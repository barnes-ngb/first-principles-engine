import { describe, expect, it } from 'vitest'

import type { Artifact, DadLabReport } from '../../core/types'
import {
  DAD_LAB_FAMILY_SCOPE_NOTE,
  buildDadLabMarkdownSection,
  dadLabNarrativeExcerpt,
  linkedArtifactLabel,
  selectDadLabPortfolioEntries,
} from './dadLabPortfolio.logic'
import { generatePortfolioMarkdown } from './records.logic'

const report = (over: Partial<DadLabReport> = {}): DadLabReport => ({
  id: 'r1',
  date: '2026-07-11',
  weekKey: '2026-W28',
  title: 'Balloon rockets',
  labType: 'science' as DadLabReport['labType'],
  question: 'What makes a balloon fly farther?',
  description: '',
  status: 'complete',
  childReports: {},
  subjectTags: [],
  createdAt: '2026-07-11T10:00:00.000Z',
  updatedAt: '2026-07-11T10:00:00.000Z',
  ...over,
})

const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  id: 'a1',
  childId: 'lincoln',
  title: 'Lab photo',
  type: 'Photo' as Artifact['type'],
  createdAt: '2026-07-11T11:00:00.000Z',
  tags: {
    engineStage: 'Build' as Artifact['tags']['engineStage'],
    subjectBucket: 'Science' as Artifact['tags']['subjectBucket'],
    location: 'Home',
    // Deliberately NOT `dad-lab`: these tests exercise the link fields
    // themselves (labSessionId / report-owned ids), not the domain shortcut.
    domain: 'science',
  },
  ...over,
})

describe('dadLabNarrativeExcerpt', () => {
  it('prefers the three-beat capture, in narrative order', () => {
    const excerpt = dadLabNarrativeExcerpt(
      report({
        beats: {
          predict: { text: 'the long straw wins', items: [] },
          try: { text: 'we taped three straws', items: [] },
          saw: { text: 'the short one went farthest', items: [] },
        },
        bestMoment: 'ignored when beats exist',
      }),
    )
    expect(excerpt).toBe(
      'Predict: the long straw wins · Try: we taped three straws · What we saw: the short one went farthest',
    )
  })

  it('skips empty beats rather than emitting a bare label', () => {
    const excerpt = dadLabNarrativeExcerpt(
      report({
        beats: {
          predict: { text: '   ', items: [] },
          try: { items: [] },
          saw: { text: 'it popped', items: [] },
        },
      }),
    )
    expect(excerpt).toBe('What we saw: it popped')
  })

  it('falls back to parent reflection, then framing, for pre-FEAT-56 labs', () => {
    expect(dadLabNarrativeExcerpt(report({ bestMoment: 'Lincoln explained it back' }))).toBe(
      'Lincoln explained it back',
    )
    expect(dadLabNarrativeExcerpt(report({ dadReflection: 'slower pace worked' }))).toBe(
      'slower pace worked',
    )
    expect(dadLabNarrativeExcerpt(report({ description: 'we built a circuit' }))).toBe(
      'we built a circuit',
    )
    // Last resort: the lab's own driving question.
    expect(dadLabNarrativeExcerpt(report())).toBe('What makes a balloon fly farther?')
  })

  it('falls back to the legacy per-child capture', () => {
    const excerpt = dadLabNarrativeExcerpt(
      report({
        question: '',
        childReports: {
          lincoln: { artifacts: [], observation: 'the water climbed the paper' },
        },
      }),
    )
    expect(excerpt).toBe('the water climbed the paper')
  })

  it('returns an empty string when the lab carries no narrative at all', () => {
    expect(dadLabNarrativeExcerpt(report({ question: '', description: '' }))).toBe('')
  })

  it('truncates at a word boundary with an ellipsis', () => {
    const excerpt = dadLabNarrativeExcerpt(
      report({ bestMoment: 'alpha bravo charlie delta echo foxtrot' }),
      20,
    )
    expect(excerpt).toBe('alpha bravo charlie…')
    expect(excerpt.length).toBeLessThanOrEqual(21)
  })
})

describe('selectDadLabPortfolioEntries', () => {
  const start = '2026-07-01'
  const end = '2026-07-31'

  it('selects the month, newest first, and skips other months', () => {
    const entries = selectDadLabPortfolioEntries(
      [
        report({ id: 'june', date: '2026-06-30', title: 'June lab' }),
        report({ id: 'early', date: '2026-07-04', title: 'Early July' }),
        report({ id: 'late', date: '2026-07-25', title: 'Late July' }),
        report({ id: 'august', date: '2026-08-01', title: 'August lab' }),
      ],
      [],
      start,
      end,
    )
    expect(entries.map((e) => e.id)).toEqual(['late', 'early'])
  })

  it('includes both month boundaries', () => {
    const entries = selectDadLabPortfolioEntries(
      [
        report({ id: 'first', date: start }),
        report({ id: 'last', date: end }),
      ],
      [],
      start,
      end,
    )
    expect(entries).toHaveLength(2)
  })

  it('leaves out labs that have not happened yet', () => {
    const entries = selectDadLabPortfolioEntries(
      [
        report({ id: 'planned', status: 'planned' }),
        report({ id: 'active', status: 'active' }),
        report({ id: 'complete', status: 'complete' }),
      ],
      [],
      start,
      end,
    )
    expect(entries.map((e) => e.id)).toEqual(['active', 'complete'])
  })

  it('is family-scoped: DadLabReport carries no childId, so nothing filters by child', () => {
    // Characterizing the real shape (DATA-04) rather than an idealized one —
    // there is no per-child field to filter on, and the selector takes no
    // childId, so the same labs surface on every child's portfolio.
    const labs = [report({ id: 'r1', childRoles: { lincoln: 'builder' } })]
    expect('childId' in labs[0]).toBe(false)
    const entries = selectDadLabPortfolioEntries(labs, [], start, end)
    expect(entries).toHaveLength(1)
  })

  it('falls back to a neutral title when the lab was saved untitled', () => {
    const [entry] = selectDadLabPortfolioEntries([report({ title: '  ' })], [], start, end)
    expect(entry.title).toBe('Untitled lab')
  })

  describe('linked-artifact counts resolve from both directions', () => {
    it('counts artifacts stamped with labSessionId', () => {
      const [entry] = selectDadLabPortfolioEntries(
        [report({ id: 'r1' })],
        [
          artifact({ id: 'a1', labSessionId: 'r1' }),
          artifact({ id: 'a2', labSessionId: 'r1' }),
          artifact({ id: 'a3', labSessionId: 'other-lab' }),
        ],
        start,
        end,
      )
      expect(entry.linkedArtifactCount).toBe(2)
    })

    it('counts a three-beat session, whose artifacts carry NO labSessionId', () => {
      // FEAT-56 three-beat capture is today's default: the link lives only on
      // the report side. A one-directional artifact→report match would report
      // zero here, which is the exact false finding this must not produce.
      const [entry] = selectDadLabPortfolioEntries(
        [
          report({
            id: 'r1',
            beats: {
              predict: { text: 'it will float', items: [{ artifactId: 'a1', child: 'both' }] },
              try: { items: [{ artifactId: 'a2', child: 'lincoln' }] },
              saw: { items: [] },
            },
          }),
        ],
        [
          artifact({ id: 'a1', childId: 'both', labSessionId: undefined }),
          artifact({ id: 'a2', childId: 'lincoln', labSessionId: undefined }),
        ],
        start,
        end,
      )
      expect(entry.linkedArtifactCount).toBe(2)
    })

    it('counts the legacy per-child artifact id list', () => {
      const [entry] = selectDadLabPortfolioEntries(
        [report({ id: 'r1', childReports: { lincoln: { artifacts: ['a1', 'a2'] } } })],
        [artifact({ id: 'a1' }), artifact({ id: 'a2' }), artifact({ id: 'a9' })],
        start,
        end,
      )
      expect(entry.linkedArtifactCount).toBe(2)
    })

    it('does not double-count an artifact linked from both sides', () => {
      const [entry] = selectDadLabPortfolioEntries(
        [
          report({
            id: 'r1',
            beats: {
              predict: { items: [{ artifactId: 'a1', child: 'both' }] },
              try: { items: [] },
              saw: { items: [] },
            },
          }),
        ],
        [artifact({ id: 'a1', labSessionId: 'r1' })],
        start,
        end,
      )
      expect(entry.linkedArtifactCount).toBe(1)
    })

    it('reports zero for a lab with no captured evidence', () => {
      const [entry] = selectDadLabPortfolioEntries([report({ id: 'r1' })], [], start, end)
      expect(entry.linkedArtifactCount).toBe(0)
    })
  })
})

describe('linkedArtifactLabel', () => {
  it('reads as evidence, not as a grade', () => {
    expect(linkedArtifactLabel(0)).toBe('0 lab photos or recordings')
    expect(linkedArtifactLabel(1)).toBe('1 lab photo or recording')
    expect(linkedArtifactLabel(4)).toBe('4 lab photos or recordings')
  })
})

describe('buildDadLabMarkdownSection', () => {
  const entries = [
    {
      id: 'r1',
      title: 'Balloon rockets',
      date: '2026-07-11',
      excerpt: 'Predict: the long straw wins · What we saw: the short one went farthest',
      linkedArtifactCount: 3,
    },
  ]

  it('renders nothing for an empty month — no header, no noise', () => {
    expect(buildDadLabMarkdownSection([])).toEqual([])
  })

  it('renders a block per report with the family-scope note', () => {
    const md = buildDadLabMarkdownSection(entries).join('\n')
    expect(md).toContain('## Dad Lab')
    expect(md).toContain(DAD_LAB_FAMILY_SCOPE_NOTE)
    expect(md).toContain('### Balloon rockets — 2026-07-11')
    expect(md).toContain('Predict: the long straw wins')
    expect(md).toContain('Linked this month: 3 lab photos or recordings')
  })

  it('omits the excerpt line for a lab with no narrative', () => {
    const md = buildDadLabMarkdownSection([
      { id: 'r2', title: 'Quiet lab', date: '2026-07-12', excerpt: '', linkedArtifactCount: 0 },
    ]).join('\n')
    expect(md).toContain('### Quiet lab — 2026-07-12')
    expect(md).toContain('Linked this month: 0 lab photos or recordings')
  })

  it('introduces no score-like framing (ETHOS-02)', () => {
    const md = buildDadLabMarkdownSection(entries).join('\n')
    for (const forbidden of ['✅', '❌', 'Score', 'score', 'Grade', 'grade', 'Pass', 'Fail', '/5', '%']) {
      expect(md).not.toContain(forbidden)
    }
  })

  it('carries no photo URLs — the portfolio Photos section already has them', () => {
    const md = buildDadLabMarkdownSection(entries).join('\n')
    expect(md).not.toContain('![')
    expect(md).not.toContain('http')
  })
})

describe('generatePortfolioMarkdown with a Dad Lab section', () => {
  const children = [{ id: 'lincoln', name: 'Lincoln' }]
  const photo = artifact({ id: 'a1', title: 'Rocket', uri: 'https://example.test/a1.jpg' })

  it('appends the section once, after the per-child sections', () => {
    const section = buildDadLabMarkdownSection([
      {
        id: 'r1',
        title: 'Balloon rockets',
        date: '2026-07-11',
        excerpt: 'What we saw: the short one went farthest',
        linkedArtifactCount: 3,
      },
    ])
    const md = generatePortfolioMarkdown([photo], children, '2026-07-01', '2026-07-31', section)

    expect(md.match(/## Dad Lab/g)).toHaveLength(1)
    expect(md.indexOf('## Lincoln')).toBeLessThan(md.indexOf('## Dad Lab'))
    // The photo ref stays in the per-child Photos section and is not repeated.
    expect(md.match(/https:\/\/example\.test\/a1\.jpg/g)).toHaveLength(1)
  })

  it('is byte-identical to the previous output when omitted', () => {
    const withoutArg = generatePortfolioMarkdown([photo], children, '2026-07-01', '2026-07-31')
    const withEmpty = generatePortfolioMarkdown([photo], children, '2026-07-01', '2026-07-31', [])
    expect(withEmpty).toBe(withoutArg)
    expect(withoutArg).not.toContain('Dad Lab')
  })
})
