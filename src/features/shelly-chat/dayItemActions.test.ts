import { describe, expect, it } from 'vitest'

import type { ChatWeekDay, DayItemAction } from './dayItemActions'
import {
  checklistItemTitle,
  dayItemActionFootnote,
  describeDayItemAction,
  isDayItemAction,
  resolveDayItemAction,
} from './dayItemActions'

// Lincoln's live week, deliberately realistic: a finished row, an ordinary one,
// a skipped one, and a weekday with nothing on it.
function week(): ChatWeekDay[] {
  return [
    {
      dateKey: '2026-08-10',
      label: 'Monday',
      items: [
        { itemKey: 'Reading Eggs (30m)::Reading', label: 'Reading Eggs (30m)', completed: true },
        { itemKey: 'Math Facts (10m)::Math', label: 'Math Facts (10m)', completed: false },
      ],
    },
    { dateKey: '2026-08-11', label: 'Tuesday', items: [] },
    {
      dateKey: '2026-08-12',
      label: 'Wednesday',
      items: [
        { itemKey: 'row-9', label: 'Watch: Volcanoes (12m)', completed: false, skipped: true },
      ],
    },
    { dateKey: '2026-08-13', label: 'Thursday', items: [] },
    { dateKey: '2026-08-14', label: 'Friday', items: [] },
  ]
}

const remove = (dateKey: string, itemKey: string): DayItemAction => ({
  kind: 'removeItemFromDay',
  childId: 'lincoln',
  dateKey,
  itemKey,
})

const move = (from: string, to: string, itemKey: string): DayItemAction => ({
  kind: 'moveItemToDay',
  childId: 'lincoln',
  fromDateKey: from,
  toDateKey: to,
  itemKey,
})

const add = (dateKey: string): DayItemAction => ({
  kind: 'addItemToDay',
  childId: 'lincoln',
  dateKey,
  label: 'Sight word games',
  estimatedMinutes: 15,
})

describe('isDayItemAction', () => {
  it('recognises exactly the three live-day kinds', () => {
    expect(isDayItemAction(remove('2026-08-10', 'k'))).toBe(true)
    expect(isDayItemAction(move('2026-08-10', '2026-08-11', 'k'))).toBe(true)
    expect(isDayItemAction(add('2026-08-10'))).toBe(true)
    expect(
      isDayItemAction({ kind: 'addSightWord', childId: 'lincoln', word: 'the' }),
    ).toBe(false)
    expect(
      isDayItemAction({
        kind: 'setActivityMinutes',
        childId: 'lincoln',
        activityConfigId: 'cfg',
        minutes: 30,
      }),
    ).toBe(false)
  })
})

describe('resolveDayItemAction — the gate that keeps a hallucination off the write', () => {
  it('resolves a real row on a real day', () => {
    const result = resolveDayItemAction(
      remove('2026-08-10', 'Math Facts (10m)::Math'),
      week(),
      true,
      'Lincoln',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resolved.day.label).toBe('Monday')
    expect(result.resolved.item?.label).toBe('Math Facts (10m)')
  })

  it('drops a hallucinated itemKey WITH a reason the parent can read', () => {
    // FEAT-135's lesson: the model's prose says "confirm with a tap", so a
    // silently dropped proposal leaves the app promising a card that never
    // appears.
    const result = resolveDayItemAction(
      remove('2026-08-10', 'Handwriting (20m)::LanguageArts'),
      week(),
      true,
      'Lincoln',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.notice).toContain("couldn't find that item on Monday")
    // Never quotes the key back at her — it means nothing to a parent.
    expect(result.notice).not.toContain('::')
  })

  it('drops a row that exists, but on a DIFFERENT day of the week', () => {
    // The itemKey is real; it is just not on Tuesday. Resolution is per-day, so
    // the model cannot borrow a key from one day to edit another.
    const result = resolveDayItemAction(
      remove('2026-08-11', 'Math Facts (10m)::Math'),
      week(),
      true,
      'Lincoln',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.notice).toContain('Tuesday')
  })

  it('drops a date outside this week, with a reason', () => {
    for (const action of [
      remove('2026-08-17', 'Math Facts (10m)::Math'),
      remove('2026-08-15', 'Math Facts (10m)::Math'), // Saturday — not a school day
      add('2026-09-01'),
    ]) {
      const result = resolveDayItemAction(action, week(), true, 'Lincoln')
      expect(result.ok, JSON.stringify(action)).toBe(false)
      if (result.ok) continue
      expect(result.notice).toContain('current week')
    }
  })

  it("drops a move whose TARGET is outside this week, even when the source resolves", () => {
    const result = resolveDayItemAction(
      move('2026-08-10', '2026-08-17', 'Math Facts (10m)::Math'),
      week(),
      true,
      'Lincoln',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.notice).toContain('current week')
  })

  it('resolves a legitimate within-week move, carrying both days', () => {
    const result = resolveDayItemAction(
      move('2026-08-10', '2026-08-13', 'Math Facts (10m)::Math'),
      week(),
      true,
      'Lincoln',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resolved.day.label).toBe('Monday')
    expect(result.resolved.targetDay?.label).toBe('Thursday')
  })

  it('REFUSES a completed row at stage time, with the same sentence the UI uses', () => {
    for (const action of [
      remove('2026-08-10', 'Reading Eggs (30m)::Reading'),
      move('2026-08-10', '2026-08-13', 'Reading Eggs (30m)::Reading'),
    ]) {
      const result = resolveDayItemAction(action, week(), true, 'Lincoln')
      expect(result.ok, action.kind).toBe(false)
      if (result.ok) continue
      expect(result.notice).toContain('Lincoln already did this one')
      expect(result.notice).toContain('Un-check it first')
    }
  })

  it('lets a SKIPPED row be edited — skipped is not finished', () => {
    const result = resolveDayItemAction(remove('2026-08-12', 'row-9'), week(), true, 'Lincoln')
    expect(result.ok).toBe(true)
  })

  it('refuses everything without the parent capability, before touching the week', () => {
    for (const action of [
      remove('2026-08-10', 'Math Facts (10m)::Math'),
      move('2026-08-10', '2026-08-13', 'Math Facts (10m)::Math'),
      add('2026-08-10'),
    ]) {
      const result = resolveDayItemAction(action, week(), false, 'Lincoln')
      expect(result.ok, action.kind).toBe(false)
      if (result.ok) continue
      expect(result.notice).toContain('grown-up')
      expect(result.notice).toContain('nothing was changed')
    }
  })

  it('fails closed on an empty week — no week, no card', () => {
    const result = resolveDayItemAction(add('2026-08-10'), [], true, 'Lincoln')
    expect(result.ok).toBe(false)
  })

  it('resolves an add onto a weekday that has nothing on it yet', () => {
    // An empty day is a real day; a row can be added to it.
    const result = resolveDayItemAction(add('2026-08-11'), week(), true, 'Lincoln')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resolved.item).toBeUndefined()
    expect(result.resolved.day.label).toBe('Tuesday')
  })
})

describe('checklistItemTitle', () => {
  it('strips the saved (Nm) suffix so a card does not double the minutes', () => {
    expect(checklistItemTitle('Reading Eggs (30m)')).toBe('Reading Eggs')
    expect(checklistItemTitle('Watch: Volcanoes (12m)')).toBe('Watch: Volcanoes')
  })

  it('leaves a label with no suffix alone', () => {
    expect(checklistItemTitle('Nature walk')).toBe('Nature walk')
  })

  it('never returns an empty string, even for a label that is only a suffix', () => {
    expect(checklistItemTitle('(30m)')).toBe('(30m)')
  })
})

describe('describeDayItemAction — plain language, never an id', () => {
  const resolvedFor = (action: DayItemAction) => {
    const result = resolveDayItemAction(action, week(), true, 'Lincoln')
    if (!result.ok) throw new Error('fixture should resolve')
    return result.resolved
  }

  it('names the child, the weekday and the row for a removal', () => {
    const text = describeDayItemAction(
      resolvedFor(remove('2026-08-10', 'Math Facts (10m)::Math')),
      'Lincoln',
    )
    expect(text).toBe(`Remove "Math Facts" from Lincoln's Monday`)
  })

  it('names both days for a move', () => {
    const text = describeDayItemAction(
      resolvedFor(move('2026-08-10', '2026-08-13', 'Math Facts (10m)::Math')),
      'Lincoln',
    )
    expect(text).toBe(`Move "Math Facts" from Lincoln's Monday to Thursday`)
  })

  it('names the row, its minutes and the day for an add', () => {
    const text = describeDayItemAction(resolvedFor(add('2026-08-11')), 'Lincoln')
    expect(text).toBe(`Add "Sight word games" (15m) to Lincoln's Tuesday`)
  })

  it('never leaks an itemKey or a raw date into a preview', () => {
    for (const action of [
      remove('2026-08-10', 'Math Facts (10m)::Math'),
      move('2026-08-10', '2026-08-13', 'Math Facts (10m)::Math'),
      add('2026-08-11'),
    ]) {
      const text = describeDayItemAction(resolvedFor(action), 'Lincoln')
      expect(text, action.kind).not.toContain('::')
      expect(text, action.kind).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })
})

describe('dayItemActionFootnote', () => {
  it('tells a parent that finished work is not in play, for the subtractive kinds', () => {
    expect(dayItemActionFootnote(remove('2026-08-10', 'k'))).toContain('Finished work stays put')
    expect(dayItemActionFootnote(move('2026-08-10', '2026-08-13', 'k'))).toContain(
      'Finished work stays put',
    )
  })

  it('says an add touches nothing already on the day', () => {
    expect(dayItemActionFootnote(add('2026-08-10'))).toContain('Nothing already on it changes')
  })
})

describe('resolveDayItemAction — duplicate identities (Codex P1, PR #1667)', () => {
  // `retainChecklistForApply` KEEPS a completed row and Apply then appends the
  // freshly-planned one with the same label and subject — so a day really can
  // hold two rows of one identity, completed one FIRST.
  const dupWeek = (): ChatWeekDay[] => [
    {
      dateKey: '2026-08-10',
      label: 'Monday',
      items: [
        { itemKey: 'GATB Math (30m)::Math', label: 'GATB Math (30m)', completed: true },
        { itemKey: 'GATB Math (30m)::Math', label: 'GATB Math (30m)', completed: false },
      ],
    },
    { dateKey: '2026-08-13', label: 'Thursday', items: [] },
  ]

  it('resolves the EDITABLE duplicate, matching the write lane exactly', () => {
    // Taking the first match would refuse a legitimate edit of the fresh row as
    // finished work — a gate stricter than the lane it fronts, telling the
    // parent "he already did this one" about work he has not done.
    const result = resolveDayItemAction(
      remove('2026-08-10', 'GATB Math (30m)::Math'),
      dupWeek(),
      true,
      'Lincoln',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resolved.item?.completed).toBe(false)
  })

  it('applies the same tie-break to a move', () => {
    const result = resolveDayItemAction(
      move('2026-08-10', '2026-08-13', 'GATB Math (30m)::Math'),
      dupWeek(),
      true,
      'Lincoln',
    )
    expect(result.ok).toBe(true)
  })

  it('still refuses when EVERY duplicate is completed — the fallback is not a loophole', () => {
    const allDone: ChatWeekDay[] = [
      {
        dateKey: '2026-08-10',
        label: 'Monday',
        items: [
          { itemKey: 'GATB Math (30m)::Math', label: 'GATB Math (30m)', completed: true },
          { itemKey: 'GATB Math (30m)::Math', label: 'GATB Math (30m)', completed: true },
        ],
      },
    ]
    const result = resolveDayItemAction(
      remove('2026-08-10', 'GATB Math (30m)::Math'),
      allDone,
      true,
      'Lincoln',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.notice).toContain('Lincoln already did this one')
  })
})
