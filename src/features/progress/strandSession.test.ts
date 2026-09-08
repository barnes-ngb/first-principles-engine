import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import {
  ActivityFrequency,
  ActivityType,
  EvidenceType,
  SubjectBucket,
} from '../../core/types/enums'
import {
  buildStrandArtifact,
  evidenceKinds,
  hasEvidence,
  planStrandSession,
  STRAND_SESSION_REFUSALS,
} from './strandSession'

function strand(overrides: Partial<ActivityConfig> = {}): ActivityConfig {
  return {
    id: 's1',
    name: 'History',
    type: ActivityType.Strand,
    subjectBucket: SubjectBucket.SocialStudies,
    defaultMinutes: 30,
    frequency: ActivityFrequency.TwoPerWeek,
    childId: 'c1',
    sortOrder: 0,
    completed: false,
    scannable: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as ActivityConfig
}

const photo = () => new File(['x'], 'egypt.jpg', { type: 'image/jpeg' })

describe('what counts as evidence', () => {
  it('recognises each of the four kinds', () => {
    expect(evidenceKinds({ photos: [photo()] })).toEqual([EvidenceType.Photo])
    expect(evidenceKinds({ audio: new Blob(['a']) })).toEqual([EvidenceType.Audio])
    expect(evidenceKinds({ note: 'we talked about pyramids' })).toEqual([EvidenceType.Note])
    expect(evidenceKinds({ videoUrl: 'https://example/v' })).toEqual([EvidenceType.Video])
  })

  it('does not count a blank note, an empty link or an empty photo batch', () => {
    expect(hasEvidence({ note: '   ' })).toBe(false)
    expect(hasEvidence({ videoUrl: '  ' })).toBe(false)
    expect(hasEvidence({ photos: [] })).toBe(false)
    expect(hasEvidence({})).toBe(false)
  })

  it('lists several kinds in a fixed order, not tap order', () => {
    expect(
      evidenceKinds({ videoUrl: 'https://v', note: 'n', photos: [photo()] }),
    ).toEqual([EvidenceType.Photo, EvidenceType.Note, EvidenceType.Video])
  })
})

describe('planStrandSession refuses rather than half-writing', () => {
  it('refuses a row that is not a strand', () => {
    const result = planStrandSession(
      strand({ type: ActivityType.Workbook }),
      'Ancient Egypt',
      { note: 'n' },
    )
    expect(result).toEqual({ ok: false, reason: STRAND_SESSION_REFUSALS.notAStrand })
  })

  it('refuses a session with no topic — the count would say nothing', () => {
    const result = planStrandSession(strand(), '   ', { note: 'n' })
    expect(result).toEqual({ ok: false, reason: STRAND_SESSION_REFUSALS.noTopic })
  })

  it('refuses a session with no evidence, which is what keeps the topic', () => {
    // `recentTopics` is a capped cache trimmed from the oldest end. Requiring
    // evidence is what makes it derived rather than authoritative.
    const result = planStrandSession(strand(), 'Ancient Egypt', {})
    expect(result).toEqual({ ok: false, reason: STRAND_SESSION_REFUSALS.noEvidence })
  })
})

describe('planStrandSession, when it is a session', () => {
  it('stores the topic as she typed it, whitespace-normalized', () => {
    const result = planStrandSession(strand(), '  Ancient   Egypt ', { note: 'n' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.topic).toBe('Ancient Egypt')
  })

  it('files the third Egypt session with the other two', () => {
    const config = strand({ recentTopics: ['The Pilgrims', 'Ancient Egypt'] })
    const result = planStrandSession(config, 'ancient egypt', { note: 'n' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // One Egypt entry, not two — matched through `nameKey` (UX-205).
    expect(result.plan.recentTopics).toEqual(['ancient egypt', 'The Pilgrims'])
  })

  it('offers a brand-new topic at the front of an empty list', () => {
    const result = planStrandSession(strand(), 'The Silk Road', { photos: [photo()] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.recentTopics).toEqual(['The Silk Road'])
  })
})

describe('the artifact a session writes', () => {
  const artifact = buildStrandArtifact({
    config: strand(),
    childId: 'c1',
    topic: 'Ancient Egypt',
    type: EvidenceType.Audio,
    createdAt: '2026-09-07T15:00:00.000Z',
    dayLogId: '2026-09-07',
  })

  it('carries the join and the durable record of the topic', () => {
    expect(artifact.activityConfigId).toBe('s1')
    expect(artifact.topic).toBe('Ancient Egypt')
  })

  it('is titled by the topic, not by the strand', () => {
    // A gallery of a year's evidence is read by topic; the strand is one tap
    // away on the join.
    expect(artifact.title).toBe('Ancient Egypt')
  })

  it('is an ordinary artifact, so every existing consumer needs no new case', () => {
    expect(artifact.childId).toBe('c1')
    expect(artifact.type).toBe(EvidenceType.Audio)
    expect(artifact.dayLogId).toBe('2026-09-07')
    expect(artifact.tags.subjectBucket).toBe(SubjectBucket.SocialStudies)
    expect(artifact.tags.planItem).toBe('History')
  })

  it('omits optional fields rather than writing undefined into Firestore', () => {
    const bare = buildStrandArtifact({
      config: strand(),
      childId: 'c1',
      topic: 'Rome',
      type: EvidenceType.Note,
      createdAt: '2026-09-07T15:00:00.000Z',
    })
    expect(bare).not.toHaveProperty('dayLogId')
    expect(bare).not.toHaveProperty('weekKey')
    expect(bare).not.toHaveProperty('uri')
    expect(bare).not.toHaveProperty('content')
  })
})
