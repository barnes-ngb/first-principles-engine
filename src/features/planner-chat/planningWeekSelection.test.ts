import { describe, expect, it } from 'vitest'

import { getPlanningWeekRange } from '../../core/utils/time'
import {
  applyButtonLabel,
  appliedConfirmation,
  defaultPlanningWeekChoice,
  generateButtonLabel,
  planningWeekDates,
  planningWeekOptions,
  planningWeekRangeFor,
  planningWeekStillMatches,
  resolvePlanningWeek,
  staleWeekNotice,
} from './planningWeekSelection'

// One anchor week, used everywhere below so the dates stay checkable by eye:
//   Sun Jul 12 ── Sat Jul 18, 2026   ("this week" from Sun 12 through Sat 18)
//   Sun Jul 19 ── Sat Jul 25, 2026   ("next week" from that same window)
// School bodies: Mon Jul 13 – Fri Jul 17, and Mon Jul 20 – Fri Jul 24.
const THIS_WEEK = '2026-07-12'
const NEXT_WEEK = '2026-07-19'
// Local-midnight dates, matching how the page builds `now` from its day key.
const SUN = new Date(2026, 6, 12)
const MON = new Date(2026, 6, 13)
const WED = new Date(2026, 6, 15)
const THU = new Date(2026, 6, 16)
const FRI = new Date(2026, 6, 17)
const SAT = new Date(2026, 6, 18)

describe('planningWeekRangeFor', () => {
  it('resolves the two weeks from the Sun–Sat week containing now', () => {
    expect(planningWeekRangeFor('this', WED)).toEqual({ start: THIS_WEEK, end: '2026-07-18' })
    expect(planningWeekRangeFor('next', WED)).toEqual({ start: NEXT_WEEK, end: '2026-07-25' })
  })

  it('gives the same pair of weeks on every day of one Sun–Sat window', () => {
    for (const now of [SUN, MON, WED, THU, FRI, SAT]) {
      expect(planningWeekRangeFor('this', now).start).toBe(THIS_WEEK)
      expect(planningWeekRangeFor('next', now).start).toBe(NEXT_WEEK)
    }
  })

  it('crosses a month/year boundary as calendar arithmetic, not string math', () => {
    const satDec = new Date(2025, 11, 27) // Sat Dec 27, 2025 (week Dec 21–27)
    expect(planningWeekRangeFor('next', satDec)).toEqual({
      start: '2025-12-28',
      end: '2026-01-03',
    })
  })
})

describe('defaultPlanningWeekChoice', () => {
  it('is "this" Sunday through Thursday', () => {
    for (const now of [SUN, MON, WED, THU]) {
      expect(defaultPlanningWeekChoice(now)).toBe('this')
    }
  })

  // FEAT-196: the owner's report — planning on a Friday means next week.
  it('is "next" on Friday and Saturday', () => {
    expect(defaultPlanningWeekChoice(FRI)).toBe('next')
    expect(defaultPlanningWeekChoice(SAT)).toBe('next')
  })

  // The load-bearing invariant of this module: the selector's default is not a
  // restatement of the roll rule, it is `getPlanningWeekRange`'s own answer. Move
  // the roll day there and this stays true with nothing else to edit.
  it('agrees with getPlanningWeekRange on every weekday of a fortnight', () => {
    for (let day = 12; day <= 25; day++) {
      const now = new Date(2026, 6, day, 12, 0, 0)
      const choice = defaultPlanningWeekChoice(now)
      expect(planningWeekRangeFor(choice, now).start).toBe(getPlanningWeekRange(now).start)
    }
  })
})

describe('planningWeekOptions', () => {
  it('offers exactly two weeks, labelled with the dates they write to', () => {
    const options = planningWeekOptions(WED)
    expect(options.map((o) => o.choice)).toEqual(['this', 'next'])
    expect(options[0].label).toBe('This week')
    expect(options[0].dates).toBe('Jul 13–17')
    expect(options[1].label).toBe('Next week')
    expect(options[1].dates).toBe('Jul 20–24')
  })

  it('leaves both plannable Sunday through Friday', () => {
    for (const now of [SUN, MON, WED, THU, FRI]) {
      expect(planningWeekOptions(now).map((o) => o.disabled)).toEqual([false, false])
    }
  })

  // Saturday is the one day the containing week's whole Mon–Fri body is behind
  // us. The option is shown, greyed, with the reason — not hidden.
  it('disables "this week" on Saturday, with a reason, and keeps it visible', () => {
    const [thisWeek, nextWeek] = planningWeekOptions(SAT)
    expect(thisWeek.disabled).toBe(true)
    expect(thisWeek.disabledReason).toBe('Already passed')
    expect(thisWeek.dates).toBe('Jul 13–17')
    expect(nextWeek.disabled).toBe(false)
    expect(nextWeek.disabledReason).toBeUndefined()
  })
})

describe('resolvePlanningWeek', () => {
  it('follows the corrected default while the parent has said nothing', () => {
    expect(resolvePlanningWeek(null, THU).range.start).toBe(THIS_WEEK)
    expect(resolvePlanningWeek(null, FRI).range.start).toBe(NEXT_WEEK)
  })

  // The whole point of the run: a Wednesday parent can plan next week, which no
  // weekday rule could ever express.
  it('honours an explicit pick over the default, in both directions', () => {
    expect(resolvePlanningWeek('next', WED).range.start).toBe(NEXT_WEEK)
    expect(resolvePlanningWeek('this', FRI).range.start).toBe(THIS_WEEK)
  })

  it('reports the choice actually in force alongside the range', () => {
    expect(resolvePlanningWeek('next', WED).choice).toBe('next')
    expect(resolvePlanningWeek(null, FRI).choice).toBe('next')
  })

  it('falls back to the default when the picked week has passed', () => {
    const resolved = resolvePlanningWeek('this', SAT)
    expect(resolved.choice).toBe('next')
    expect(resolved.range.start).toBe(NEXT_WEEK)
    expect(resolved.fellBackFromPast).toBe(true)
  })

  it('does not claim a fallback when the pick was honoured', () => {
    expect(resolvePlanningWeek('this', WED).fellBackFromPast).toBe(false)
    expect(resolvePlanningWeek(null, SAT).fellBackFromPast).toBe(false)
  })

  it('never resolves to a week the options list marked unplannable', () => {
    for (let day = 12; day <= 25; day++) {
      const now = new Date(2026, 6, day, 12, 0, 0)
      for (const explicit of [null, 'this', 'next'] as const) {
        const resolved = resolvePlanningWeek(explicit, now)
        const option = resolved.options.find((o) => o.choice === resolved.choice)
        expect(option?.disabled).toBe(false)
      }
    }
  })
})

describe('planningWeekStillMatches (the FEAT-196 write rail)', () => {
  it('holds while the clock stays inside the week the draft was built in', () => {
    expect(planningWeekStillMatches('next', NEXT_WEEK, WED)).toBe(true)
    // Friday → Saturday is the same Sun–Sat window, so a draft survives it.
    expect(planningWeekStillMatches('next', NEXT_WEEK, SAT)).toBe(true)
    expect(planningWeekStillMatches('this', THIS_WEEK, FRI)).toBe(true)
  })

  it('fails once the week rolls over, for both choices', () => {
    const nextSunday = new Date(2026, 6, 19)
    // "Next week" drafted on Saturday meant Jul 20–24; on Sunday it means Jul 27–31.
    expect(planningWeekStillMatches('next', NEXT_WEEK, nextSunday)).toBe(false)
    expect(planningWeekStillMatches('this', THIS_WEEK, nextSunday)).toBe(false)
  })

  it('fails for a week key that was never one of the two', () => {
    expect(planningWeekStillMatches('this', '2026-01-04', WED)).toBe(false)
  })
})

describe('copy', () => {
  it('the stale notice names the refused week and says nothing was written', () => {
    const notice = staleWeekNotice(NEXT_WEEK)
    expect(notice).toContain('Week of Jul 20–24')
    expect(notice).toContain('nothing was written')
  })

  it('the stale notice still reads as English for an unparseable week', () => {
    expect(staleWeekNotice('not-a-date')).toContain('nothing was written')
    expect(staleWeekNotice('not-a-date')).not.toContain('  ')
  })

  it('the Apply button names the week it writes to', () => {
    expect(applyButtonLabel(NEXT_WEEK)).toBe('Apply to Jul 20–24')
    expect(applyButtonLabel('2026-08-30')).toBe('Apply to Aug 31 – Sep 4')
  })

  it('the Apply button drops the range rather than showing an empty one', () => {
    expect(applyButtonLabel('not-a-date')).toBe('Apply this plan')
  })

  it('the confirmation says back the same week, and still points at Today', () => {
    expect(appliedConfirmation(NEXT_WEEK)).toBe("Plan applied to Jul 20–24. It's on Today.")
    expect(appliedConfirmation('not-a-date')).toBe("Plan applied! It's on Today.")
  })

  it('every date string comes from the one formatter', () => {
    expect(planningWeekDates(NEXT_WEEK)).toBe('Jul 20–24')
    expect(applyButtonLabel(NEXT_WEEK)).toContain(planningWeekDates(NEXT_WEEK))
    expect(appliedConfirmation(NEXT_WEEK)).toContain(planningWeekDates(NEXT_WEEK))
  })
})

// ── UX-183: the Generate button and the selector must agree ──────────────────
//
// The owner's screenshot: the selector reading "This week — Aug 31–Sep 4 ·
// already passed" / "Next week — Sep 7–11" (selected), and directly beneath it a
// button reading "Generate This Week's Plan". He did not tap it, and was right
// not to. These assert the button now names the week the selector holds.
describe('generateButtonLabel', () => {
  it('names next week when next week is what was picked', () => {
    const label = generateButtonLabel(planningWeekRangeFor('next', WED).start)
    expect(label).toBe('Generate Plan for Jul 20–24')
    // The exact words the old hardcoded string said, whichever week was picked.
    expect(label).not.toContain("This Week's")
    expect(label).not.toContain('This Week\u2019s')
  })

  it('names this week when this week is what was picked', () => {
    expect(generateButtonLabel(planningWeekRangeFor('this', WED).start)).toBe(
      'Generate Plan for Jul 13–17',
    )
  })

  it('reproduces the owner’s screenshot, with the label corrected', () => {
    // Sat Sep 5 2026 — "this week" (Aug 31–Sep 4) has passed, so the selector
    // greys it out and defaults to next week, Sep 7–11.
    const saturday = new Date(2026, 8, 5)
    const resolved = resolvePlanningWeek(null, saturday)
    expect(resolved.choice).toBe('next')
    expect(generateButtonLabel(resolved.range.start)).toBe('Generate Plan for Sep 7–11')
  })

  it('names the week on the photo variant too, which named neither before', () => {
    expect(generateButtonLabel(NEXT_WEEK, 1)).toBe('Generate Plan for Jul 20–24 (1 photo)')
    expect(generateButtonLabel(NEXT_WEEK, 3)).toBe('Generate Plan for Jul 20–24 (3 photos)')
  })

  it('keeps the literal "Generate Plan" the chat messages tell a parent to tap', () => {
    for (const start of [THIS_WEEK, NEXT_WEEK, 'not-a-date']) {
      expect(generateButtonLabel(start)).toContain('Generate Plan')
    }
  })

  it('drops the range rather than showing an empty one, exactly like Apply', () => {
    expect(generateButtonLabel('not-a-date')).toBe('Generate Plan')
    expect(generateButtonLabel('not-a-date', 2)).toBe('Generate Plan (2 photos)')
  })

  it('takes its dates from the one formatter, like every other label here', () => {
    expect(generateButtonLabel(NEXT_WEEK)).toContain(planningWeekDates(NEXT_WEEK))
    // And therefore says the same week the Apply button will.
    expect(planningWeekDates(NEXT_WEEK)).not.toBe('')
    expect(applyButtonLabel(NEXT_WEEK)).toContain(planningWeekDates(NEXT_WEEK))
  })
})
