import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, DayLog } from '../../core/types'

/**
 * UX-351 — an edit that did not land says so, and is taken back.
 *
 * Shelly, 2026-09-11: *"she added to the lessons but some of them seem to have
 * failed or not saved."* `persistDayLogImmediate` set the screen first and never
 * took it back, and reported success with a snack while reporting failure with
 * nothing. A refused write — no child, no day ref — did not even move
 * `saveState`, so the indicator kept saying *Saved* from the last edit that
 * worked.
 *
 * THE QUIET PATHS ARE WHAT THIS FILE ASSERTS. A test that only proved the happy
 * path passed on every one of these defects, and did.
 *
 * POSITIVE CONTROL: revert `writeDayLog`'s catch to `setSaveState('error')`
 * alone, or its guard to a bare `return`, and the snack assertions below fail.
 */

const setDayLogGuarded = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
let snapshotHandler: ((snap: unknown) => void) | null = null

// Two listeners are opened — the day and the week plan. Only the day's matters
// here, so the collection marker rides on the ref and the week's is ignored.
vi.mock('firebase/firestore', () => ({
  doc: (col: { kind?: string }, id: string) => ({ id, kind: col?.kind }),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  onSnapshot: (ref: { kind?: string }, next: (snap: unknown) => void) => {
    if (ref?.kind === 'days') snapshotHandler = next
    return () => {}
  },
}))

vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: () => ({ kind: 'days' }),
  weeksCollection: () => ({ kind: 'weeks' }),
}))

vi.mock('./dayWriteGuard', () => ({
  setDayLogGuarded: (...args: unknown[]) => setDayLogGuarded(...args),
}))

function item(label: string): ChecklistItem {
  return { label, completed: false } as ChecklistItem
}

const STORED: DayLog = {
  childId: 'lincoln',
  date: '2026-09-11',
  checklist: [item('Prayer and Scripture (10m)'), item('Language Arts lesson 4 (20m)')],
} as DayLog

async function mountWithStoredDay(childId = 'lincoln') {
  const { useDayLog } = await import('./useDayLog')
  const rendered = renderHook(() =>
    useDayLog({
      familyId: 'fam-1',
      selectedChildId: childId,
      today: '2026-09-11',
      selectedChild: undefined,
      activeTemplate: undefined,
      activeRoutineItems: undefined,
    }),
  )
  // The listener delivers the stored day exactly as Firestore does.
  act(() => {
    snapshotHandler?.({ exists: () => true, data: () => STORED })
  })
  await waitFor(() => expect(rendered.result.current.dayLog).not.toBeNull())
  return rendered
}

/** The edit a parent makes: tick the second row, every other row untouched. */
function tickSecondRow(dayLog: DayLog): DayLog {
  return {
    ...dayLog,
    checklist: (dayLog.checklist ?? []).map((ci, i) =>
      i === 1 ? { ...ci, completed: true } : ci,
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  snapshotHandler = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a Today edit that did not save says so', () => {
  it('a rejected write names the row, takes it back, and shows an error', async () => {
    setDayLogGuarded.mockRejectedValueOnce(new Error('permission-denied'))
    const { result } = await mountWithStoredDay()
    const before = result.current.dayLog!

    await act(async () => {
      result.current.persistDayLogImmediate(tickSecondRow(before))
    })

    await waitFor(() => expect(result.current.saveState).toBe('error'))
    expect(result.current.snackMessage?.severity).toBe('error')
    // Named, because the parent needs to know WHICH lesson did not save.
    expect(result.current.snackMessage?.text).toContain('Language Arts lesson 4 (20m)')
    // And taken back — the screen no longer claims the row is done.
    expect(result.current.dayLog?.checklist?.[1].completed).toBe(false)
    expect(result.current.dayLog).toBe(before)
  })

  it('a REFUSED write reports too — a guard is a failure, not a quiet no-op', async () => {
    // No child selected: `writeDayLog` returns before attempting anything, and
    // used to leave `saveState` reading whatever the last success said.
    const { useDayLog } = await import('./useDayLog')
    const { result } = renderHook(() =>
      useDayLog({
        familyId: 'fam-1',
        selectedChildId: '',
        today: '2026-09-11',
        selectedChild: undefined,
        activeTemplate: undefined,
        activeRoutineItems: undefined,
      }),
    )

    await act(async () => {
      result.current.persistDayLogImmediate(tickSecondRow(STORED))
    })

    await waitFor(() => expect(result.current.saveState).toBe('error'))
    expect(result.current.snackMessage?.severity).toBe('error')
    expect(result.current.snackMessage?.text).toContain('Not saved')
    expect(setDayLogGuarded).not.toHaveBeenCalled()
  })

  it('does not undo an edit made since the failed one', async () => {
    setDayLogGuarded
      .mockRejectedValueOnce(new Error('offline'))
      // The second write is still in flight, so the only snack is the first's.
      .mockReturnValueOnce(new Promise(() => {}))
    const { result } = await mountWithStoredDay()
    const before = result.current.dayLog!

    await act(async () => {
      result.current.persistDayLogImmediate(tickSecondRow(before))
      // A second edit lands while the first is still in flight.
      result.current.persistDayLogImmediate({
        ...before,
        checklist: [...(before.checklist ?? []), item('Nature walk (30m)')],
      })
    })

    await waitFor(() => expect(result.current.snackMessage?.severity).toBe('error'))
    // The rollback is identity-guarded: the later edit survives.
    expect(result.current.dayLog?.checklist).toHaveLength(3)
    // And the sentence does not claim a rollback that did not happen (Codex
    // round 2, P1) — "it's back to how it was" over a screen that was not put
    // back is the same species of lie as "Saved" over a write that did not land.
    expect(result.current.snackMessage?.text).not.toContain('back to how it was')
    expect(result.current.snackMessage?.text).toContain('newer change')
  })

  it('does not name a row over a day it is no longer showing', async () => {
    // Codex round 1, P1's sibling: a write left in flight across a child switch
    // belongs to a day that is no longer on screen, and its sentence names a
    // checklist row — which over the brother's day reads as a claim about his.
    let reject: (err: Error) => void = () => {}
    setDayLogGuarded.mockReturnValueOnce(
      new Promise((_resolve, rej) => {
        reject = rej
      }),
    )
    const { useDayLog } = await import('./useDayLog')
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useDayLog({
          familyId: 'fam-1',
          selectedChildId: childId,
          today: '2026-09-11',
          selectedChild: undefined,
          activeTemplate: undefined,
          activeRoutineItems: undefined,
        }),
      { initialProps: { childId: 'lincoln' } },
    )
    act(() => {
      snapshotHandler?.({ exists: () => true, data: () => STORED })
    })
    await waitFor(() => expect(result.current.dayLog).not.toBeNull())

    await act(async () => {
      result.current.persistDayLogImmediate(tickSecondRow(result.current.dayLog!))
    })
    // The parent switches child while the write is still in flight.
    rerender({ childId: 'london' })
    await act(async () => {
      reject(new Error('permission-denied'))
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.snackMessage?.severity).toBe('error'))
    expect(result.current.snackMessage?.text).not.toContain('Language Arts lesson 4')
    expect(result.current.snackMessage?.text).toContain('before you switched')
  })

  it('still says Saved, loudly, when the write lands', async () => {
    const { result } = await mountWithStoredDay()

    await act(async () => {
      result.current.persistDayLogImmediate(tickSecondRow(result.current.dayLog!))
    })

    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    expect(result.current.snackMessage).toEqual({ text: 'Saved', severity: 'success' })
  })
})

describe('there is exactly one Today write lane', () => {
  it('exposes no debounced persist — the lane with no caller is gone', async () => {
    const { result } = await mountWithStoredDay()

    // UX-353: `persistDayLog` discarded a pending write on unmount and was
    // called by nothing. A loaded gun on the compliance rail is not kept.
    expect('persistDayLog' in result.current).toBe(false)
    expect(typeof result.current.persistDayLogImmediate).toBe('function')
  })
})
