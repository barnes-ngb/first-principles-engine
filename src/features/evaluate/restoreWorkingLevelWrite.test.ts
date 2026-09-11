import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkingLevel } from '../../core/types/evaluation'

/**
 * The snapshot as the TRANSACTION sees it — deliberately different from what a
 * pre-transaction read would have returned, so a check made outside the
 * transaction shows up as a failing test rather than as a passing write.
 */
let storedSnapshot: Record<string, unknown> | null = null
const updateMock = vi.fn<(ref: unknown, data: unknown) => void>()
const setDocMock = vi.fn<(ref: unknown, data: unknown, opts: unknown) => void>()

vi.mock('firebase/firestore', () => ({
  doc: (_col: unknown, id?: string) => ({ __doc: id ?? 'auto' }),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  setDoc: async (ref: unknown, data: unknown, opts: unknown) => {
    setDocMock(ref, data, opts)
  },
  runTransaction: async <T>(
    _db: unknown,
    fn: (tx: {
      get: (ref: unknown) => Promise<{ exists: () => boolean; data: () => unknown }>
      update: (ref: unknown, data: unknown) => void
    }) => Promise<T>,
  ): Promise<T> =>
    fn({
      get: async () => ({
        exists: () => storedSnapshot !== null,
        data: () => storedSnapshot,
      }),
      update: updateMock,
    }),
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
  skillSnapshotsCollection: () => ({ __col: 'skillSnapshots' }),
}))

const { writeRestoredWorkingLevel } = await import('./skillSnapshotWrites')

const scanWritten: WorkingLevel = {
  level: 2,
  updatedAt: '2026-09-10T22:02:14.000Z',
  source: 'curriculum',
  evidence: 'Scanned The Good and the Beautiful Handwriting Lesson 35',
}

const args = {
  key: 'phonics' as const,
  expect: scanWritten,
  level: 5,
  evidence: 'Restored 2026-09-11 after UX-383 — a … scan had written 2',
  at: '2026-09-11T12:00:00.000Z',
}

beforeEach(() => {
  storedSnapshot = null
  updateMock.mockClear()
  setDocMock.mockClear()
})

describe('writeRestoredWorkingLevel — the check and the write are one unit (UX-383)', () => {
  it('writes ONE field path when the slot still holds exactly what was surveyed', async () => {
    storedSnapshot = { workingLevels: { phonics: scanWritten, math: { level: 4, updatedAt: 'x', source: 'quest' } } }
    const outcome = await writeRestoredWorkingLevel('f1', 'c1', args)
    expect(outcome.status).toBe('written')
    expect(updateMock).toHaveBeenCalledTimes(1)
    const payload = updateMock.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['updatedAt', 'workingLevels.phonics'])
    expect(payload['workingLevels.phonics']).toMatchObject({ level: 5, source: 'manual' })
    // Never the whole map, so the sibling `math` level cannot be carried along.
    expect(payload).not.toHaveProperty('workingLevels')
  })

  it('re-reads INSIDE the transaction, so a quest landing after the survey stands', async () => {
    // Codex round 2, P1. Merging one key protects siblings from a concurrent
    // write but not this key from one.
    storedSnapshot = { workingLevels: { phonics: { level: 6, updatedAt: 'later', source: 'quest' } } }
    const outcome = await writeRestoredWorkingLevel('f1', 'c1', args)
    expect(outcome).toMatchObject({ status: 'refused', reason: 'slot-moved' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('writes nothing when there is no snapshot document at all', async () => {
    storedSnapshot = null
    const outcome = await writeRestoredWorkingLevel('f1', 'c1', args)
    expect(outcome).toMatchObject({ status: 'refused', reason: 'slot-moved' })
    expect(updateMock).not.toHaveBeenCalled()
    expect(setDocMock).not.toHaveBeenCalled()
  })
})
