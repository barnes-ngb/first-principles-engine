import { describe, expect, it } from 'vitest'

import {
  clearedHistoricalHoursDraft,
  DEFAULT_ESTIMATE_DAYS_PER_WEEK,
  historicalHoursDraftIsEmpty,
  historicalHoursSwitchNotice,
  type HistoricalHoursDraft,
} from './historicalHoursOwnership'

const BLANK: HistoricalHoursDraft = {
  backfillMonth: '',
  backfillEntries: [
    { subject: 'Reading', hours: 0 },
    { subject: 'Math', hours: 0 },
  ],
  estimateStartMonth: '',
  estimateEndMonth: '',
  estimateDailyHours: '',
  estimateDaysPerWeek: DEFAULT_ESTIMATE_DAYS_PER_WEEK,
}

describe('historicalHoursDraftIsEmpty', () => {
  it('is true for an untouched dialog', () => {
    expect(historicalHoursDraftIsEmpty(BLANK)).toBe(true)
  })

  it('is false once a month is picked', () => {
    expect(historicalHoursDraftIsEmpty({ ...BLANK, backfillMonth: '2025-09' })).toBe(false)
  })

  it('is false once any subject carries hours', () => {
    expect(
      historicalHoursDraftIsEmpty({
        ...BLANK,
        backfillEntries: [
          { subject: 'Reading', hours: 0 },
          { subject: 'Math', hours: 12 },
        ],
      }),
    ).toBe(false)
  })

  it('is false for any part of a quick-estimate range', () => {
    expect(historicalHoursDraftIsEmpty({ ...BLANK, estimateStartMonth: '2024-09' })).toBe(false)
    expect(historicalHoursDraftIsEmpty({ ...BLANK, estimateEndMonth: '2025-05' })).toBe(false)
    expect(historicalHoursDraftIsEmpty({ ...BLANK, estimateDailyHours: '3' })).toBe(false)
  })

  /**
   * Codex round 1, P1 — `estimateDaysPerWeek` is the field with a non-empty
   * default, and it feeds the minutes `handleSaveQuickEstimate` writes. Read it
   * like the others and every switch announces work nobody did; ignore it and
   * one child's school week silently prices the next child's compliance hours.
   */
  it('is still true on an untouched days-per-week, which has a real default', () => {
    expect(
      historicalHoursDraftIsEmpty({ ...BLANK, estimateDaysPerWeek: DEFAULT_ESTIMATE_DAYS_PER_WEEK }),
    ).toBe(true)
  })

  it('is false once days-per-week is CHANGED from the default', () => {
    expect(historicalHoursDraftIsEmpty({ ...BLANK, estimateDaysPerWeek: '5' })).toBe(false)
  })

  it('ignores whitespace, which is not a typed figure', () => {
    expect(historicalHoursDraftIsEmpty({ ...BLANK, estimateDailyHours: '   ' })).toBe(true)
  })

  it('is not fooled by a negative or NaN hours value', () => {
    // A number that cannot produce minutes is not evidence a person typed a
    // figure worth announcing the loss of.
    expect(
      historicalHoursDraftIsEmpty({
        ...BLANK,
        backfillEntries: [{ subject: 'Reading', hours: Number.NaN }],
      }),
    ).toBe(true)
    expect(
      historicalHoursDraftIsEmpty({
        ...BLANK,
        backfillEntries: [{ subject: 'Reading', hours: -5 }],
      }),
    ).toBe(true)
  })
})

describe('clearedHistoricalHoursDraft', () => {
  it('zeroes every typed figure and keeps the subject rows in order', () => {
    const cleared = clearedHistoricalHoursDraft({
      backfillMonth: '2025-09',
      backfillEntries: [
        { subject: 'Reading', hours: 20 },
        { subject: 'Math', hours: 15 },
      ],
      estimateStartMonth: '2024-09',
      estimateEndMonth: '2025-05',
      estimateDailyHours: '3',
      estimateDaysPerWeek: '5',
    })
    expect(historicalHoursDraftIsEmpty(cleared)).toBe(true)
    // POSITIVE CONTROL — the whole point of the round-1 finding: a five-day
    // week set for one child must not price the next child's estimate.
    expect(cleared.estimateDaysPerWeek).toBe(DEFAULT_ESTIMATE_DAYS_PER_WEEK)
    expect(cleared.backfillEntries.map((e) => e.subject)).toEqual(['Reading', 'Math'])
  })

  it('does not mutate the caller’s draft or its entries array', () => {
    const entries = [{ subject: 'Reading', hours: 20 }]
    const draft: HistoricalHoursDraft = { ...BLANK, backfillMonth: '2025-09', backfillEntries: entries }
    clearedHistoricalHoursDraft(draft)
    expect(draft.backfillMonth).toBe('2025-09')
    expect(entries[0].hours).toBe(20)
  })
})

describe('historicalHoursSwitchNotice', () => {
  it('says nothing when there was nothing to lose', () => {
    expect(historicalHoursSwitchNotice(false, 'Lincoln', 'London')).toBeNull()
  })

  it('names both children and says a save is what records hours', () => {
    const line = historicalHoursSwitchNotice(true, 'Lincoln', 'London')
    expect(line).toContain('Lincoln')
    expect(line).toContain('London')
    expect(line).toMatch(/weren't saved|weren’t saved/)
  })

  it('still says the figures were lost when a name is unknown', () => {
    const line = historicalHoursSwitchNotice(true)
    expect(line).toMatch(/weren't saved|weren’t saved/)
    expect(line).not.toContain('undefined')
  })
})
