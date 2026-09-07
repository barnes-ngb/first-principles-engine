import { describe, expect, it } from 'vitest'

import type { AppBlock, DraftDayPlan, DraftWeeklyPlan } from '../../core/types'
import { DayType, PlanType, SubjectBucket } from '../../core/types/enums'
import {
  buildDayTypeSection,
  DAY_TYPE_SHAPE,
  applyDayTypeToDay,
  enforceDayTypes,
  lifeDayNames,
  lightDayNames,
  plannedPlanTypeWrite,
  plannerDayTypeLabel,
  PLANNER_DAY_TYPE_CHOICES,
  resolvePlannerDayType,
  restoreAllDayTypes,
  setPlannerDayType,
} from './plannerDayTypes'

const appBlocks: AppBlock[] = [{ label: 'Reading Eggs', defaultMinutes: 45 }]

function day(name: string, titles: string[]): DraftDayPlan {
  return {
    day: name,
    timeBudgetMinutes: 260,
    items: titles.map((title, i) => ({
      id: `${name}-${i}`,
      title,
      subjectBucket: SubjectBucket.Math,
      estimatedMinutes: 20,
      skillTags: [],
      accepted: true,
      category: 'must-do' as const,
    })),
  }
}

function week(days: DraftDayPlan[]): DraftWeeklyPlan {
  return { days, skipSuggestions: [] } as unknown as DraftWeeklyPlan
}

describe('resolvePlannerDayType', () => {
  it('reads an absent config as Full — the no-migration rule', () => {
    expect(resolvePlannerDayType('Tuesday', undefined)).toBe(DayType.Normal)
    expect(resolvePlannerDayType('Tuesday', [])).toBe(DayType.Normal)
  })

  it('reads a day absent from a non-empty config as Full', () => {
    const config = [{ day: 'Monday', dayType: DayType.Life }]
    expect(resolvePlannerDayType('Tuesday', config)).toBe(DayType.Normal)
  })

  it('reads the day it was set for', () => {
    const config = [{ day: 'Tuesday', dayType: DayType.Life }]
    expect(resolvePlannerDayType('Tuesday', config)).toBe(DayType.Life)
  })
})

describe('setPlannerDayType', () => {
  it('appends a day that had no row, leaving untouched days absent', () => {
    const next = setPlannerDayType(undefined, 'Tuesday', DayType.Life)
    expect(next).toEqual([{ day: 'Tuesday', dayType: DayType.Life }])
  })

  it('updates in place rather than appending a second row', () => {
    const first = setPlannerDayType([], 'Tuesday', DayType.Life)
    const second = setPlannerDayType(first, 'Tuesday', DayType.Normal)
    expect(second).toEqual([{ day: 'Tuesday', dayType: DayType.Normal }])
  })

  it('does not mutate the config it was given', () => {
    const original = [{ day: 'Tuesday', dayType: DayType.Life }]
    setPlannerDayType(original, 'Tuesday', DayType.Normal)
    expect(original).toEqual([{ day: 'Tuesday', dayType: DayType.Life }])
  })
})

describe('the offered choices', () => {
  it('offers exactly Full, Light and Life — never the consumer-less Appointment', () => {
    expect(PLANNER_DAY_TYPE_CHOICES.map((c) => c.value)).toEqual([
      DayType.Normal,
      DayType.Light,
      DayType.Life,
    ])
  })

  it('still SHAPES every member of the union, Appointment included', () => {
    // The partition lesson (UX-204): a stored `appointment` must land somewhere
    // rather than falling through. Adding a `DayType` member fails to compile
    // against this Record until it is given a shape.
    for (const value of Object.values(DayType)) {
      expect(DAY_TYPE_SHAPE[value]).toBeDefined()
    }
    expect(DAY_TYPE_SHAPE[DayType.Appointment]).toBe('light')
  })

  it('describes each kind of day without ranking it against the others', () => {
    // The same charter rule `today/dayTypeChoices.test.ts` holds: a line may say
    // what a day IS, never that it is less than another one.
    const ranking = /\b(less|lighter|fewer|reduced|minimum|bare|only a|instead of the full|can'?t|cannot|shortfall|behind)\b/i
    for (const choice of PLANNER_DAY_TYPE_CHOICES) {
      expect(choice.description).not.toMatch(ranking)
      expect(choice.description.length).toBeGreaterThan(0)
    }
  })

  it('labels every offered choice short enough for a phone chip', () => {
    for (const choice of PLANNER_DAY_TYPE_CHOICES) {
      expect(choice.label.length).toBeLessThanOrEqual(10)
    }
  })

  it('falls back to a real label for a type it does not offer', () => {
    expect(plannerDayTypeLabel(DayType.Appointment)).toBe('Light')
    expect(plannerDayTypeLabel(DayType.Life)).toBe('Life Day')
  })
})

describe('enforceDayTypes', () => {
  const draft = week([
    day('Monday', ['Math', 'Reading']),
    day('Tuesday', ['Math', 'Reading']),
    day('Wednesday', ['Math', 'Reading']),
  ])

  it('returns the draft untouched when nothing is set', () => {
    expect(enforceDayTypes(draft, undefined, appBlocks)).toBe(draft)
    expect(enforceDayTypes(draft, [], appBlocks)).toBe(draft)
  })

  it('returns the draft untouched when every day is Full', () => {
    const allFull = [
      { day: 'Monday', dayType: DayType.Normal },
      { day: 'Tuesday', dayType: DayType.Normal },
    ]
    expect(enforceDayTypes(draft, allFull, appBlocks)).toBe(draft)
  })

  it('empties a Life day and leaves every other day alone', () => {
    const result = enforceDayTypes(
      draft,
      [{ day: 'Tuesday', dayType: DayType.Life }],
      appBlocks,
    )
    expect(result.days.find((d) => d.day === 'Tuesday')!.items).toEqual([])
    expect(result.days.find((d) => d.day === 'Monday')!.items).toHaveLength(2)
    expect(result.days.find((d) => d.day === 'Wednesday')!.items).toHaveLength(2)
  })

  it('keeps a Life day\'s budget — a relabel, never a destruction', () => {
    const result = enforceDayTypes(
      draft,
      [{ day: 'Tuesday', dayType: DayType.Life }],
      appBlocks,
    )
    const tuesday = result.days.find((d) => d.day === 'Tuesday')!
    expect(tuesday.timeBudgetMinutes).toBe(260)
    expect(tuesday.day).toBe('Tuesday')
  })

  it('replaces a Light day with the shared template', () => {
    const result = enforceDayTypes(
      draft,
      [{ day: 'Wednesday', dayType: DayType.Light }],
      appBlocks,
    )
    const titles = result.days.find((d) => d.day === 'Wednesday')!.items.map((i) => i.title)
    expect(titles).toContain('Quick writing (copy 1 sentence)')
    expect(titles).toContain('Math facts sprint (5 min)')
    expect(titles).not.toContain('Math')
  })

  it('holds the owner\'s case: two set-aside days, three that keep the routine', () => {
    // "Tuesday Thursday would be packing days" — the report this run exists for.
    const fullWeek = week([
      day('Monday', ['Math']),
      day('Tuesday', ['Math']),
      day('Wednesday', ['Math']),
      day('Thursday', ['Math']),
      day('Friday', ['Math']),
    ])
    const result = enforceDayTypes(
      fullWeek,
      [
        { day: 'Tuesday', dayType: DayType.Life },
        { day: 'Thursday', dayType: DayType.Life },
      ],
      appBlocks,
    )
    expect(result.days.filter((d) => d.items.length === 0).map((d) => d.day)).toEqual([
      'Tuesday',
      'Thursday',
    ])
    expect(result.days.filter((d) => d.items.length > 0)).toHaveLength(3)
  })

  it('is what makes a pick survive a regenerate — a fresh full draft is re-shaped', () => {
    const picks = [{ day: 'Tuesday', dayType: DayType.Life }]
    const regenerated = week([day('Tuesday', ['Math', 'Reading', 'Prayer'])])
    expect(enforceDayTypes(regenerated, picks, appBlocks).days[0].items).toEqual([])
  })

  it('does not mutate the draft it was given', () => {
    const original = week([day('Tuesday', ['Math'])])
    enforceDayTypes(original, [{ day: 'Tuesday', dayType: DayType.Life }], appBlocks)
    expect(original.days[0].items).toHaveLength(1)
  })
})

// ── Codex rounds 1 and 2: a pick must be reversible, and survive a reload ────
describe('reversibility', () => {
  const base = week([day('Monday', ['Math']), day('Tuesday', ['Math', 'Reading'])])
  const life = [{ day: 'Tuesday', dayType: DayType.Life }]
  const full = [{ day: 'Tuesday', dayType: DayType.Normal }]
  const light = [{ day: 'Tuesday', dayType: DayType.Light }]

  it('Life → Full gives the day its items back, not an empty day under a Full chip', () => {
    // `applicableDays` skips an empty day, so without this a mis-tap silently
    // cost the parent a whole day of plan with nothing on screen saying so.
    const setAside = enforceDayTypes(base, life, appBlocks)
    expect(setAside.days.find((d) => d.day === 'Tuesday')!.items).toEqual([])

    const backToFull = enforceDayTypes(setAside, full, appBlocks)
    const tuesday = backToFull.days.find((d) => d.day === 'Tuesday')!
    expect(tuesday.items).toHaveLength(2)
    expect(tuesday.items.map((i) => i.title)).toEqual(['Math', 'Reading'])
  })

  it('leaves no stash or marker behind once a day is Full again', () => {
    const roundTrip = enforceDayTypes(enforceDayTypes(base, life, appBlocks), full, appBlocks)
    const tuesday = roundTrip.days.find((d) => d.day === 'Tuesday')!
    expect(tuesday.setAsideItems).toBeUndefined()
    expect(tuesday.appliedDayType).toBeUndefined()
  })

  it('Life → Light rebuilds from the real day, not from an empty one', () => {
    const toLight = enforceDayTypes(enforceDayTypes(base, life, appBlocks), light, appBlocks)
    const titles = toLight.days.find((d) => d.day === 'Tuesday')!.items.map((i) => i.title)
    expect(titles).toContain('Math facts sprint (5 min)')
  })

  it('Light → Full restores the original items, not the template', () => {
    const backToFull = enforceDayTypes(enforceDayTypes(base, light, appBlocks), full, appBlocks)
    const titles = backToFull.days.find((d) => d.day === 'Tuesday')!.items.map((i) => i.title)
    expect(titles).toEqual(['Math', 'Reading'])
  })

  it('survives a round trip through JSON — the stash rides in the draft', () => {
    // The whole reason it lives on the day rather than in page state: the draft
    // is persisted on the conversation, so a reload can still undo a pick.
    const setAside = enforceDayTypes(base, life, appBlocks)
    const reloaded = JSON.parse(JSON.stringify(setAside)) as DraftWeeklyPlan
    const backToFull = enforceDayTypes(reloaded, full, appBlocks)
    expect(backToFull.days.find((d) => d.day === 'Tuesday')!.items).toHaveLength(2)
  })

  it('restores only the changed day, so edits to the others survive', () => {
    const setAside = enforceDayTypes(base, life, appBlocks)
    const edited: DraftWeeklyPlan = {
      ...setAside,
      days: setAside.days.map((d) => (d.day === 'Monday' ? { ...d, items: [] } : d)),
    }
    const backToFull = enforceDayTypes(edited, full, appBlocks)
    expect(backToFull.days.find((d) => d.day === 'Monday')!.items).toEqual([])
    expect(backToFull.days.find((d) => d.day === 'Tuesday')!.items).toHaveLength(2)
  })
})

describe('idempotence, and the one exception to it', () => {
  const base = week([day('Tuesday', ['Math', 'Reading'])])

  it('preserves edits to a Light day rather than re-templating it', () => {
    // Apply re-enforces at the write. Without the short-circuit, a template task
    // the parent removed came back and a video they added vanished — a write
    // disagreeing with the card they were looking at. Codex round 2 (P1).
    const lit = enforceDayTypes(base, [{ day: 'Tuesday', dayType: DayType.Light }], appBlocks)
    const edited: DraftWeeklyPlan = {
      ...lit,
      days: lit.days.map((d) => ({
        ...d,
        items: d.items.filter((i) => i.title !== 'Math facts sprint (5 min)'),
      })),
    }
    const reEnforced = enforceDayTypes(edited, [{ day: 'Tuesday', dayType: DayType.Light }], appBlocks)
    expect(reEnforced.days[0].items.map((i) => i.title)).not.toContain('Math facts sprint (5 min)')
    expect(reEnforced).toBe(edited)
  })

  it('re-empties a set-aside day even when it is already in that shape', () => {
    // The exception: `MoveToDayDialog` offers every weekday, so an item can be
    // moved onto a Life day after shaping. "No plan" is the whole meaning of the
    // type, and Apply is about to set the day's planType to life.
    const setAside = enforceDayTypes(base, [{ day: 'Tuesday', dayType: DayType.Life }], appBlocks)
    const smuggled: DraftWeeklyPlan = {
      ...setAside,
      days: setAside.days.map((d) => ({ ...d, items: base.days[0].items })),
    }
    const reEnforced = enforceDayTypes(smuggled, [{ day: 'Tuesday', dayType: DayType.Life }], appBlocks)
    expect(reEnforced.days[0].items).toEqual([])
    // ...and the original stash is still what a Full pick would restore.
    expect(reEnforced.days[0].setAsideItems).toHaveLength(2)
  })

  it('is a no-op on an unchanged draft, identity included', () => {
    const setAside = enforceDayTypes(base, [{ day: 'Tuesday', dayType: DayType.Life }], appBlocks)
    expect(enforceDayTypes(setAside, [{ day: 'Tuesday', dayType: DayType.Life }], appBlocks)).toBe(setAside)
  })
})

// ── Codex round 3, P2: a repeat must see the week that was actually planned ──
describe('restoreAllDayTypes', () => {
  const base = week([day('Monday', ['Lesson 5']), day('Tuesday', ['Lesson 6'])])

  it('gives every stashed day its real rows back', () => {
    // `clonePlanWithAdvancedLessons` counts and advances off `day.items`, so a
    // set-aside Tuesday whose Lesson 6 sat in `setAsideItems` was invisible to
    // the count and both days came back as Lesson 6.
    const setAside = enforceDayTypes(base, [{ day: 'Tuesday', dayType: DayType.Life }], appBlocks)
    expect(setAside.days.find((d) => d.day === 'Tuesday')!.items).toEqual([])

    const restored = restoreAllDayTypes(setAside)
    expect(restored.days.map((d) => d.items.map((i) => i.title))).toEqual([
      ['Lesson 5'],
      ['Lesson 6'],
    ])
  })

  it('restores a Light day to its real rows, not the template', () => {
    const lit = enforceDayTypes(base, [{ day: 'Tuesday', dayType: DayType.Light }], appBlocks)
    const restored = restoreAllDayTypes(lit)
    expect(restored.days.find((d) => d.day === 'Tuesday')!.items.map((i) => i.title)).toEqual([
      'Lesson 6',
    ])
  })

  it('leaves no stash or marker behind', () => {
    const setAside = enforceDayTypes(base, [{ day: 'Tuesday', dayType: DayType.Life }], appBlocks)
    for (const d of restoreAllDayTypes(setAside).days) {
      expect(d.setAsideItems).toBeUndefined()
      expect(d.appliedDayType).toBeUndefined()
    }
  })

  it('is a no-op on a draft that was never shaped, identity included', () => {
    expect(restoreAllDayTypes(base)).toBe(base)
  })
})

describe('applyDayTypeToDay', () => {
  it('returns the identical object for a Full day', () => {
    const d = day('Monday', ['Math'])
    expect(applyDayTypeToDay(d, DayType.Normal, appBlocks)).toBe(d)
  })

  it('treats the unoffered Appointment as Light rather than dropping the day', () => {
    const result = applyDayTypeToDay(day('Monday', ['Math']), DayType.Appointment, appBlocks)
    expect(result.items.map((i) => i.title)).toContain('Math facts sprint (5 min)')
  })
})

describe('plannedPlanTypeWrite', () => {
  it('writes Life for a set-aside day', () => {
    expect(plannedPlanTypeWrite(DayType.Life, undefined)).toBe(PlanType.Life)
    expect(plannedPlanTypeWrite(DayType.Life, PlanType.Normal)).toBe(PlanType.Life)
    expect(plannedPlanTypeWrite(DayType.Life, PlanType.Mvd)).toBe(PlanType.Life)
  })

  it('writes nothing at all for a Full or Light day that is not currently Life', () => {
    expect(plannedPlanTypeWrite(DayType.Normal, undefined)).toBeNull()
    expect(plannedPlanTypeWrite(DayType.Normal, PlanType.Normal)).toBeNull()
    expect(plannedPlanTypeWrite(DayType.Light, undefined)).toBeNull()
  })

  it('never touches a Minimum Viable Day the parent chose on Today', () => {
    expect(plannedPlanTypeWrite(DayType.Normal, PlanType.Mvd)).toBeNull()
    expect(plannedPlanTypeWrite(DayType.Light, PlanType.Mvd)).toBeNull()
  })

  it('takes a day back OUT of Life when the parent changes their mind', () => {
    // Without this, a re-applied week writes a checklist Today then hides it.
    expect(plannedPlanTypeWrite(DayType.Normal, PlanType.Life)).toBe(PlanType.Normal)
    expect(plannedPlanTypeWrite(DayType.Light, PlanType.Life)).toBe(PlanType.Normal)
  })
})

describe('lifeDayNames / lightDayNames', () => {
  const config = [
    { day: 'Monday', dayType: DayType.Normal },
    { day: 'Tuesday', dayType: DayType.Life },
    { day: 'Wednesday', dayType: DayType.Light },
    { day: 'Thursday', dayType: DayType.Life },
    { day: 'Friday', dayType: DayType.Appointment },
  ]

  it('names the set-aside days in config order', () => {
    expect(lifeDayNames(config)).toEqual(['Tuesday', 'Thursday'])
  })

  it('counts the unoffered Appointment among the light days', () => {
    expect(lightDayNames(config)).toEqual(['Wednesday', 'Friday'])
  })

  it('returns nothing for an absent config', () => {
    expect(lifeDayNames(undefined)).toEqual([])
    expect(lightDayNames(undefined)).toEqual([])
  })
})

describe('buildDayTypeSection', () => {
  it('sends nothing when every day is Full — no empty preamble', () => {
    expect(buildDayTypeSection(undefined)).toBe('')
    expect(buildDayTypeSection([])).toBe('')
    expect(buildDayTypeSection([{ day: 'Monday', dayType: DayType.Normal }])).toBe('')
  })

  it('names the set-aside days and tells the model not to output them', () => {
    const section = buildDayTypeSection([
      { day: 'Tuesday', dayType: DayType.Life },
      { day: 'Thursday', dayType: DayType.Life },
    ])
    expect(section).toContain('Tuesday, Thursday')
    expect(section).toContain('SET ASIDE')
    expect(section).toMatch(/do NOT output/i)
  })

  it('states precedence over the routine rule it has to beat', () => {
    // `buildPlannerPrompt` opens with `YOUR #1 JOB` and `Every day MUST include
    // ALL of these activities`. The section is composed above it AND says so.
    const section = buildDayTypeSection([{ day: 'Wednesday', dayType: DayType.Light }])
    expect(section).toMatch(/override every rule above/i)
    expect(section).toMatch(/MUST-DO rule does not apply/i)
  })

  it('asks for the work to be spread rather than dropped', () => {
    const section = buildDayTypeSection([{ day: 'Tuesday', dayType: DayType.Life }])
    expect(section).toMatch(/spread/i)
  })
})
