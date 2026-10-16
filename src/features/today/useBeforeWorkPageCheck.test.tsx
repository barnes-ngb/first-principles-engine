import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BeforeWorkCheckStatus, useBeforeWorkPageCheck } from './useBeforeWorkPageCheck'
import { BeforeWorkSuitability } from './beforeWorkPageCheck'
import type { ProspectivePageCheckOutcome } from '../../core/hooks/useProspectivePageCheck'
import type { WorksheetScanResult } from '../../core/types'

/**
 * The controller, under the conditions an independent host test found it
 * failing: a selection delivered from outside React after the child changed, an
 * A-B-A switch, capability revoked mid-flight, a callback retained past
 * unmount, and an environment where `URL.createObjectURL` throws.
 *
 * The runner is injected, so nothing here reaches a network, a database or a
 * Cloud Function.
 */

const realCheck = vi.fn()
vi.mock('../../core/hooks/useProspectivePageCheck', () => ({
  useProspectivePageCheck: () => ({ check: realCheck }),
}))

const file = () => new File(['x'], 'page.jpg', { type: 'image/jpeg' })

const results = (over: Partial<WorksheetScanResult> = {}): WorksheetScanResult => ({
  pageType: 'worksheet',
  subject: 'math',
  specificTopic: 'adding tens',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: 'Sits beside the work he is on.',
  estimatedMinutes: 15,
  teacherNotes: 'Six problems at a time.',
  ...over,
})

/** A runner whose answers are released by hand, one deferred per call. */
function deferredRunner() {
  const settle: Array<{
    resolve: (outcome: ProspectivePageCheckOutcome) => void
    reject: (err: Error) => void
  }> = []
  const runCheck = vi.fn(
    () =>
      new Promise<ProspectivePageCheckOutcome>((resolve, reject) => {
        settle.push({ resolve, reject })
      }),
  )
  return { runCheck, settle }
}

const base = { familyId: 'fam', childId: 'lincoln', dateKey: '2026-10-16', canCheck: true }

beforeEach(() => {
  realCheck.mockReset()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview') as unknown as typeof URL.createObjectURL
  globalThis.URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
})

describe('the gate is asked of what is live, not of a closure', () => {
  it('a child actor is refused, even calling start directly', async () => {
    const { runCheck } = deferredRunner()
    const { result } = renderHook(() =>
      useBeforeWorkPageCheck({ ...base, canCheck: false, runCheck }),
    )

    await act(async () => {
      await result.current.start(file())
    })

    expect(runCheck).not.toHaveBeenCalled()
    expect(realCheck).not.toHaveBeenCalled()
    expect(result.current.status).toBe(BeforeWorkCheckStatus.Idle)
  })

  it('a selection opened for child A is refused after the switch to B', async () => {
    const { runCheck } = deferredRunner()
    const { result, rerender } = renderHook(
      (props: { childId: string }) => useBeforeWorkPageCheck({ ...base, ...props, runCheck }),
      { initialProps: { childId: 'lincoln' } },
    )

    // The parent opens the picker for Lincoln — the token is what the picker
    // was opened under.
    const openedUnder = result.current.selectionToken
    // …switches child while the native picker is still open…
    rerender({ childId: 'london' })
    // …and only then chooses a file. This is the real failure: the change event
    // fires from outside React with the old element's handler.
    await act(async () => {
      await result.current.start(file(), undefined, openedUnder)
    })

    expect(runCheck).not.toHaveBeenCalled()
    expect(result.current.summary).toBeNull()
  })

  it('and still refused after A-B-A, where the scope matches again', async () => {
    const { runCheck } = deferredRunner()
    const { result, rerender } = renderHook(
      (props: { childId: string }) => useBeforeWorkPageCheck({ ...base, ...props, runCheck }),
      { initialProps: { childId: 'lincoln' } },
    )

    const openedUnder = result.current.selectionToken
    const staleStart = result.current.start
    rerender({ childId: 'london' })
    rerender({ childId: 'lincoln' })

    await act(async () => {
      await result.current.start(file(), undefined, openedUnder)
      // The retained callback itself is stale too, token or no token.
      await staleStart(file())
    })

    expect(runCheck).not.toHaveBeenCalled()
    expect(result.current.selectionToken).not.toBe(openedUnder)
  })

  it('a callback retained from before capability was revoked does not run', async () => {
    const { runCheck } = deferredRunner()
    const { result, rerender } = renderHook(
      (props: { canCheck: boolean }) => useBeforeWorkPageCheck({ ...base, ...props, runCheck }),
      { initialProps: { canCheck: true } },
    )

    const staleStart = result.current.start
    const openedUnder = result.current.selectionToken
    rerender({ canCheck: false })

    await act(async () => {
      await staleStart(file())
      await result.current.start(file(), undefined, openedUnder)
    })

    expect(runCheck).not.toHaveBeenCalled()
  })

  it('a callback retained past unmount does not run', async () => {
    const { runCheck } = deferredRunner()
    const { result, unmount } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))
    const staleStart = result.current.start
    unmount()

    await act(async () => {
      await staleStart(file())
    })

    expect(runCheck).not.toHaveBeenCalled()
  })

  it('a date change retires the selection the same way a child change does', async () => {
    const { runCheck } = deferredRunner()
    const { result, rerender } = renderHook(
      (props: { dateKey: string }) => useBeforeWorkPageCheck({ ...base, ...props, runCheck }),
      { initialProps: { dateKey: '2026-10-16' } },
    )
    const openedUnder = result.current.selectionToken
    rerender({ dateKey: '2026-10-17' })
    await act(async () => {
      await result.current.start(file(), undefined, openedUnder)
    })
    expect(runCheck).not.toHaveBeenCalled()
  })

  it('a family change does too', async () => {
    const { runCheck } = deferredRunner()
    const { result, rerender } = renderHook(
      (props: { familyId: string }) => useBeforeWorkPageCheck({ ...base, ...props, runCheck }),
      { initialProps: { familyId: 'fam' } },
    )
    const openedUnder = result.current.selectionToken
    rerender({ familyId: 'other-fam' })
    await act(async () => {
      await result.current.start(file(), undefined, openedUnder)
    })
    expect(runCheck).not.toHaveBeenCalled()
  })

  it('a live selection DOES run, and carries the row context as prompt context', async () => {
    const runCheck = vi.fn(async () => ({ results: results() }))
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      await result.current.start(file(), { itemLabel: 'GATB Math', subjectBucket: 'Math' }, result.current.selectionToken)
    })

    expect(runCheck).toHaveBeenCalledWith(expect.any(File), {
      familyId: 'fam',
      childId: 'lincoln',
      captureContext: { itemLabel: 'GATB Math', subjectBucket: 'Math' },
    })
    expect(result.current.itemLabel).toBe('GATB Math')
    expect(result.current.summary?.suitability).toBe(BeforeWorkSuitability.Workable)
  })
})

describe('one question at a time, and the latch always releases', () => {
  it('a second tap while one is running is dropped, not queued', async () => {
    const { runCheck, settle } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      void result.current.start(file())
      void result.current.start(file())
    })

    expect(runCheck).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe(BeforeWorkCheckStatus.Running)

    await act(async () => {
      settle[0].resolve({ results: results() })
    })
    await waitFor(() => expect(result.current.status).toBe(BeforeWorkCheckStatus.Answered))
  })

  it('RECOVERY: a preview that throws does not latch the door shut', async () => {
    // The first version called `URL.createObjectURL` outside the recovery path,
    // so an environment without object URLs left the latch held: run count
    // stayed at 0 for every later attempt.
    globalThis.URL.createObjectURL = vi.fn(() => {
      throw new Error('not implemented')
    }) as unknown as typeof URL.createObjectURL

    const runCheck = vi.fn(async () => ({ results: results() }))
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      await result.current.start(file())
    })
    expect(runCheck).toHaveBeenCalledTimes(1)
    // The answer still arrives — the preview is cosmetic.
    expect(result.current.summary?.conclusive).toBe(true)
    expect(result.current.photoPreviewUrl).toBeNull()

    // And the next attempt is not blocked.
    await act(async () => {
      result.current.close()
    })
    await act(async () => {
      await result.current.start(file())
    })
    expect(runCheck).toHaveBeenCalledTimes(2)
  })

  it('a rejected runner releases the latch and shows an honest non-answer', async () => {
    const { runCheck, settle } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      void result.current.start(file())
    })
    await act(async () => {
      settle[0].reject(new Error('boom'))
    })

    await waitFor(() => expect(result.current.status).toBe(BeforeWorkCheckStatus.Answered))
    expect(result.current.summary?.conclusive).toBe(false)
    expect(result.current.summary?.failureMessage).toMatch(/no learning or progress records change/i)

    // The latch really did release: a second attempt reaches the runner. NOT
    // awaited — this runner's promise is released by hand and never settles on
    // its own, and awaiting it here is what hung the first version of this test.
    await act(async () => {
      void result.current.start(file())
    })
    expect(runCheck).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe(BeforeWorkCheckStatus.Running)
  })

  it('a late failure from an abandoned request cannot disturb the current one', async () => {
    const { runCheck, settle } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      void result.current.start(file())
    })
    act(() => result.current.cancel())
    await act(async () => {
      void result.current.start(file())
    })
    // The abandoned FIRST request now fails…
    await act(async () => {
      settle[0].reject(new Error('late failure'))
    })
    // …and the second is still running, untouched.
    expect(result.current.status).toBe(BeforeWorkCheckStatus.Running)

    await act(async () => {
      settle[1].resolve({ results: results({ recommendation: 'modify' }) })
    })
    await waitFor(() =>
      expect(result.current.summary?.suitability).toBe(BeforeWorkSuitability.NeedsTweak),
    )
  })

  it('a late ANSWER from an abandoned request is dropped', async () => {
    const { runCheck, settle } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      void result.current.start(file())
    })
    act(() => result.current.cancel())
    expect(result.current.cancelled).toBe(true)

    await act(async () => {
      settle[0].resolve({ results: results() })
    })

    expect(result.current.summary).toBeNull()
    expect(result.current.status).toBe(BeforeWorkCheckStatus.Idle)
  })

  it('retry after an answer asks again and replaces what is shown', async () => {
    const { runCheck, settle } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      void result.current.start(file())
    })
    await act(async () => {
      settle[0].resolve({ results: results({ recommendation: 'skip', estimatedDifficulty: 'easy' }) })
    })
    await waitFor(() => expect(result.current.summary?.suitability).toBe(BeforeWorkSuitability.Easy))

    act(() => result.current.close())
    expect(result.current.summary).toBeNull()

    await act(async () => {
      void result.current.start(file())
    })
    await act(async () => {
      settle[1].resolve({ results: results({ estimatedDifficulty: 'too-hard' }) })
    })
    await waitFor(() =>
      expect(result.current.summary?.suitability).toBe(BeforeWorkSuitability.Stretch),
    )
  })
})

describe('the picker session is retired by the sheet’s lifecycle, not only by scope', () => {
  it('a selection from a picker opened before CLOSE is refused', async () => {
    // The host case: Upload opens the picker, the parent closes the sheet, and
    // the input — still mounted through the dialog's exit transition — delivers
    // its file. Expected AI requests: zero.
    const { runCheck } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    const openedUnder = result.current.selectionToken
    act(() => result.current.close())

    await act(async () => {
      await result.current.start(file(), undefined, openedUnder)
    })

    expect(runCheck).not.toHaveBeenCalled()
    expect(result.current.summary).toBeNull()
  })

  it('a selection from a picker opened before CANCEL is refused', async () => {
    const { runCheck } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    const openedUnder = result.current.selectionToken
    act(() => result.current.cancel())

    await act(async () => {
      await result.current.start(file(), undefined, openedUnder)
    })

    expect(runCheck).not.toHaveBeenCalled()
    // The cancel line is still on screen — retiring the session does not hide it.
    expect(result.current.cancelled).toBe(true)
  })

  it('a selection from a picker opened before a RETRY is refused', async () => {
    const runCheck = vi.fn(async () => ({ results: results() }))
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      await result.current.start(file())
    })
    const openedUnderFirstSession = result.current.selectionToken
    // "Check another page" → close() keeps the sheet open but retires the picker.
    act(() => result.current.close())

    await act(async () => {
      await result.current.start(file(), undefined, openedUnderFirstSession)
    })
    expect(runCheck).toHaveBeenCalledTimes(1)
  })

  it('POSITIVE CONTROL — after any of those, a FRESH selection still works', async () => {
    const runCheck = vi.fn(async () => ({ results: results() }))
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    for (const retire of ['close', 'cancel', 'beginPickerSession'] as const) {
      act(() => result.current[retire]())
      await act(async () => {
        // The token read AFTER the retirement is the live session's.
        await result.current.start(file(), undefined, result.current.selectionToken)
      })
    }

    expect(runCheck).toHaveBeenCalledTimes(3)
    expect(result.current.summary?.conclusive).toBe(true)
  })

  it('reopening retires the previous session too', async () => {
    const { runCheck } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    const openedUnder = result.current.selectionToken
    act(() => result.current.beginPickerSession())
    expect(result.current.selectionToken).not.toBe(openedUnder)

    await act(async () => {
      await result.current.start(file(), undefined, openedUnder)
    })
    expect(runCheck).not.toHaveBeenCalled()
  })

  it('and the SCOPE token survives close / cancel / retry, so a retry cannot close the sheet', () => {
    const { runCheck } = deferredRunner()
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))
    const scope = result.current.scopeToken

    act(() => result.current.close())
    expect(result.current.scopeToken).toBe(scope)
    act(() => result.current.cancel())
    expect(result.current.scopeToken).toBe(scope)
    act(() => result.current.beginPickerSession())
    expect(result.current.scopeToken).toBe(scope)
  })

  it('but a child switch — and an A-B-A — moves the scope token on', () => {
    const { runCheck } = deferredRunner()
    const { result, rerender } = renderHook(
      (props: { childId: string }) => useBeforeWorkPageCheck({ ...base, ...props, runCheck }),
      { initialProps: { childId: 'lincoln' } },
    )
    const first = result.current.scopeToken
    rerender({ childId: 'london' })
    expect(result.current.scopeToken).not.toBe(first)
    rerender({ childId: 'lincoln' })
    // Back to the same child, but NOT back to the same token — otherwise a
    // sheet closed on the way out would re-open here.
    expect(result.current.scopeToken).not.toBe(first)
  })
})

describe('the service being older than the app', () => {
  it('is reported as unavailable, not as something to retry now', async () => {
    const runCheck = vi.fn(async () => ({ results: null, sendFailed: true, unsupported: true }))
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      await result.current.start(file())
    })

    expect(result.current.summary?.conclusive).toBe(false)
    expect(result.current.summary?.failureMessage).toMatch(/isn’t available yet/i)
    expect(result.current.summary?.failureMessage).toMatch(/nothing at all was written/i)
    expect(result.current.summary?.failureMessage).not.toMatch(/may or may not have reached the AI/i)
  })
})

describe('no stale answer is ever on screen', () => {
  it('an answered result is hidden the moment the child changes — not one frame later', async () => {
    const runCheck = vi.fn(async () => ({ results: results() }))
    const { result, rerender } = renderHook(
      (props: { childId: string }) => useBeforeWorkPageCheck({ ...base, ...props, runCheck }),
      { initialProps: { childId: 'lincoln' } },
    )

    await act(async () => {
      await result.current.start(file())
    })
    expect(result.current.summary).not.toBeNull()

    // No `act` around the switch: the very first render after it must already
    // be hiding the old answer, because the visible state is stamped rather
    // than cleared by an effect.
    rerender({ childId: 'london' })
    expect(result.current.summary).toBeNull()
    expect(result.current.status).toBe(BeforeWorkCheckStatus.Idle)
    expect(result.current.photoPreviewUrl).toBeNull()
    expect(result.current.cancelled).toBe(false)
  })

  it('and cannot reappear when the parent switches back', async () => {
    const runCheck = vi.fn(async () => ({ results: results() }))
    const { result, rerender } = renderHook(
      (props: { childId: string }) => useBeforeWorkPageCheck({ ...base, ...props, runCheck }),
      { initialProps: { childId: 'lincoln' } },
    )

    await act(async () => {
      await result.current.start(file())
    })
    rerender({ childId: 'london' })
    rerender({ childId: 'lincoln' })

    expect(result.current.summary).toBeNull()
  })

  it('a send failure is an inconclusive answer, not a silent one', async () => {
    const runCheck = vi.fn(async () => ({ results: null, sendFailed: true }))
    const { result } = renderHook(() => useBeforeWorkPageCheck({ ...base, runCheck }))

    await act(async () => {
      await result.current.start(file())
    })

    expect(result.current.summary?.conclusive).toBe(false)
    expect(result.current.summary?.failureMessage).toMatch(/may or may not have reached the AI/i)
  })
})
