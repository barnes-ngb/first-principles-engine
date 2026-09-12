import { describe, expect, it } from 'vitest'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  HOURS_SOURCE_CAPTION,
  POSITIONS_MISSING_LINE,
  POSITIONS_PENDING_LINE,
  REVIEW_SAVE_DUE_TIME,
  REVIEW_SAVE_TIME_ZONE,
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
  // Sunday Sep 6 **America/Chicago** — the cron's own scheduled instant — so
  // every fixture below is an absolute moment and the answers are the same
  // whatever zone the runner is in.
  const WEEK = '2026-08-30'
  /** CDT is UTC−5 in September, so 00:15 CT Sunday Sep 6 is 05:15Z. */
  const DUE = new Date('2026-09-06T05:15:00Z')
  const at = (iso: string) => new Date(iso)

  it('promises the overnight save while that Saturday is still ahead', () => {
    for (const iso of ['2026-08-30T18:00:00Z', '2026-09-02T12:00:00Z', '2026-09-04T23:00:00Z']) {
      expect(positionsPendingLine(WEEK, at(iso))).toBe(POSITIONS_PENDING_LINE)
    }
  })

  it('still promises it ON the Saturday — the day the sentence was written for', () => {
    // 1pm Central, and again at 11:30pm Central, both still Saturday there.
    expect(positionsPendingLine(WEEK, at('2026-09-05T18:00:00Z'))).toBe(POSITIONS_PENDING_LINE)
    expect(positionsPendingLine(WEEK, at('2026-09-06T04:30:00Z'))).toBe(POSITIONS_PENDING_LINE)
  })

  it('holds the promise through the fifteen minutes before the cron is due', () => {
    // Codex round 1, P2: a date-only comparison flipped at the viewer's local
    // midnight, so a Central reader saw the failure sentence for a quarter of an
    // hour every Sunday BEFORE the save was even scheduled to run.
    const oneMinuteBefore = new Date(DUE.getTime() - 60_000)
    expect(positionsPendingLine(WEEK, oneMinuteBefore)).toBe(POSITIONS_PENDING_LINE)
  })

  it('stops promising it at the scheduled instant, not at anyone’s midnight', () => {
    expect(positionsPendingLine(WEEK, DUE)).toBe(POSITIONS_MISSING_LINE)
    expect(positionsPendingLine(WEEK, new Date(DUE.getTime() + 60_000))).toBe(
      POSITIONS_MISSING_LINE,
    )
  })

  it('gives the same answer on a device set ahead of Central and one behind', () => {
    // The whole point of reading the boundary in the family's zone: the sentence
    // is about the CRON, so it may not depend on where the reader is standing.
    // 02:00 Sunday in Tokyo is still Saturday afternoon in Chicago; 22:00
    // Saturday in Honolulu is Sunday 03:00 there — both before 00:15 CT Sunday.
    expect(positionsPendingLine(WEEK, at('2026-09-05T17:00:00Z'))).toBe(POSITIONS_PENDING_LINE)
    expect(positionsPendingLine(WEEK, at('2026-09-06T05:14:00Z'))).toBe(POSITIONS_PENDING_LINE)
    expect(positionsPendingLine(WEEK, at('2026-09-06T05:16:00Z'))).toBe(POSITIONS_MISSING_LINE)
  })

  it('does not repeat a promise about a Saturday a week gone — the owner’s screen', () => {
    // Friday 2026-09-11, 8:30pm Central. The page named Aug 31 – Sep 4 and told
    // him its positions would be saved "once Saturday is over". That Saturday
    // had passed six days earlier.
    expect(positionsPendingLine(WEEK, at('2026-09-12T01:30:00Z'))).toBe(POSITIONS_MISSING_LINE)
  })

  it('claims nothing about why, and says the numbers above are unaffected', () => {
    expect(POSITIONS_MISSING_LINE).not.toMatch(/cron|server|failed|error|didn’t run/i)
    expect(POSITIONS_MISSING_LINE).toMatch(/read live/)
  })

  it('falls back to the promise for an unparseable week — the safer claim', () => {
    expect(positionsPendingLine('not-a-week', at('2026-09-12T01:30:00Z'))).toBe(
      POSITIONS_PENDING_LINE,
    )
  })
})

// ── The schedule this sentence mirrors ──────────────────────────────────────

describe('the mirrored cron schedule stays in step with the Cloud Function', () => {
  // `WEEKLY_REVIEW_SCHEDULE` cannot be imported here — `evaluate.ts` pulls in
  // firebase-admin and firebase-functions and is not in `functions/src/shared/`,
  // the one directory both projects compile. So it is read as SOURCE, which is
  // this repo's standing answer where the project boundary makes one definition
  // impossible: a hand-kept copy with a test on it, never a hand-kept copy alone.
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', '..', 'functions', 'src', 'ai', 'evaluate.ts'),
    'utf8',
  )
  const schedule =
    /export const WEEKLY_REVIEW_SCHEDULE = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? ''

  it('finds the Cloud Function’s constant at all', () => {
    expect(schedule).not.toBe('')
  })

  it('mirrors its time zone', () => {
    expect(schedule).toContain(`"${REVIEW_SAVE_TIME_ZONE}"`)
  })

  it('mirrors the hour it fires', () => {
    expect(schedule).toMatch(new RegExp(`sunday ${REVIEW_SAVE_DUE_TIME}`))
  })
})
