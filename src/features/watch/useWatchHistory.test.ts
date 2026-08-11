import { renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { getDocsMock, whereMock, orderByMock, queryMock } = vi.hoisted(() => ({
  getDocsMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ docs: [] })),
  whereMock: vi.fn((...args: unknown[]) => ({ __where: args })),
  orderByMock: vi.fn((...args: unknown[]) => ({ __orderBy: args })),
  queryMock: vi.fn((coll: unknown, ...rest: unknown[]) => ({ __query: rest, coll })),
}))

vi.mock('firebase/firestore', () => ({
  getDocs: getDocsMock,
  query: queryMock,
  where: whereMock,
  orderBy: orderByMock,
}))

vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: vi.fn(() => ({ __collection: 'days' })),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

import {
  WATCH_HISTORY_WINDOW_DAYS,
  useWatchHistory,
  watchHistoryWindowStart,
} from './useWatchHistory'

function emit(docs: unknown[]) {
  getDocsMock.mockResolvedValueOnce({ docs: docs.map((d) => ({ data: () => d })) })
}

beforeEach(() => {
  getDocsMock.mockReset()
  getDocsMock.mockResolvedValue({ docs: [] })
  whereMock.mockClear()
  orderByMock.mockClear()
  queryMock.mockClear()
})

describe('watchHistoryWindowStart', () => {
  it('walks back exactly the window in YYYY-MM-DD', () => {
    // Midday UTC — local and UTC agree for any plausible offset, so this pins
    // the arithmetic independently of the calendar question below.
    expect(watchHistoryWindowStart(90, new Date('2026-08-11T12:00:00Z'))).toBe('2026-05-13')
  })

  it('defaults to the declared window', () => {
    expect(WATCH_HISTORY_WINDOW_DAYS).toBe(90)
  })

})

/**
 * Codex P2 (PR #1660). Day-log doc keys are **local** `YYYY-MM-DD` strings and
 * `setDate` subtracts in local time — so serialising the boundary with
 * `toISOString()` would mix two calendars, landing a day late for any evening
 * west of Greenwich and silently dropping the real boundary day's watches out
 * of the window.
 *
 * CI runs in UTC, where the two spellings agree and any assertion would be
 * vacuous — so this block **forces a west-of-Greenwich zone** for its duration.
 * Node re-reads `process.env.TZ` for Dates constructed after the assignment.
 */
describe('watchHistoryWindowStart — local calendar, not UTC (Codex P2)', () => {
  const originalTz = process.env.TZ

  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles'
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  const localKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  it('does not shift the boundary a day late on a local evening', () => {
    // 8 PM local on Aug 11 is already Aug 12 in UTC — the case in the finding.
    const localEvening = new Date(2026, 7, 11, 20, 0, 0)
    expect(localEvening.getTimezoneOffset()).toBeGreaterThan(0) // guard: the zone really applied

    const expected = new Date(localEvening)
    expected.setDate(expected.getDate() - 90)

    expect(watchHistoryWindowStart(90, localEvening)).toBe(localKey(expected))
    // The UTC spelling is a genuinely different day here — that is the bug.
    expect(watchHistoryWindowStart(90, localEvening)).not.toBe(
      new Date(new Date(localEvening).setDate(localEvening.getDate() - 90))
        .toISOString()
        .slice(0, 10),
    )
  })

  it('agrees with the local calendar across the whole day', () => {
    for (const hour of [0, 1, 12, 17, 20, 23]) {
      const now = new Date(2026, 7, 11, hour, 30, 0)
      const start = new Date(now)
      start.setDate(start.getDate() - 90)
      expect(watchHistoryWindowStart(90, now)).toBe(localKey(start))
    }
  })
})

describe('useWatchHistory — the read is bounded', () => {
  it('constrains the read to the window rather than scanning every day log', async () => {
    renderHook(() => useWatchHistory())
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1))

    const since = watchHistoryWindowStart()
    expect(whereMock).toHaveBeenCalledWith('date', '>=', since)
  })

  it('applies no childId filter — the library is family-scoped', async () => {
    renderHook(() => useWatchHistory())
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1))

    // Only the date range narrows the query. A childId equality here would need
    // the composite index and would hide the sibling's watches on a 'both' video.
    expect(whereMock.mock.calls.map((c) => c[0])).toEqual(['date'])
  })

  it('orders by date only — no new composite index is required', async () => {
    renderHook(() => useWatchHistory())
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1))
    expect(orderByMock.mock.calls.map((c) => c[0])).toEqual(['date'])
  })

  it('reads ONCE, not as a live subscription', async () => {
    const { rerender } = renderHook(() => useWatchHistory())
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1))
    rerender()
    rerender()
    expect(getDocsMock).toHaveBeenCalledTimes(1)
  })

  it('does not read at all when disabled', async () => {
    renderHook(() => useWatchHistory(false))
    await waitFor(() => expect(getDocsMock).not.toHaveBeenCalled())
  })

  it('reports the window it actually read, so a caller never restates it', async () => {
    const { result } = renderHook(() => useWatchHistory())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.windowDays).toBe(WATCH_HISTORY_WINDOW_DAYS)
    expect(result.current.since).toBe(watchHistoryWindowStart())
  })
})

describe('useWatchHistory — folding and failure', () => {
  it('folds completed watch rows into a per-video index', async () => {
    emit([
      {
        childId: 'lincoln',
        date: '2026-08-04',
        checklist: [
          { label: 'Watch: a', completed: true, itemType: 'watch', watchVideoId: 'v1' },
          { label: 'Watch: b', completed: false, itemType: 'watch', watchVideoId: 'v2' },
        ],
      },
    ])
    const { result } = renderHook(() => useWatchHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.history.v1?.lastWatchedOn).toBe('2026-08-04')
    expect(result.current.history.v2).toBeUndefined()
    expect(result.current.error).toBeNull()
  })

  it('degrades to an empty history instead of taking the library down', async () => {
    getDocsMock.mockRejectedValueOnce(new Error('permission-denied'))
    const { result } = renderHook(() => useWatchHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.history).toEqual({})
    expect(result.current.error).toBe('permission-denied')
  })
})
