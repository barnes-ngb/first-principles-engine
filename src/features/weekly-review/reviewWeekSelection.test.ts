import { describe, expect, it } from 'vitest'

import { lastCompletedSchoolWeekKey } from '../../core/utils/time'
import {
  IN_PROGRESS_NOTE,
  REVIEW_WEEK_CHOICES,
  defaultReviewWeekChoice,
  resolveReviewWeek,
  reviewWeekKeyFor,
  reviewWeekOptions,
} from './reviewWeekSelection'

// Local noon, so nothing in this suite depends on the runner's UTC offset —
// every helper under test reads LOCAL date fields, as the page does.
const at = (iso: string) => new Date(`${iso}T12:00:00`)

// The week the owner's report is about: Mon Sep 7 – Fri Sep 11, 2026.
const SEP_06 = '2026-09-06' // Sunday — the Sunday-start key of that week
const AUG_30 = '2026-08-30' // the Sunday before it

describe('the two weeks a review can read (UX-406)', () => {
  it('offers the containing week and the one before it, in date order', () => {
    expect([...REVIEW_WEEK_CHOICES]).toEqual(['last', 'this'])
    const options = reviewWeekOptions(at('2026-09-11'))
    expect(options.map((o) => o.choice)).toEqual(['last', 'this'])
    expect(options.map((o) => o.weekKey)).toEqual([AUG_30, SEP_06])
  })

  it('names each option by its school days, never by a bare key', () => {
    const [last, current] = reviewWeekOptions(at('2026-09-11'))
    expect(last.dateLabel).toBe('Week of Aug 31 – Sep 4')
    expect(last.dates).toBe('Aug 31 – Sep 4')
    expect(current.dateLabel).toBe('Week of Sep 7–11')
    expect(current.dates).toBe('Sep 7–11')
  })

  it('resolves the same key from either direction', () => {
    const now = at('2026-09-11')
    for (const option of reviewWeekOptions(now)) {
      expect(reviewWeekKeyFor(option.choice, now)).toBe(option.weekKey)
    }
  })
})

// ── The default is READ from the UX-218 helper, never restated ──────────────

describe('the default choice tracks lastCompletedSchoolWeekKey', () => {
  // Sep 6–12, 2026 is Sunday through Saturday, so this walks a whole week.
  const WEEK = [
    '2026-09-06', // Sun
    '2026-09-07', // Mon
    '2026-09-08', // Tue
    '2026-09-09', // Wed
    '2026-09-10', // Thu
    '2026-09-11', // Fri
    '2026-09-12', // Sat
  ]

  it('resolves to exactly the key the helper names, on every day of the week', () => {
    for (const day of WEEK) {
      const now = at(day)
      const choice = defaultReviewWeekChoice(now)
      expect(
        reviewWeekKeyFor(choice, now),
        `default on ${day} must name the helper's week`,
      ).toBe(lastCompletedSchoolWeekKey(now))
    }
  })

  it('is “this” on SATURDAY alone — the one day that week’s Mon–Fri is behind us', () => {
    // Saturday is the only day on which the containing Sun–Sat week's whole
    // school body has passed. On a Sunday the containing week is the one about
    // to start, so the week just finished is the previous one — which is what a
    // parent opening this page on a Sunday morning means, and is why the default
    // still reads the document the cron wrote overnight.
    expect(WEEK.map((d) => defaultReviewWeekChoice(at(d)))).toEqual([
      'last', // Sun — the containing week's Mon–Fri is all ahead
      'last',
      'last',
      'last',
      'last',
      'last', // Fri — the week the owner had just logged is still in progress
      'this', // Sat
    ])
  })
})

// ── In progress is a note, never a gate ─────────────────────────────────────

describe('a week that has not finished is offered, marked, and never disabled', () => {
  it('marks the containing week in progress on a Friday', () => {
    const [last, current] = reviewWeekOptions(at('2026-09-11'))
    expect(current.inProgress).toBe(true)
    expect(current.note).toBe(IN_PROGRESS_NOTE)
    expect(last.inProgress).toBe(false)
    expect(last.note).toBeUndefined()
  })

  it('drops the note once that week’s Friday has passed', () => {
    const [, current] = reviewWeekOptions(at('2026-09-12')) // Saturday
    expect(current.inProgress).toBe(false)
    expect(current.note).toBeUndefined()
  })

  it('never marks an option unreadable — reading a week writes nothing', () => {
    for (const day of ['2026-09-06', '2026-09-09', '2026-09-11', '2026-09-12']) {
      for (const option of reviewWeekOptions(at(day))) {
        expect(option).not.toHaveProperty('disabled')
      }
    }
  })
})

// ── Resolution ──────────────────────────────────────────────────────────────

describe('resolveReviewWeek', () => {
  it('follows the default while the parent has said nothing', () => {
    const now = at('2026-09-11')
    const resolved = resolveReviewWeek(null, now)
    expect(resolved.choice).toBe('last')
    expect(resolved.weekKey).toBe(AUG_30)
  })

  it('honours an explicit choice — the owner’s Friday, one tap', () => {
    // "the days here isn't updated — I added time in artefacts": the time was in
    // Sep 7–11 and the page was showing Aug 31–Sep 4. This is the tap.
    const resolved = resolveReviewWeek('this', at('2026-09-11'))
    expect(resolved.weekKey).toBe(SEP_06)
    expect(resolved.options).toHaveLength(2)
  })

  it('re-resolves an untouched selector against the clock, never a stored date', () => {
    // A tab opened Friday and reloaded Saturday moves on its own, because the
    // choice is named by its relationship to today.
    expect(resolveReviewWeek(null, at('2026-09-11')).weekKey).toBe(AUG_30)
    expect(resolveReviewWeek(null, at('2026-09-12')).weekKey).toBe(SEP_06)
  })

  it('keeps an explicit choice meaning the same thing across a week boundary', () => {
    // 'this' is not a frozen key: it means the week containing today, so the
    // same explicit choice names a different week once the week rolls. That is
    // the intent — the alternative is a toggle labelled "This week" reading a
    // week that is no longer this one.
    expect(resolveReviewWeek('this', at('2026-09-11')).weekKey).toBe(SEP_06)
    expect(resolveReviewWeek('this', at('2026-09-13')).weekKey).toBe('2026-09-13')
  })
})
