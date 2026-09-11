import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SubjectBucket } from '../types/enums'

/**
 * The snapshot document as the TRANSACTION sees it — deliberately separate from
 * what a pre-transaction read would have returned, so a check performed outside
 * the transaction is visible as a test failure rather than as a passing write.
 */
let storedSnapshot: Record<string, unknown> | null = null
const updateMock = vi.fn<(ref: unknown, data: unknown) => void>()
const setMock = vi.fn<(ref: unknown, data: unknown, opts: unknown) => void>()

vi.mock('firebase/firestore', () => ({
  doc: (_col: unknown, id?: string) => ({ __doc: id ?? 'auto' }),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  getDocs: async () => ({ docs: [] }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  setDoc: async () => undefined,
  updateDoc: async () => undefined,
  runTransaction: async (
    _db: unknown,
    fn: (tx: {
      get: (ref: unknown) => Promise<{ exists: () => boolean; data: () => unknown }>
      update: (ref: unknown, data: unknown) => void
      set: (ref: unknown, data: unknown, opts: unknown) => void
    }) => Promise<void>,
  ) =>
    fn({
      get: async () => ({
        exists: () => storedSnapshot !== null,
        data: () => storedSnapshot,
      }),
      update: updateMock,
      set: setMock,
    }),
}))

vi.mock('../firebase/firestore', () => ({
  activityConfigsCollection: () => ({ __col: 'activityConfigs' }),
  db: { __db: true },
  normalizeCurriculumKey: (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ''),
  skillSnapshotsCollection: () => ({ __col: 'skillSnapshots' }),
}))

const { updateWorkingLevelFromScan } = await import('./useScanToActivityConfig')

const level = (n: number) => ({ level: n, updatedAt: 'then', source: 'quest' as const })

beforeEach(() => {
  storedSnapshot = null
  updateMock.mockClear()
  setMock.mockClear()
})

describe('updateWorkingLevelFromScan — the gate and the write are one unit (UX-382)', () => {
  it('re-checks against what the TRANSACTION reads, so a level raised in the gap wins', () => {
    // Codex round 1, P1. A quest finishing on another device raises phonics to
    // 5 between a read and a write. Inside the transaction the stored level is
    // 5 and the scan's derived level 2 must not land.
    storedSnapshot = { workingLevels: { phonics: level(5) } }
    return updateWorkingLevelFromScan('f1', 'c1', 35, 'Fast Phonics', SubjectBucket.Reading).then(
      () => {
        expect(updateMock).not.toHaveBeenCalled()
        expect(setMock).not.toHaveBeenCalled()
      },
    )
  })

  it('writes ONE field path, never the whole map, so a sibling level cannot be clobbered', async () => {
    storedSnapshot = { workingLevels: { phonics: level(1), math: level(4) } }
    await updateWorkingLevelFromScan('f1', 'c1', 35, 'Fast Phonics', SubjectBucket.Reading)
    expect(updateMock).toHaveBeenCalledTimes(1)
    const payload = updateMock.mock.calls[0][1] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['updatedAt', 'workingLevels.phonics'])
    expect(payload['workingLevels.phonics']).toMatchObject({ level: 2, source: 'curriculum' })
    // The whole map is never sent, so `math` is not in the payload at all.
    expect(payload).not.toHaveProperty('workingLevels')
  })

  it('creates the snapshot with just this level when there is no document yet', async () => {
    storedSnapshot = null
    await updateWorkingLevelFromScan('f1', 'c1', 35, 'Fast Phonics', SubjectBucket.Reading)
    expect(updateMock).not.toHaveBeenCalled()
    expect(setMock).toHaveBeenCalledTimes(1)
    expect(setMock.mock.calls[0][1]).toMatchObject({
      childId: 'c1',
      workingLevels: { phonics: { level: 2 } },
    })
    expect(setMock.mock.calls[0][2]).toEqual({ merge: true })
  })

  it('writes nothing at all for a book the domain rule refuses (UX-381)', async () => {
    storedSnapshot = { workingLevels: { phonics: level(5) } }
    await updateWorkingLevelFromScan(
      'f1',
      'c1',
      35,
      'The Good and the Beautiful Handwriting',
      SubjectBucket.LanguageArts,
    )
    expect(updateMock).not.toHaveBeenCalled()
    expect(setMock).not.toHaveBeenCalled()
  })
})
