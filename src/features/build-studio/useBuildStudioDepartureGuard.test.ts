import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The departure guard (LOCAL-BUILD-001 repair #4).
 *
 * `beforeunload` is not a departure guard in this app: the AppShell's *Today*
 * link goes through the data router and unmounts the editor without firing it.
 * Verification reproduced exactly that — two failed commits, a visible *Try
 * again*, a tap on Today with no warning, and no retry on return.
 *
 * `useBlocker` is stubbed so the predicate it is handed can be called directly,
 * which is the thing under test: the router asks it AT NAVIGATION TIME, so it
 * must read a ref rather than a rendered boolean.
 *
 * POSITIVE CONTROL: change `useBlocker(shouldBlock)` to `useBlocker(false)` and
 * every "holds" case below fails.
 */

interface BlockerStub {
  state: 'unblocked' | 'blocked'
  proceed: () => void
  reset: () => void
}

/** The predicate the hook registered, captured for direct interrogation. */
let registered: (() => boolean) | boolean | null = null
const blocker: BlockerStub = {
  state: 'unblocked',
  proceed: vi.fn(),
  reset: vi.fn(),
}

vi.mock('react-router-dom', () => ({
  useBlocker: (arg: (() => boolean) | boolean) => {
    registered = arg
    return blocker
  },
}))

import { useBuildStudioDepartureGuard } from './useBuildStudioDepartureGuard'

/** Ask the registered predicate the way the router would. */
function askRouter(): boolean {
  return typeof registered === 'function' ? registered() : Boolean(registered)
}

beforeEach(() => {
  registered = null
  blocker.state = 'unblocked'
  vi.mocked(blocker.proceed).mockClear()
  vi.mocked(blocker.reset).mockClear()
})

describe('the router is asked, with a function, at navigation time', () => {
  it('registers a FUNCTION rather than a rendered boolean', () => {
    // A boolean is the answer as of the last render, which a tap that edits and
    // navigates in one tick gets wrong.
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => false,
        writeInFlight: () => false,
      }),
    )
    expect(typeof registered).toBe('function')
  })

  it('lets an idle, clean editor leave', () => {
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => false,
        writeInFlight: () => false,
      }),
    )
    expect(askRouter()).toBe(false)
  })

  it('holds a departure while work is at risk', () => {
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => true,
        writeInFlight: () => false,
      }),
    )
    expect(askRouter()).toBe(true)
  })

  it('holds a departure while a durable write is in flight', () => {
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => false,
        writeInFlight: () => true,
      }),
    )
    expect(askRouter()).toBe(true)
  })

  it('reads the CURRENT answer, not the one at registration', () => {
    // The whole reason the input is a function. A save that fails after the
    // hook rendered must still hold the next navigation.
    let atRisk = false
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => atRisk,
        writeInFlight: () => false,
      }),
    )
    expect(askRouter()).toBe(false)
    atRisk = true
    expect(askRouter()).toBe(true)
  })
})

describe('a held departure offers a real choice', () => {
  it('reports that it is held, and why', () => {
    blocker.state = 'blocked'
    const { result } = renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => true,
        writeInFlight: () => false,
      }),
    )
    expect(result.current.held).toBe(true)
    expect(result.current.reason).toBe('at-risk')
  })

  it('distinguishes "being saved right now" from "not saved yet"', () => {
    blocker.state = 'blocked'
    const { result } = renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => true,
        writeInFlight: () => true,
      }),
    )
    expect(result.current.reason).toBe('in-flight')
  })

  it('stays when asked to stay', () => {
    blocker.state = 'blocked'
    const { result } = renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => true,
        writeInFlight: () => false,
      }),
    )
    result.current.stay()
    expect(blocker.reset).toHaveBeenCalled()
    expect(blocker.proceed).not.toHaveBeenCalled()
  })

  it('leaves only on an explicit, confirmed choice', () => {
    blocker.state = 'blocked'
    const { result } = renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => true,
        writeInFlight: () => false,
      }),
    )
    result.current.leaveAnyway()
    expect(blocker.proceed).toHaveBeenCalled()
  })

  it('releases itself once the write lands and nothing is left at risk', () => {
    // So "tap Save, tap Today" is one tap rather than two.
    blocker.state = 'blocked'
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => false,
        writeInFlight: () => false,
      }),
    )
    expect(blocker.proceed).toHaveBeenCalled()
  })

  it('does NOT release itself while work is still at risk', () => {
    blocker.state = 'blocked'
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => true,
        writeInFlight: () => false,
      }),
    )
    expect(blocker.proceed).not.toHaveBeenCalled()
  })

  it('reports nothing held when the router is not blocking', () => {
    const { result } = renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => true,
        writeInFlight: () => false,
      }),
    )
    expect(result.current.held).toBe(false)
    expect(result.current.reason).toBeNull()
  })
})

describe('the tab-close warning is kept BESIDE the router guard', () => {
  it('warns when there is work at risk', () => {
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => true,
        writeInFlight: () => false,
      }),
    )
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    const prevented = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)
    // `preventDefault` is the spec'd form; the legacy `returnValue` assignment
    // beside it is what actually triggers the prompt in Chrome and Safari, and
    // jsdom does not model it reliably enough to assert on.
    expect(prevented).toHaveBeenCalled()
  })

  it('stays silent when there is nothing to lose', () => {
    renderHook(() =>
      useBuildStudioDepartureGuard({
        hasWorkAtRisk: () => false,
        writeInFlight: () => false,
      }),
    )
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    const prevented = vi.spyOn(event, 'preventDefault')
    window.dispatchEvent(event)
    expect(prevented).not.toHaveBeenCalled()
  })
})
