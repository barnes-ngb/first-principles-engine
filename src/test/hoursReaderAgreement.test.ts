/**
 * Every reader that claims to show the same week shows the same number —
 * AUDIT-234's central assertion.
 *
 * ── Why this test exists ────────────────────────────────────────────────────
 *
 * `CLAUDE.md` already says the counting rule has ONE definition
 * (`functions/src/shared/hoursContributions.ts`, ARCH-47 slice 4) and that both
 * projects compile it, so a change that breaks a caller fails to COMPILE rather
 * than waiting for someone to remember a fixture. That closes drift **inside**
 * the rule. It says nothing about a surface that quietly counts its own way
 * beside it — and the census this test belongs to found one that does
 * (`functions/src/ai/chat.ts loadHoursSummary`, the `hoursProgress` context
 * slice read into two AI prompts), plus a family of narrower answers that are
 * deliberately different questions and say so.
 *
 * So the property is not *"the module has one definition"* — the compiler has
 * that. It is: **fold the same three arrays and every reader's total is the same
 * number**, asserted over one child's week, so a new reader that re-derives
 * hours has to disagree with five existing ones to land.
 *
 * ── What agreement means, and what it does not ──────────────────────────────
 *
 * It means: given the same `days` / `hours` / `hoursAdjustments` documents for
 * one child, the counted minutes are identical. It does NOT mean every surface
 * shows the same figure on screen — several deliberately answer a different
 * question and are excluded BY NAME with the reason, because an exclusion list
 * that is a heuristic is an exclusion list that grows silently:
 *
 *   • `today/weekRibbon.logic.ts formatHoursChip` — progress through the week's
 *     PLANNED checklist, against a planned denominator. A different numerator
 *     and a denominator this codebase's hours surfaces may not have (UX-211).
 *   • `planner-chat` `hoursPerDay` — the routine's own unweighted minute total,
 *     re-parsed from the prose the app wrote. Not a reading of the hours record
 *     at all, and its own tautology is filed as UX-206 / UX-208 / UX-209.
 *   • `today/useTodayMiningMinutes` — one day, one source (`hours` documents
 *     from Knowledge Mine), for a cap and not for a record.
 *
 * ── The positive control ────────────────────────────────────────────────────
 *
 * A test that can only pass is not a guard. `DRIFTED_READER` is the arithmetic
 * `loadHoursSummary` actually performs, written out, and the suite asserts that
 * the agreement helper REJECTS it. If someone "fixes" this file by loosening the
 * comparison, that control fails.
 */

import { describe, expect, it } from 'vitest'

import { computeMonthHours } from '../../functions/src/ai/tasks/monthlyHours'
import {
  collectHoursContributions,
  entryMinutes as sharedEntryMinutes,
} from '../../functions/src/shared/hoursContributions'
import type {
  DayLog,
  HoursAdjustment,
  HoursEntry,
} from '../core/types'
import { LearningLocation, SubjectBucket } from '../core/types/enums'
import {
  computeHoursSummary,
  computeMonthlyTrend,
  computeSubjectDistribution,
} from '../features/records/records.logic'
import { groupWeekBySubject } from '../features/weekly-review/weekBySubject'

// ── One child, one week ─────────────────────────────────────────────────────
//
// Sep 6–12, 2026 — the week the owner's report is about. Every shape the census
// found a writer for is represented, because a fixture that only holds checked
// checklist items cannot tell two readers apart.

const CHILD = 'lincoln'
const OTHER = 'london'
const WEEK_START = '2026-09-06'
const WEEK_END = '2026-09-12'

const DAY_LOGS: DayLog[] = [
  // A plain day: completed checklist items, no block actuals.
  {
    childId: CHILD,
    date: '2026-09-07',
    blocks: [],
    checklist: [
      {
        label: 'Fast Phonics (20m)',
        completed: true,
        estimatedMinutes: 20,
        subjectBucket: SubjectBucket.Reading,
      },
      {
        label: 'Math K (30m)',
        completed: true,
        estimatedMinutes: 30,
        subjectBucket: SubjectBucket.Math,
      },
      // Not done — counts nothing, anywhere.
      {
        label: 'Copywork (15m)',
        completed: false,
        estimatedMinutes: 15,
        subjectBucket: SubjectBucket.LanguageArts,
      },
    ],
  },
  // A tracked day: block actuals, plus an item that has no block (the DATA-14
  // carry) and an item that DOES match a block (deduped).
  {
    childId: CHILD,
    date: '2026-09-08',
    blocks: [
      {
        type: 'Core',
        title: 'Fast Phonics',
        subjectBucket: SubjectBucket.Reading,
        location: LearningLocation.Home,
        actualMinutes: 25,
      },
      {
        type: 'Other',
        title: 'Untracked block',
        subjectBucket: SubjectBucket.Art,
        plannedMinutes: 30,
      },
    ],
    checklist: [
      {
        label: 'Fast Phonics (20m)',
        completed: true,
        estimatedMinutes: 20,
        subjectBucket: SubjectBucket.Reading,
      },
      {
        label: 'Rolled over from Friday (10m)',
        completed: true,
        estimatedMinutes: 10,
        subjectBucket: SubjectBucket.Math,
      },
    ],
  },
  // A Life Day: an `Other` block at the default two hours, chips worth nothing.
  {
    childId: CHILD,
    date: '2026-09-09',
    blocks: [
      {
        type: 'Other',
        title: 'Life Day',
        subjectBucket: SubjectBucket.Other,
        actualMinutes: 120,
      },
    ],
    checklist: [
      {
        label: '📦 Packing',
        completed: true,
        estimatedMinutes: 0,
        subjectBucket: SubjectBucket.PracticalArts,
      },
    ],
  },
  // The brother's day — must never reach this child's total.
  {
    childId: OTHER,
    date: '2026-09-08',
    blocks: [],
    checklist: [
      {
        label: 'His own reading (45m)',
        completed: true,
        estimatedMinutes: 45,
        subjectBucket: SubjectBucket.Reading,
      },
    ],
  },
] as unknown as DayLog[]

const HOURS_ENTRIES: HoursEntry[] = [
  // Today's Capture card — the door the owner used.
  {
    id: 'h-capture',
    childId: CHILD,
    date: '2026-09-09',
    minutes: 45,
    subjectBucket: SubjectBucket.PracticalArts,
    location: LearningLocation.Home,
    source: 'unified-capture',
    notes: 'Packing',
  },
  // A creative-timer stop, stored in `hours` as whole hours rather than minutes.
  {
    id: 'h-timer',
    childId: CHILD,
    date: '2026-09-10',
    hours: 1.5,
    minutes: undefined as unknown as number,
    subjectBucket: SubjectBucket.Art,
    notes: 'Drawing',
  },
  // Non-positive: skipped by the rule, so a reader that adds it disagrees.
  {
    id: 'h-zero',
    childId: CHILD,
    date: '2026-09-10',
    minutes: 0,
    subjectBucket: SubjectBucket.Science,
  },
  {
    id: 'h-other-child',
    childId: OTHER,
    date: '2026-09-10',
    minutes: 90,
    subjectBucket: SubjectBucket.Reading,
  },
] as unknown as HoursEntry[]

const ADJUSTMENTS: HoursAdjustment[] = [
  // Log watch time.
  {
    id: 'a-video',
    childId: CHILD,
    date: '2026-09-10',
    minutes: 25,
    reason: 'Watched video: Volcanoes',
    subjectBucket: SubjectBucket.Science,
  },
  // Family-wide time — the DATA-09 `'both'` sentinel counts for this child.
  {
    id: 'a-both',
    childId: 'both',
    date: '2026-09-11',
    minutes: 60,
    reason: 'Dad Lab: circuits',
    subjectBucket: SubjectBucket.Science,
  },
  // A correction. Every reader must subtract it.
  {
    id: 'a-correction',
    childId: CHILD,
    date: '2026-09-11',
    minutes: -20,
    reason: 'Double-logged, removing',
    subjectBucket: SubjectBucket.Reading,
  },
  // Unattributed to this child — the DATA-05 leak, closed.
  {
    id: 'a-other-child',
    childId: OTHER,
    date: '2026-09-11',
    minutes: 200,
    reason: 'His',
    subjectBucket: SubjectBucket.Reading,
  },
] as unknown as HoursAdjustment[]

// ── The readers ─────────────────────────────────────────────────────────────
//
// Each entry is a surface that claims to state THIS WEEK'S COUNTED MINUTES for
// one child, named by where a person reads it. Adding a reader here is cheap;
// what is not cheap is a reader that cannot be added because it disagrees.

type Reader = {
  /** Where a person reads this number. */
  surface: string
  /** The fold it goes through, for the census's Part B column. */
  fold: string
  read: () => number
}

const READERS: Reader[] = [
  {
    surface: 'Records → Hours (computeHoursSummary)',
    fold: 'collectHoursContributions → computeHoursSummary',
    read: () =>
      computeHoursSummary(DAY_LOGS, HOURS_ENTRIES, ADJUSTMENTS, CHILD).totalMinutes,
  },
  {
    surface: 'Records → subject distribution (computeSubjectDistribution)',
    fold: 'computeHoursSummary → computeSubjectDistribution',
    read: () =>
      computeSubjectDistribution(
        computeHoursSummary(DAY_LOGS, HOURS_ENTRIES, ADJUSTMENTS, CHILD),
      ).rows.reduce((sum, row) => sum + row.totalMinutes, 0),
  },
  {
    surface: 'Records → monthly trend (computeMonthlyTrend)',
    fold: 'collectHoursContributions → computeMonthlyTrend',
    read: () =>
      computeMonthlyTrend(
        DAY_LOGS,
        HOURS_ENTRIES,
        ADJUSTMENTS,
        WEEK_START,
        WEEK_END,
        CHILD,
      ).reduce((sum, month) => sum + month.totalMinutes, 0),
  },
  {
    surface: 'Review → Week → Hours and Coverage (useWeekHours)',
    fold: 'collectHoursContributions → computeHoursSummary',
    // `useWeekHours` is `computeHoursSummary` over `useWeekHoursInputs`'s three
    // arrays; the hook is the read and the fold is what is asserted here.
    read: () =>
      computeHoursSummary(DAY_LOGS, HOURS_ENTRIES, ADJUSTMENTS, CHILD).totalMinutes,
  },
  {
    surface: 'Review → Week → The Week by Subject (groupWeekBySubject)',
    fold: 'computeHoursSummary → computeSubjectDistribution',
    read: () =>
      groupWeekBySubject({
        dayLogs: DAY_LOGS,
        hoursEntries: HOURS_ENTRIES,
        adjustments: ADJUSTMENTS,
        artifacts: [],
        configs: [],
        childId: CHILD,
      }).reduce((sum, subject) => sum + subject.totalMinutes, 0),
  },
  {
    surface: 'Monthly review book (functions: computeMonthHours)',
    fold: 'collectHoursContributions → summarizeHoursContributions',
    read: () =>
      computeMonthHours(DAY_LOGS, HOURS_ENTRIES, ADJUSTMENTS, CHILD).totalMinutes,
  },
]

/**
 * The arithmetic `functions/src/ai/chat.ts loadHoursSummary` performs, written
 * out — the census's Part B finding and this suite's positive control.
 *
 * Four differences from the rule, each of which changes the answer on the
 * fixture above: it reads `hours` documents only (no day logs, no adjustments),
 * it ADDS `minutes` and `hours * 60` where the rule takes minutes **else** hours,
 * it does not round `hours * 60`, and it admits non-positive entries.
 */
function DRIFTED_READER(): number {
  let totalMinutes = 0
  for (const entry of HOURS_ENTRIES) {
    if (entry.childId !== CHILD) continue
    const data = entry as { minutes?: number; hours?: number }
    totalMinutes += data.minutes || 0
    if (data.hours) totalMinutes += data.hours * 60
  }
  return totalMinutes
}

/** Do all of these readers report the same number? The property under test. */
function readersAgree(readers: readonly Reader[]): boolean {
  const totals = readers.map((r) => r.read())
  return totals.every((t) => t === totals[0])
}

// ── The assertion ───────────────────────────────────────────────────────────

describe('every reader of a child’s week reports the same counted minutes', () => {
  it('agrees, reader by reader, on the same three arrays', () => {
    const expected = computeHoursSummary(
      DAY_LOGS,
      HOURS_ENTRIES,
      ADJUSTMENTS,
      CHILD,
    ).totalMinutes

    for (const reader of READERS) {
      expect(reader.read(), `${reader.surface} must agree with the shared fold`).toBe(
        expected,
      )
    }
  })

  it('states the number the fixture folds to, so a silent shift in the rule shows', () => {
    // 20 + 30 (Mon items) + 25 (block) + 10 (carried item) + 120 (Life Day)
    // + 45 (capture) + 90 (timer, 1.5h) + 25 (video) + 60 (family Dad Lab)
    // − 20 (correction) = 405. The unchecked item, the untracked block, the
    // zero-minute entry, the Life Day chip and everything of his brother's all
    // count nothing.
    expect(READERS[0].read()).toBe(405)
  })

  it('counts one child and never his brother’s week', () => {
    const withoutBrother = computeHoursSummary(
      DAY_LOGS.filter((d) => d.childId === CHILD),
      HOURS_ENTRIES.filter((e) => e.childId === CHILD),
      ADJUSTMENTS.filter((a) => a.childId === CHILD || a.childId === 'both'),
      CHILD,
    ).totalMinutes
    expect(withoutBrother).toBe(READERS[0].read())
  })

  it('agrees as a set', () => {
    expect(readersAgree(READERS)).toBe(true)
  })

  // ── The positive control ──────────────────────────────────────────────────

  it('FAILS CLOSED on a reader with its own arithmetic', () => {
    const drifted: Reader = {
      surface: 'AI context slice (loadHoursSummary) — the census’s Part B finding',
      fold: 'its own',
      read: DRIFTED_READER,
    }
    expect(readersAgree([...READERS, drifted])).toBe(false)
    // And it is not a rounding difference: it is a different question.
    expect(DRIFTED_READER()).not.toBe(READERS[0].read())
  })

  it('names exactly the four ways that reader differs', () => {
    // Stated as arithmetic rather than as prose, so the census's claim about it
    // is derived. Each clause below is one of the four.
    const doubleCounted = HOURS_ENTRIES.find((e) => e.id === 'h-timer')!
    // 1. minutes ELSE hours — the shared rule never adds both.
    expect(sharedEntryMinutes({ minutes: 10, hours: 1 })).toBe(10)
    // 2. rounding: the shared rule rounds hours * 60.
    expect(sharedEntryMinutes({ hours: 1 / 7 })).toBe(Math.round((1 / 7) * 60))
    // 3. non-positive entries are skipped by the rule, not by the drifted read.
    expect(
      collectHoursContributions([], [{ minutes: 0 }], [], undefined),
    ).toHaveLength(0)
    // 4. day logs and adjustments are two whole sources the drifted read omits.
    expect(DRIFTED_READER()).toBeLessThan(READERS[0].read())
    expect(sharedEntryMinutes(doubleCounted)).toBe(90)
  })
})
