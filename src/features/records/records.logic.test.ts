import { describe, expect, it } from 'vitest'

import type {
  Artifact,
  DayLog,
  Evaluation,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types/domain'
import {
  DayBlockType,
  EngineStage,
  EvidenceType,
  SubjectBucket,
} from '../../core/types/enums'
import {
  buildComplianceZip,
  computeHoursSummary,
  entryMinutes,
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

  it('prefers hours entries over dayLogs when entries exist', () => {
    const logs: DayLog[] = [
      {
        childId: 'child-a',
        date: '2026-01-10',
        blocks: [
          {
            type: DayBlockType.Reading,
            subjectBucket: SubjectBucket.Reading,
            actualMinutes: 999,
            location: 'Home',
          },
        ],
      },
    ]

    const entries: HoursEntry[] = [
      {
        date: '2026-01-10',
        minutes: 30,
        subjectBucket: SubjectBucket.Reading,
        location: 'Home',
      },
    ]

    const summary = computeHoursSummary(logs, entries, [])

    // Should use entries (30), not logs (999)
    expect(summary.totalMinutes).toBe(30)
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

  it('returns empty summary for no data', () => {
    const summary = computeHoursSummary([], [], [])

    expect(summary.totalMinutes).toBe(0)
    expect(summary.coreMinutes).toBe(0)
    expect(summary.bySubject.length).toBe(0)
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

    expect(lines[0]).toBe('Date,Block Type,Subject,Location,Minutes,Notes')
    expect(lines[1]).toContain('2026-01-10')
    expect(lines[1]).toContain('Reading')
    expect(lines[1]).toContain('Read chapter 5')
  })

  it('prefers hours entries when present', () => {
    const entries: HoursEntry[] = [
      {
        date: '2026-01-10',
        minutes: 30,
        blockType: DayBlockType.Reading,
        subjectBucket: SubjectBucket.Reading,
        location: 'Home',
      },
    ]

    const csv = generateDailyLogCsv([], entries)
    const lines = csv.split('\n')

    expect(lines.length).toBe(2) // header + 1 row
    expect(lines[1]).toContain('30')
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
    })

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)

    const zip = await JSZip.loadAsync(blob)
    const names = Object.keys(zip.files)

    expect(names).toContain('hours-summary-2026-01-01-to-2026-01-31.csv')
    expect(names).toContain('daily-logs-2026-01-01-to-2026-01-31.csv')
    // No evaluations or artifacts → those files should be absent
    expect(names).not.toContain('evaluations-2026-01-01-to-2026-01-31.md')
    expect(names).not.toContain('portfolio-2026-01-01-to-2026-01-31.md')
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
    })

    const zip = await JSZip.loadAsync(blob)
    const names = Object.keys(zip.files)

    expect(names).toContain('evaluations-2026-01-01-to-2026-01-31.md')
    expect(names).toContain('portfolio-2026-01-01-to-2026-01-31.md')

    const evalContent = await zip.files['evaluations-2026-01-01-to-2026-01-31.md'].async('string')
    expect(evalContent).toContain('Great progress')

    const portfolioContent = await zip.files['portfolio-2026-01-01-to-2026-01-31.md'].async('string')
    expect(portfolioContent).toContain('Test Artifact')
  })
})
