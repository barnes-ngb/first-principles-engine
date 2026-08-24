import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DadLabReport } from '../../core/types'

// ── Mocks at the Firestore boundary ────────────────────────────────────────

const addDocMock = vi.fn()
const setDocMock = vi.fn()
const getDocsMock = vi.fn()
const deleteDocMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  updateDoc: vi.fn(),
  doc: vi.fn((coll: { path?: string }, id: string) => ({ path: coll?.path, id })),
  onSnapshot: vi.fn(() => vi.fn()),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))

vi.mock('../../core/firebase/firestore', () => ({
  dadLabReportsCollection: () => ({ path: 'dadLabReports' }),
  hoursCollection: () => ({ path: 'hours' }),
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../core/hooks/useChildren', () => ({
  useChildren: () => ({ children: [{ id: 'c-lincoln', name: 'Lincoln' }] }),
}))
vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../core/xp/addDiamondEvent', () => ({
  addDiamondEvent: vi.fn().mockResolvedValue(undefined),
}))

import { useDadLabReports } from './useDadLabReports'

const NOW = '2026-08-24T00:00:00.000Z'

/** A brand-new lab as `LabReportForm` composes it: no id, always `Planned`. */
const NEW_REPORT: DadLabReport = {
  date: '2026-08-24',
  weekKey: '2026-W35',
  title: 'Balloon Lab',
  labType: 'science',
  question: 'Why does it pop?',
  description: '',
  status: 'planned',
  childReports: {},
  subjectTags: ['Science'],
  createdAt: NOW,
  updatedAt: NOW,
}

beforeEach(() => {
  addDocMock.mockReset().mockResolvedValue({ id: 'lab-new' })
  setDocMock.mockReset().mockResolvedValue(undefined)
  getDocsMock.mockReset().mockResolvedValue({ docs: [] })
  deleteDocMock.mockReset().mockResolvedValue(undefined)
})

// Codex P2 on PR #1700: the post-write refresh could reject AFTER `addDoc` had
// already created the report. That rejection reached `useSaveState` as a save
// failure — and UX-83's new alert tells the parent to tap Save again, which on
// a still-id-less form would `addDoc` a SECOND report. A create is the one save
// that cannot be retried idempotently, so a refresh failure must never be
// reported as one.
describe('useDadLabReports.saveReport — a redundant refresh is not a save failure', () => {
  it('resolves a created report even when the post-write list refresh rejects', async () => {
    getDocsMock.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useDadLabReports())

    // The report was written; the parent must not be told otherwise.
    await expect(result.current.saveReport(NEW_REPORT)).resolves.toBe('lab-new')
    expect(addDocMock).toHaveBeenCalledTimes(1)
  })

  it('still rejects when the primary write itself fails — nothing was created', async () => {
    // The honesty UX-83 added is preserved for real failures: here `addDoc`
    // never succeeded, so "tap Save to try again" is both true and safe.
    addDocMock.mockRejectedValue(new Error('permission-denied'))
    const { result } = renderHook(() => useDadLabReports())

    await expect(result.current.saveReport(NEW_REPORT)).rejects.toThrow('permission-denied')
  })

  it('still rejects when a completing lab\'s compliance-hours sync fails', async () => {
    // An update carries a doc id, so its retry is a `setDoc` on that id and its
    // hours sync deletes-then-recreates for the same `labReportId` — idempotent.
    // That failure stays loud.
    getDocsMock.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useDadLabReports())

    await expect(
      result.current.saveReport({ ...NEW_REPORT, id: 'lab-1', status: 'complete' }),
    ).rejects.toThrow('offline')
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })
})
