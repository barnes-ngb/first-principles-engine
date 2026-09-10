// Codex round 1, P1 — the read and the write are one atomic unit, and
// `create-only` really is a conditional create. Before this, both halves were
// claimed in a docstring and neither was true: a stale seed's `setDoc` wrote all
// sixty `conceptStates` keys plus both judgment arrays, so an incremental write
// landing between the read and the write was silently overwritten.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LearnerModel } from '../types/learnerModel'

const txGet = vi.fn()
const txSet = vi.fn()
const runTransaction = vi.fn(
  async (_db: unknown, fn: (tx: { get: unknown; set: unknown }) => unknown) =>
    fn({ get: txGet, set: txSet }),
)
const getDoc = vi.fn(async (): Promise<{ exists: () => boolean; data: () => unknown }> => ({
  exists: () => false,
  data: () => ({}),
}))
const getDocs = vi.fn(async () => ({ docs: [] as unknown[] }))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((c: { name?: string } | undefined, id: string) => ({ id, col: c?.name })),
  query: vi.fn((c: unknown) => c),
  getDoc: (...a: unknown[]) => getDoc(...(a as [])),
  getDocs: (...a: unknown[]) => getDocs(...(a as [])),
  runTransaction: (...a: unknown[]) => runTransaction(...(a as [never, never])),
}))
// Named so a transactional read can be routed to the right document: reproject
// reads BOTH the model and the snapshot inside the transaction, and they share
// the child id (Codex round 1).
vi.mock('../firebase/firestore', () => ({
  db: {},
  childSkillMapsCollection: () => ({ name: 'childSkillMaps' }),
  learnerModelsCollection: () => ({ name: 'learnerModels' }),
  sightWordProgressCollection: () => ({ name: 'sightWordProgress' }),
  skillSnapshotsCollection: () => ({ name: 'skillSnapshots' }),
}))

import { bootstrapLearnerModel } from './bootstrapLearnerModel'
import { foundationGraphs } from './index'
import { projectWorkingLevelStates } from './seedLearnerModel'
import type { SkillSnapshot } from '../types/evaluation'

const NOW = '2026-09-09T12:00:00.000Z'

/** A stored model carrying evidence a stale seed would otherwise flatten. */
function stored(): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {
      'reading.fluency.accuracy': {
        state: 'solid',
        evidence: [{ kind: 'eval', sourceId: 'sess-1', note: 'n', observedAt: NOW }],
      },
    },
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [{ conceptId: 'reading.fluency.accuracy', from: 'not-yet', to: 'solid', cause: 'eval', at: NOW }],
    openQuestions: [],
    seededAt: NOW,
    updatedAt: NOW,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
  getDocs.mockResolvedValue({ docs: [] })
})

describe('bootstrapLearnerModel', () => {
  it('reads the contended document INSIDE the transaction, never outside it', async () => {
    txGet.mockResolvedValue({ exists: () => false, data: () => ({}) })
    await bootstrapLearnerModel('fam-1', 'c1')

    expect(runTransaction).toHaveBeenCalledTimes(1)
    expect(txGet).toHaveBeenCalledTimes(1)
    // The three input reads stay outside — they are not contended, and the
    // sight-word read is a collection query, which a transaction cannot run.
    expect(getDoc).toHaveBeenCalledTimes(2)
    expect(getDocs).toHaveBeenCalledTimes(1)
  })

  it('writes the seed when the document is absent', async () => {
    txGet.mockResolvedValue({ exists: () => false, data: () => ({}) })
    const model = await bootstrapLearnerModel('fam-1', 'c1', 'create-only')

    expect(txSet).toHaveBeenCalledTimes(1)
    expect(txSet.mock.calls[0][2]).toEqual({ merge: true })
    expect(model?.childId).toBe('c1')
  })

  it('create-only writes NOTHING when a document appeared meanwhile', async () => {
    const existing = stored()
    txGet.mockResolvedValue({ exists: () => true, data: () => existing })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'create-only')

    expect(txSet).not.toHaveBeenCalled()
    // The racer's evidence is returned untouched, not flattened by a stale seed.
    expect(model).toBe(existing)
  })

  it('reseed still re-seeds an existing model, preserving its evidence', async () => {
    txGet.mockResolvedValue({ exists: () => true, data: () => stored() })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reseed')

    expect(txSet).toHaveBeenCalledTimes(1)
    expect(model?.conceptStates['reading.fluency.accuracy'].state).toBe('solid')
    expect(model?.changeFeed).toHaveLength(1)
    // And it does not demote an established status (the round-1 P2).
    expect(model?.status).toBe('seeded')
  })

  it('defaults to create-only, so a caller that forgets cannot re-seed', async () => {
    txGet.mockResolvedValue({ exists: () => true, data: () => stored() })
    await bootstrapLearnerModel('fam-1', 'c1')
    expect(txSet).not.toHaveBeenCalled()
  })

  it('does not swallow a failure — a silent bootstrap is the defect it removes', async () => {
    runTransaction.mockRejectedValueOnce(new Error('firestore down') as never)
    await expect(bootstrapLearnerModel('fam-1', 'c1')).rejects.toThrow('firestore down')
  })
})

// ── UX-291 — the narrow re-projection's three write shapes, and only three ──
//
// The trigger is a page view, so "writes nothing when the levels have not moved"
// is not a nicety: without it every visit would stamp `synthesisStaleAt` and the
// weekly synthesis beat would regenerate forever.

const SEEDED_AT = '2026-07-06T12:55:33.000Z'
const LEVEL_MOVED_AT = '2026-09-01T09:00:00.000Z'

function snapshotAt(level: number, updatedAt: string): SkillSnapshot {
  return {
    childId: 'c1',
    workingLevels: { phonics: { level, updatedAt, source: 'manual' } },
  } as SkillSnapshot
}

/** A model whose band-derived states were computed in July at phonics level 5. */
function seededInJuly(over: Partial<LearnerModel> = {}): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: projectWorkingLevelStates(
      foundationGraphs,
      'c1',
      snapshotAt(5, SEEDED_AT),
      SEEDED_AT,
    ),
    projectedThrough: { phonics: 5 },
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    ...over,
  }
}

/**
 * Both reproject reads are transactional (Codex round 1), so the mock is routed
 * by document id: the model is `{childId}`, the snapshot is anything else.
 */
function txReads(opts: { model: LearnerModel | null; snapshot: SkillSnapshot | null }) {
  txGet.mockImplementation(async (ref: { col?: string }) => {
    const data = ref?.col === 'learnerModels' ? opts.model : opts.snapshot
    return { exists: () => data !== null, data: () => data ?? {} }
  })
}

describe('bootstrapLearnerModel — reproject (UX-291)', () => {
  // Codex round 1, P2 — the snapshot is the projection's INPUT, so reading it
  // outside the transaction left a window in which a level landing on another
  // device was projected from the older snapshot and then watermarked as
  // processed, and the next visit skipped it.
  it('reads the snapshot INSIDE the transaction, alongside the model', async () => {
    txReads({ model: seededInJuly(), snapshot: snapshotAt(7, LEVEL_MOVED_AT) })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    // Both reads are transactional; neither is a plain get, and the sight-word
    // collection query the seed path needs is not run at all.
    expect(getDoc).not.toHaveBeenCalled()
    expect(getDocs).not.toHaveBeenCalled()
    expect(txGet).toHaveBeenCalledTimes(2)
  })

  it('reads ONE input document, not four — a page view is not worth the skill map and the word list', async () => {
    txReads({ model: seededInJuly(), snapshot: snapshotAt(7, LEVEL_MOVED_AT) })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    // No skill map, no sight-word collection query — the seed path's other reads.
    expect(getDoc).not.toHaveBeenCalled()
    expect(getDocs).not.toHaveBeenCalled()
  })

  it('writes NOTHING when the levels are the ones already projected', async () => {
    txReads({ model: seededInJuly(), snapshot: snapshotAt(5, LEVEL_MOVED_AT) })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).not.toHaveBeenCalled()
    expect(model?.projectedThrough).toEqual({ phonics: 5 })
  })

  it('writes projectedThrough ALONE when the levels moved but no state did', async () => {
    // Level 7 already, and the stored states were computed at 7 — nothing to raise.
    const stored7: LearnerModel = {
      ...seededInJuly(),
      conceptStates: projectWorkingLevelStates(
        foundationGraphs,
        'c1',
        snapshotAt(7, SEEDED_AT),
        SEEDED_AT,
      ),
      // Recorded as level 5 while its states already reflect 7 — so the watermark
      // is stale, the projection runs, and nothing has anywhere to move.
      projectedThrough: { phonics: 5 },
    }
    txReads({ model: stored7, snapshot: snapshotAt(7, LEVEL_MOVED_AT) })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).toHaveBeenCalledTimes(1)
    const payload = txSet.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['projectedThrough'])
    // The LEVELS that were projected, never this client's clock.
    expect(payload.projectedThrough).toEqual({ phonics: 7 })
    expect(txSet.mock.calls[0][2]).toEqual({ merge: true })
  })

  it('writes states, the feed, projectedThrough and synthesisStaleAt when a state moved', async () => {
    txReads({ model: seededInJuly(), snapshot: snapshotAt(7, LEVEL_MOVED_AT) })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).toHaveBeenCalledTimes(1)
    const payload = txSet.mock.calls[0][1] as LearnerModel
    expect(payload.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
    expect(payload.changeFeed.length).toBeGreaterThan(0)
    // The watermark is the LEVELS; synthesisStaleAt is a real wall clock, because
    // it answers "how old is the synthesis", not "what have I read".
    expect(payload.projectedThrough).toEqual({ phonics: 7 })
    expect(Date.parse(payload.synthesisStaleAt as string)).toBeGreaterThan(
      Date.parse(LEVEL_MOVED_AT),
    )
    expect(txSet.mock.calls[0][2]).toEqual({ merge: true })
    expect(model?.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
  })

  it('applies the shared promotedModelStatus rule rather than re-implementing it', async () => {
    // A model stamped `no-data` that a projection is about to land evidence on.
    txReads({
      model: {
        ...seededInJuly({ status: 'no-data' }),
        conceptStates: Object.fromEntries(
          Object.keys(
            projectWorkingLevelStates(foundationGraphs, 'c1', snapshotAt(5, SEEDED_AT), SEEDED_AT),
          ).map((id) => [id, { state: 'not-yet', evidence: [], seededAt: SEEDED_AT }]),
        ),
      } as LearnerModel,
      snapshot: snapshotAt(7, LEVEL_MOVED_AT),
    })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    const payload = txSet.mock.calls[0][1] as LearnerModel
    expect(payload.status).toBe('seeded')
  })

  it('never CREATES a document — a projection has nothing to project onto', async () => {
    txReads({ model: null, snapshot: snapshotAt(7, LEVEL_MOVED_AT) })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).not.toHaveBeenCalled()
    expect(model).toBeNull()
  })

  it('records an EMPTY watermark when the child has no skill snapshot', async () => {
    // No levels means the fold reads `not-yet` everywhere and the upgrade-only
    // rule discards all of it — but the fact is still recorded, or this
    // transaction re-runs on every later mount.
    txReads({ model: seededInJuly(), snapshot: null })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).toHaveBeenCalledTimes(1)
    expect(txSet.mock.calls[0][1]).toEqual({ projectedThrough: {} })
    expect(model?.projectedThrough).toEqual({})
  })

  // Codex round 2, finding 2 — a model that never recorded a projection is
  // projected once and recorded, rather than measured against a seed wall clock
  // that could mark a level landing during the seed's own read window as done.
  it('projects a model that has never recorded one, then stops', async () => {
    const unrecorded = seededInJuly()
    delete (unrecorded as { projectedThrough?: unknown }).projectedThrough
    txReads({ model: unrecorded, snapshot: snapshotAt(5, LEVEL_MOVED_AT) })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    // Its states already match level 5, so nothing moves — only the watermark.
    expect(txSet).toHaveBeenCalledTimes(1)
    expect(txSet.mock.calls[0][1]).toEqual({ projectedThrough: { phonics: 5 } })

    // And with that recorded, the next visit writes nothing.
    vi.clearAllMocks()
    txReads({ model: seededInJuly(), snapshot: snapshotAt(5, LEVEL_MOVED_AT) })
    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')
    expect(txSet).not.toHaveBeenCalled()
  })
})
