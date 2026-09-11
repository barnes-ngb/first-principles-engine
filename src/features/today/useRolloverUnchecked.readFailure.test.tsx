import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DayLog } from '../../core/types'

/**
 * UX-356(b) — "we didn't look" is not "nothing was left".
 *
 * The catch here was a `console.warn` and nothing else, so a dropped read of the
 * previous school day left the page carrying on exactly as though yesterday had
 * held nothing to carry forward. An unfinished Language Arts lesson silently did
 * not roll over, and the parent had no way to tell the two apart. Same rule as
 * the weekly review's *"Couldn't read this week's hours"*, and the **GATE**
 * verdict `useBusinessGoal` got in the child-switch census.
 *
 * POSITIVE CONTROL: delete `onReadFailed?.()` from the catch and the first test
 * fails.
 */

const getDoc = vi.fn<(...args: unknown[]) => Promise<unknown>>()

vi.mock('firebase/firestore', () => ({
  doc: (col: unknown, id: string) => ({ col, id }),
  getDoc: (...args: unknown[]) => getDoc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: () => ({ kind: 'days' }),
}))

/** A Thursday, so the previous school day is a real Wednesday. */
const TODAY = '2026-09-10'

const DAY: DayLog = {
  childId: 'lincoln',
  date: TODAY,
  checklist: [{ label: 'Language Arts lesson 4 (20m)', completed: false }],
} as DayLog

async function mountRollover(onReadFailed: () => void) {
  const { useRolloverUnchecked } = await import('./useRolloverUnchecked')
  return renderHook(() =>
    useRolloverUnchecked({
      familyId: 'fam-1',
      childId: 'lincoln',
      today: TODAY,
      dayLog: DAY,
      dailyPlan: null,
      persistDayLogImmediate: vi.fn(),
      onReadFailed,
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('a previous day that could not be read is reported', () => {
  it('tells the page when the read fails', async () => {
    getDoc.mockRejectedValueOnce(new Error('unavailable'))
    const onReadFailed = vi.fn()

    await mountRollover(onReadFailed)

    await waitFor(() => expect(onReadFailed).toHaveBeenCalledTimes(1))
  })

  it('says nothing when yesterday genuinely had nothing', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false })
    const onReadFailed = vi.fn()

    await mountRollover(onReadFailed)

    await waitFor(() => expect(getDoc).toHaveBeenCalled())
    expect(onReadFailed).not.toHaveBeenCalled()
  })

  it('says nothing when yesterday read fine', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ childId: 'lincoln', date: '2026-09-09', checklist: [] }),
    })
    const onReadFailed = vi.fn()

    await mountRollover(onReadFailed)

    await waitFor(() => expect(getDoc).toHaveBeenCalled())
    expect(onReadFailed).not.toHaveBeenCalled()
  })

  it('reports once, not on every re-render', async () => {
    getDoc.mockRejectedValue(new Error('unavailable'))
    const onReadFailed = vi.fn()

    const { rerender } = await mountRollover(onReadFailed)
    await waitFor(() => expect(onReadFailed).toHaveBeenCalledTimes(1))
    rerender()
    rerender()

    // The rollover runs at most once per child+day; a sentence repeated on every
    // render would be its own defect.
    await waitFor(() => expect(onReadFailed).toHaveBeenCalledTimes(1))
  })
})
