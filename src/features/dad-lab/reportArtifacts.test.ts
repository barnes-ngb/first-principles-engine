import { describe, expect, it } from 'vitest'

import type { DadLabReport } from '../../core/types'
import { reportArtifactIds } from './reportArtifacts'

const NOW = '2026-08-22T00:00:00.000Z'

/** A report shell; each test supplies the evidence it cares about. */
function report(overrides: Partial<DadLabReport>): DadLabReport {
  return {
    id: 'lab-1',
    date: '2026-08-22',
    weekKey: '2026-W34',
    title: 'Balloon Lab',
    labType: 'science',
    question: 'Why does it pop?',
    description: '',
    status: 'complete',
    childReports: {},
    subjectTags: ['Science'],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('reportArtifactIds — one answer to "what is on this report" (UX-85)', () => {
  it('reads the legacy per-child capture', () => {
    expect(
      reportArtifactIds(
        report({
          childReports: {
            lincoln: { prediction: 'it pops', artifacts: ['art-a', 'art-b'] },
            london: { observation: 'loud', artifacts: ['art-c'] },
          },
        }),
      ),
    ).toEqual(['art-a', 'art-b', 'art-c'])
  })

  it('reads beat items — the FEAT-156 default, where lab photos now land', () => {
    // Nathan's Aug 22 lab: every photo lives in a beat, and the child reports
    // are empty. Reading only the child-report side returns nothing.
    expect(
      reportArtifactIds(
        report({
          childReports: {},
          beats: {
            predict: { items: [{ artifactId: 'art-p', child: 'both' }] },
            try: { text: 'we blew it up', items: [{ artifactId: 'art-t', child: 'c-lincoln' }] },
            saw: { items: [{ artifactId: 'art-s', child: 'both' }] },
          },
        }),
      ),
    ).toEqual(['art-p', 'art-t', 'art-s'])
  })

  it('unions both sources, counting an id referenced from both exactly once', () => {
    const ids = reportArtifactIds(
      report({
        childReports: { lincoln: { artifacts: ['art-shared', 'art-child'] } },
        beats: {
          predict: {
            items: [
              { artifactId: 'art-shared', child: 'both' },
              { artifactId: 'art-beat', child: 'both' },
            ],
          },
          try: { items: [] },
          saw: { items: [] },
        },
      }),
    )
    expect(ids).toEqual(['art-shared', 'art-child', 'art-beat'])
    expect(ids.filter((id) => id === 'art-shared')).toHaveLength(1)
  })

  it('returns nothing for a report with no evidence anywhere', () => {
    expect(reportArtifactIds(report({}))).toEqual([])
    expect(
      reportArtifactIds(
        report({
          childReports: { lincoln: { prediction: 'a guess', artifacts: [] } },
          beats: {
            predict: { text: 'a word', items: [] },
            try: { items: [] },
            saw: { items: [] },
          },
        }),
      ),
    ).toEqual([])
  })

  it('is defensive about malformed docs — missing sides and empty ids', () => {
    const malformed = {
      ...report({}),
      childReports: undefined,
      beats: undefined,
    } as unknown as DadLabReport
    expect(reportArtifactIds(malformed)).toEqual([])

    const emptyIds = {
      ...report({}),
      childReports: { lincoln: { artifacts: ['', 'art-real'] } },
      beats: { predict: { items: [{ artifactId: '', child: 'both' }] } },
    } as unknown as DadLabReport
    expect(reportArtifactIds(emptyIds)).toEqual(['art-real'])
  })
})
