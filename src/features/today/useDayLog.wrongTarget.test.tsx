import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, DayLog } from '../../core/types'

/**
 * UX-357 — a day write is addressed to the day it was COMPOSED from.
 *
 * Today is the heaviest write surface in the app, and every one of its handlers
 * composes its edit from the `dayLog` it closed over and hands the whole
 * document back. A handler that starts before a child switch or a day-arrow tap
 * and finishes after it is still holding the old document — a photo upload, a
 * scan, a dialog left open across the switch.
 *
 * The writer used to **re-stamp** that document with the live child and save it
 * under the live day's id, in a line labelled *"defense in depth"*. That is
 * exactly backwards: it turns a mis-addressed write into a confidently wrong
 * one. One boy's entire checklist lands on his brother's day, under his
 * brother's name, on the single lane where the preservation guard runs in
 * observe-only mode (`enforce: false`) and so logs the anomaly and proceeds.
 *
 * POSITIVE CONTROL: delete the `composedFor !== docId` guard in
 * `useDayLog.writeDayLog` and the first two tests below fail — the write goes
 * through and `setDayLogGuarded` is called with the other child's rows.
 */

const setDayLogGuarded = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
let snapshotHandler: ((snap: unknown) => void) | null = null

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

/** Lincoln's Tuesday, as the listener delivers it. */
const LINCOLNS_DAY: DayLog = {
  childId: 'lincoln',
  date: '2026-09-11',
  checklist: [item('Prayer and Scripture (10m)'), item('Language Arts lesson 4 (20m)')],
} as DayLog

beforeEach(() => {
  vi.clearAllMocks()
  snapshotHandler = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a day write is refused when it belongs to a different day', () => {
  async function mount(childId: string, date: string) {
    const { useDayLog } = await import('./useDayLog')
    const rendered = renderHook(
      (props: { childId: string; date: string }) =>
        useDayLog({
          familyId: 'fam-1',
          selectedChildId: props.childId,
          today: props.date,
          selectedChild: undefined,
          activeTemplate: undefined,
          activeRoutineItems: undefined,
        }),
      { initialProps: { childId, date } },
    )
    act(() => {
      snapshotHandler?.({ exists: () => true, data: () => LINCOLNS_DAY })
    })
    await waitFor(() => expect(rendered.result.current.dayLog).not.toBeNull())
    return rendered
  }

  it("refuses Lincoln's checklist onto London's day, and says so", async () => {
    const { result, rerender } = await mount('lincoln', '2026-09-11')
    // The edit a slow handler is holding: Lincoln's day, second row ticked.
    const stale: DayLog = {
      ...result.current.dayLog!,
      checklist: (result.current.dayLog!.checklist ?? []).map((ci, i) =>
        i === 1 ? { ...ci, completed: true } : ci,
      ),
    }

    // The parent switches child in Today's own `ChildSelector` while it runs.
    rerender({ childId: 'london', date: '2026-09-11' })
    setDayLogGuarded.mockClear()

    await act(async () => {
      result.current.persistDayLogImmediate(stale)
    })

    // Nothing was sent at all — this is the whole point. Before the guard, this
    // call landed on `2026-09-11_london` carrying Lincoln's two rows.
    expect(setDayLogGuarded).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.saveState).toBe('error'))
    expect(result.current.snackMessage?.severity).toBe('error')
    expect(result.current.snackMessage?.text).toContain('for a different day')
    // And it does not NAME the row: a row title read over the day now on screen
    // is a claim about that day.
    expect(result.current.snackMessage?.text).not.toContain('Language Arts lesson 4')
  })

  it("refuses yesterday's document onto today's, for the same child", async () => {
    const { result, rerender } = await mount('lincoln', '2026-09-11')
    const stale = result.current.dayLog!

    // The day arrow, not the child selector — the half the old child-only guard
    // never covered.
    rerender({ childId: 'lincoln', date: '2026-09-12' })
    setDayLogGuarded.mockClear()

    await act(async () => {
      result.current.persistDayLogImmediate({ ...stale, retro: 'went well' })
    })

    expect(setDayLogGuarded).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.snackMessage?.severity).toBe('error'))
    expect(result.current.snackMessage?.text).toContain('for a different day')
  })

  it('writes normally when the document and the page agree', async () => {
    const { result } = await mount('lincoln', '2026-09-11')
    setDayLogGuarded.mockClear()

    await act(async () => {
      result.current.persistDayLogImmediate({
        ...result.current.dayLog!,
        retro: 'good day',
      })
    })

    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    expect(setDayLogGuarded).toHaveBeenCalledTimes(1)
  })

  it('still fills a blank childId on the oldest legacy documents', async () => {
    const { result } = await mount('lincoln', '2026-09-11')
    setDayLogGuarded.mockClear()

    // A document with no `childId` states nothing, so it contradicts nothing —
    // it is stamped, exactly as before. Only a document that names a DIFFERENT
    // day is refused.
    await act(async () => {
      result.current.persistDayLogImmediate({
        date: '2026-09-11',
        checklist: [item('Prayer (10m)')],
      } as DayLog)
    })

    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    const written = setDayLogGuarded.mock.calls[0][1] as DayLog
    expect(written.childId).toBe('lincoln')
  })
})

describe('the loaded day is dropped the moment the page targets another one', () => {
  it('clears the rendered day on a DATE change, not only on a child change', async () => {
    const { useDayLog } = await import('./useDayLog')
    const rendered = renderHook(
      (props: { childId: string; date: string }) =>
        useDayLog({
          familyId: 'fam-1',
          selectedChildId: props.childId,
          today: props.date,
          selectedChild: undefined,
          activeTemplate: undefined,
          activeRoutineItems: undefined,
        }),
      { initialProps: { childId: 'lincoln', date: '2026-09-11' } },
    )
    act(() => {
      snapshotHandler?.({ exists: () => true, data: () => LINCOLNS_DAY })
    })
    await waitFor(() => expect(rendered.result.current.dayLog).not.toBeNull())

    // The guard used to key on the child alone, so tapping the day arrow left
    // yesterday's checklist rendered under tomorrow's heading until the new
    // snapshot arrived — and an edit made in that window composed tomorrow's
    // write out of yesterday's document.
    rendered.rerender({ childId: 'lincoln', date: '2026-09-12' })
    expect(rendered.result.current.dayLog).toBeNull()
  })

  it('still clears on a child change', async () => {
    const { useDayLog } = await import('./useDayLog')
    const rendered = renderHook(
      (props: { childId: string; date: string }) =>
        useDayLog({
          familyId: 'fam-1',
          selectedChildId: props.childId,
          today: props.date,
          selectedChild: undefined,
          activeTemplate: undefined,
          activeRoutineItems: undefined,
        }),
      { initialProps: { childId: 'lincoln', date: '2026-09-11' } },
    )
    act(() => {
      snapshotHandler?.({ exists: () => true, data: () => LINCOLNS_DAY })
    })
    await waitFor(() => expect(rendered.result.current.dayLog).not.toBeNull())

    rendered.rerender({ childId: 'london', date: '2026-09-11' })
    expect(rendered.result.current.dayLog).toBeNull()
  })
})
