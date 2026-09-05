import { describe, expect, it } from 'vitest'
import type {
  CurriculumPositionRecord,
  CurriculumSnapshot,
  WorkbookConfig,
} from '../../core/types'
import { PaceStatus, SubjectBucket } from '../../core/types/enums'
import {
  NO_BASELINE_NOTICE,
  buildPaceSuggestion,
  calculateAllPaces,
  calculatePace,
  computeObservedCoverage,
  normalizeCurriculumSnapshot,
  selectBaselineSnapshot,
} from './pace.logic'

const baseConfig: WorkbookConfig = {
  childId: 'c1',
  name: 'Math Grade 2',
  subjectBucket: SubjectBucket.Math,
  totalUnits: 100,
  currentPosition: 40,
  unitLabel: 'lesson',
  targetFinishDate: '2026-05-30',
  schoolDaysPerWeek: 4,
}

describe('calculatePace', () => {
  it('shows current when partially through workbook', () => {
    const result = calculatePace(baseConfig)
    expect(result.workbookName).toBe('Math Grade 2')
    expect(result.status).toBe(PaceStatus.Current)
    expect(result.coverageText).toBe('Lesson 40 of 100 covered')
  })

  it('shows explored when workbook is complete', () => {
    const completed: WorkbookConfig = { ...baseConfig, currentPosition: 100 }
    const result = calculatePace(completed)
    expect(result.status).toBe(PaceStatus.Explored)
    expect(result.coverageText).toBe('Complete!')
  })

  it('shows not started when position is 0', () => {
    const notStarted: WorkbookConfig = { ...baseConfig, currentPosition: 0 }
    const result = calculatePace(notStarted)
    expect(result.status).toBe(PaceStatus.NotStarted)
    expect(result.coverageText).toBe('Not started')
  })

  it('shows current with position text when totalUnits is 0', () => {
    const noTotal: WorkbookConfig = { ...baseConfig, totalUnits: 0, currentPosition: 15 }
    const result = calculatePace(noTotal)
    expect(result.status).toBe(PaceStatus.Current)
    expect(result.coverageText).toBe('Lesson 15 reached')
  })

  it('shows not started when both totalUnits and position are 0', () => {
    const empty: WorkbookConfig = { ...baseConfig, totalUnits: 0, currentPosition: 0 }
    const result = calculatePace(empty)
    expect(result.status).toBe(PaceStatus.NotStarted)
  })

  it('returns correct currentPosition and totalUnits', () => {
    const result = calculatePace(baseConfig)
    expect(result.currentPosition).toBe(40)
    expect(result.totalUnits).toBe(100)
    expect(result.unitLabel).toBe('lesson')
  })
})

describe('buildPaceSuggestion', () => {
  it('returns appropriate text for each status', () => {
    expect(buildPaceSuggestion(PaceStatus.Explored, 0, 0, 'lesson')).toContain('covered')
    expect(buildPaceSuggestion(PaceStatus.Current, 0, 0, 'lesson')).toContain('comfortable pace')
    expect(buildPaceSuggestion(PaceStatus.Upcoming, 0, 0, 'lesson')).toContain('No rush')
    expect(buildPaceSuggestion(PaceStatus.NotStarted, 0, 0, 'page')).toContain('Jump in')
  })
})

describe('calculateAllPaces', () => {
  it('calculates coverage for multiple workbooks', () => {
    const configs: WorkbookConfig[] = [
      baseConfig,
      { ...baseConfig, name: 'Reading ELA', subjectBucket: SubjectBucket.Reading, totalUnits: 50, currentPosition: 20 },
    ]
    const results = calculateAllPaces(configs)
    expect(results).toHaveLength(2)
    expect(results[0].workbookName).toBe('Math Grade 2')
    expect(results[1].workbookName).toBe('Reading ELA')
    expect(results[1].coverageText).toBe('Lesson 20 of 50 covered')
  })
})

// ── Observed coverage rate (UX-213) ──────────────────────────────────────────
//
// The parent-facing half of this module. Every assertion below is about a
// sentence a parent reads; none of it may reach a child surface (asserted in
// `weekly-review/WeekPaceSection.test.tsx`).

const snapshot = (
  recordedAt: string,
  positions: Array<Partial<CurriculumPositionRecord> & { configId: string; currentPosition: number }>,
): CurriculumSnapshot => ({
  recordedAt,
  weekKey: recordedAt.slice(0, 10),
  positions: positions.map((p) => ({
    name: 'TGTB Math',
    unitLabel: 'lesson',
    totalUnits: 60,
    ...p,
  })),
})

const AUG_17 = '2026-08-17T01:00:00.000Z'
const SEP_07 = '2026-09-07T01:00:00.000Z' // 21 days later — three weeks

describe('computeObservedCoverage', () => {
  it('says nothing at all when this week recorded no positions', () => {
    expect(computeObservedCoverage(null, [])).toEqual({
      baselineRecordedAt: null,
      entries: [],
      notice: null,
    })
    const empty = snapshot(SEP_07, [])
    expect(computeObservedCoverage(empty, []).notice).toBeNull()
  })

  it('reports the first week as unknown rather than estimating a rate', () => {
    const current = snapshot(SEP_07, [{ configId: 'w1', currentPosition: 14 }])
    const result = computeObservedCoverage(current, [])
    expect(result.notice).toBe(NO_BASELINE_NOTICE)
    expect(result.notice).toBe('First week recorded — a rate needs two.')
    expect(result.entries).toEqual([])
  })

  it('tolerates the scheduled run’s own jitter between two weekly recordings', () => {
    // Snapshots are taken inside the Sunday run, after variable context,
    // synthesis and model latency and after the earlier children in the family,
    // so consecutive weekly readings land a few hours short of 168 apart. A
    // strict seven days would reject last week and claim a first week.
    const current = snapshot(SEP_07, [{ configId: 'w1', currentPosition: 14 }])
    const lastSunday = snapshot('2026-08-31T04:30:00.000Z', [
      { configId: 'w1', currentPosition: 12 },
    ])
    const result = computeObservedCoverage(current, [lastSunday])
    expect(result.notice).toBeNull()
    expect(result.entries[0].unitsCovered).toBe(2)
    expect(result.entries[0].weeks).toBe(1)
  })

  it('will not build a rate from two readings taken less than a week apart', () => {
    // A parent regenerating an old review re-reads TODAY's positions and stamps
    // them onto a months-old week. Measuring on the week key would report "no
    // lessons covered in 3 weeks" about two readings minutes apart.
    const current = snapshot(SEP_07, [{ configId: 'w1', currentPosition: 14 }])
    const sameDay = snapshot('2026-09-06T01:00:00.000Z', [
      { configId: 'w1', currentPosition: 14 },
    ])
    expect(computeObservedCoverage(current, [sameDay]).notice).toBe(
      NO_BASELINE_NOTICE,
    )
    // …and a couple of days is still a re-read, not a second week.
    const twoDaysBack = snapshot('2026-09-05T01:00:00.000Z', [
      { configId: 'w1', currentPosition: 14 },
    ])
    expect(computeObservedCoverage(current, [twoDaysBack]).notice).toBe(
      NO_BASELINE_NOTICE,
    )
  })

  it('states progress as observed units over observed weeks', () => {
    const current = snapshot(SEP_07, [{ configId: 'w1', currentPosition: 14 }])
    const before = snapshot(AUG_17, [{ configId: 'w1', currentPosition: 10 }])
    const result = computeObservedCoverage(current, [before])

    expect(result.baselineRecordedAt).toBe(AUG_17)
    expect(result.notice).toBeNull()
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].kind).toBe('covered')
    expect(result.entries[0].unitsCovered).toBe(4)
    expect(result.entries[0].weeks).toBe(3)
    expect(result.entries[0].line).toBe(
      'TGTB Math — lesson 14 of 60. 4 lessons in 3 weeks (since Aug 17).',
    )
  })

  it('reports zero plainly, and does not soften it in either direction', () => {
    const current = snapshot(SEP_07, [{ configId: 'w1', currentPosition: 10 }])
    const before = snapshot(AUG_17, [{ configId: 'w1', currentPosition: 10 }])
    const [entry] = computeObservedCoverage(current, [before]).entries

    expect(entry.kind).toBe('none')
    expect(entry.line).toBe(
      'TGTB Math — lesson 10 of 60. No lessons covered in 3 weeks (since Aug 17).',
    )
    // Never a verdict, never a requirement, never a deadline.
    expect(entry.line).not.toMatch(/behind|should|need to|target|goal|by [A-Z]/)
  })

  it('never says "should", "behind" or a required pace in any state', () => {
    const cases: Array<[number, number]> = [
      [10, 14],
      [10, 10],
      [10, 8],
    ]
    for (const [before, now] of cases) {
      const result = computeObservedCoverage(
        snapshot(SEP_07, [{ configId: 'w1', currentPosition: now }]),
        [snapshot(AUG_17, [{ configId: 'w1', currentPosition: before }])],
      )
      for (const entry of result.entries) {
        expect(entry.line).not.toMatch(
          /behind|ahead of|should|must|required|on track|off track|falling/i,
        )
      }
    }
  })

  it('reports a position that moved backwards as no rate, not as negative coverage', () => {
    const current = snapshot(SEP_07, [{ configId: 'w1', currentPosition: 8 }])
    const before = snapshot(AUG_17, [{ configId: 'w1', currentPosition: 10 }])
    const [entry] = computeObservedCoverage(current, [before]).entries

    expect(entry.kind).toBe('adjusted')
    expect(entry.line).toBe(
      'TGTB Math — lesson 8 of 60. The recorded position moved back since Aug 17, so there is no rate to report.',
    )
    expect(entry.line).not.toContain('-2')
  })

  it('says nothing about a workbook the baseline never recorded', () => {
    const current = snapshot(SEP_07, [
      { configId: 'w1', currentPosition: 14 },
      { configId: 'w2', name: 'Explode the Code', currentPosition: 3 },
    ])
    const before = snapshot(AUG_17, [{ configId: 'w1', currentPosition: 10 }])
    const result = computeObservedCoverage(current, [before])

    expect(result.entries.map((e) => e.configId)).toEqual(['w1'])
  })

  it('omits a finished program, whose position has stopped moving by design', () => {
    const current = snapshot(SEP_07, [
      { configId: 'w1', currentPosition: 60, completed: true },
    ])
    const before = snapshot(AUG_17, [{ configId: 'w1', currentPosition: 60 }])
    expect(computeObservedCoverage(current, [before]).entries).toEqual([])
  })

  it('drops the total from the sentence when the workbook has no total', () => {
    const current = snapshot(SEP_07, [
      { configId: 'w1', currentPosition: 14, totalUnits: undefined },
    ])
    const before = snapshot(AUG_17, [
      { configId: 'w1', currentPosition: 13, totalUnits: undefined },
    ])
    const [entry] = computeObservedCoverage(current, [before]).entries
    expect(entry.line).toBe(
      'TGTB Math — lesson 14. 1 lesson in 3 weeks (since Aug 17).',
    )
  })

  it('uses the stored unit label, whatever it is', () => {
    const current = snapshot(SEP_07, [
      { configId: 'w1', name: 'Story of the World', currentPosition: 5, unitLabel: 'chapter', totalUnits: 42 },
    ])
    const before = snapshot(AUG_17, [
      { configId: 'w1', name: 'Story of the World', currentPosition: 3, unitLabel: 'chapter', totalUnits: 42 },
    ])
    const [entry] = computeObservedCoverage(current, [before]).entries
    expect(entry.line).toBe(
      'Story of the World — chapter 5 of 42. 2 chapters in 3 weeks (since Aug 17).',
    )
  })
})

describe('selectBaselineSnapshot', () => {
  it('takes the most recent snapshot that is far enough back', () => {
    const current = snapshot(SEP_07, [{ configId: 'w1', currentPosition: 14 }])
    const tooRecent = snapshot('2026-09-05T01:00:00.000Z', [
      { configId: 'w1', currentPosition: 14 },
    ])
    const usable = snapshot('2026-08-31T01:00:00.000Z', [
      { configId: 'w1', currentPosition: 12 },
    ])
    const older = snapshot(AUG_17, [{ configId: 'w1', currentPosition: 10 }])

    expect(
      selectBaselineSnapshot(current, [tooRecent, usable, older])?.recordedAt,
    ).toBe('2026-08-31T01:00:00.000Z')
  })

  it('ignores a snapshot that recorded no positions', () => {
    const current = snapshot(SEP_07, [{ configId: 'w1', currentPosition: 14 }])
    const emptyOne = snapshot('2026-08-31T01:00:00.000Z', [])
    const older = snapshot(AUG_17, [{ configId: 'w1', currentPosition: 10 }])
    expect(selectBaselineSnapshot(current, [emptyOne, older])?.recordedAt).toBe(
      AUG_17,
    )
  })
})

describe('normalizeCurriculumSnapshot', () => {
  it('returns null for anything that is not a recorded snapshot', () => {
    expect(normalizeCurriculumSnapshot(undefined)).toBeNull()
    expect(normalizeCurriculumSnapshot({})).toBeNull()
    expect(normalizeCurriculumSnapshot({ recordedAt: '', positions: [] })).toBeNull()
    expect(normalizeCurriculumSnapshot({ recordedAt: AUG_17 })).toBeNull()
  })

  it('drops a position whose stored number is unusable rather than calling it zero', () => {
    const result = normalizeCurriculumSnapshot({
      recordedAt: AUG_17,
      weekKey: '2026-08-16',
      positions: [
        { configId: 'w1', name: 'Math', currentPosition: 10, totalUnits: 60 },
        { configId: 'w2', name: 'Bad', currentPosition: Number.NaN },
        { configId: 'w3', name: 'Worse', currentPosition: 'twelve' },
        // Negative, matching the server writer's own rule — this would
        // otherwise print as "lesson -3" and poison the delta.
        { configId: 'w4', name: 'Negative', currentPosition: -3 },
        { configId: '', name: 'Nameless', currentPosition: 4 },
        null,
      ],
    })
    expect(result?.positions.map((p) => p.configId)).toEqual(['w1'])
  })

  it('keeps position zero, which is a real reading — not started', () => {
    const result = normalizeCurriculumSnapshot({
      recordedAt: AUG_17,
      positions: [{ configId: 'w1', name: 'New', currentPosition: 0 }],
    })
    expect(result?.positions[0].currentPosition).toBe(0)
  })

  it('keeps only the optional fields that are actually usable', () => {
    const result = normalizeCurriculumSnapshot({
      recordedAt: AUG_17,
      positions: [
        { configId: 'w1', currentPosition: 3, totalUnits: 0, unitLabel: '', completed: 'yes' },
      ],
    })
    expect(result?.positions[0]).toEqual({
      configId: 'w1',
      name: 'Workbook',
      currentPosition: 3,
    })
  })
})
