import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The automatic-credit driver's lifecycle: one timer chain per mounted child,
 * serial passes, bounded backoff, recovery on reconnect / reopen / nudge, and a
 * clean stop. The writer's own behaviour is tested beside it; here the pass is a
 * stand-in whose answers and timing the test controls.
 */

interface PassArgs {
  familyId: string
  childId: string
  after?: string | null
  isCurrent?: () => boolean
}
type PassResult = {
  listed: 'ok' | 'failed'
  settled: number
  retrying: number
  more: boolean
  nextCursor?: string | null
}

const pass = vi.fn<(args: PassArgs) => Promise<PassResult>>()
vi.mock('../../core/firebase/buildStudioHoursCreditWrites', () => ({
  reconcileBuildStudioCreditJobsForChild: (args: PassArgs) => pass(args),
}))

import {
  IDLE_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  TRIGGER_DELAY_MS,
  useBuildStudioAutoCredit,
  type UseBuildStudioAutoCreditArgs,
} from './useBuildStudioAutoCredit'

const done: PassResult = { listed: 'ok', settled: 0, retrying: 0, more: false }
const settledOne: PassResult = { listed: 'ok', settled: 1, retrying: 0, more: false }
const pendingOne: PassResult = { listed: 'ok', settled: 0, retrying: 1, more: false }
const offline: PassResult = { listed: 'failed', settled: 0, retrying: 0, more: false }

const base: UseBuildStudioAutoCreditArgs = { familyId: 'fam-1', childId: 'lincoln', enabled: true }
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  vi.useFakeTimers()
  pass.mockReset()
  pass.mockResolvedValue(done)
  setVisibility('visible')
})
afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
})

describe('useBuildStudioAutoCredit', () => {
  it('runs a pass at once on mount for exactly the confirmed family and child (reopen recovery)', async () => {
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0)
    expect(pass).toHaveBeenCalledTimes(1)
    expect(pass.mock.calls[0][0]).toMatchObject({ familyId: 'fam-1', childId: 'lincoln' })
  })

  it.each([
    ['not enabled', { ...base, enabled: false }],
    ['no family', { ...base, familyId: null }],
    ['no child', { ...base, childId: '' }],
  ])('does nothing when %s', async (_name, args) => {
    renderHook(() => useBuildStudioAutoCredit(args))
    await tick(IDLE_MS * 3)
    expect(pass).not.toHaveBeenCalled()
  })

  it('then polls at the idle cadence, one pass at a time and never as a busy loop', async () => {
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0)
    expect(pass).toHaveBeenCalledTimes(1)
    await tick(IDLE_MS - 1)
    expect(pass).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(pass).toHaveBeenCalledTimes(2)
    await tick(IDLE_MS * 4)
    expect(pass).toHaveBeenCalledTimes(6)
  })

  it('never overlaps passes: a slow pass is finished before the next is scheduled', async () => {
    let release!: (r: PassResult) => void
    pass.mockImplementationOnce(() => new Promise((r) => (release = r)))
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0)
    await tick(IDLE_MS * 3) // far longer than any cadence, while the first is still running
    expect(pass).toHaveBeenCalledTimes(1)
    release(done)
    await tick(0)
    await tick(IDLE_MS)
    expect(pass).toHaveBeenCalledTimes(2)
  })

  it('refreshes the caller once per pass that settled something, and only then', async () => {
    const onSettled = vi.fn()
    pass.mockResolvedValueOnce(settledOne).mockResolvedValue(done)
    renderHook(() => useBuildStudioAutoCredit({ ...base, onSettled }))
    await tick(0)
    expect(onSettled).toHaveBeenCalledTimes(1)
    await tick(IDLE_MS * 2)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('a failing refresh never stops the lifecycle', async () => {
    const onSettled = vi.fn(async () => {
      throw new Error('refresh failed')
    })
    pass.mockResolvedValueOnce(settledOne).mockResolvedValue(done)
    renderHook(() => useBuildStudioAutoCredit({ ...base, onSettled }))
    await tick(0)
    await tick(IDLE_MS)
    expect(pass).toHaveBeenCalledTimes(2)
  })

  it('backs off exponentially, to a ceiling, while work stays pending or reads fail', async () => {
    pass.mockResolvedValue(pendingOne)
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0)
    expect(pass).toHaveBeenCalledTimes(1)
    const gaps: number[] = []
    let elapsedSince = 0
    let calls = 1
    for (let ms = 0; ms < RETRY_MAX_MS * 4 && gaps.length < 8; ms += 1_000) {
      await tick(1_000)
      elapsedSince += 1_000
      if (pass.mock.calls.length > calls) {
        gaps.push(elapsedSince)
        elapsedSince = 0
        calls = pass.mock.calls.length
      }
    }
    expect(gaps.slice(0, 5)).toEqual([5_000, 10_000, 20_000, 40_000, 80_000])
    expect(Math.max(...gaps)).toBeLessThanOrEqual(RETRY_MAX_MS)
    expect(gaps[0]).toBe(RETRY_BASE_MS)
  })

  it('treats an unreadable queue like a failure, and recovers to the idle cadence once it reads', async () => {
    pass.mockResolvedValueOnce(offline).mockResolvedValueOnce(offline).mockResolvedValue(done)
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0) // 1: offline
    await tick(RETRY_BASE_MS) // 2: offline
    await tick(RETRY_BASE_MS * 2) // 3: ok
    expect(pass).toHaveBeenCalledTimes(3)
    await tick(RETRY_BASE_MS * 2)
    expect(pass).toHaveBeenCalledTimes(3) // idle now, not backing off at 5 s
    await tick(IDLE_MS)
    expect(pass).toHaveBeenCalledTimes(4)
  })

  it('a pass that throws is a failure to back off from, not an unhandled rejection', async () => {
    pass.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(done)
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0)
    await tick(RETRY_BASE_MS)
    expect(pass).toHaveBeenCalledTimes(2)
  })

  it('a plain backlog (more than one page, everything finished) continues quickly without backing off', async () => {
    pass.mockResolvedValue({ listed: 'ok', settled: 3, retrying: 0, more: true })
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0)
    await tick(RETRY_BASE_MS)
    await tick(RETRY_BASE_MS)
    await tick(RETRY_BASE_MS)
    expect(pass).toHaveBeenCalledTimes(4)
  })

  it('recovers when the connection returns, without waiting out the backoff', async () => {
    pass.mockResolvedValue(offline)
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0)
    await tick(RETRY_BASE_MS) // backed off to 10 s now
    expect(pass).toHaveBeenCalledTimes(2)
    pass.mockResolvedValue(done)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await tick(TRIGGER_DELAY_MS)
    expect(pass).toHaveBeenCalledTimes(3)
  })

  it('does not poll in a hidden tab, and runs a pass when it becomes visible', async () => {
    setVisibility('hidden')
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(IDLE_MS * 3)
    expect(pass).not.toHaveBeenCalled()
    setVisibility('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await tick(TRIGGER_DELAY_MS)
    expect(pass).toHaveBeenCalledTimes(1)
  })

  it('a new saved version nudges the same lifecycle, once per change, and never restarts it', async () => {
    const { rerender } = renderHook((p: UseBuildStudioAutoCreditArgs) => useBuildStudioAutoCredit(p), {
      initialProps: { ...base, nudgeKey: 1 },
    })
    await tick(0)
    expect(pass).toHaveBeenCalledTimes(1)
    rerender({ ...base, nudgeKey: 1 })
    await tick(TRIGGER_DELAY_MS)
    expect(pass).toHaveBeenCalledTimes(1) // same key: nothing

    rerender({ ...base, nudgeKey: 2 })
    await tick(TRIGGER_DELAY_MS)
    expect(pass).toHaveBeenCalledTimes(2) // a Save needed no extra tap
    // Still ONE timer chain: the idle cadence continues from here, not doubled.
    await tick(IDLE_MS - TRIGGER_DELAY_MS)
    expect(pass).toHaveBeenCalledTimes(2)
  })

  it('a nudge that arrives mid-pass runs exactly one more pass afterwards', async () => {
    let release!: (r: PassResult) => void
    pass.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const { rerender } = renderHook((p: UseBuildStudioAutoCreditArgs) => useBuildStudioAutoCredit(p), {
      initialProps: { ...base, nudgeKey: 1 },
    })
    await tick(0)
    rerender({ ...base, nudgeKey: 2 })
    rerender({ ...base, nudgeKey: 3 })
    expect(pass).toHaveBeenCalledTimes(1)
    release(done)
    await tick(TRIGGER_DELAY_MS)
    expect(pass).toHaveBeenCalledTimes(2)
    await tick(TRIGGER_DELAY_MS * 3)
    expect(pass).toHaveBeenCalledTimes(2)
  })

  it('cleans up on unmount: no timer, no listener, and an in-flight pass is told it is no longer current', async () => {
    let release!: (r: PassResult) => void
    pass.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const onSettled = vi.fn()
    const { unmount } = renderHook(() => useBuildStudioAutoCredit({ ...base, onSettled }))
    await tick(0)
    const { isCurrent } = pass.mock.calls[0][0]
    expect(isCurrent?.()).toBe(true)
    unmount()
    expect(isCurrent?.()).toBe(false)
    release(settledOne)
    await tick(IDLE_MS * 5)
    expect(pass).toHaveBeenCalledTimes(1) // no new work, no timer
    // The credit committed; the original closure guards its own scope.
    expect(onSettled).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await tick(IDLE_MS)
    expect(pass).toHaveBeenCalledTimes(1)
  })

  it('a child switch retires the old pass and starts one for the new child only', async () => {
    let release!: (r: PassResult) => void
    pass.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const onSettled = vi.fn()
    const { rerender } = renderHook((p: UseBuildStudioAutoCreditArgs) => useBuildStudioAutoCredit(p), {
      initialProps: { ...base, onSettled },
    })
    await tick(0)
    const first = pass.mock.calls[0][0]
    rerender({ ...base, childId: 'london', onSettled })
    await tick(0)
    expect(first.isCurrent?.()).toBe(false)
    expect(pass.mock.calls[1][0]).toMatchObject({ familyId: 'fam-1', childId: 'london' })
    release(settledOne) // the old child's pass answers late, having committed
    await tick(0)
    // Notified exactly once through the ORIGINAL closure, so switching back shows it.
    expect(onSettled).toHaveBeenCalledTimes(1)
    await tick(IDLE_MS * 3)
    // The retired scope scheduled nothing: only london's chain runs.
    expect(pass.mock.calls.every((c, i) => i === 0 || c[0].childId === 'london')).toBe(true)
  })

  it('a delayed settle still reaches the ORIGINAL refresh closure, not a newer one', async () => {
    let release!: (r: PassResult) => void
    pass.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const oldRefresh = vi.fn()
    const newRefresh = vi.fn()
    const { rerender } = renderHook((p: UseBuildStudioAutoCreditArgs) => useBuildStudioAutoCredit(p), {
      initialProps: { ...base, onSettled: oldRefresh },
    })
    await tick(0)
    rerender({ ...base, childId: 'london', onSettled: newRefresh })
    release(settledOne)
    await tick(0)
    expect(oldRefresh).toHaveBeenCalledTimes(1)
    expect(newRefresh).not.toHaveBeenCalled()
  })

  it('a family change is a different scope too, and a late settle is not reported across it', async () => {
    let release!: (r: PassResult) => void
    pass.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const onSettled = vi.fn()
    const { rerender } = renderHook((p: UseBuildStudioAutoCreditArgs) => useBuildStudioAutoCredit(p), {
      initialProps: { ...base, onSettled },
    })
    await tick(0)
    rerender({ ...base, familyId: 'fam-2', onSettled })
    await tick(0)
    expect(pass.mock.calls[1][0]).toMatchObject({ familyId: 'fam-2', childId: 'lincoln' })
    release(settledOne)
    await tick(0)
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('walks the queue with a cursor, then returns to the start with backoff so held rows cannot busy-loop', async () => {
    const held = { listed: 'ok', settled: 0, retrying: 2, more: true } as const
    pass
      .mockResolvedValueOnce({ ...held, nextCursor: 'a025' })
      .mockResolvedValueOnce({ ...held, nextCursor: 'b050' })
      .mockResolvedValueOnce({ listed: 'ok', settled: 1, retrying: 0, more: false, nextCursor: null })
      .mockResolvedValue({ listed: 'ok', settled: 0, retrying: 1, more: false, nextCursor: null })
    renderHook(() => useBuildStudioAutoCredit(base))
    await tick(0) // page 1, from the start
    expect(pass.mock.calls[0][0].after ?? null).toBeNull()
    await tick(RETRY_BASE_MS) // page 2 continues after page 1's last row, no backoff growth
    expect(pass.mock.calls[1][0].after).toBe('a025')
    await tick(RETRY_BASE_MS)
    expect(pass.mock.calls[2][0].after).toBe('b050')
    // The sweep ended with held rows: back off before starting over from the top.
    await tick(RETRY_BASE_MS - 1)
    expect(pass).toHaveBeenCalledTimes(3)
    await tick(1)
    expect(pass).toHaveBeenCalledTimes(4)
    expect(pass.mock.calls[3][0].after ?? null).toBeNull()
    // Still failing at the end of a sweep: the delay doubles, never a tight loop.
    await tick(RETRY_BASE_MS)
    expect(pass).toHaveBeenCalledTimes(4)
    await tick(RETRY_BASE_MS)
    expect(pass).toHaveBeenCalledTimes(5)
  })

  it('a scope switch starts with its own cursor', async () => {
    pass.mockResolvedValueOnce({ listed: 'ok', settled: 0, retrying: 0, more: true, nextCursor: 'a025' })
    const { rerender } = renderHook((p: UseBuildStudioAutoCreditArgs) => useBuildStudioAutoCredit(p), {
      initialProps: base,
    })
    await tick(0)
    rerender({ ...base, childId: 'london' })
    await tick(0)
    expect(pass.mock.calls[1][0]).toMatchObject({ childId: 'london' })
    expect(pass.mock.calls[1][0].after ?? null).toBeNull()
  })
})
