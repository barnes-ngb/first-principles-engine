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
  doc: vi.fn((_c: unknown, id: string) => ({ id })),
  query: vi.fn((c: unknown) => c),
  getDoc: (...a: unknown[]) => getDoc(...(a as [])),
  getDocs: (...a: unknown[]) => getDocs(...(a as [])),
  runTransaction: (...a: unknown[]) => runTransaction(...(a as [never, never])),
}))
vi.mock('../firebase/firestore', () => ({
  db: {},
  childSkillMapsCollection: () => ({}),
  learnerModelsCollection: () => ({}),
  sightWordProgressCollection: () => ({}),
  skillSnapshotsCollection: () => ({}),
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
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    ...over,
  }
}

describe('bootstrapLearnerModel — reproject (UX-291)', () => {
  it('reads ONE input document, not four — a page view is not worth the skill map and the word list', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => snapshotAt(7, LEVEL_MOVED_AT) })
    txGet.mockResolvedValue({ exists: () => true, data: () => seededInJuly() })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(getDoc).toHaveBeenCalledTimes(1)
    expect(getDocs).not.toHaveBeenCalled()
  })

  it('writes NOTHING when the levels have not moved since the last projection', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => snapshotAt(7, SEEDED_AT) })
    txGet.mockResolvedValue({ exists: () => true, data: () => seededInJuly() })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).not.toHaveBeenCalled()
    expect(model?.projectedAt).toBeUndefined()
  })

  it('writes projectedAt ALONE when the levels moved but no state did', async () => {
    // Level 7 already, and the stored states were computed at 7 — nothing to raise.
    getDoc.mockResolvedValue({ exists: () => true, data: () => snapshotAt(7, LEVEL_MOVED_AT) })
    const stored7: LearnerModel = {
      ...seededInJuly(),
      conceptStates: projectWorkingLevelStates(
        foundationGraphs,
        'c1',
        snapshotAt(7, SEEDED_AT),
        SEEDED_AT,
      ),
    }
    txGet.mockResolvedValue({ exists: () => true, data: () => stored7 })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).toHaveBeenCalledTimes(1)
    const payload = txSet.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['projectedAt'])
    expect(txSet.mock.calls[0][2]).toEqual({ merge: true })
  })

  it('writes states, the feed, projectedAt and synthesisStaleAt when a state moved', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => snapshotAt(7, LEVEL_MOVED_AT) })
    txGet.mockResolvedValue({ exists: () => true, data: () => seededInJuly() })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).toHaveBeenCalledTimes(1)
    const payload = txSet.mock.calls[0][1] as LearnerModel
    expect(payload.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
    expect(payload.changeFeed.length).toBeGreaterThan(0)
    expect(payload.projectedAt).toBeTruthy()
    // FEAT-57 D4 — a moved state means the stored synthesis is behind.
    expect(payload.synthesisStaleAt).toBe(payload.projectedAt)
    expect(txSet.mock.calls[0][2]).toEqual({ merge: true })
    expect(model?.conceptStates['reading.phonics.longVowels'].state).toBe('solid')
  })

  it('applies the shared promotedModelStatus rule rather than re-implementing it', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => snapshotAt(7, LEVEL_MOVED_AT) })
    // A model stamped `no-data` that a projection is about to land evidence on.
    txGet.mockResolvedValue({
      exists: () => true,
      data: () => ({
        ...seededInJuly({ status: 'no-data' }),
        conceptStates: Object.fromEntries(
          Object.keys(
            projectWorkingLevelStates(foundationGraphs, 'c1', snapshotAt(5, SEEDED_AT), SEEDED_AT),
          ).map((id) => [id, { state: 'not-yet', evidence: [], seededAt: SEEDED_AT }]),
        ),
      }),
    })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    const payload = txSet.mock.calls[0][1] as LearnerModel
    expect(payload.status).toBe('seeded')
  })

  it('never CREATES a document — a projection has nothing to project onto', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => snapshotAt(7, LEVEL_MOVED_AT) })
    txGet.mockResolvedValue({ exists: () => false, data: () => ({}) })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(txSet).not.toHaveBeenCalled()
    expect(model).toBeNull()
  })

  it('does nothing when the child has no skill snapshot', async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })

    const model = await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(runTransaction).not.toHaveBeenCalled()
    expect(model).toBeNull()
  })

  it('reads the contended document inside the transaction, like every other mode', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => snapshotAt(7, LEVEL_MOVED_AT) })
    txGet.mockResolvedValue({ exists: () => true, data: () => seededInJuly() })

    await bootstrapLearnerModel('fam-1', 'c1', 'reproject')

    expect(runTransaction).toHaveBeenCalledTimes(1)
    expect(txGet).toHaveBeenCalledTimes(1)
  })
})
