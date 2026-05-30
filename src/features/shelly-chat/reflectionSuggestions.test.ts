import { describe, expect, it } from 'vitest'

import { computeReflectionSuggestions } from './reflectionSuggestions'
import type { ReflectionDay } from './reflectionSuggestions'

// Verified weekday anchors (see node check): Mon 2026-05-25, Tue 05-26,
// Wed 05-27, Thu 05-28, Fri 05-29.
const MON = '2026-05-25'
const TUE = '2026-05-26'
const THU = '2026-05-28'

function items(
  specs: Array<{ completed?: boolean; engagement?: string }>,
): ReflectionDay['checklist'] {
  return specs.map((s) => ({ completed: s.completed ?? false, engagement: s.engagement }))
}

describe('computeReflectionSuggestions', () => {
  it('returns nothing for an empty week', () => {
    expect(computeReflectionSuggestions([], 'lincoln')).toEqual([])
  })

  it('returns nothing when there are days but no checklist items', () => {
    const days: ReflectionDay[] = [{ date: MON, checklist: [] }, { date: TUE }]
    expect(computeReflectionSuggestions(days, 'lincoln')).toEqual([])
  })

  it('flags a frustration pattern above the 15% threshold (Lincoln naming)', () => {
    // 2 struggled / 10 = 0.2 > 0.15
    const days: ReflectionDay[] = [{
      date: MON,
      checklist: items([
        { engagement: 'struggled' }, { engagement: 'refused' },
        {}, {}, {}, {}, {}, {}, {}, {},
      ]),
    }]
    const out = computeReflectionSuggestions(days, 'lincoln')
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Lincoln seemed frustrated this week')
  })

  it('uses London naming for the london context', () => {
    const days: ReflectionDay[] = [{
      date: MON,
      checklist: items([{ engagement: 'struggled' }, { engagement: 'struggled' }, {}, {}, {}, {}, {}, {}, {}, {}]),
    }]
    const out = computeReflectionSuggestions(days, 'london')
    expect(out[0].label).toBe('London seemed frustrated this week')
  })

  it('does not flag frustration at or below the threshold', () => {
    // 1 struggled / 10 = 0.1 — not > 0.15
    const days: ReflectionDay[] = [{
      date: MON,
      checklist: items([{ engagement: 'struggled' }, {}, {}, {}, {}, {}, {}, {}, {}, {}]),
    }]
    expect(computeReflectionSuggestions(days, 'lincoln')).toEqual([])
  })

  it('flags a late-week completion dropoff', () => {
    const days: ReflectionDay[] = [
      { date: MON, checklist: items([{ completed: true }, { completed: true }, { completed: true }, { completed: true }]) },
      { date: THU, checklist: items([{ completed: false }, { completed: false }, { completed: false }, { completed: false }]) },
    ]
    const out = computeReflectionSuggestions(days, 'lincoln')
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Completion drops late in the week')
  })

  it('does not flag a dropoff when there is too little early/late data', () => {
    // monTue total = 2 (not > 3), so the guard short-circuits
    const days: ReflectionDay[] = [
      { date: MON, checklist: items([{ completed: true }, { completed: true }]) },
      { date: THU, checklist: items([{ completed: false }, { completed: false }]) },
    ]
    expect(computeReflectionSuggestions(days, 'lincoln')).toEqual([])
  })

  it('flags high engagement above 60%', () => {
    const days: ReflectionDay[] = [{
      date: MON,
      checklist: items([
        { engagement: 'engaged' }, { engagement: 'engaged' }, { engagement: 'engaged' },
        { engagement: 'engaged' }, { engagement: 'engaged' }, { engagement: 'engaged' },
        { engagement: 'engaged' }, {}, {}, {},
      ]),
    }]
    const out = computeReflectionSuggestions(days, 'lincoln')
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Lincoln is doing great this week')
  })

  it('combines frustration and high engagement, frustration first', () => {
    // 7 engaged (0.7 > 0.6) and 2 struggled (0.2 > 0.15) on a single day
    const days: ReflectionDay[] = [{
      date: MON,
      checklist: items([
        { engagement: 'engaged' }, { engagement: 'engaged' }, { engagement: 'engaged' },
        { engagement: 'engaged' }, { engagement: 'engaged' }, { engagement: 'engaged' },
        { engagement: 'engaged' }, { engagement: 'struggled' }, { engagement: 'struggled' }, {},
      ]),
    }]
    const out = computeReflectionSuggestions(days, 'lincoln')
    expect(out.map((s) => s.label)).toEqual([
      'Lincoln seemed frustrated this week',
      'Lincoln is doing great this week',
    ])
  })

  it('returns all three suggestions when every heuristic fires', () => {
    // Mon/Tue: engaged + completed (early, high completion).
    // Thu: struggled + not completed (late dropoff + frustration).
    // Totals: 12 items, engaged 8/12 = 0.67, struggled 4/12 = 0.33,
    // earlyRate 1 vs lateRate 0.
    const engagedDone = { completed: true, engagement: 'engaged' }
    const struggledMissed = { completed: false, engagement: 'struggled' }
    const days: ReflectionDay[] = [
      { date: MON, checklist: items([engagedDone, engagedDone, engagedDone, engagedDone]) },
      { date: TUE, checklist: items([engagedDone, engagedDone, engagedDone, engagedDone]) },
      { date: THU, checklist: items([struggledMissed, struggledMissed, struggledMissed, struggledMissed]) },
    ]
    const out = computeReflectionSuggestions(days, 'lincoln')
    expect(out).toHaveLength(3)
    expect(out.map((s) => s.label)).toEqual([
      'Lincoln seemed frustrated this week',
      'Completion drops late in the week',
      'Lincoln is doing great this week',
    ])
  })
})
