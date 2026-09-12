import { describe, expect, it } from 'vitest'

import {
  HOURS_SOURCE_CAPTION,
  POSITIONS_MISSING_LINE,
  POSITIONS_PENDING_LINE,
  hoursLoggedLine,
  positionsPendingLine,
} from './weekHours'

describe('hoursLoggedLine (UX-211)', () => {
  it('states hours with one decimal, dropping a trailing zero', () => {
    expect(hoursLoggedLine(288)).toBe('4.8 hours logged this week.')
    expect(hoursLoggedLine(300)).toBe('5 hours logged this week.')
  })

  it('stays in minutes under an hour', () => {
    expect(hoursLoggedLine(20)).toBe('20 minutes logged this week.')
    expect(hoursLoggedLine(1)).toBe('1 minute logged this week.')
  })

  it('reports an empty week plainly', () => {
    expect(hoursLoggedLine(0)).toBe('No hours logged this week.')
  })

  it('does not report a negative duration when adjustments outweigh the week', () => {
    // Adjustments subtract, and a correction must subtract everywhere.
    expect(hoursLoggedLine(-30)).toBe('No hours logged this week.')
    expect(hoursLoggedLine(Number.NaN)).toBe('No hours logged this week.')
  })

  it('never states a target, a ratio, a percentage or a goal', () => {
    const lines = [0, 20, 288, 300, 900].map(hoursLoggedLine)
    for (const line of lines) {
      expect(line).not.toMatch(/\//)
      expect(line).not.toMatch(/%/)
      expect(line).not.toMatch(/goal|target|of \d|remaining|left|behind|short/i)
    }
  })

  it('names which count this is, so it reconciles with the Records page', () => {
    expect(HOURS_SOURCE_CAPTION).toContain('Records page')
    expect(HOURS_SOURCE_CAPTION).toContain('compliance pack')
  })
})

// ── The promise expires (UX-407) ────────────────────────────────────────────

describe('positionsPendingLine', () => {
  // Week 2026-08-30 is Sun Aug 30 – Sat Sep 5. Its overnight save runs 00:15 on
  // Sunday Sep 6, so the promise holds through Saturday and not one day longer.
  const WEEK = '2026-08-30'

  it('promises the overnight save while that Saturday is still ahead', () => {
    for (const day of ['2026-08-30', '2026-09-02', '2026-09-04']) {
      expect(positionsPendingLine(WEEK, day)).toBe(POSITIONS_PENDING_LINE)
    }
  })

  it('still promises it ON the Saturday — the day the sentence was written for', () => {
    expect(positionsPendingLine(WEEK, '2026-09-05')).toBe(POSITIONS_PENDING_LINE)
  })

  it('stops promising it the moment the save was due', () => {
    // Sunday Sep 6: the cron has fired or it has not, and either way "it will
    // happen tonight" is no longer true.
    expect(positionsPendingLine(WEEK, '2026-09-06')).toBe(POSITIONS_MISSING_LINE)
  })

  it('does not repeat a promise about a Saturday a week gone — the owner’s screen', () => {
    // Friday 2026-09-11, 8:30pm, Review → Week, Lincoln. The page named
    // Aug 31 – Sep 4 and told him its positions would be saved "once Saturday is
    // over". That Saturday had passed six days earlier.
    expect(positionsPendingLine(WEEK, '2026-09-11')).toBe(POSITIONS_MISSING_LINE)
  })

  it('claims nothing about why, and says the numbers above are unaffected', () => {
    expect(POSITIONS_MISSING_LINE).not.toMatch(/cron|server|failed|error|didn’t run/i)
    expect(POSITIONS_MISSING_LINE).toMatch(/read live/)
  })

  it('falls back to the promise for an unparseable week — the safer claim', () => {
    expect(positionsPendingLine('not-a-week', '2026-09-11')).toBe(POSITIONS_PENDING_LINE)
  })
})
