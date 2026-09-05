import { describe, expect, it } from 'vitest'

import { HISTORY_WEEKS, previousWeekKeys } from './weeklyReviewHistory'

describe('previousWeekKeys (UX-213)', () => {
  it('walks back one Sunday at a time, newest first', () => {
    expect(previousWeekKeys('2026-09-06', 3)).toEqual([
      '2026-08-30',
      '2026-08-23',
      '2026-08-16',
    ])
  })

  it('crosses a month and a year boundary without drifting', () => {
    expect(previousWeekKeys('2026-01-03', 2)).toEqual(['2025-12-27', '2025-12-20'])
  })

  it('returns nothing for a bad key or a non-positive look-back', () => {
    expect(previousWeekKeys('not-a-date', 4)).toEqual([])
    expect(previousWeekKeys('2026-09-06', 0)).toEqual([])
  })

  it('is bounded, so a page load cannot grow into the whole archive', () => {
    expect(previousWeekKeys('2026-09-06', HISTORY_WEEKS)).toHaveLength(
      HISTORY_WEEKS,
    )
    expect(HISTORY_WEEKS).toBeLessThanOrEqual(26)
  })
})
