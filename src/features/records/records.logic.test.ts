import { describe, expect, it } from 'vitest'

import type {
  Artifact,
  DayLog,
  Evaluation,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types'
import {
  DayBlockType,
  EngineStage,
  EvidenceType,
  SubjectBucket,
} from '../../core/types/enums'
import {
  assertAttributed,
  buildComplianceZip,
  collectHoursContributions,
  computeHoursSummary,
  computeMonthlyTrend,
  computeSubjectDistribution,
  dayLogMinuteContributions,
  deriveChildIdFromDocId,
  entryMinutes,
  generateComplianceReportHtml,
  generateDailyLogCsv,
  generateEvaluationMarkdown,
  generateHoursSummaryCsv,
  generatePortfolioMarkdown,
  getMonthLabel,
  getMonthRange,
  scoreArtifactsForPortfolio,
} from './records.logic'

// ─── entryMinutes ────────────────────────────────────────────────────────────

describe('entryMinutes', () => {
  it('returns minutes when present', () => {
    const entry: HoursEntry = { date: '2026-01-01', minutes: 45 }
    expect(entryMinutes(entry)).toBe(45)
  })

  it('converts hours to minutes when minutes is missing', () => {
    const entry: HoursEntry = { date: '2026-01-01', minutes: 0, hours: 1.5 }
    // minutes is 0 which is falsy but not null, so it returns 0
    // Actually: minutes != null is true (0 != null), so it returns 0
    expect(entryMinutes(entry)).toBe(0)
  })

  it('converts hours to minutes when minutes is undefined', () => {
    const entry = { date: '2026-01-01', hours: 1.5 } as HoursEntry
    expect(entryMinutes(entry)).toBe(90)
  })

  it('returns 0 when neither is present', () => {
    const entry = { date: '2026-01-01' } as HoursEntry
    expect(entryMinutes(entry)).toBe(0)
  })
})

// ─── deriveChildIdFromDocId ──────────────────────────────────────────────────

describe('deriveChildIdFromDocId', () => {
  it('extracts childId from date_childId format', () => {
    expect(deriveChildIdFromDocId('2026-01-10_child123')).toBe('child123')
  })

  it('extracts childId from childId_date format', () => {
    expect(deriveChildIdFromDocId('child123_2026-01-10')).toBe('child123')
  })

  it('returns undefined for plain date (no underscore)', () => {
    expect(deriveChildIdFromDocId('2026-01-10')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(deriveChildIdFromDocId('')).toBeUndefined()
  })

  it('returns undefined for id without valid date part', () => {
    expect(deriveChildIdFromDocId('abc_def')).toBeUndefined()
  })
})

// ─── computeHoursSummary ─────────────────────────────────────────────────────

describe('computeHoursSummary', () => {
  it('computes summary from dayLogs when no hours entries', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
          {
            type: DayBlockType.Math,
            subjectBucket: SubjectBucket.Math,
            actualMinutes: 45,
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    expect(summary.totalMinutes).toBe(75)
    expect(summary.coreMinutes).toBe(75)
    expect(summary.coreHomeMinutes).toBe(75)
    expect(summary.adjustmentMinutes).toBe(0)
    expect(summary.bySubject.length).toBe(2)
    expect(summary.byDate['2026-01-10']).toBe(75)
  })

  it('counts BOTH hours entries AND dayLogs additively', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 45,
            location: 'Home',
          },
        ],
      },
    ]

    const entries: HoursEntry[] = [
      {
        date: '2026-01-10',
        minutes: 30,
        subjectBucket: SubjectBucket.Science,
        location: 'Home',
      },
    ]

    const summary = computeHoursSummary(logs, entries, [])

    // Should sum both: entries (30) + logs (45) = 75
    expect(summary.totalMinutes).toBe(75)
    expect(summary.bySubject.length).toBe(2)
  })

  it('applies adjustments', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 60,
            location: 'Home',
          },
        ],
      },
    ]

    const adjustments: HoursAdjustment[] = [
      {
        date: '2026-01-10',
        minutes: 15,
        reason: 'Extra reading time',
        subjectBucket: SubjectBucket.Reading,
      },
    ]

    const summary = computeHoursSummary(logs, [], adjustments)

    expect(summary.totalMinutes).toBe(75) // 60 + 15
    expect(summary.adjustmentMinutes).toBe(15)
    expect(summary.coreMinutes).toBe(75)
  })

  it('handles negative adjustments', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 60,
            location: 'Home',
          },
        ],
      },
    ]

    const adjustments: HoursAdjustment[] = [
      {
        date: '2026-01-10',
        minutes: -20,
        reason: 'Overcounted',
        subjectBucket: SubjectBucket.Reading,
      },
    ]

    const summary = computeHoursSummary(logs, [], adjustments)

    expect(summary.totalMinutes).toBe(40) // 60 - 20
    expect(summary.adjustmentMinutes).toBe(-20)
  })

  it('separates core and non-core subjects', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
          {
            type: DayBlockType.Movement,
            subjectBucket: SubjectBucket.Other,
            actualMinutes: 20,
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    expect(summary.totalMinutes).toBe(50)
    expect(summary.coreMinutes).toBe(30)
    expect(summary.coreHomeMinutes).toBe(30)
  })

  it('classifies PracticalArts as non-core (counts toward total, not core)', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
          {
            type: DayBlockType.Project,
            subjectBucket: SubjectBucket.PracticalArts,
            actualMinutes: 45,
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    expect(summary.totalMinutes).toBe(75)
    expect(summary.coreMinutes).toBe(30)
    expect(summary.coreHomeMinutes).toBe(30)
    // homeMinutes = ALL home minutes (Reading 30 + PracticalArts 45),
    // distinct from coreHomeMinutes which excludes the non-core PracticalArts.
    expect(summary.homeMinutes).toBe(75)
    const practicalRow = summary.bySubject.find(
      (r) => r.subjectBucket === 'PracticalArts',
    )
    expect(practicalRow?.totalMinutes).toBe(45)
  })

  it('returns empty summary for no data', () => {
    const summary = computeHoursSummary([], [], [])

    expect(summary.totalMinutes).toBe(0)
    expect(summary.coreMinutes).toBe(0)
    expect(summary.bySubject.length).toBe(0)
  })

  it('uses block actualMinutes when any block has tracked time (mixed blocks)', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
          {
            type: DayBlockType.Math,
            subjectBucket: SubjectBucket.Math,
            // No actualMinutes — should count as 0
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    // Only the block with actualMinutes counts
    expect(summary.totalMinutes).toBe(30)
    expect(summary.bySubject.length).toBe(1)
    expect(summary.bySubject[0].subjectBucket).toBe('Reading')
  })

  it('falls back to checklist when no block has actualMinutes', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [],
        checklist: [
          {
            label: 'Reading Eggs (45m)',
            completed: true,
            subjectBucket: SubjectBucket.Reading,
          },
          {
            label: 'Math Practice (20m)',
            completed: true,
            subjectBucket: SubjectBucket.Math,
          },
          {
            label: 'Art Project (30m)',
            completed: false,
            subjectBucket: SubjectBucket.Art,
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    // Only completed checklist items count; minutes parsed from label
    expect(summary.totalMinutes).toBe(65) // 45 + 20
    expect(summary.bySubject.length).toBe(2)
  })

  it('prefers estimatedMinutes over label parsing for checklist items', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [],
        checklist: [
          {
            label: 'Reading Eggs (45m)',
            completed: true,
            subjectBucket: SubjectBucket.Reading,
            estimatedMinutes: 30,
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    expect(summary.totalMinutes).toBe(30) // estimatedMinutes wins over parsed (45m)
  })

  it('aggregates all 3 sources: dayLogs + hoursEntries + adjustments', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
        ],
      },
    ]

    const entries: HoursEntry[] = [
      {
        date: '2026-01-10',
        minutes: 25,
        subjectBucket: SubjectBucket.Science,
        location: 'Home',
      },
    ]

    const adjustments: HoursAdjustment[] = [
      {
        date: '2026-01-10',
        minutes: 10,
        reason: 'Extra time',
        subjectBucket: SubjectBucket.Reading,
      },
    ]

    const summary = computeHoursSummary(logs, entries, adjustments)

    expect(summary.totalMinutes).toBe(65) // 30 + 25 + 10
    expect(summary.adjustmentMinutes).toBe(10)
    expect(summary.bySubject.length).toBe(2) // Reading (30+10=40), Science (25)

    const reading = summary.bySubject.find(
      (r) => r.subjectBucket === 'Reading',
    )
    expect(reading?.totalMinutes).toBe(40) // 30 dayLog + 10 adjustment

    const science = summary.bySubject.find(
      (r) => r.subjectBucket === 'Science',
    )
    expect(science?.totalMinutes).toBe(25)
  })

  it('filters by childId when provided', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
        ],
      },
      {
        childId: 'child-b',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Math,
            subjectBucket: SubjectBucket.Math,
            actualMinutes: 45,
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [], 'child-a')

    // Should only include child-a's 30 minutes
    expect(summary.totalMinutes).toBe(30)
    expect(summary.bySubject.length).toBe(1)
    expect(summary.bySubject[0].subjectBucket).toBe('Reading')
  })
})

// ─── DATA-14: unmatched completed checklist items in block-actuals mode ───────
//
// In block-actuals mode the day previously counted block actuals ONLY and
// dropped every completed checklist item — including carried-over items with no
// matching block. Option A: count block actuals PLUS completed items that don't
// correspond (via the shared matcher) to any block-with-actuals, deduped so a
// matched item is not double-counted.

describe('dayLogMinuteContributions — DATA-14 unmatched checklist carry', () => {
  it('(a) matched-only day is UNCHANGED — every completed item matches a block-with-actuals', () => {
    const log: DayLog = {
      childId: 'child-a',
      date: '2026-01-10',
      blocks: [
        {
          type: DayBlockType.Reading,
          title: 'Reading Eggs',
          subjectBucket: SubjectBucket.Reading,
          actualMinutes: 45,
          location: 'Home',
        },
        {
          type: DayBlockType.Math,
          title: 'Math Practice',
          subjectBucket: SubjectBucket.Math,
          actualMinutes: 20,
          location: 'Home',
        },
      ],
      checklist: [
        { label: 'Reading Eggs (45m)', completed: true, subjectBucket: SubjectBucket.Reading },
        { label: 'Math Practice (20m)', completed: true, subjectBucket: SubjectBucket.Math },
      ],
    }

    // Byte-identical to the pre-DATA-14 behavior: block actuals only, no
    // checklist contributions (both items correspond to a block-with-actuals).
    expect(dayLogMinuteContributions(log)).toEqual([
      { subjectBucket: 'Reading', minutes: 45, location: 'Home' },
      { subjectBucket: 'Math', minutes: 20, location: 'Home' },
    ])
  })

  it('(b) matched block + unmatched completed carried item → counts BOTH, matched item NOT double-counted', () => {
    const log: DayLog = {
      childId: 'child-a',
      date: '2026-01-10',
      blocks: [
        {
          type: DayBlockType.Reading,
          title: 'Reading Eggs',
          subjectBucket: SubjectBucket.Reading,
          actualMinutes: 45,
          location: 'Home',
        },
      ],
      checklist: [
        // Matches the block by title — already represented by its actualMinutes.
        { label: 'Reading Eggs (45m)', completed: true, subjectBucket: SubjectBucket.Reading },
        // Carried over from Tuesday, no corresponding block → previously dropped.
        {
          label: 'Handwriting page (15m)',
          completed: true,
          subjectBucket: SubjectBucket.LanguageArts,
          rolledOver: true,
        },
      ],
    }

    const contributions = dayLogMinuteContributions(log)
    // Block actual (45) + carried unmatched item (15) = 60, no double-count.
    expect(contributions).toEqual([
      { subjectBucket: 'Reading', minutes: 45, location: 'Home' },
      { subjectBucket: 'LanguageArts', minutes: 15, location: 'Home' },
    ])
    expect(contributions.reduce((s, c) => s + c.minutes, 0)).toBe(60)
  })

  it('(c) unmatched completed item contributes at Home (feeds core-at-home)', () => {
    const log: DayLog = {
      childId: 'child-a',
      date: '2026-01-10',
      blocks: [
        // Tracked block with a non-Home location.
        {
          type: DayBlockType.Reading,
          title: 'Library reading',
          subjectBucket: SubjectBucket.Reading,
          actualMinutes: 30,
          location: 'Library',
        },
      ],
      checklist: [
        {
          label: 'Math worksheet (25m)',
          completed: true,
          subjectBucket: SubjectBucket.Math,
        },
      ],
    }

    const summary = computeHoursSummary([log], [], [])
    expect(summary.totalMinutes).toBe(55) // 30 block + 25 carried item
    // The carried Math item lands at Home and is a core subject, so it repairs
    // the core-at-home figure even though the block was at the library.
    expect(summary.coreHomeMinutes).toBe(25)
    expect(summary.homeMinutes).toBe(25)
  })

  it('does not carry INCOMPLETE checklist items in block-actuals mode', () => {
    const log: DayLog = {
      childId: 'child-a',
      date: '2026-01-10',
      blocks: [
        {
          type: DayBlockType.Reading,
          title: 'Reading Eggs',
          subjectBucket: SubjectBucket.Reading,
          actualMinutes: 45,
          location: 'Home',
        },
      ],
      checklist: [
        { label: 'Reading Eggs (45m)', completed: true, subjectBucket: SubjectBucket.Reading },
        { label: 'Unfinished art (30m)', completed: false, subjectBucket: SubjectBucket.Art },
      ],
    }

    expect(dayLogMinuteContributions(log)).toEqual([
      { subjectBucket: 'Reading', minutes: 45, location: 'Home' },
    ])
  })

  it("(d) no-block-actuals day is UNCHANGED — full checklist fallback", () => {
    const log: DayLog = {
      childId: 'child-a',
      date: '2026-01-10',
      blocks: [],
      checklist: [
        { label: 'Reading Eggs (45m)', completed: true, subjectBucket: SubjectBucket.Reading },
        { label: 'Math Practice (20m)', completed: true, subjectBucket: SubjectBucket.Math },
        { label: 'Art Project (30m)', completed: false, subjectBucket: SubjectBucket.Art },
      ],
    }

    // Both completed items count via the checklist fallback (unchanged path).
    expect(dayLogMinuteContributions(log)).toEqual([
      { subjectBucket: 'Reading', minutes: 45, location: 'Home' },
      { subjectBucket: 'Math', minutes: 20, location: 'Home' },
    ])
  })
})

// ─── DATA-05: per-kid hours-adjustment attribution ───────────────────────────

describe('assertAttributed (DATA-05 write guard)', () => {
  it('returns the adjustment unchanged when a childId is present', () => {
    const adj = {
      childId: 'lincoln',
      date: '2026-01-10',
      minutes: 30,
      reason: 'extra reading',
      subjectBucket: SubjectBucket.Reading,
    }
    expect(assertAttributed(adj)).toBe(adj)
  })

  it('throws when childId is missing, so no unattributed record can be written', () => {
    expect(() =>
      // @ts-expect-error — intentionally omitting childId to prove the guard
      assertAttributed({ date: '2026-01-10', minutes: 30, reason: 'x' }),
    ).toThrow(/childId/)
  })

  it('throws when childId is an empty string', () => {
    expect(() =>
      assertAttributed({ childId: '', date: '2026-01-10', minutes: 30, reason: 'x' }),
    ).toThrow(/childId/)
  })
})

describe('computeHoursSummary — adjustment attribution (DATA-05)', () => {
  // Two kids, each with a day log, plus adjustments attributed to specific kids.
  const dayLogs: DayLog[] = [
    {
      childId: 'lincoln',
      date: '2026-01-10',
      blocks: [
        { type: DayBlockType.Reading, subjectBucket: SubjectBucket.Reading, actualMinutes: 60, location: 'Home' },
      ],
    },
    {
      childId: 'london',
      date: '2026-01-10',
      blocks: [
        { type: DayBlockType.Math, subjectBucket: SubjectBucket.Math, actualMinutes: 40, location: 'Home' },
      ],
    },
  ]

  it('counts an attributed adjustment for that child ONLY — never cross-kid', () => {
    const adjustments: HoursAdjustment[] = [
      { childId: 'lincoln', date: '2026-01-11', minutes: 20, reason: 'extra reading', subjectBucket: SubjectBucket.Reading },
    ]

    const lincoln = computeHoursSummary(dayLogs, [], adjustments, 'lincoln')
    const london = computeHoursSummary(dayLogs, [], adjustments, 'london')

    // Lincoln gets his 60 day-log + 20 adjustment.
    expect(lincoln.totalMinutes).toBe(80)
    expect(lincoln.adjustmentMinutes).toBe(20)
    // London's total is untouched by Lincoln's adjustment (no cross-kid leak).
    expect(london.totalMinutes).toBe(40)
    expect(london.adjustmentMinutes).toBe(0)
  })

  it('does not double-count an attributed adjustment across the two kids', () => {
    const adjustments: HoursAdjustment[] = [
      { childId: 'lincoln', date: '2026-01-11', minutes: 20, reason: 'extra reading', subjectBucket: SubjectBucket.Reading },
    ]
    const lincoln = computeHoursSummary(dayLogs, [], adjustments, 'lincoln')
    const london = computeHoursSummary(dayLogs, [], adjustments, 'london')
    // The 20 adjustment minutes appear exactly once across both per-kid totals.
    expect(lincoln.adjustmentMinutes + london.adjustmentMinutes).toBe(20)
  })

  // ── DATA-09: the DATA-05 leak is now CLOSED. The read filter matches
  // `childId === child || childId === 'both'`, so a still-unattributed
  // (`!childId`) adjustment counts for NEITHER kid (the legacy docs are migrated
  // to 'both' at the data layer to stay hours-neutral — see the test below). ──
  it('DATA-09: an unattributed adjustment counts for NEITHER kid (leak closed)', () => {
    const unattributed: HoursAdjustment[] = [
      { date: '2026-01-12', minutes: 50, reason: 'legacy backfill, no childId', subjectBucket: SubjectBucket.Reading },
    ]
    const lincoln = computeHoursSummary(dayLogs, [], unattributed, 'lincoln')
    const london = computeHoursSummary(dayLogs, [], unattributed, 'london')
    expect(lincoln.adjustmentMinutes).toBe(0)
    expect(london.adjustmentMinutes).toBe(0)
    // Day-log totals are untouched — only the leaking adjustment is excluded.
    expect(lincoln.totalMinutes).toBe(60)
    expect(london.totalMinutes).toBe(40)
  })

  it("DATA-09: a 'both' adjustment counts for BOTH kids (legitimate family-wide time)", () => {
    const shared: HoursAdjustment[] = [
      { childId: 'both', date: '2026-01-12', minutes: 50, reason: 'Dad Lab — counts for both', subjectBucket: SubjectBucket.Science },
    ]
    const lincoln = computeHoursSummary(dayLogs, [], shared, 'lincoln')
    const london = computeHoursSummary(dayLogs, [], shared, 'london')
    expect(lincoln.adjustmentMinutes).toBe(50)
    expect(london.adjustmentMinutes).toBe(50)
    expect(lincoln.totalMinutes).toBe(110) // 60 day-log + 50 shared
    expect(london.totalMinutes).toBe(90) //  40 day-log + 50 shared
  })

  it("DATA-09 hours-neutral: migrating an unattributed adjustment to 'both' preserves the prior per-kid totals", () => {
    // Pre-DATA-09, an unattributed (`!childId`) adjustment counted for BOTH kids
    // (the leak): Lincoln 60 + 50 = 110, London 40 + 50 = 90, 50 adj-minutes
    // each. The migration stamps it 'both', which under the new filter must
    // reproduce EXACTLY those figures — so no compliance total moves.
    const afterMigration: HoursAdjustment[] = [
      { childId: 'both', date: '2026-01-12', minutes: 50, reason: 'legacy backfill', subjectBucket: SubjectBucket.Reading },
    ]
    const lincoln = computeHoursSummary(dayLogs, [], afterMigration, 'lincoln')
    const london = computeHoursSummary(dayLogs, [], afterMigration, 'london')
    // Identical to the documented pre-migration count-for-both behavior.
    expect(lincoln.adjustmentMinutes).toBe(50)
    expect(lincoln.totalMinutes).toBe(110)
    expect(london.adjustmentMinutes).toBe(50)
    expect(london.totalMinutes).toBe(90)
  })
})

// ─── collectHoursContributions (DATA-11 single counting path) ────────────────

describe('collectHoursContributions (DATA-11)', () => {
  const dayLogs: DayLog[] = [
    {
      childId: 'lincoln',
      date: '2026-01-10',
      blocks: [
        { type: DayBlockType.Reading, subjectBucket: SubjectBucket.Reading, actualMinutes: 30, location: 'Home' },
      ],
    },
  ]
  const hoursEntries: HoursEntry[] = [
    { childId: 'lincoln', date: '2026-01-11', minutes: 25, subjectBucket: SubjectBucket.Science, location: 'Home' },
    { childId: 'lincoln', date: '2026-01-12', minutes: 0, subjectBucket: SubjectBucket.Math }, // non-positive → skipped
  ]
  const adjustments: HoursAdjustment[] = [
    { childId: 'lincoln', date: '2026-01-13', minutes: 15, reason: 'Watched video: fractions', subjectBucket: SubjectBucket.Math, source: 'video-watch' },
    { childId: 'lincoln', date: '2026-01-14', minutes: -10, reason: 'overcounted', subjectBucket: SubjectBucket.Reading },
  ]

  it('emits all three additive sources with their kind; skips non-positive entries; keeps negative adjustments', () => {
    const contributions = collectHoursContributions(dayLogs, hoursEntries, adjustments, 'lincoln')

    expect(contributions.map((c) => c.kind)).toEqual(['entry', 'day-log', 'adjustment', 'adjustment'])
    // The zero-minute entry is skipped; the negative adjustment is NOT.
    expect(contributions.find((c) => c.minutes === 0)).toBeUndefined()
    expect(contributions.find((c) => c.minutes === -10)?.kind).toBe('adjustment')
  })

  it("a video-watch adjustment lands identically in the compliance summary and the monthly trend", () => {
    const videoWatch = adjustments.filter((a) => a.source === 'video-watch')
    const summary = computeHoursSummary(dayLogs, [], videoWatch, 'lincoln')
    const trend = computeMonthlyTrend(dayLogs, [], videoWatch, '2026-01', '2026-01', 'lincoln')

    expect(summary.adjustmentMinutes).toBe(15)
    expect(summary.totalMinutes).toBe(45) // 30 day-log + 15 video-watch
    expect(trend[0].totalMinutes).toBe(45)
    expect(trend[0].coreMinutes).toBe(summary.coreMinutes) // Math is core
  })

  it('applies the DATA-09 child/both attribution once, in the shared path', () => {
    const shared: HoursAdjustment[] = [
      { childId: 'both', date: '2026-01-13', minutes: 50, reason: 'Dad Lab', subjectBucket: SubjectBucket.Science },
      { date: '2026-01-13', minutes: 99, reason: 'legacy unattributed', subjectBucket: SubjectBucket.Science },
    ]
    const contributions = collectHoursContributions([], [], shared, 'lincoln')
    // 'both' counts; unattributed counts for no one.
    expect(contributions).toHaveLength(1)
    expect(contributions[0].minutes).toBe(50)
  })
})

// ─── computeMonthlyTrend (DATA-01 compliance reconciliation guard) ───────────

describe('computeMonthlyTrend', () => {
  // A fixed, representative multi-month dataset that exercises every code path
  // the compliance figure depends on: block-actuals days, a checklist-fallback
  // day, an inflated checklist that must be IGNORED on a tracked day (the exact
  // DATA-01 over-count source), a manual hours entry, a positive adjustment, a
  // negative adjustment, and a non-core block.
  const dayLogs: DayLog[] = [
    // Jan: block actuals, with an INFLATED checklist that must be ignored.
    {
      childId: 'lincoln',
      date: '2026-01-10',
      blocks: [
        { type: DayBlockType.Reading, title: 'Reading', subjectBucket: SubjectBucket.Reading, actualMinutes: 50, location: 'Home' },
        { type: DayBlockType.Math, title: 'Math', subjectBucket: SubjectBucket.Math, actualMinutes: 40, location: 'Home' },
      ],
      checklist: [
        // Inflated estimates for the SAME work as the tracked blocks (they
        // title-match via the shared matcher). The old MonthlyTrend counted
        // these (120) instead of the 90 actual minutes; canonical (and now the
        // trend) dedup them against the matched blocks-with-actuals (DATA-14),
        // so only the 90 block actuals count — no double-count.
        { label: 'Reading (120m)', completed: true, subjectBucket: SubjectBucket.Reading, estimatedMinutes: 120 },
        { label: 'Math (120m)', completed: true, subjectBucket: SubjectBucket.Math, estimatedMinutes: 120 },
      ],
    } as DayLog,
    // Feb: partial-day edge — one tracked block, one untracked block (counts 0).
    {
      childId: 'lincoln',
      date: '2026-02-05',
      blocks: [
        { type: DayBlockType.Reading, subjectBucket: SubjectBucket.Reading, actualMinutes: 30, location: 'Home' },
        { type: DayBlockType.Math, subjectBucket: SubjectBucket.Math, location: 'Home' }, // no actualMinutes
      ],
    } as DayLog,
    // Feb: checklist-fallback day (no block actuals at all).
    {
      childId: 'lincoln',
      date: '2026-02-12',
      blocks: [],
      checklist: [
        { label: 'Science (25m)', completed: true, subjectBucket: SubjectBucket.Science, estimatedMinutes: 25 },
        { label: 'Art (40m)', completed: true, subjectBucket: SubjectBucket.Art, estimatedMinutes: 40 }, // non-core
        { label: 'Reading (20m)', completed: false, subjectBucket: SubjectBucket.Reading, estimatedMinutes: 20 }, // not completed
      ],
    } as DayLog,
  ]
  const hoursEntries: HoursEntry[] = [
    { childId: 'lincoln', date: '2026-01-20', minutes: 60, subjectBucket: SubjectBucket.Science, location: 'Home' },
  ]
  // DATA-09: attributed to Lincoln (this whole dataset is Lincoln's). Pre-DATA-09
  // these were unattributed and counted via the `!childId` leak; the new filter
  // requires explicit attribution, so the reconciliation intent is unchanged.
  const adjustments: HoursAdjustment[] = [
    { childId: 'lincoln', date: '2026-02-15', minutes: 15, reason: 'extra math', subjectBucket: SubjectBucket.Math },
    { childId: 'lincoln', date: '2026-02-16', minutes: -10, reason: 'overcounted reading', subjectBucket: SubjectBucket.Reading },
  ]

  // Expected core minutes by month (core = Reading/LangArts/Math/Science/SocialStudies):
  //   Jan: 50 Reading + 40 Math (block actuals; checklist ignored) + 60 Science entry = 150
  //   Feb: 30 Reading (tracked block) + 25 Science (checklist) + 15 Math adj − 10 Reading adj = 60
  // Expected non-core minutes:
  //   Feb: 40 Art (checklist) = 40
  it('buckets core/non-core minutes per month using the canonical rule', () => {
    const trend = computeMonthlyTrend(dayLogs, hoursEntries, adjustments, '2026-01', '2026-02', 'lincoln')

    expect(trend).toHaveLength(2)
    const [jan, feb] = trend

    expect(jan.month).toBe('2026-01')
    expect(jan.coreMinutes).toBe(150)
    expect(jan.nonCoreMinutes).toBe(0)
    expect(jan.totalMinutes).toBe(150)

    expect(feb.month).toBe('2026-02')
    expect(feb.coreMinutes).toBe(60)
    expect(feb.nonCoreMinutes).toBe(40)
    expect(feb.totalMinutes).toBe(100)

    // Cumulative core at end of period
    expect(feb.cumulativeCore).toBe(210)
    expect(feb.cumulativeTotal).toBe(250)
  })

  it('does NOT count inflated checklist estimates on a block-tracked day (the DATA-01 over-count)', () => {
    const trend = computeMonthlyTrend(dayLogs, [], [], '2026-01', '2026-01', 'lincoln')
    // 50 + 40 block actuals — NOT the 120 + 120 = 240 inflated checklist estimates.
    expect(trend[0].coreMinutes).toBe(90)
  })

  it('RECONCILES exactly with computeHoursSummary core total (compliance guard)', () => {
    const trend = computeMonthlyTrend(dayLogs, hoursEntries, adjustments, '2026-01', '2026-02', 'lincoln')
    const summary = computeHoursSummary(dayLogs, hoursEntries, adjustments, 'lincoln')

    const cumulativeCore = trend[trend.length - 1].cumulativeCore
    const cumulativeTotal = trend[trend.length - 1].cumulativeTotal

    // The whole point of DATA-01: the trend's cumulative figures must equal the
    // canonical compliance figures for data within the period.
    expect(cumulativeCore).toBe(summary.coreMinutes)
    expect(cumulativeTotal).toBe(summary.totalMinutes)
  })

  it('creates zero buckets for months with no activity across the full range', () => {
    const trend = computeMonthlyTrend(dayLogs, hoursEntries, adjustments, '2025-12', '2026-03', 'lincoln')
    expect(trend.map((t) => t.month)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03'])
    expect(trend[0].totalMinutes).toBe(0) // Dec — no activity
    expect(trend[3].totalMinutes).toBe(0) // Mar — no activity
    // Cumulative still reconciles at the end since all data is in-range.
    const summary = computeHoursSummary(dayLogs, hoursEntries, adjustments, 'lincoln')
    expect(trend[trend.length - 1].cumulativeCore).toBe(summary.coreMinutes)
  })

  it('filters to the requested child (safety net)', () => {
    const mixed: DayLog[] = [
      ...dayLogs,
      {
        childId: 'london',
        date: '2026-01-11',
        blocks: [{ type: DayBlockType.Reading, subjectBucket: SubjectBucket.Reading, actualMinutes: 999, location: 'Home' }],
      } as DayLog,
    ]
    const trend = computeMonthlyTrend(mixed, hoursEntries, adjustments, '2026-01', '2026-02', 'lincoln')
    // London's 999 must not leak into Lincoln's Jan core.
    expect(trend[0].coreMinutes).toBe(150)
  })
})

// ─── computeSubjectDistribution (FEAT-105) ───────────────────────────────────
//
// The "hours by subject" distribution is a PURE reshape of the canonical
// HoursSummary, so its total must reconcile EXACTLY with the compliance total
// already displayed. Fixtures: multi-subject, untagged-only, empty range,
// single subject.

describe('computeSubjectDistribution (FEAT-105)', () => {
  // Multi-subject dataset: Reading 60 (core), Math 30 (core), Art 30 (non-core),
  // plus an untagged 20-minute entry that lands in the Other bucket.
  const multiSubjectSummary = computeHoursSummary(
    [
      {
        childId: 'lincoln',
        date: '2026-01-10',
        blocks: [
          { type: DayBlockType.Reading, subjectBucket: SubjectBucket.Reading, actualMinutes: 60, location: 'Home' },
          { type: DayBlockType.Math, subjectBucket: SubjectBucket.Math, actualMinutes: 30, location: 'Home' },
          { type: DayBlockType.Movement, subjectBucket: SubjectBucket.Art, actualMinutes: 30, location: 'Library' },
        ],
      },
    ],
    // Untagged entry — no subjectBucket → folds into 'Other'.
    [{ childId: 'lincoln', date: '2026-01-11', minutes: 20, location: 'Home' }],
    [],
    'lincoln',
  )

  it('sorts subjects by minutes DESCENDING (label ascending on ties)', () => {
    const dist = computeSubjectDistribution(multiSubjectSummary)
    expect(dist.rows.map((r) => r.subjectBucket)).toEqual([
      'Reading', // 60
      // Math and Art both 30 → tie broken by label ('Art' < 'Math')
      'Art',
      'Math',
      'Other', // 20
    ])
  })

  it('RECONCILES exactly with the summary total (the FEAT-105 guard)', () => {
    const dist = computeSubjectDistribution(multiSubjectSummary)
    const rowSum = dist.rows.reduce((s, r) => s + r.totalMinutes, 0)
    // The distribution total, the sum of its rows, and the canonical compliance
    // total are all the same number — no re-count, no drift.
    expect(dist.totalMinutes).toBe(multiSubjectSummary.totalMinutes)
    expect(rowSum).toBe(multiSubjectSummary.totalMinutes)
    expect(dist.totalMinutes).toBe(140) // 60 + 30 + 30 + 20
  })

  it('splits core vs non-core factually — core + non-core === total', () => {
    const dist = computeSubjectDistribution(multiSubjectSummary)
    // Core = Reading 60 + Math 30 = 90; non-core = Art 30 + Other 20 = 50.
    expect(dist.coreMinutes).toBe(90)
    expect(dist.nonCoreMinutes).toBe(50)
    expect(dist.coreMinutes + dist.nonCoreMinutes).toBe(dist.totalMinutes)
    expect(dist.coreMinutes).toBe(multiSubjectSummary.coreMinutes)

    const reading = dist.rows.find((r) => r.subjectBucket === 'Reading')
    const art = dist.rows.find((r) => r.subjectBucket === 'Art')
    expect(reading?.isCore).toBe(true)
    expect(art?.isCore).toBe(false)
  })

  it('percentages are precise shares of the total that sum to ~100', () => {
    const dist = computeSubjectDistribution(multiSubjectSummary)
    const reading = dist.rows.find((r) => r.subjectBucket === 'Reading')
    expect(reading?.percent).toBeCloseTo((60 / 140) * 100, 6)
    const sum = dist.rows.reduce((s, r) => s + r.percent, 0)
    expect(sum).toBeCloseTo(100, 6)
  })

  it('scales the bar to the largest subject, never to a target', () => {
    const dist = computeSubjectDistribution(multiSubjectSummary)
    // maxSubjectMinutes is the biggest single-subject total (Reading 60) — the
    // denominator for a bar scaled to the DATA.
    expect(dist.maxSubjectMinutes).toBe(60)
  })

  it('surfaces untagged time honestly as an "Other / untagged" row', () => {
    const dist = computeSubjectDistribution(multiSubjectSummary)
    const other = dist.rows.find((r) => r.subjectBucket === 'Other')
    expect(other).toBeDefined()
    expect(other?.label).toBe('Other / untagged')
    expect(other?.isOther).toBe(true)
    expect(other?.isCore).toBe(false)
    expect(other?.totalMinutes).toBe(20)
  })

  it('untagged-only range: a single Other/untagged row at 100%', () => {
    const summary = computeHoursSummary(
      [],
      [
        { childId: 'lincoln', date: '2026-01-10', minutes: 45, location: 'Home' },
        { childId: 'lincoln', date: '2026-01-11', minutes: 15, location: 'Home' },
      ],
      [],
      'lincoln',
    )
    const dist = computeSubjectDistribution(summary)
    expect(dist.rows).toHaveLength(1)
    expect(dist.rows[0].label).toBe('Other / untagged')
    expect(dist.rows[0].percent).toBeCloseTo(100, 6)
    expect(dist.coreMinutes).toBe(0)
    expect(dist.nonCoreMinutes).toBe(60)
    expect(dist.totalMinutes).toBe(60)
  })

  it('empty range: no rows, zeroed totals, no divide-by-zero', () => {
    const dist = computeSubjectDistribution(computeHoursSummary([], [], []))
    expect(dist.rows).toEqual([])
    expect(dist.totalMinutes).toBe(0)
    expect(dist.coreMinutes).toBe(0)
    expect(dist.nonCoreMinutes).toBe(0)
    expect(dist.maxSubjectMinutes).toBe(0)
  })

  it('single subject: one row at 100%, all core', () => {
    const summary = computeHoursSummary(
      [
        {
          childId: 'lincoln',
          date: '2026-01-10',
          blocks: [
            { type: DayBlockType.Math, subjectBucket: SubjectBucket.Math, actualMinutes: 50, location: 'Home' },
          ],
        },
      ],
      [],
      [],
      'lincoln',
    )
    const dist = computeSubjectDistribution(summary)
    expect(dist.rows).toHaveLength(1)
    expect(dist.rows[0].subjectBucket).toBe('Math')
    expect(dist.rows[0].label).toBe('Math')
    expect(dist.rows[0].percent).toBeCloseTo(100, 6)
    expect(dist.coreMinutes).toBe(50)
    expect(dist.nonCoreMinutes).toBe(0)
  })

  it('omits a subject whose net minutes are exactly zero (adjustment cancels it)', () => {
    const summary = computeHoursSummary(
      [
        {
          childId: 'lincoln',
          date: '2026-01-10',
          blocks: [
            { type: DayBlockType.Reading, subjectBucket: SubjectBucket.Reading, actualMinutes: 40, location: 'Home' },
            { type: DayBlockType.Project, subjectBucket: SubjectBucket.Art, actualMinutes: 20, location: 'Home' },
          ],
        },
      ],
      [],
      // Cancel the Art time back out.
      [{ childId: 'lincoln', date: '2026-01-11', minutes: -20, reason: 'miscount', subjectBucket: SubjectBucket.Art }],
      'lincoln',
    )
    const dist = computeSubjectDistribution(summary)
    expect(dist.rows.map((r) => r.subjectBucket)).toEqual(['Reading'])
    // Still reconciles: 40 Reading + 0 net Art = 40.
    expect(dist.totalMinutes).toBe(40)
  })
})

// ─── generateHoursSummaryCsv ─────────────────────────────────────────────────

describe('generateHoursSummaryCsv', () => {
  it('produces valid CSV with headers and totals', () => {
    const summary = computeHoursSummary(
      [
        {
          childId: 'child-a',
          date: '2026-01-10',
          blocks: [
            {
              type: DayBlockType.Reading,
              subjectBucket: SubjectBucket.Reading,
              actualMinutes: 60,
              location: 'Home',
            },
          ],
        },
      ],
      [],
      [],
    )

    const csv = generateHoursSummaryCsv(summary)
    const lines = csv.split('\n')

    expect(lines[0]).toBe('Subject,Total Hours,Home Hours')
    expect(lines[1].startsWith('Reading')).toBe(true)
    expect(csv).toContain('TOTAL')
    expect(csv).toContain('CORE TOTAL')
  })
})

// ─── generateDailyLogCsv ────────────────────────────────────────────────────

describe('generateDailyLogCsv', () => {
  it('generates CSV from dayLogs when no hours entries', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
            notes: 'Read chapter 5',
          },
        ],
      },
    ]

    const csv = generateDailyLogCsv(logs, [])
    const lines = csv.split('\n')

    expect(lines[0]).toBe('Date,Block Type,Subject,Location,Minutes,Notes,Source')
    expect(lines[1]).toContain('2026-01-10')
    expect(lines[1]).toContain('Reading')
    expect(lines[1]).toContain('Read chapter 5')
    expect(lines[1]).toContain('day-log')
  })

  it('includes both hours entries and dayLogs in CSV', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Math,
            subjectBucket: SubjectBucket.Math,
            actualMinutes: 45,
            location: 'Home',
          },
        ],
      },
    ]

    const entries: HoursEntry[] = [
      {
        date: '2026-01-10',
        minutes: 30,
        blockType: DayBlockType.Reading,
        subjectBucket: SubjectBucket.Reading,
        location: 'Home',
      },
    ]

    const csv = generateDailyLogCsv(logs, entries)
    const lines = csv.split('\n')

    expect(lines.length).toBe(3) // header + 2 rows (1 entry + 1 log block)
    expect(csv).toContain('30')
    expect(csv).toContain('45')
  })

  it('escapes commas and quotes in notes', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 15,
            location: 'Home',
            notes: 'Read "To Kill a Mockingbird", chapter 1',
          },
        ],
      },
    ]

    const csv = generateDailyLogCsv(logs, [])

    // Notes with commas and quotes should be properly escaped
    expect(csv).toContain('""To Kill a Mockingbird""')
  })

  it('includes source column for auto-tracked sessions', () => {
    const entries: HoursEntry[] = [
      {
        date: '2026-01-10',
        minutes: 15,
        subjectBucket: SubjectBucket.Reading,
        source: 'evaluation-session',
        notes: 'Reading evaluation session',
      },
      {
        date: '2026-01-11',
        minutes: 20,
        subjectBucket: SubjectBucket.Math,
        source: 'quest-session',
        notes: 'math quest session',
      },
    ]

    const csv = generateDailyLogCsv([], entries)
    const lines = csv.split('\n')

    expect(lines[0]).toContain('Source')
    expect(lines[1]).toContain('evaluation-session')
    expect(lines[2]).toContain('quest-session')
  })
})

// ─── generateEvaluationMarkdown ──────────────────────────────────────────────

describe('generateEvaluationMarkdown', () => {
  it('generates markdown with wins/struggles/nextSteps', () => {
    const evaluations: Evaluation[] = [
      {
        childId: 'lincoln',
        monthStart: '2026-01-01',
        monthEnd: '2026-01-31',
        wins: ['Finished reading chapter book', 'Improved math facts'],
        struggles: ['Focus during read-aloud'],
        nextSteps: ['Start multiplication'],
        sampleArtifactIds: ['art-1'],
      },
    ]

    const children = [{ id: 'lincoln', name: 'Lincoln' }]

    const artifacts: Artifact[] = [
      {
        id: 'art-1',
        childId: 'lincoln',
        title: 'Book Report',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T10:00:00',
        tags: {
          engineStage: EngineStage.Explain,
          domain: 'Reading',
          subjectBucket: SubjectBucket.Reading,
          location: 'Home',
        },
      },
    ]

    const md = generateEvaluationMarkdown(evaluations, children, artifacts)

    expect(md).toContain('# Monthly Evaluations')
    expect(md).toContain('## Lincoln')
    expect(md).toContain('### Wins')
    expect(md).toContain('Finished reading chapter book')
    expect(md).toContain('### Struggles')
    expect(md).toContain('Focus during read-aloud')
    expect(md).toContain('### Next Steps')
    expect(md).toContain('Start multiplication')
    expect(md).toContain('### Sample Artifacts')
    expect(md).toContain('Book Report')
  })

  it('uses childId when child not found', () => {
    const evaluations: Evaluation[] = [
      {
        childId: 'unknown-child',
        monthStart: '2026-01-01',
        monthEnd: '2026-01-31',
        wins: ['A win'],
        struggles: [],
        nextSteps: [],
        sampleArtifactIds: [],
      },
    ]

    const md = generateEvaluationMarkdown(evaluations, [], [])

    expect(md).toContain('## unknown-child')
  })
})

// ─── generatePortfolioMarkdown ───────────────────────────────────────────────

describe('generatePortfolioMarkdown', () => {
  it('groups artifacts by child in a table', () => {
    const artifacts: Artifact[] = [
      {
        id: 'art-1',
        childId: 'lincoln',
        title: 'Butterfly Observation',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T10:00:00',
        tags: {
          engineStage: EngineStage.Wonder,
          domain: 'Insects',
          subjectBucket: SubjectBucket.Science,
          location: 'Home',
        },
      },
    ]

    const children = [{ id: 'lincoln', name: 'Lincoln' }]

    const md = generatePortfolioMarkdown(
      artifacts,
      children,
      '2026-01-01',
      '2026-01-31',
    )

    expect(md).toContain('# Portfolio Index')
    expect(md).toContain('## Lincoln')
    expect(md).toContain('Butterfly Observation')
    expect(md).toContain('Wonder')
    expect(md).toContain('Science')
  })
})

// ─── scoreArtifactsForPortfolio ──────────────────────────────────────────────

describe('scoreArtifactsForPortfolio', () => {
  it('scores higher for artifacts with ladder refs', () => {
    const artifacts: Artifact[] = [
      {
        id: 'a1',
        childId: 'child-a',
        title: 'With Ladder',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T10:00:00',
        tags: {
          engineStage: EngineStage.Build,
          domain: 'Math',
          subjectBucket: SubjectBucket.Math,
          location: 'Home',
          ladderRef: { ladderId: 'l1', rungId: 'r1' },
        },
      },
      {
        id: 'a2',
        childId: 'child-a',
        title: 'Without Ladder',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T11:00:00',
        tags: {
          engineStage: EngineStage.Build,
          domain: 'Math',
          subjectBucket: SubjectBucket.Math,
          location: 'Home',
        },
      },
    ]

    const scored = scoreArtifactsForPortfolio(artifacts)

    // First result should be the one with ladder ref (higher score)
    expect(scored[0].artifact.id).toBe('a1')
    expect(scored[0].score).toBeGreaterThan(scored[1].score)
  })

  it('scores higher for artifacts with content', () => {
    const artifacts: Artifact[] = [
      {
        id: 'a1',
        childId: 'child-a',
        title: 'Rich',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T10:00:00',
        content: 'This is a detailed observation about the butterfly lifecycle.',
        tags: {
          engineStage: EngineStage.Wonder,
          domain: 'Science',
          subjectBucket: SubjectBucket.Science,
          location: 'Home',
        },
      },
      {
        id: 'a2',
        childId: 'child-a',
        title: 'Sparse',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T11:00:00',
        tags: {
          engineStage: EngineStage.Wonder,
          domain: 'Science',
          subjectBucket: SubjectBucket.Science,
          location: 'Home',
        },
      },
    ]

    const scored = scoreArtifactsForPortfolio(artifacts)

    expect(scored[0].artifact.id).toBe('a1')
  })

  it('returns sorted by score descending', () => {
    const artifacts: Artifact[] = [
      {
        id: 'low',
        childId: 'child-a',
        title: 'Low',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T10:00:00',
        tags: {
          engineStage: EngineStage.Wonder,
          domain: '',
          subjectBucket: SubjectBucket.Other,
          location: '',
        },
      },
      {
        id: 'high',
        childId: 'child-a',
        title: 'High',
        type: EvidenceType.Photo,
        createdAt: '2026-01-15T11:00:00',
        content: 'This is a long enough content to count for scoring purposes',
        notes: 'Extra notes',
        tags: {
          engineStage: EngineStage.Build,
          domain: 'Math',
          subjectBucket: SubjectBucket.Math,
          location: 'Home',
          ladderRef: { ladderId: 'l1', rungId: 'r1' },
        },
      },
    ]

    const scored = scoreArtifactsForPortfolio(artifacts)

    expect(scored[0].artifact.id).toBe('high')
    expect(scored[1].artifact.id).toBe('low')
  })
})

// ─── getMonthRange ───────────────────────────────────────────────────────────

describe('getMonthRange', () => {
  it('returns correct range for January', () => {
    const range = getMonthRange(2026, 1)

    expect(range.start).toBe('2026-01-01')
    expect(range.end).toBe('2026-01-31')
  })

  it('returns correct range for February in non-leap year', () => {
    const range = getMonthRange(2025, 2)

    expect(range.start).toBe('2025-02-01')
    expect(range.end).toBe('2025-02-28')
  })

  it('returns correct range for February in leap year', () => {
    const range = getMonthRange(2028, 2)

    expect(range.start).toBe('2028-02-01')
    expect(range.end).toBe('2028-02-29')
  })

  it('returns correct range for December', () => {
    const range = getMonthRange(2026, 12)

    expect(range.start).toBe('2026-12-01')
    expect(range.end).toBe('2026-12-31')
  })
})

// ─── getMonthLabel ───────────────────────────────────────────────────────────

describe('getMonthLabel', () => {
  it('returns human-readable month label', () => {
    const label = getMonthLabel(2026, 1)

    expect(label).toBe('January 2026')
  })

  it('returns correct label for December', () => {
    const label = getMonthLabel(2026, 12)

    expect(label).toBe('December 2026')
  })
})

// ─── buildComplianceZip ─────────────────────────────────────────────────────

describe('buildComplianceZip', () => {
  it('produces a zip blob containing hours and daily-log CSVs', async () => {
    const { default: JSZip } = await import('jszip')

    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    const blob = await buildComplianceZip({
      summary,
      dayLogs: logs,
      hoursEntries: [],
      evaluations: [],
      artifacts: [],
      children: [{ id: 'child-a', name: 'Alice' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Alice',
    })

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)

    const zip = await JSZip.loadAsync(blob)
    const names = Object.keys(zip.files)

    expect(names).toContain('alice-hours-summary-2026-01-01-to-2026-01-31.csv')
    expect(names).toContain('alice-daily-logs-2026-01-01-to-2026-01-31.csv')
    // No evaluations or artifacts → those files should be absent
    expect(names).not.toContain('alice-evaluations-2026-01-01-to-2026-01-31.md')
    expect(names).not.toContain('alice-portfolio-2026-01-01-to-2026-01-31.md')
  })

  it('uses per-child filename prefix when childName is provided', async () => {
    const { default: JSZip } = await import('jszip')

    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    const blob = await buildComplianceZip({
      summary,
      dayLogs: logs,
      hoursEntries: [],
      evaluations: [],
      artifacts: [],
      children: [{ id: 'child-a', name: 'Lincoln' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Lincoln',
    })

    const zip = await JSZip.loadAsync(blob)
    const names = Object.keys(zip.files)

    expect(names).toContain('lincoln-hours-summary-2026-01-01-to-2026-01-31.csv')
    expect(names).toContain('lincoln-daily-logs-2026-01-01-to-2026-01-31.csv')
  })

  it('includes evaluation and portfolio markdown when data exists', async () => {
    const { default: JSZip } = await import('jszip')

    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
        ],
      },
    ]

    const evaluations: Evaluation[] = [
      {
        childId: 'child-a',
        monthStart: '2026-01-01',
        monthEnd: '2026-01-31',
        wins: ['Great progress'],
        struggles: [],
        nextSteps: [],
        sampleArtifactIds: [],
      },
    ]

    const artifacts: Artifact[] = [
      {
        id: 'art-1',
        childId: 'child-a',
        title: 'Test Artifact',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T10:00:00',
        tags: {
          engineStage: EngineStage.Wonder,
          domain: 'Science',
          subjectBucket: SubjectBucket.Science,
          location: 'Home',
        },
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    const blob = await buildComplianceZip({
      summary,
      dayLogs: logs,
      hoursEntries: [],
      evaluations,
      artifacts,
      children: [{ id: 'child-a', name: 'Alice' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Alice',
    })

    const zip = await JSZip.loadAsync(blob)
    const names = Object.keys(zip.files)

    expect(names).toContain('alice-evaluations-2026-01-01-to-2026-01-31.md')
    expect(names).toContain('alice-portfolio-2026-01-01-to-2026-01-31.md')

    const evalContent = await zip.files['alice-evaluations-2026-01-01-to-2026-01-31.md'].async('string')
    expect(evalContent).toContain('Great progress')

    const portfolioContent = await zip.files['alice-portfolio-2026-01-01-to-2026-01-31.md'].async('string')
    expect(portfolioContent).toContain('Test Artifact')
  })

  it('includes per-child prefixed evaluations and portfolio when childName is given', async () => {
    const { default: JSZip } = await import('jszip')

    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 30,
            location: 'Home',
          },
        ],
      },
    ]

    const evaluations: Evaluation[] = [
      {
        childId: 'child-a',
        monthStart: '2026-01-01',
        monthEnd: '2026-01-31',
        wins: ['Great progress'],
        struggles: [],
        nextSteps: [],
        sampleArtifactIds: [],
      },
    ]

    const artifacts: Artifact[] = [
      {
        id: 'art-1',
        childId: 'child-a',
        title: 'Test Artifact',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T10:00:00',
        tags: {
          engineStage: EngineStage.Wonder,
          domain: 'Science',
          subjectBucket: SubjectBucket.Science,
          location: 'Home',
        },
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    const blob = await buildComplianceZip({
      summary,
      dayLogs: logs,
      hoursEntries: [],
      evaluations,
      artifacts,
      children: [{ id: 'child-a', name: 'Lincoln' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Lincoln',
    })

    const zip = await JSZip.loadAsync(blob)
    const names = Object.keys(zip.files)

    expect(names).toContain('lincoln-evaluations-2026-01-01-to-2026-01-31.md')
    expect(names).toContain('lincoln-portfolio-2026-01-01-to-2026-01-31.md')
  })
})

// ─── generateComplianceReportHtml ──────────────────────────────────────────

describe('generateComplianceReportHtml', () => {
  it('generates valid HTML with hours summary', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 60,
            location: 'Home',
          },
          {
            type: DayBlockType.Math,
            subjectBucket: SubjectBucket.Math,
            actualMinutes: 45,
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    const html = generateComplianceReportHtml({
      summary,
      dayLogs: logs,
      hoursEntries: [],
      evaluations: [],
      artifacts: [],
      children: [{ id: 'child-a', name: 'Lincoln' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Lincoln',
    })

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Missouri Homeschool Compliance Report')
    expect(html).toContain('Lincoln')
    expect(html).toContain('2026-01-01')
    expect(html).toContain('1,000 hours')
    expect(html).toContain('600')
    // Should contain subject rows
    expect(html).toContain('Reading')
    expect(html).toContain('Math')
  })

  it('includes evaluations when present', () => {
    const summary = computeHoursSummary([], [], [])

    const evaluations: Evaluation[] = [
      {
        childId: 'lincoln',
        monthStart: '2026-01-01',
        monthEnd: '2026-01-31',
        wins: ['Mastered addition facts'],
        struggles: ['Slow with reading'],
        nextSteps: ['Start multiplication'],
        sampleArtifactIds: [],
      },
    ]

    const html = generateComplianceReportHtml({
      summary,
      dayLogs: [],
      hoursEntries: [],
      evaluations,
      artifacts: [],
      children: [{ id: 'lincoln', name: 'Lincoln' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Lincoln',
    })

    expect(html).toContain('Mastered addition facts')
    expect(html).toContain('Slow with reading')
    expect(html).toContain('Start multiplication')
  })

  it('includes portfolio samples when artifacts present', () => {
    const summary = computeHoursSummary([], [], [])

    const artifacts: Artifact[] = [
      {
        id: 'art-1',
        childId: 'lincoln',
        title: 'Science Observation',
        type: EvidenceType.Note,
        createdAt: '2026-01-15T10:00:00',
        tags: {
          engineStage: EngineStage.Wonder,
          domain: 'Science',
          subjectBucket: SubjectBucket.Science,
          location: 'Home',
        },
      },
    ]

    const html = generateComplianceReportHtml({
      summary,
      dayLogs: [],
      hoursEntries: [],
      evaluations: [],
      artifacts,
      children: [{ id: 'lincoln', name: 'Lincoln' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Lincoln',
    })

    expect(html).toContain('Science Observation')
    expect(html).toContain('Note')
  })

  it('shows daily log with date and hours', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 120,
            location: 'Home',
          },
        ],
      },
    ]

    const summary = computeHoursSummary(logs, [], [])

    const html = generateComplianceReportHtml({
      summary,
      dayLogs: logs,
      hoursEntries: [],
      evaluations: [],
      artifacts: [],
      children: [{ id: 'child-a', name: 'Lincoln' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Lincoln',
    })

    expect(html).toContain('2026-01-10')
    expect(html).toContain('2.0') // 120 minutes = 2.0 hours
    expect(html).toContain('1 school days logged')
  })

  // DATA-12: the citation is now sourced from the state compliance config; MO
  // (the default) must render the prior RSMo 167.031 paragraph byte-identically.
  it('renders the MO RSMo 167.031 citation verbatim (byte-identical default)', () => {
    const summary = computeHoursSummary([], [], [])

    const html = generateComplianceReportHtml({
      summary,
      dayLogs: [],
      hoursEntries: [],
      evaluations: [],
      artifacts: [],
      children: [{ id: 'child-a', name: 'Lincoln' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Lincoln',
    })

    expect(html).toContain(
      '<p class="muted">MO RSMo 167.031 requires 1,000 hours of instruction (600 in core subjects: Reading, Language Arts, Math, Science, Social Studies). At least 600 hours must occur at the regular place of instruction.</p>',
    )
  })

  // FEAT-105: the print/export carries the same descriptive subject
  // distribution as the screen — largest first, a % column, and the honest
  // "Other / untagged" label — and its subject rows still reconcile to the total.
  it('includes the subject distribution: % column, descending order, Other / untagged', () => {
    const logs: DayLog[] = [
      {
        childId: 'lincoln',
        date: '2026-01-10',
        blocks: [
          { type: DayBlockType.Math, subjectBucket: SubjectBucket.Math, actualMinutes: 90, location: 'Home' },
          { type: DayBlockType.Reading, subjectBucket: SubjectBucket.Reading, actualMinutes: 30, location: 'Home' },
        ],
      },
    ]
    // Untagged entry → Other / untagged bucket.
    const entries: HoursEntry[] = [
      { childId: 'lincoln', date: '2026-01-11', minutes: 30, location: 'Home' },
    ]
    const summary = computeHoursSummary(logs, entries, [], 'lincoln')

    const html = generateComplianceReportHtml({
      summary,
      dayLogs: logs,
      hoursEntries: entries,
      evaluations: [],
      artifacts: [],
      children: [{ id: 'lincoln', name: 'Lincoln' }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      childName: 'Lincoln',
    })

    // New share-of-total column + honest untagged label are present.
    expect(html).toContain('% of Total')
    expect(html).toContain('Other / untagged')
    // Math (90) sorts before Reading (30) before Other (30, tie → label order).
    expect(html.indexOf('>Math<')).toBeLessThan(html.indexOf('>Reading<'))
    // The factual core/non-core reference line (no target language).
    expect(html).toContain('count toward total instruction')

    // Reconciliation: the subject-row hour values sum to the displayed total.
    const dist = computeSubjectDistribution(summary)
    const rowSum = dist.rows.reduce((s, r) => s + r.totalMinutes, 0)
    expect(rowSum).toBe(summary.totalMinutes)
    expect(html).toContain(`<div class="value">${(summary.totalMinutes / 60).toFixed(1)}</div>`)
  })
})
