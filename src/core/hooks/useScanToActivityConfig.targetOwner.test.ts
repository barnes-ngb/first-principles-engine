import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useScanToActivityConfig } from './useScanToActivityConfig'
import type { WorksheetScanResult } from '../types'

// ── UX-403 ──────────────────────────────────────────────────────────────────
//
// The pinned-target branch loaded the config BY ID and checked no `childId`,
// while the fuzzy branch beside it has always filtered on
// `where('childId', 'in', [childId, 'both'])`. So a stale join — a
// `workbookConfigId` stamped while the header was on the other boy, which is
// exactly what `useActivityConfigs` not resetting its state produced — advanced
// the SIBLING's lesson count from this child's photo.

const configs = new Map<string, Record<string, unknown>>()
const updateDocCalls: { id: string; data: Record<string, unknown> }[] = []
const setDocCalls: Record<string, unknown>[] = []

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_col: unknown, id?: string) => ({ __id: id ?? 'new-doc' })),
  getDoc: vi.fn((ref: { __id?: string }) =>
    Promise.resolve({
      exists: () => configs.has(ref.__id ?? ''),
      id: ref.__id,
      ref,
      data: () => configs.get(ref.__id ?? ''),
    }),
  ),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  runTransaction: vi.fn(() => Promise.resolve()),
  setDoc: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
    setDocCalls.push(data)
    return Promise.resolve()
  }),
  updateDoc: vi.fn((ref: { __id?: string }, data: Record<string, unknown>) => {
    updateDocCalls.push({ id: ref.__id ?? '', data })
    return Promise.resolve()
  }),
}))

vi.mock('../auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../firebase/firestore', () => ({
  activityConfigsCollection: vi.fn(() => ({})),
  db: {},
  normalizeCurriculumKey: (s: string) => s,
  skillSnapshotsCollection: vi.fn(() => ({})),
}))
vi.mock('../foundations/workbookPositionSync', () => ({
  syncWorkbookPositionToModel: vi.fn(),
}))

const scan = {
  pageType: 'worksheet',
  subject: 'Math',
  specificTopic: 'addition',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: '',
  estimatedMinutes: 20,
  teacherNotes: '',
  curriculumDetected: {
    provider: 'gatb', name: 'GATB Math', lessonNumber: 14,
    pageNumber: null, levelDesignation: null,
  },
} as unknown as WorksheetScanResult

const sync = () => renderHook(() => useScanToActivityConfig()).result.current.syncScanToConfig

beforeEach(() => {
  configs.clear()
  updateDocCalls.length = 0
  setDocCalls.length = 0
})

describe('syncScanToConfig — a pinned target must be THIS child’s row (UX-403)', () => {
  it("refuses a target belonging to the sibling, and writes nothing at all", async () => {
    configs.set('wb-london', {
      id: 'wb-london', name: 'GATB Math', childId: 'london',
      type: 'workbook', currentPosition: 3,
    })

    const result = await sync()('lincoln', scan, { targetConfigId: 'wb-london' })

    expect(result).toEqual({ action: 'none', reason: 'target-missing' })
    // The rail: no position advance on the other boy's document…
    expect(updateDocCalls).toEqual([])
    // …and no fallback to CREATING one either — a pinned target that resolves to
    // nothing bails, it does not become a fuzzy match.
    expect(setDocCalls).toEqual([])
  })

  it('POSITIVE CONTROL — the same call on this child’s own row DOES advance it', async () => {
    configs.set('wb-lincoln', {
      id: 'wb-lincoln', name: 'GATB Math', childId: 'lincoln',
      type: 'workbook', currentPosition: 3,
    })

    const result = await sync()('lincoln', scan, { targetConfigId: 'wb-lincoln' })

    expect(result).toMatchObject({ action: 'updated', configId: 'wb-lincoln', position: 14 })
    expect(updateDocCalls[0].data).toMatchObject({ currentPosition: 14 })
  })

  it("a shared ('both') row is still this child's row", async () => {
    configs.set('wb-both', {
      id: 'wb-both', name: 'Prayer Journal', childId: 'both',
      type: 'routine', currentPosition: 1,
    })

    const result = await sync()('lincoln', scan, { targetConfigId: 'wb-both' })
    expect(result).toMatchObject({ action: 'updated', configId: 'wb-both' })
  })
})
