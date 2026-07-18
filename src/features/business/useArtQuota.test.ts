import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────

const { setDocMock, onSnapshotMock, incrementMock, docMock } = vi.hoisted(() => ({
  setDocMock: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  onSnapshotMock: vi.fn<(...args: unknown[]) => () => void>(() => () => undefined),
  incrementMock: vi.fn((n: number) => ({ __increment: n })),
  docMock: vi.fn((_coll: unknown, id: string) => ({ __doc: id })),
}))

vi.mock('firebase/firestore', () => ({
  doc: docMock,
  onSnapshot: onSnapshotMock,
  setDoc: setDocMock,
  increment: incrementMock,
}))

vi.mock('../../core/firebase/firestore', () => ({
  artQuotaCollection: vi.fn(() => ({ __collection: 'artQuota' })),
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

// Pin the day so the doc id is deterministic — mutable so the rollover test can
// advance it across local midnight.
const dayHolder = vi.hoisted(() => ({ value: '2026-07-18' }))
vi.mock('../../core/utils/dateKey', () => ({
  todayKey: () => dayHolder.value,
}))

import { ART_QUOTA_MESSAGE, DEFAULT_DAILY_ART_QUOTA, useArtQuota } from './useArtQuota'

/** Drive the stored onSnapshot success callback with a given count. */
function emitCount(count: number | undefined) {
  const onNext = onSnapshotMock.mock.calls[0][1] as (snap: unknown) => void
  act(() => onNext({ data: () => (count === undefined ? undefined : { count }) }))
}

beforeEach(() => {
  setDocMock.mockClear()
  onSnapshotMock.mockReset()
  onSnapshotMock.mockReturnValue(() => undefined)
  incrementMock.mockClear()
  docMock.mockClear()
  dayHolder.value = '2026-07-18'
})

describe('useArtQuota', () => {
  it('the default cap is 10 and the message is warm + non-shaming', () => {
    expect(DEFAULT_DAILY_ART_QUOTA).toBe(10)
    expect(ART_QUOTA_MESSAGE).toMatch(/ask a grown-up/i)
    expect(ART_QUOTA_MESSAGE).not.toMatch(/error|fail|denied|not allowed/i)
  })

  it('a parent is uncapped: never subscribes, remaining is Infinity, recordGeneration is a no-op', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: false }))

    expect(onSnapshotMock).not.toHaveBeenCalled()
    expect(result.current.atLimit).toBe(false)
    expect(result.current.remaining).toBe(Infinity)

    await result.current.recordGeneration()
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('a capped kid subscribes to the per-day doc {childId}-{date} and tracks the count', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true }))

    expect(docMock).toHaveBeenCalledWith(expect.anything(), 'lincoln-2026-07-18')

    emitCount(3)
    await waitFor(() => expect(result.current.count).toBe(3))
    expect(result.current.remaining).toBe(7)
    expect(result.current.atLimit).toBe(false)
  })

  it('atLimit flips true once the count reaches the cap', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true }))
    emitCount(10)
    await waitFor(() => expect(result.current.atLimit).toBe(true))
    expect(result.current.remaining).toBe(0)
  })

  it('a missing counter doc reads as zero (fresh day)', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true }))
    emitCount(undefined)
    await waitFor(() => expect(result.current.count).toBe(0))
    expect(result.current.remaining).toBe(10)
  })

  it('recordGeneration writes an atomic increment merge to the per-day doc', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true }))
    await result.current.recordGeneration()

    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [, payload, options] = setDocMock.mock.calls[0] as [
      unknown,
      { childId: string; date: string; count: unknown },
      { merge: boolean },
    ]
    expect(payload.childId).toBe('lincoln')
    expect(payload.date).toBe('2026-07-18')
    expect(payload.count).toEqual({ __increment: 1 })
    expect(options).toEqual({ merge: true })
  })

  it('honors a custom limit', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true, limit: 3 }))
    expect(result.current.limit).toBe(3)
    emitCount(3)
    await waitFor(() => expect(result.current.atLimit).toBe(true))
  })

  it('rolls the subscription over to the new day at local midnight while mounted', () => {
    vi.useFakeTimers()
    try {
      // Just before local midnight on 2026-07-18.
      vi.setSystemTime(new Date(2026, 6, 18, 23, 59, 0))
      renderHook(() => useArtQuota('lincoln', { capped: true }))
      expect(docMock).toHaveBeenLastCalledWith(expect.anything(), 'lincoln-2026-07-18')

      // Cross midnight: the calendar day advances and the timer fires.
      dayHolder.value = '2026-07-19'
      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000) // 2 min → past the +1s cushion
      })

      // The subscription re-targets the new day's counter doc, no refresh needed.
      expect(docMock).toHaveBeenLastCalledWith(expect.anything(), 'lincoln-2026-07-19')
    } finally {
      vi.useRealTimers()
    }
  })
})
