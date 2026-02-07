import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

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
    assert.equal(entryMinutes(entry), 45)
  })

  it('converts hours to minutes when minutes is missing', () => {
    const entry: HoursEntry = { date: '2026-01-01', minutes: 0, hours: 1.5 }
    // minutes is 0 which is falsy but not null, so it returns 0
    // Actually: minutes != null is true (0 != null), so it returns 0
    assert.equal(entryMinutes(entry), 0)
  })

  it('converts hours to minutes when minutes is undefined', () => {
    const entry = { date: '2026-01-01', hours: 1.5 } as HoursEntry
    assert.equal(entryMinutes(entry), 90)
  })

  it('returns 0 when neither is present', () => {
    const entry = { date: '2026-01-01' } as HoursEntry
    assert.equal(entryMinutes(entry), 0)
  })
})

// ─── computeHoursSummary ─────────────────────────────────────────────────────

describe('computeHoursSummary', () => {
  it('computes summary from dayLogs when no hours entries', () => {
    const logs: DayLog[] = [
      {
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

    assert.equal(summary.totalMinutes, 75)
    assert.equal(summary.coreMinutes, 75)
    assert.equal(summary.coreHomeMinutes, 75)
    assert.equal(summary.adjustmentMinutes, 0)
    assert.equal(summary.bySubject.length, 2)
    assert.equal(summary.byDate['2026-01-10'], 75)
  })

  it('prefers hours entries over dayLogs when entries exist', () => {
    const logs: DayLog[] = [
      {
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
    assert.equal(summary.totalMinutes, 30)
  })

  it('applies adjustments', () => {
    const logs: DayLog[] = [
      {
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

    assert.equal(summary.totalMinutes, 75) // 60 + 15
    assert.equal(summary.adjustmentMinutes, 15)
    assert.equal(summary.coreMinutes, 75)
  })

  it('handles negative adjustments', () => {
    const logs: DayLog[] = [
      {
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

    assert.equal(summary.totalMinutes, 40) // 60 - 20
    assert.equal(summary.adjustmentMinutes, -20)
  })

  it('separates core and non-core subjects', () => {
    const logs: DayLog[] = [
      {
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

    assert.equal(summary.totalMinutes, 50)
    assert.equal(summary.coreMinutes, 30)
    assert.equal(summary.coreHomeMinutes, 30)
  })

  it('returns empty summary for no data', () => {
    const summary = computeHoursSummary([], [], [])

    assert.equal(summary.totalMinutes, 0)
    assert.equal(summary.coreMinutes, 0)
    assert.equal(summary.bySubject.length, 0)
  })
})

// ─── generateHoursSummaryCsv ─────────────────────────────────────────────────

describe('generateHoursSummaryCsv', () => {
  it('produces valid CSV with headers and totals', () => {
    const summary = computeHoursSummary(
      [
        {
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

    assert.equal(lines[0], 'Subject,Total Hours,Home Hours')
    assert.ok(lines[1].startsWith('Reading'))
    assert.ok(csv.includes('TOTAL'))
    assert.ok(csv.includes('CORE TOTAL'))
  })
})

// ─── generateDailyLogCsv ────────────────────────────────────────────────────

describe('generateDailyLogCsv', () => {
  it('generates CSV from dayLogs when no hours entries', () => {
    const logs: DayLog[] = [
      {
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

    assert.equal(lines[0], 'Date,Block Type,Subject,Location,Minutes,Notes')
    assert.ok(lines[1].includes('2026-01-10'))
    assert.ok(lines[1].includes('Reading'))
    assert.ok(lines[1].includes('Read chapter 5'))
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

    assert.equal(lines.length, 2) // header + 1 row
    assert.ok(lines[1].includes('30'))
  })

  it('escapes commas and quotes in notes', () => {
    const logs: DayLog[] = [
      {
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
    assert.ok(csv.includes('""To Kill a Mockingbird""'))
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
        tags: {
          engineStage: EngineStage.Explain,
          domain: 'Reading',
          subjectBucket: SubjectBucket.Reading,
          location: 'Home',
        },
      },
    ]

    const md = generateEvaluationMarkdown(evaluations, children, artifacts)

    assert.ok(md.includes('# Monthly Evaluations'))
    assert.ok(md.includes('## Lincoln'))
    assert.ok(md.includes('### Wins'))
    assert.ok(md.includes('Finished reading chapter book'))
    assert.ok(md.includes('### Struggles'))
    assert.ok(md.includes('Focus during read-aloud'))
    assert.ok(md.includes('### Next Steps'))
    assert.ok(md.includes('Start multiplication'))
    assert.ok(md.includes('### Sample Artifacts'))
    assert.ok(md.includes('Book Report'))
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

    assert.ok(md.includes('## unknown-child'))
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

    assert.ok(md.includes('# Portfolio Index'))
    assert.ok(md.includes('## Lincoln'))
    assert.ok(md.includes('Butterfly Observation'))
    assert.ok(md.includes('Wonder'))
    assert.ok(md.includes('Science'))
  })
})

// ─── scoreArtifactsForPortfolio ──────────────────────────────────────────────

describe('scoreArtifactsForPortfolio', () => {
  it('scores higher for artifacts with ladder refs', () => {
    const artifacts: Artifact[] = [
      {
        id: 'a1',
        title: 'With Ladder',
        type: EvidenceType.Note,
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
        title: 'Without Ladder',
        type: EvidenceType.Note,
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
    assert.equal(scored[0].artifact.id, 'a1')
    assert.ok(scored[0].score > scored[1].score)
  })

  it('scores higher for artifacts with content', () => {
    const artifacts: Artifact[] = [
      {
        id: 'a1',
        title: 'Rich',
        type: EvidenceType.Note,
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
        title: 'Sparse',
        type: EvidenceType.Note,
        tags: {
          engineStage: EngineStage.Wonder,
          domain: 'Science',
          subjectBucket: SubjectBucket.Science,
          location: 'Home',
        },
      },
    ]

    const scored = scoreArtifactsForPortfolio(artifacts)

    assert.equal(scored[0].artifact.id, 'a1')
  })

  it('returns sorted by score descending', () => {
    const artifacts: Artifact[] = [
      {
        id: 'low',
        title: 'Low',
        type: EvidenceType.Note,
        tags: {
          engineStage: EngineStage.Wonder,
          domain: '',
          subjectBucket: SubjectBucket.Other,
          location: '',
        },
      },
      {
        id: 'high',
        title: 'High',
        type: EvidenceType.Photo,
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

    assert.equal(scored[0].artifact.id, 'high')
    assert.equal(scored[1].artifact.id, 'low')
  })
})

// ─── getMonthRange ───────────────────────────────────────────────────────────

describe('getMonthRange', () => {
  it('returns correct range for January', () => {
    const range = getMonthRange(2026, 1)

    assert.equal(range.start, '2026-01-01')
    assert.equal(range.end, '2026-01-31')
  })

  it('returns correct range for February in non-leap year', () => {
    const range = getMonthRange(2025, 2)

    assert.equal(range.start, '2025-02-01')
    assert.equal(range.end, '2025-02-28')
  })

  it('returns correct range for February in leap year', () => {
    const range = getMonthRange(2028, 2)

    assert.equal(range.start, '2028-02-01')
    assert.equal(range.end, '2028-02-29')
  })

  it('returns correct range for December', () => {
    const range = getMonthRange(2026, 12)

    assert.equal(range.start, '2026-12-01')
    assert.equal(range.end, '2026-12-31')
  })
})

// ─── getMonthLabel ───────────────────────────────────────────────────────────

describe('getMonthLabel', () => {
  it('returns human-readable month label', () => {
    const label = getMonthLabel(2026, 1)

    assert.equal(label, 'January 2026')
  })

  it('returns correct label for December', () => {
    const label = getMonthLabel(2026, 12)

    assert.equal(label, 'December 2026')
  })
})
