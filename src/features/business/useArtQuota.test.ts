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

// `dateKey` is deliberately NOT mocked (FEAT-175). The window is now the app's
// own Sunday-start week, and the whole point of the change is that the boundary
// falls on Saturday night and NOT on an ordinary midnight — a mocked week key
// would assert that by construction instead of proving it. The real
// `weekKeyFromDate` (→ `getWeekRange`) runs here, and the rollover tests pin the
// system clock instead so it sees a known Saturday / Tuesday.
import { weekKeyFromDate } from '../../core/utils/dateKey'
import { MAX_TARGET_PAGE_COUNT } from '../books/storyPageTargets'
import { ART_QUOTA_MESSAGE, DEFAULT_WEEKLY_ART_QUOTA, useArtQuota } from './useArtQuota'

/** The doc id the hook should be using right now, for the current real week. */
const currentWeekDocId = (childId: string) => `${childId}-wk-${weekKeyFromDate(new Date())}`

/** A legacy FEAT-94/168 daily id: `{childId}-{YYYY-MM-DD}` and nothing else. */
const LEGACY_DAILY_ID = /^[^-]+-\d{4}-\d{2}-\d{2}$/

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
})

describe('useArtQuota', () => {
  it('the default cap is a weekly 100 and the message says "this week"', () => {
    // 10 (FEAT-94) → 25 (FEAT-168) → weekly 100 (FEAT-175). A book spends one
    // paid call per illustrated page and a "Long" book is 14, so 100 is roughly
    // seven Long books a week — the owner's ask ("some days it's a few books and
    // some more. Maybe a weekly max"), and still a real ceiling.
    expect(DEFAULT_WEEKLY_ART_QUOTA).toBe(100)
    // Enough for several of the longest book, not just one.
    expect(DEFAULT_WEEKLY_ART_QUOTA).toBeGreaterThanOrEqual(MAX_TARGET_PAGE_COUNT * 4)
    // Still a ceiling, not an open tap.
    expect(DEFAULT_WEEKLY_ART_QUOTA).toBeLessThanOrEqual(200)
    // The copy has to name the window it actually enforces, or the nudge lies
    // about when the budget comes back.
    expect(ART_QUOTA_MESSAGE).toMatch(/this week/i)
    expect(ART_QUOTA_MESSAGE).not.toMatch(/today/i)
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

  it('a capped kid subscribes to the per-week doc {childId}-wk-{weekStart} and tracks the count', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true }))

    expect(docMock).toHaveBeenCalledWith(expect.anything(), currentWeekDocId('lincoln'))

    emitCount(3)
    await waitFor(() => expect(result.current.count).toBe(3))
    // Derived from the constant, not a literal — the cap has moved twice
    // (FEAT-168, FEAT-175) and these assertions are about the arithmetic.
    expect(result.current.remaining).toBe(DEFAULT_WEEKLY_ART_QUOTA - 3)
    expect(result.current.atLimit).toBe(false)
  })

  it('the week doc id can never collide with a legacy daily id (the `wk-` segment)', () => {
    // A plain `{childId}-{weekStart}` for a Sunday IS that Sunday's legacy daily
    // id, so a leftover daily count would silently seed the new week. The `wk-`
    // segment is what keeps the two namespaces apart, and legacy daily docs are
    // left inert rather than migrated — so this is the guard that matters.
    renderHook(() => useArtQuota('lincoln', { capped: true }))

    const id = docMock.mock.calls[0][1]
    expect(id).toContain('-wk-')
    expect(id).not.toMatch(LEGACY_DAILY_ID)
    expect(id).toBe(`lincoln-wk-${weekKeyFromDate(new Date())}`)
  })

  it('atLimit flips true once the count reaches the cap', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true }))
    emitCount(DEFAULT_WEEKLY_ART_QUOTA)
    await waitFor(() => expect(result.current.atLimit).toBe(true))
    expect(result.current.remaining).toBe(0)
  })

  it('a missing counter doc reads as zero (fresh week)', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true }))
    emitCount(undefined)
    await waitFor(() => expect(result.current.count).toBe(0))
    expect(result.current.remaining).toBe(DEFAULT_WEEKLY_ART_QUOTA)
  })

  it('recordGeneration writes an atomic increment merge stamped with the weekStart', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true }))
    await result.current.recordGeneration()

    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [ref, payload, options] = setDocMock.mock.calls[0] as [
      { __doc: string },
      { childId: string; weekStart: string; count: unknown; date?: unknown },
      { merge: boolean },
    ]
    expect(ref.__doc).toBe(currentWeekDocId('lincoln'))
    expect(payload.childId).toBe('lincoln')
    // The doc records the week it covers, not a day (FEAT-175). `date` is gone.
    expect(payload.weekStart).toBe(weekKeyFromDate(new Date()))
    expect(payload.date).toBeUndefined()
    expect(payload.count).toEqual({ __increment: 1 })
    expect(options).toEqual({ merge: true })
  })

  it('honors a custom limit', async () => {
    const { result } = renderHook(() => useArtQuota('lincoln', { capped: true, limit: 3 }))
    expect(result.current.limit).toBe(3)
    emitCount(3)
    await waitFor(() => expect(result.current.atLimit).toBe(true))
  })

  it('rolls the subscription over at the week boundary — Saturday night into Sunday', () => {
    vi.useFakeTimers()
    try {
      // Just before local midnight on Saturday 2026-07-18. That week started on
      // Sunday 2026-07-12; the next one starts on Sunday 2026-07-19.
      vi.setSystemTime(new Date(2026, 6, 18, 23, 59, 0))
      renderHook(() => useArtQuota('lincoln', { capped: true }))
      expect(docMock).toHaveBeenLastCalledWith(expect.anything(), 'lincoln-wk-2026-07-12')

      // Cross into Sunday: the week advances and the timer fires.
      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000) // 2 min → past the +1s cushion
      })

      // The subscription re-targets the new week's counter doc, no refresh needed.
      expect(docMock).toHaveBeenLastCalledWith(expect.anything(), 'lincoln-wk-2026-07-19')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does NOT roll over at an ordinary midnight — Tuesday night into Wednesday', () => {
    vi.useFakeTimers()
    try {
      // Just before local midnight on Tuesday 2026-07-21, inside the week that
      // started Sunday 2026-07-19. Wednesday is the same week's budget.
      vi.setSystemTime(new Date(2026, 6, 21, 23, 59, 0))
      const { rerender } = renderHook(() => useArtQuota('lincoln', { capped: true }))
      expect(docMock).toHaveBeenLastCalledWith(expect.anything(), 'lincoln-wk-2026-07-19')

      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000) // now Wednesday 2026-07-22
      })
      // Re-render explicitly, so this proves the recomputed key is unchanged and
      // not merely that no timer happened to fire.
      rerender()

      expect(docMock).toHaveBeenLastCalledWith(expect.anything(), 'lincoln-wk-2026-07-19')
      // The old daily behaviour would have moved to a 2026-07-22 doc here.
      expect(docMock.mock.calls.map((c) => c[1])).not.toContain('lincoln-wk-2026-07-22')
    } finally {
      vi.useRealTimers()
    }
  })
})
