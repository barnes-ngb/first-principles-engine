import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayLog } from '../../core/types'
import {
  DayWriteRefusal,
  dayWriteFailureNotice,
  namedDayEdit,
} from './dayWriteOutcome'

function item(label: string, extra: Partial<ChecklistItem> = {}): ChecklistItem {
  return { label, completed: false, ...extra } as ChecklistItem
}

function day(checklist: ChecklistItem[]): DayLog {
  return { childId: 'lincoln', date: '2026-09-11', checklist } as DayLog
}

describe('namedDayEdit', () => {
  it('names the one row a checklist edit touched', () => {
    const untouched = item('Prayer and Scripture (10m)')
    const before = day([untouched, item('Math lesson 12 (20m)')])
    // The shape every Today call site produces: `.map()` returning the SAME
    // object for every row it did not change.
    const after = day(
      before.checklist!.map((it, i) => (i === 1 ? { ...it, completed: true } : it)),
    )

    expect(namedDayEdit(before, after)).toBe('Math lesson 12 (20m)')
  })

  it('names a single row appended at the end — how a watch row joins a day', () => {
    const before = day([item('Math lesson 12 (20m)')])
    const after = day([...before.checklist!, item('Watch: Volcanoes (12m)')])

    expect(namedDayEdit(before, after)).toBe('Watch: Volcanoes (12m)')
  })

  it('refuses to name anything when more than one row moved', () => {
    const before = day([item('A'), item('B')])
    const after = day([{ ...before.checklist![0] }, { ...before.checklist![1] }])

    expect(namedDayEdit(before, after)).toBeNull()
  })

  it('refuses to name anything on a removal or a reorder', () => {
    const before = day([item('A'), item('B'), item('C')])
    const after = day([before.checklist![0], before.checklist![2]])

    expect(namedDayEdit(before, after)).toBeNull()
  })

  it('has nothing to compare against with no previous document', () => {
    expect(namedDayEdit(null, day([item('A')]))).toBeNull()
  })

  it('declines a blank label rather than naming a row “”', () => {
    const before = day([item('  ')])
    const after = day([{ ...before.checklist![0], completed: true }])

    expect(namedDayEdit(before, after)).toBeNull()
  })
})

describe('dayWriteFailureNotice', () => {
  it('names the row and says it was taken back', () => {
    const notice = dayWriteFailureNotice(DayWriteRefusal.Rejected, 'Math lesson 12 (20m)')

    expect(notice.severity).toBe('error')
    expect(notice.text).toContain('Math lesson 12 (20m)')
    expect(notice.text).toContain("didn't save")
    expect(notice.text).toContain('back to how it was')
  })

  it('falls back to an honest unnamed sentence rather than guessing', () => {
    const notice = dayWriteFailureNotice(DayWriteRefusal.Rejected, null)

    expect(notice.severity).toBe('error')
    expect(notice.text).toContain("That change didn't save")
  })

  it('gives a refused write its own advice — reload, not retry-in-place', () => {
    const notice = dayWriteFailureNotice(DayWriteRefusal.NoTarget, 'Math lesson 12 (20m)')

    expect(notice.severity).toBe('error')
    expect(notice.text).toContain('Not saved')
    expect(notice.text).toContain('Reload')
  })

  it('is never a warning — a lost edit on a records surface is an error', () => {
    for (const reason of Object.values(DayWriteRefusal)) {
      expect(dayWriteFailureNotice(reason, null).severity).toBe('error')
    }
  })
})
