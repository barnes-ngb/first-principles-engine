// ── FEAT-150: which week, who may, and what the cards say ────────────────────
//
// Every case here pins its clock explicitly. The week window is the rail the
// whole feature hangs on — "next week" on a Tuesday, on a Saturday, and across a
// Sunday→Monday rollover are three different answers, and the bug this suite
// exists to prevent is a draft written to a week the family has already started.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ChatAction } from '../../core/types'
import {
  APPLY_RETAIN_RULES,
  civilTodayKey,
  describeApplyNextWeek,
  describeDraftNextWeek,
  DRAFT_FOOTNOTE,
  formatNextWeekLabel,
  isDraftNextWeekAction,
  isNextWeekStart,
  NEXT_WEEK_NOTICES,
  nextWeekDayKeys,
  nextWeekStartKey,
  partialApplyNotice,
  resolveDraftNextWeek,
  type DraftNextWeekAction,
} from './nextWeekActions'

// The week helpers run on LOCAL date components (they build on
// `currentWeekDayKeys`, which is the FEAT-142 definition), so the zone has to be
// pinned or these assertions drift with the runner's machine.
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Chicago'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

const draftAction = (over: Partial<DraftNextWeekAction> = {}): DraftNextWeekAction => ({
  kind: 'draftNextWeek',
  childId: 'c1',
  instructions: 'lighter, math every day but short',
  ...over,
})

/** Local midday on the given local date — safely inside the day in any zone. */
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0)

describe('nextWeekDayKeys — which week is "next week"', () => {
  it('on a Tuesday, returns the following Mon–Fri', () => {
    // Tue 2026-08-18 → this week is Aug 17–21, next week is Aug 24–28.
    expect(nextWeekDayKeys(at(2026, 8, 18)).map((d) => d.dateKey)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ])
  })

  it('labels the days by name, never by date', () => {
    expect(nextWeekDayKeys(at(2026, 8, 18)).map((d) => d.label)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ])
  })

  it('on a Saturday, means the Mon–Fri that is about to start', () => {
    // Sat 2026-08-22 — this week's body (Aug 17–21) is behind us, so the week a
    // weekend planner means is Aug 24–28, the same week `getPlanningWeekRange`
    // targets on a Saturday.
    expect(nextWeekDayKeys(at(2026, 8, 22))[0].dateKey).toBe('2026-08-24')
  })

  it('on a Sunday, means the Mon–Fri that starts tomorrow', () => {
    // Sun 2026-08-23. Sunday belongs to the week that is ENDING (the FEAT-142
    // rule the CF mirrors), so next week is still Aug 24–28.
    expect(nextWeekDayKeys(at(2026, 8, 23))[0].dateKey).toBe('2026-08-24')
  })

  it('is exactly five weekdays — never a weekend, never a longer horizon', () => {
    const days = nextWeekDayKeys(at(2026, 8, 18))
    expect(days).toHaveLength(5)
    for (const d of days) {
      const dow = new Date(`${d.dateKey}T12:00:00Z`).getUTCDay()
      expect(dow).toBeGreaterThanOrEqual(1)
      expect(dow).toBeLessThanOrEqual(5)
    }
  })
})

describe('nextWeekStartKey — the Sunday-start key Apply writes against', () => {
  it('is the Sunday before next Monday, matching the planner convention', () => {
    expect(nextWeekStartKey(at(2026, 8, 18))).toBe('2026-08-23')
  })

  it('stays exactly one day before the first weekday it reports', () => {
    for (const now of [at(2026, 8, 17), at(2026, 8, 20), at(2026, 8, 22), at(2026, 8, 23)]) {
      const start = new Date(`${nextWeekStartKey(now)}T00:00:00Z`)
      start.setUTCDate(start.getUTCDate() + 1)
      expect(start.toISOString().slice(0, 10)).toBe(nextWeekDayKeys(now)[0].dateKey)
    }
  })
})

describe('isNextWeekStart — the rollover rail', () => {
  it('accepts the week it just resolved', () => {
    const now = at(2026, 8, 18)
    expect(isNextWeekStart(nextWeekStartKey(now), now)).toBe(true)
  })

  it('REJECTS the current week', () => {
    // 2026-08-16 is the Sunday starting the live week on Tue Aug 18. The planner
    // and FEAT-142's live-day edits own that week; this lane must not write it.
    expect(isNextWeekStart('2026-08-16', at(2026, 8, 18))).toBe(false)
  })

  it('REJECTS the week after next', () => {
    expect(isNextWeekStart('2026-08-30', at(2026, 8, 18))).toBe(false)
  })

  it('rejects a draft that sat through a Sunday→Monday rollover', () => {
    // Drafted on Sunday Aug 23 for the week starting Sunday Aug 23...
    const staged = nextWeekStartKey(at(2026, 8, 23))
    expect(staged).toBe('2026-08-23')
    // ...and tapped on Monday Aug 24, when that is now the CURRENT week.
    expect(isNextWeekStart(staged, at(2026, 8, 24))).toBe(false)
  })

  it('rejects junk rather than coercing it', () => {
    expect(isNextWeekStart('', at(2026, 8, 18))).toBe(false)
    expect(isNextWeekStart('not-a-date', at(2026, 8, 18))).toBe(false)
  })
})

describe('resolveDraftNextWeek — the gates', () => {
  it('refuses a kid profile by capability, never by name', () => {
    const result = resolveDraftNextWeek(draftAction(), false, at(2026, 8, 18))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.notice).toBe(NEXT_WEEK_NOTICES.notPermitted)
  })

  it('refuses when no child is bound', () => {
    const result = resolveDraftNextWeek(draftAction({ childId: '' }), true, at(2026, 8, 18))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.notice).toBe(NEXT_WEEK_NOTICES.noChild)
  })

  it('resolves to next week for a parent', () => {
    const result = resolveDraftNextWeek(draftAction(), true, at(2026, 8, 18))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.weekStart).toBe('2026-08-23')
    expect(result.days[0].dateKey).toBe('2026-08-24')
  })

  it('every refusal is a sentence a parent can read, not a code', () => {
    for (const notice of Object.values(NEXT_WEEK_NOTICES)) {
      expect(notice.length).toBeGreaterThan(30)
      expect(notice).toMatch(/[.!]$/)
      // No ids, no raw dates.
      expect(notice).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })
})

describe('isDraftNextWeekAction', () => {
  it('narrows only its own kind', () => {
    expect(isDraftNextWeekAction(draftAction())).toBe(true)
    const other: ChatAction = { kind: 'addSightWord', childId: 'c1', word: 'the' }
    expect(isDraftNextWeekAction(other)).toBe(false)
  })
})

describe('card wording', () => {
  it('names the week in words, never as a date key', () => {
    const label = formatNextWeekLabel(nextWeekDayKeys(at(2026, 8, 18)))
    expect(label).toBe('Aug 24–28')
    expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('spans a month boundary readably', () => {
    // Next week from Tue 2026-08-25 is Aug 31 – Sep 4.
    expect(formatNextWeekLabel(nextWeekDayKeys(at(2026, 8, 25)))).toBe('Aug 31 – Sep 4')
  })

  it('quotes the instructions back on the draft card', () => {
    const line = describeDraftNextWeek(draftAction(), 'Lincoln', 'Aug 24–28')
    expect(line).toContain('Lincoln')
    expect(line).toContain('Aug 24–28')
    expect(line).toContain('lighter, math every day but short')
  })

  it("says the draft tap writes nothing — the parent's model of Confirm is 'done'", () => {
    expect(DRAFT_FOOTNOTE).toContain('writes nothing')
  })

  it('names the child and the week on the apply card', () => {
    expect(describeApplyNextWeek('Lincoln', 'Aug 24–28')).toBe(
      "Apply this plan to Lincoln's next week (Aug 24–28)",
    )
  })

  it('states all three retain rules in parent language', () => {
    expect(APPLY_RETAIN_RULES).toHaveLength(3)
    const all = APPLY_RETAIN_RULES.join(' ')
    // finished work survives...
    expect(all).toMatch(/finished/i)
    // ...her own additions survive...
    expect(all).toMatch(/by hand/i)
    // ...and stale leftovers are what actually change.
    expect(all).toMatch(/leftovers/i)
    // No jargon leaks from `applyReset.ts`.
    expect(all).not.toMatch(/rolledOverFrom|source|checklist|planner residue/i)
  })
})

describe('partialApplyNotice — FEAT-138 honesty at week scale', () => {
  it('says nothing was written when nothing was', () => {
    const notice = partialApplyNotice([])
    expect(notice).toMatch(/nothing was written/i)
  })

  it('names the single day that landed', () => {
    const notice = partialApplyNotice(['2026-08-24'])
    expect(notice).toContain('Monday')
    expect(notice).toMatch(/was written/)
  })

  it('names every day that landed, and never claims a rollback', () => {
    const notice = partialApplyNotice(['2026-08-24', '2026-08-25', '2026-08-26'])
    expect(notice).toContain('Monday')
    expect(notice).toContain('Tuesday')
    expect(notice).toContain('and Wednesday')
    expect(notice).not.toMatch(/undone|rolled back|reverted/i)
    // Points at where she can check, so "don't double up" is actionable.
    expect(notice).toContain('Plan My Week')
  })
})

describe('civilTodayKey', () => {
  it('is the local civil date, matching the week window', () => {
    expect(civilTodayKey(at(2026, 8, 18))).toBe('2026-08-18')
  })
})
