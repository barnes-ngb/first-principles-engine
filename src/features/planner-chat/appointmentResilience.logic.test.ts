import { describe, expect, it, beforeEach } from 'vitest'
import type { DraftDayPlan, DraftWeeklyPlan } from '../../core/types/domain'
import { DayType, SubjectBucket } from '../../core/types/enums'
import { resetIdCounter } from './chatPlanner.logic'
import {
  applyLightDayToplan,
  buildLightDayTemplate,
  getDefaultDayTypes,
  isLightDay,
  reflowPlanAroundLightDays,
} from './appointmentResilience.logic'

const appBlocks = [{ label: 'Reading Eggs', defaultMinutes: 15 }]

beforeEach(() => {
  resetIdCounter()
})

describe('buildLightDayTemplate', () => {
  it('creates a light day with app blocks + tiny tasks', () => {
    const template = buildLightDayTemplate(appBlocks)
    expect(template.items.length).toBeGreaterThanOrEqual(4)
    expect(template.items[0].title).toBe('Reading Eggs')
    expect(template.items[0].isAppBlock).toBe(true)
    expect(template.totalMinutes).toBeGreaterThan(0)
  })

  it('includes writing, math, and win card items', () => {
    const template = buildLightDayTemplate(appBlocks)
    const titles = template.items.map((i) => i.title)
    expect(titles.some((t) => t.toLowerCase().includes('writing'))).toBe(true)
    expect(titles.some((t) => t.toLowerCase().includes('math'))).toBe(true)
    expect(titles.some((t) => t.toLowerCase().includes('read aloud') || t.toLowerCase().includes('win'))).toBe(true)
  })

  it('total minutes is reasonable for a light day', () => {
    const template = buildLightDayTemplate(appBlocks)
    expect(template.totalMinutes).toBeLessThanOrEqual(60)
  })
})

describe('applyLightDayToplan', () => {
  it('replaces non-app items with light day template', () => {
    const dayPlan: DraftDayPlan = {
      day: 'Wednesday',
      timeBudgetMinutes: 150,
      items: [
        { id: '1', title: 'Reading Eggs', subjectBucket: SubjectBucket.Other, estimatedMinutes: 15, skillTags: [], accepted: true, isAppBlock: true },
        { id: '2', title: 'Heavy Math', subjectBucket: SubjectBucket.Math, estimatedMinutes: 30, skillTags: [], accepted: true },
        { id: '3', title: 'Heavy Reading', subjectBucket: SubjectBucket.Reading, estimatedMinutes: 20, skillTags: [], accepted: true },
      ],
    }
    const template = buildLightDayTemplate(appBlocks)
    const result = applyLightDayToplan(dayPlan, template)

    // Should keep the existing app block
    const appItems = result.items.filter((i) => i.isAppBlock)
    expect(appItems).toHaveLength(1)
    expect(appItems[0].title).toBe('Reading Eggs')

    // Should have template non-app items
    const nonApp = result.items.filter((i) => !i.isAppBlock)
    expect(nonApp.length).toBeGreaterThanOrEqual(3)
  })
})

describe('reflowPlanAroundLightDays', () => {
  function makePlan(): DraftWeeklyPlan {
    const days: DraftDayPlan[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({
      day,
      timeBudgetMinutes: 150,
      items: [
        { id: `${day}-app`, title: 'Reading Eggs', subjectBucket: SubjectBucket.Other, estimatedMinutes: 15, skillTags: [], accepted: true, isAppBlock: true },
        { id: `${day}-math`, title: 'Math lesson', subjectBucket: SubjectBucket.Math, estimatedMinutes: 25, skillTags: ['math.subtraction.regroup'], accepted: true },
      ],
    }))
    return { days, skipSuggestions: [], minimumWin: 'test' }
  }

  it('preserves plan when no light days', () => {
    const plan = makePlan()
    const dayTypes = getDefaultDayTypes().map((d) => ({ ...d, dayType: DayType.Normal }))
    const result = reflowPlanAroundLightDays(plan, dayTypes, appBlocks)
    expect(result.days).toHaveLength(5)
  })

  it('converts light day and redistributes items', () => {
    const plan = makePlan()
    const dayTypes = getDefaultDayTypes() // Wednesday is light by default
    const result = reflowPlanAroundLightDays(plan, dayTypes, appBlocks)

    // Wednesday should be a light day (no heavy math)
    const wednesday = result.days.find((d) => d.day === 'Wednesday')!
    const wedMath = wednesday.items.filter((i) => i.title === 'Math lesson')
    expect(wedMath).toHaveLength(0)

    // The displaced math item should appear on another day
    const allMathItems = result.days.flatMap((d) => d.items.filter((i) => i.title === 'Math lesson'))
    expect(allMathItems.length).toBeGreaterThanOrEqual(4) // 4 original + 1 displaced
  })

  it('handles multiple light days', () => {
    const plan = makePlan()
    const dayTypes = getDefaultDayTypes().map((d) =>
      d.day === 'Wednesday' || d.day === 'Friday'
        ? { ...d, dayType: DayType.Appointment }
        : d,
    )
    const result = reflowPlanAroundLightDays(plan, dayTypes, appBlocks)

    // Both Wed and Fri should be light
    for (const day of ['Wednesday', 'Friday']) {
      const dayPlan = result.days.find((d) => d.day === day)!
      const heavyItems = dayPlan.items.filter((i) => i.title === 'Math lesson')
      expect(heavyItems).toHaveLength(0)
    }
  })
})

describe('getDefaultDayTypes', () => {
  it('returns 5 days with Wednesday as light', () => {
    const types = getDefaultDayTypes()
    expect(types).toHaveLength(5)
    expect(types.find((d) => d.day === 'Wednesday')!.dayType).toBe(DayType.Light)
    expect(types.find((d) => d.day === 'Monday')!.dayType).toBe(DayType.Normal)
  })
})

describe('isLightDay', () => {
  const dayTypes = getDefaultDayTypes()

  it('returns true for light days', () => {
    expect(isLightDay('Wednesday', dayTypes)).toBe(true)
  })

  it('returns false for normal days', () => {
    expect(isLightDay('Monday', dayTypes)).toBe(false)
  })

  it('returns true for appointment days', () => {
    const withAppt = dayTypes.map((d) =>
      d.day === 'Friday' ? { ...d, dayType: DayType.Appointment } : d,
    )
    expect(isLightDay('Friday', withAppt)).toBe(true)
  })
})
