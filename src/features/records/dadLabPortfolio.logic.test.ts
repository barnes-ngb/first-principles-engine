import { describe, expect, it } from 'vitest'

import type { Artifact, DadLabReport } from '../../core/types'
import {
  DAD_LAB_FAMILY_SCOPE_NOTE,
  buildDadLabMarkdownSection,
  dadLabNarrativeExcerpt,
  linkedArtifactLabel,
  portfolioExportLabel,
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
      expect(entry.linkedMedia).toEqual([])
    })
  })

  describe('linkedMedia — the evidence behind the count', () => {
    it('carries the whole-family artifacts the count describes', () => {
      // The three-beat capture writes `childId: 'both'`, which PortfolioPage
      // never makes selectable — so without this list the export would assert
      // evidence exists while carrying none of it.
      const [entry] = selectDadLabPortfolioEntries(
        [
          report({
            id: 'r1',
            beats: {
              predict: { items: [{ artifactId: 'a1', child: 'both' }] },
              try: { items: [{ artifactId: 'a2', child: 'both' }] },
              saw: { items: [] },
            },
          }),
        ],
        [
          artifact({ id: 'a1', childId: 'both', uri: 'https://example.test/a1.jpg' }),
          artifact({
            id: 'a2',
            childId: 'both',
            type: 'Audio' as Artifact['type'],
            uri: 'https://example.test/a2.m4a',
          }),
        ],
        start,
        end,
      )
      expect(entry.linkedArtifactCount).toBe(2)
      expect(entry.linkedMedia).toEqual([
        { artifactId: 'a1', title: 'Lab photo', kind: 'photo', urls: ['https://example.test/a1.jpg'] },
        { artifactId: 'a2', title: 'Lab photo', kind: 'audio', urls: ['https://example.test/a2.m4a'] },
      ])
    })

    it('attributes each artifact to the same report the count does', () => {
      const entries = selectDadLabPortfolioEntries(
        [
          report({ id: 'r1', date: '2026-07-10' }),
          report({ id: 'r2', date: '2026-07-20', childReports: { lincoln: { artifacts: ['a2'] } } }),
        ],
        [
          artifact({ id: 'a1', labSessionId: 'r1', uri: 'https://example.test/a1.jpg' }),
          artifact({ id: 'a2', uri: 'https://example.test/a2.jpg' }),
        ],
        start,
        end,
      )
      // The media list can never disagree with the number printed beside it.
      for (const entry of entries) {
        expect(entry.linkedMedia).toHaveLength(entry.linkedArtifactCount)
      }
      expect(entries.find((e) => e.id === 'r1')?.linkedMedia[0]?.artifactId).toBe('a1')
      expect(entries.find((e) => e.id === 'r2')?.linkedMedia[0]?.artifactId).toBe('a2')
    })

    it('prefers mediaUrls over uri for a multi-photo capture', () => {
      const [entry] = selectDadLabPortfolioEntries(
        [report({ id: 'r1' })],
        [
          artifact({
            id: 'a1',
            labSessionId: 'r1',
            uri: 'https://example.test/single.jpg',
            mediaUrls: ['https://example.test/1.jpg', 'https://example.test/2.jpg'],
          }),
        ],
        start,
        end,
      )
      expect(entry.linkedMedia[0].urls).toEqual([
        'https://example.test/1.jpg',
        'https://example.test/2.jpg',
      ])
    })

    it('counts but does not list an artifact with no URL', () => {
      const [entry] = selectDadLabPortfolioEntries(
        [report({ id: 'r1' })],
        [artifact({ id: 'a1', labSessionId: 'r1', uri: undefined })],
        start,
        end,
      )
      expect(entry.linkedArtifactCount).toBe(1)
      expect(entry.linkedMedia).toEqual([])
    })
  })
})

describe('portfolioExportLabel', () => {
  it('names the Dad Labs so a lab-only month reads as exportable', () => {
    expect(portfolioExportLabel(0, 0)).toBe('Export Portfolio Markdown (0 artifacts)')
    expect(portfolioExportLabel(1, 0)).toBe('Export Portfolio Markdown (1 artifact)')
    expect(portfolioExportLabel(0, 1)).toBe('Export Portfolio Markdown (0 artifacts + 1 lab)')
    expect(portfolioExportLabel(3, 2)).toBe('Export Portfolio Markdown (3 artifacts + 2 labs)')
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
      linkedMedia: [
        {
          artifactId: 'a1',
          title: 'Lab photo',
          kind: 'photo' as const,
          urls: ['https://example.test/a1.jpg'],
        },
        {
          artifactId: 'a2',
          title: 'Lab recording',
          kind: 'audio' as const,
          urls: ['https://example.test/a2.m4a'],
        },
      ],
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
      {
        id: 'r2',
        title: 'Quiet lab',
        date: '2026-07-12',
        excerpt: '',
        linkedArtifactCount: 0,
        linkedMedia: [],
      },
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

  it('carries the linked evidence it claims — photos embed, recordings link', () => {
    // Whole-family lab artifacts (`childId: 'both'`) are never selectable on
    // PortfolioPage, so without these links the export would print a count
    // whose evidence appears nowhere in the file.
    const md = buildDadLabMarkdownSection(entries).join('\n')
    expect(md).toContain('![Lab photo](https://example.test/a1.jpg)')
    expect(md).toContain('[Lab recording](https://example.test/a2.m4a)')
    // The recording must not be embedded as an image.
    expect(md).not.toContain('![Lab recording]')
  })

  it('skips evidence already rendered above, so nothing is duplicated', () => {
    const md = buildDadLabMarkdownSection(entries, ['a1']).join('\n')
    expect(md).not.toContain('https://example.test/a1.jpg')
    expect(md).toContain('https://example.test/a2.m4a')
    // The count still describes every linked artifact, listed here or not.
    expect(md).toContain('Linked this month: 3 lab photos or recordings')
  })
})

describe('generatePortfolioMarkdown with a Dad Lab section', () => {
  const children = [{ id: 'lincoln', name: 'Lincoln' }]
  const photo = artifact({ id: 'a1', title: 'Rocket', uri: 'https://example.test/a1.jpg' })

  it('appends the section once, after the per-child sections', () => {
    const section = buildDadLabMarkdownSection(
      [
        {
          id: 'r1',
          title: 'Balloon rockets',
          date: '2026-07-11',
          excerpt: 'What we saw: the short one went farthest',
          linkedArtifactCount: 1,
          linkedMedia: [
            { artifactId: 'a1', title: 'Rocket', kind: 'photo', urls: [photo.uri as string] },
          ],
        },
      ],
      // `a1` is the selected artifact rendered above, so it is skipped here.
      ['a1'],
    )
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
