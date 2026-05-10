import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

import type { DayLog } from '../../core/types'

// ── Mocks ─────────────────────────────────────────────────────────

const mockSetDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDoc = vi.fn()
const mockOnSnapshot = vi.fn()
const mockDoc = vi.fn((_coll, id) => ({ id, path: `days/${id}` }))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}))

const mockDaysCollection = vi.fn().mockReturnValue({ id: 'days' })
const mockWeeksCollection = vi.fn().mockReturnValue({ id: 'weeks' })

vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: (...args: unknown[]) => mockDaysCollection(...args),
  weeksCollection: (...args: unknown[]) => mockWeeksCollection(...args),
}))

vi.mock('../../core/utils/time', () => ({
  getWeekRange: () => ({ start: '2026-05-04', end: '2026-05-10' }),
}))

// ── Import under test ────────────────────────────────────────────

import { useDayLog } from './useDayLog'

// ── Helpers ──────────────────────────────────────────────────────

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    familyId: 'fam-1',
    selectedChildId: 'child-a',
    today: '2026-05-10',
    selectedChild: undefined,
    activeTemplate: undefined,
    activeRoutineItems: undefined,
    ...overrides,
  }
}

function makeDayLog(overrides: Partial<DayLog> = {}): DayLog {
  return {
    childId: 'child-a',
    date: '2026-05-10',
    blocks: [{ type: 'reading', plannedMinutes: 30 }],
    createdAt: '2026-05-10T08:00:00.000Z',
    updatedAt: '2026-05-10T09:00:00.000Z',
    ...overrides,
  }
}

// Track onSnapshot subscriptions: [dayLogCallback, dayLogErrorCb, weekCallback, weekErrorCb]
let snapshotCallbacks: Array<{
  callback: (snap: unknown) => void
  errorCb?: (err: Error) => void
}> = []

beforeEach(() => {
  vi.clearAllMocks()
  snapshotCallbacks = []

  // Default: onSnapshot stores callbacks and returns unsubscribe
  mockOnSnapshot.mockImplementation(
    (_ref: unknown, callback: (snap: unknown) => void, errorCb?: (err: Error) => void) => {
      snapshotCallbacks.push({ callback, errorCb })
      return vi.fn() // unsubscribe
    },
  )

  // Default: getDoc returns non-existing doc
  mockGetDoc.mockResolvedValue({ exists: () => false })
})

// ── Tests ─────────────────────────────────────────────────────────

describe('useDayLog', () => {
  describe('loading existing day log', () => {
    it('returns data when document exists', async () => {
      const existingLog = makeDayLog()

      const { result } = renderHook(() => useDayLog(makeParams()))

      // Simulate day log snapshot firing with existing data
      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => true,
          data: () => existingLog,
        })
      })

      expect(result.current.dayLog).toEqual(existingLog)
      expect(result.current.lastSavedAt).toBe(existingLog.updatedAt)
    })
  })

  describe('creating default when no doc exists', () => {
    it('calls setDoc with a new default day log', async () => {
      const { result } = renderHook(() => useDayLog(makeParams()))

      // First snapshot fires with non-existing doc → triggers legacy checks + default creation
      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => false,
        })
      })

      // Should have checked legacy formats then created a default
      expect(mockGetDoc).toHaveBeenCalledTimes(2) // legacy + bare date
      expect(mockSetDoc).toHaveBeenCalledTimes(1)

      const writtenLog = mockSetDoc.mock.calls[0][1]
      expect(writtenLog.childId).toBe('child-a')
      expect(writtenLog.date).toBe('2026-05-10')
      expect(writtenLog.createdAt).toBeDefined()
    })
  })

  describe('legacy migration: {childId}_{date} format', () => {
    it('finds legacy doc and migrates to new format', async () => {
      const legacyLog = makeDayLog({ childId: 'child-a', date: '2026-05-10' })

      // First getDoc call (legacy format) returns existing doc
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => legacyLog,
      })

      renderHook(() => useDayLog(makeParams()))

      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => false,
        })
      })

      // Should write the migrated doc to the new location
      expect(mockSetDoc).toHaveBeenCalledTimes(1)
      const writtenDoc = mockSetDoc.mock.calls[0][1]
      expect(writtenDoc.childId).toBe('child-a')
      expect(writtenDoc.date).toBe('2026-05-10')
      expect(writtenDoc.updatedAt).toBeDefined()
    })
  })

  describe('bare date migration: {date} format', () => {
    it('finds bare date doc and migrates with childId', async () => {
      const bareLog = makeDayLog({ childId: 'child-a' })

      // First getDoc (legacy format) — not found
      mockGetDoc.mockResolvedValueOnce({ exists: () => false })
      // Second getDoc (bare date format) — found
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => bareLog,
      })

      renderHook(() => useDayLog(makeParams()))

      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => false,
        })
      })

      expect(mockSetDoc).toHaveBeenCalledTimes(1)
      const writtenDoc = mockSetDoc.mock.calls[0][1]
      expect(writtenDoc.childId).toBe('child-a')
      expect(writtenDoc.updatedAt).toBeDefined()
    })

    it('skips bare date doc belonging to a different child', async () => {
      const otherChildLog = makeDayLog({ childId: 'child-b' })

      mockGetDoc.mockResolvedValueOnce({ exists: () => false })
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => otherChildLog,
      })

      renderHook(() => useDayLog(makeParams()))

      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => false,
        })
      })

      // Should create a fresh default instead of migrating the other child's doc
      expect(mockSetDoc).toHaveBeenCalledTimes(1)
      const writtenDoc = mockSetDoc.mock.calls[0][1]
      expect(writtenDoc.childId).toBe('child-a')
      expect(writtenDoc.createdAt).toBeDefined()
    })
  })

  describe('child switch', () => {
    it('clears stale dayLog when selectedChildId changes', async () => {
      const logA = makeDayLog({ childId: 'child-a' })

      const { result, rerender } = renderHook(
        (props) => useDayLog(props),
        { initialProps: makeParams() },
      )

      // Load child-a's log
      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => true,
          data: () => logA,
        })
      })
      expect(result.current.dayLog).toEqual(logA)

      // Switch to child-b
      rerender(makeParams({ selectedChildId: 'child-b' }))

      // dayLog should be cleared immediately
      expect(result.current.dayLog).toBeNull()
    })
  })

  describe('persist', () => {
    it('writeDayLog calls setDoc with updatedAt', async () => {
      const existingLog = makeDayLog()

      const { result } = renderHook(() => useDayLog(makeParams()))

      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => true,
          data: () => existingLog,
        })
      })

      // Call persistDayLogImmediate (bypasses debounce)
      const updatedLog = { ...existingLog, blocks: [] }
      await act(async () => {
        result.current.persistDayLogImmediate(updatedLog)
      })

      expect(mockSetDoc).toHaveBeenCalledTimes(1)
      const written = mockSetDoc.mock.calls[0][1]
      expect(written.updatedAt).toBeDefined()
      expect(written.blocks).toEqual([])
    })

    it('writeDayLog corrects childId if stale', async () => {
      const existingLog = makeDayLog()

      const { result } = renderHook(() => useDayLog(makeParams()))

      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => true,
          data: () => existingLog,
        })
      })

      // Pass a log with wrong childId
      const staleLog = { ...existingLog, childId: 'wrong-child' }
      await act(async () => {
        result.current.persistDayLogImmediate(staleLog)
      })

      const written = mockSetDoc.mock.calls[0][1]
      expect(written.childId).toBe('child-a')
    })

    it('tracks save state through saving → saved', async () => {
      const existingLog = makeDayLog()

      const { result } = renderHook(() => useDayLog(makeParams()))

      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => true,
          data: () => existingLog,
        })
      })

      expect(result.current.saveState).toBe('idle')

      await act(async () => {
        result.current.persistDayLogImmediate(existingLog)
      })

      expect(result.current.saveState).toBe('saved')
      expect(result.current.lastSavedAt).toBeDefined()
    })

    it('sets error save state on write failure', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore error'))

      const existingLog = makeDayLog()
      const { result } = renderHook(() => useDayLog(makeParams()))

      await act(async () => {
        snapshotCallbacks[0]?.callback({
          exists: () => true,
          data: () => existingLog,
        })
      })

      await act(async () => {
        result.current.persistDayLogImmediate(existingLog)
      })

      expect(result.current.saveState).toBe('error')
    })
  })

  describe('week plan loading', () => {
    it('loads week focus data from week plan snapshot', async () => {
      const { result } = renderHook(() => useDayLog(makeParams()))

      // The second onSnapshot subscription is for the week plan
      await act(async () => {
        snapshotCallbacks[1]?.callback({
          exists: () => true,
          id: '2026-05-04',
          data: () => ({
            theme: 'Perseverance',
            virtue: 'Grit',
            scriptureRef: 'James 1:2-4',
            readAloudBookId: 'book-123',
          }),
        })
      })

      expect(result.current.weekPlanId).toBe('2026-05-04')
      expect(result.current.weekFocus?.theme).toBe('Perseverance')
      expect(result.current.weekFocus?.virtue).toBe('Grit')
      expect(result.current.readAloudBookId).toBe('book-123')
    })

    it('clears week focus when no week plan exists', async () => {
      const { result } = renderHook(() => useDayLog(makeParams()))

      // Fire with non-existing week plan
      await act(async () => {
        snapshotCallbacks[1]?.callback({
          exists: () => false,
        })
      })

      expect(result.current.weekPlanId).toBeUndefined()
      expect(result.current.weekFocus).toBeNull()
      expect(result.current.readAloudBookId).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('sets snack message on snapshot error', async () => {
      const { result } = renderHook(() => useDayLog(makeParams()))

      // Fire error callback on day log snapshot
      await act(async () => {
        snapshotCallbacks[0]?.errorCb?.(new Error('Network error'))
      })

      expect(result.current.snackMessage).toEqual({
        text: 'Could not load today’s log.',
        severity: 'error',
      })
    })

    it('does not migrate twice (migratedOrCreated guard)', async () => {
      renderHook(() => useDayLog(makeParams()))

      // Fire non-existing snapshot twice
      await act(async () => {
        snapshotCallbacks[0]?.callback({ exists: () => false })
      })

      // Wait for first migration to complete
      await waitFor(() => {
        expect(mockSetDoc).toHaveBeenCalledTimes(1)
      })

      // Fire again — should NOT trigger another migration
      await act(async () => {
        snapshotCallbacks[0]?.callback({ exists: () => false })
      })

      expect(mockSetDoc).toHaveBeenCalledTimes(1)
    })
  })

  describe('no-op when missing params', () => {
    it('does not subscribe when selectedChildId is empty', () => {
      renderHook(() => useDayLog(makeParams({ selectedChildId: '' })))

      // onSnapshot should only be called for weekPlan (not dayLog)
      // because dayLogRef is null when selectedChildId is empty
      const dayLogSubscriptions = snapshotCallbacks.length
      // Week plan subscription always fires
      expect(dayLogSubscriptions).toBeLessThanOrEqual(1)
    })
  })
})
