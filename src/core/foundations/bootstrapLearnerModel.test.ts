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
const getDoc = vi.fn(async () => ({ exists: () => false, data: () => ({}) }))
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
    expect(model.childId).toBe('c1')
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
    expect(model.conceptStates['reading.fluency.accuracy'].state).toBe('solid')
    expect(model.changeFeed).toHaveLength(1)
    // And it does not demote an established status (the round-1 P2).
    expect(model.status).toBe('seeded')
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
