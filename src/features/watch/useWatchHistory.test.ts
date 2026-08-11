import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    expect(watchHistoryWindowStart(90, new Date('2026-08-11T12:00:00Z'))).toBe('2026-05-13')
  })

  it('defaults to the declared window', () => {
    expect(WATCH_HISTORY_WINDOW_DAYS).toBe(90)
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
