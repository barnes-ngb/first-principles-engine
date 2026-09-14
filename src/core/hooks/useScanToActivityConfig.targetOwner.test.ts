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

/**
 * Mutate the store once, after the transaction's `tx.get` and before its commit —
 * the `CurriculumTab.handleReassign` landing in the window that `UX-416` names.
 * The fake then aborts and re-runs the body, exactly as Firestore does.
 */
let contendOnce: (() => void) | null = null
/** Fuzzy-branch docs the query returns. Empty = pinned-target tests. */
let queryDocs: { id: string; data: () => Record<string, unknown> }[] = []

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_col: unknown, id?: string) => ({ __id: id ?? 'new-doc' })),
  getDocs: vi.fn(() => Promise.resolve({ docs: queryDocs })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  runTransaction: vi.fn(async (_db: unknown, body: (tx: unknown) => Promise<unknown>) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      let readAt: Record<string, unknown> | undefined
      const tx = {
        get: (ref: { __id?: string }) => {
          readAt = configs.get(ref.__id ?? '')
          const contend = contendOnce
          contendOnce = null
          contend?.()
          return Promise.resolve({
            exists: () => readAt !== undefined,
            id: ref.__id,
            data: () => readAt,
          })
        },
        update: (ref: { __id?: string }, data: Record<string, unknown>) => {
          const id = ref.__id ?? ''
          // The real transaction aborts when the document moved between the read
          // and the commit. That retry is the whole of the fix.
          if (configs.get(id) !== readAt) throw new Error('__retry__')
          updateDocCalls.push({ id, data })
          configs.set(id, { ...(configs.get(id) as Record<string, unknown>), ...data })
        },
      }
      try {
        return await body(tx)
      } catch (err) {
        if ((err as Error).message !== '__retry__') throw err
      }
    }
    throw new Error('transaction exhausted retries')
  }),
  setDoc: vi.fn((_ref: unknown, data: Record<string, unknown>) => {
    setDocCalls.push(data)
    return Promise.resolve()
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
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
  contendOnce = null
  queryDocs = []
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

// ── UX-416: the owner check and the write are ONE transaction ───────────────

describe('syncScanToConfig — a reassignment mid-write is refused, not ridden', () => {
  it('a pinned target reassigned between the read and the commit writes NOTHING', async () => {
    configs.set('wb-1', {
      id: 'wb-1', name: 'GATB Math', childId: 'lincoln',
      type: 'workbook', currentPosition: 3,
    })
    // The parent reassigns it to the sibling while the scan is mid-flight.
    contendOnce = () => {
      configs.set('wb-1', {
        id: 'wb-1', name: 'GATB Math', childId: 'london',
        type: 'workbook', currentPosition: 3,
      })
    }

    const result = await sync()('lincoln', scan, { targetConfigId: 'wb-1' })

    expect(result).toEqual({ action: 'none', reason: 'target-missing' })
    // The rail: the newly-reassigned workbook is NOT advanced…
    expect(updateDocCalls).toEqual([])
    // …and the sibling's position is untouched.
    expect(configs.get('wb-1')).toMatchObject({ childId: 'london', currentPosition: 3 })
    // And nothing is created in its place.
    expect(setDocCalls).toEqual([])
  })

  it('POSITIVE CONTROL — with no reassignment the same call advances it', async () => {
    configs.set('wb-1', {
      id: 'wb-1', name: 'GATB Math', childId: 'lincoln',
      type: 'workbook', currentPosition: 3,
    })

    const result = await sync()('lincoln', scan, { targetConfigId: 'wb-1' })

    expect(result).toMatchObject({ action: 'updated', configId: 'wb-1', position: 14 })
    expect(updateDocCalls[0].data).toMatchObject({ currentPosition: 14 })
  })

  it('the FUZZY branch is inside the transaction too — same hole, one branch over', async () => {
    // Its `where('childId', 'in', …)` filter is a claim about the document at
    // QUERY time. The finding named only the pinned path; this is the same class.
    const matched = {
      id: 'wb-2', name: 'GATB Math', childId: 'lincoln',
      type: 'workbook', currentPosition: 3,
    }
    configs.set('wb-2', matched)
    queryDocs = [{ id: 'wb-2', data: () => matched }]
    contendOnce = () => {
      configs.set('wb-2', { ...matched, childId: 'london' })
    }

    const result = await sync()('lincoln', scan)

    expect(result).toEqual({ action: 'none', reason: 'target-missing' })
    expect(updateDocCalls).toEqual([])
    // Refused, NOT fallen through to CREATE — that would write the duplicate the
    // match existed to prevent.
    expect(setDocCalls).toEqual([])
  })

  it('a target DELETED mid-write is refused rather than re-created', async () => {
    configs.set('wb-3', {
      id: 'wb-3', name: 'GATB Math', childId: 'lincoln',
      type: 'workbook', currentPosition: 3,
    })
    contendOnce = () => configs.delete('wb-3')

    const result = await sync()('lincoln', scan, { targetConfigId: 'wb-3' })

    expect(result).toEqual({ action: 'none', reason: 'target-missing' })
    expect(setDocCalls).toEqual([])
  })

  it('the position rule is read from the document at the WRITE, not at the read', async () => {
    // Not a new rule — the same advance-only expression, asked of the value it is
    // about to overwrite. A lesson that landed mid-flight above this scan's own
    // must therefore stand.
    configs.set('wb-4', {
      id: 'wb-4', name: 'GATB Math', childId: 'lincoln',
      type: 'workbook', currentPosition: 3,
    })
    contendOnce = () => {
      configs.set('wb-4', {
        id: 'wb-4', name: 'GATB Math', childId: 'lincoln',
        type: 'workbook', currentPosition: 20,
      })
    }

    const result = await sync()('lincoln', scan, { targetConfigId: 'wb-4' })

    expect(result).toMatchObject({ action: 'updated' })
    // 14 is not above 20, so no position is written at all.
    expect(updateDocCalls[0].data.currentPosition).toBeUndefined()
    expect(configs.get('wb-4')).toMatchObject({ currentPosition: 20 })
  })
})
