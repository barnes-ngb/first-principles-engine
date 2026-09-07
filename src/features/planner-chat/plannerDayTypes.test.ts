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
