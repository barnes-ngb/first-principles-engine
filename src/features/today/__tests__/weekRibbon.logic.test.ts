import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayLog } from '../../../core/types'
import {
  computeDayState,
  getPlanProgress,
  itemMinutes,
  parseMinutesFromLabel,
  pickDayLogsByDate,
  type PlanProgress,
} from '../weekRibbon.logic'

function makeLog(date: string, items: Array<Partial<ChecklistItem>>): DayLog {
  return {
    childId: 'kid-1',
    date,
    blocks: [],
    checklist: items.map((i, idx) => ({
      id: i.id ?? `item-${idx}`,
      label: i.label ?? 'Item',
      completed: i.completed ?? false,
      ...i,
    })),
  }
}

const NO_PLAN: PlanProgress = { planned: 0, checked: 0, rowsPlanned: 0, rowsDone: 0 }

describe('parseMinutesFromLabel', () => {
  it('parses minute hint from a label', () => {
    expect(parseMinutesFromLabel('Reading (20m)')).toBe(20)
  })
  it('returns 0 when no hint', () => {
    expect(parseMinutesFromLabel('Reading')).toBe(0)
  })
})

describe('itemMinutes', () => {
  it('prefers plannedMinutes', () => {
    expect(itemMinutes({ label: 'x', completed: false, plannedMinutes: 30, estimatedMinutes: 15 })).toBe(30)
  })
  it('falls back to estimatedMinutes', () => {
    expect(itemMinutes({ label: 'x', completed: false, estimatedMinutes: 15 })).toBe(15)
  })
  it('falls back to label-parsed minutes', () => {
    expect(itemMinutes({ label: 'Math (45m)', completed: false })).toBe(45)
  })
})

// ── The dot table (UX-444) — one test per row ───────────────────
//
// `done` / `partial` on a planned day stay PLAN-based; counted time decides
// whether a day that was not the plan still happened. The rows marked NEW fail
// against the retired rule, which read only the plan.

describe('computeDayState — the UX-444 table', () => {
  const today = '2026-05-14'
  const past = '2026-05-12'
  const future = '2026-05-15'
  const planned = (items: Array<Partial<ChecklistItem>>) =>
    getPlanProgress(makeLog(past, items))

  it('today, with a plan → in-progress', () => {
    const plan = planned([{ label: 'x', plannedMinutes: 30 }])
    expect(computeDayState(today, plan, 0, today)).toBe('in-progress')
  })

  it('NEW: today, no plan but counted minutes → in-progress', () => {
    expect(computeDayState(today, NO_PLAN, 25, today)).toBe('in-progress')
  })

  it('today, nothing at all → empty', () => {
    expect(computeDayState(today, NO_PLAN, 0, today)).toBe('empty')
  })

  it('NEW: past, no plan, counted > 0 → logged (not the empty ring)', () => {
    expect(computeDayState(past, NO_PLAN, 45, today)).toBe('logged')
  })

  it('past, plan, nothing checked, counted == 0 → skipped', () => {
    const plan = planned([{ label: 'x', plannedMinutes: 30 }])
    expect(computeDayState(past, plan, 0, today)).toBe('skipped')
  })

  it('NEW: past, plan, nothing checked, counted > 0 → partial', () => {
    const plan = planned([{ label: 'x', plannedMinutes: 30 }])
    expect(computeDayState(past, plan, 40, today)).toBe('partial')
  })

  it('past, plan, checked ≥ 80% of planned minutes → done', () => {
    const plan = planned([
      { label: 'a', completed: true, plannedMinutes: 30 },
      { label: 'b', completed: true, plannedMinutes: 30 },
      { label: 'c', completed: true, plannedMinutes: 20 },
      { label: 'd', completed: false, plannedMinutes: 20 },
    ])
    expect(computeDayState(past, plan, 80, today)).toBe('done')
  })

  it('past, plan, checked < 80% → partial', () => {
    const plan = planned([
      { label: 'a', completed: true, plannedMinutes: 20 },
      { label: 'b', completed: false, plannedMinutes: 80 },
    ])
    expect(computeDayState(past, plan, 20, today)).toBe('partial')
  })

  it('done stays plan-based: lots of counted time does not make an unticked plan done', () => {
    const plan = planned([{ label: 'x', plannedMinutes: 30 }])
    expect(computeDayState(past, plan, 600, today)).toBe('partial')
  })

  it('future, plan → pending', () => {
    const plan = planned([{ label: 'x', plannedMinutes: 30 }])
    expect(computeDayState(future, plan, 0, today)).toBe('pending')
  })

  it('nothing at all → empty, past or future', () => {
    expect(computeDayState(past, NO_PLAN, 0, today)).toBe('empty')
    expect(computeDayState(future, NO_PLAN, 0, today)).toBe('empty')
  })

  it('a net-negative day (a correction outweighing the time) is not counted time', () => {
    expect(computeDayState(past, NO_PLAN, -10, today)).toBe('empty')
  })
})

describe('pickDayLogsByDate', () => {
  it('takes this child’s longest checklist per date and ignores other dates', () => {
    const short = makeLog('2026-05-11', [{ label: 'a' }])
    const long = makeLog('2026-05-11', [{ label: 'a' }, { label: 'b' }])
    const brother = { ...makeLog('2026-05-11', [{ label: 'x' }, { label: 'y' }, { label: 'z' }]), childId: 'kid-2' }
    const outside = makeLog('2026-05-18', [{ label: 'q' }])
    const map = pickDayLogsByDate([short, long, brother, outside], 'kid-1', ['2026-05-11', '2026-05-12'])
    expect(map['2026-05-11']).toBe(long)
    expect(map['2026-05-12']).toBeNull()
    expect('2026-05-18' in map).toBe(false)
  })
})
