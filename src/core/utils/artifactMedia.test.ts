import { describe, expect, it } from 'vitest'

import {
  artifactExpectsMedia,
  artifactMediaMissing,
  artifactMediaUrls,
} from './artifactMedia'
import { EngineStage, EvidenceType, LearningLocation, SubjectBucket } from '../types/enums'
import type { Artifact } from '../types'

const base = (over: Partial<Artifact>): Artifact => ({
  childId: 'lincoln',
  title: 'Work',
  type: EvidenceType.Photo,
  createdAt: '2026-09-14T14:05:00Z',
  tags: {
    engineStage: EngineStage.Build,
    domain: '',
    subjectBucket: SubjectBucket.Reading,
    location: LearningLocation.Home,
  },
  ...over,
})

describe('artifactMediaMissing (UX-432)', () => {
  it('flags a media-typed artifact with no uri and no mediaUrls', () => {
    expect(artifactMediaMissing(base({ type: EvidenceType.Photo }))).toBe(true)
    expect(artifactMediaMissing(base({ type: EvidenceType.Audio }))).toBe(true)
    expect(artifactMediaMissing(base({ type: EvidenceType.Video }))).toBe(true)
  })

  it('carries the legacy lowercase spellings the export already flagged', () => {
    expect(artifactMediaMissing(base({ type: 'photo' as EvidenceType }))).toBe(true)
    expect(artifactMediaMissing(base({ type: 'audio' as EvidenceType }))).toBe(true)
    expect(artifactMediaMissing(base({ type: 'video' as EvidenceType }))).toBe(true)
  })

  it('is satisfied by either address field', () => {
    expect(artifactMediaMissing(base({ uri: 'https://x/a.jpg' }))).toBe(false)
    expect(artifactMediaMissing(base({ mediaUrls: ['https://x/a.jpg'] }))).toBe(false)
  })

  it('an empty mediaUrls array is not an address', () => {
    expect(artifactMediaMissing(base({ mediaUrls: [] }))).toBe(true)
  })

  it('a Note owes no file, so it is never missing one', () => {
    expect(artifactExpectsMedia(base({ type: EvidenceType.Note }))).toBe(false)
    expect(artifactMediaMissing(base({ type: EvidenceType.Note }))).toBe(false)
    expect(
      artifactMediaMissing(base({ type: EvidenceType.Note, content: 'He read it aloud.' })),
    ).toBe(false)
  })

  it('a Worksheet is excluded, exactly as the export excludes it', () => {
    expect(artifactExpectsMedia(base({ type: EvidenceType.Worksheet }))).toBe(false)
    expect(artifactMediaMissing(base({ type: EvidenceType.Worksheet }))).toBe(false)
  })
})

describe('artifactMediaUrls', () => {
  it('prefers mediaUrls and falls back to uri', () => {
    expect(artifactMediaUrls(base({ uri: 'a', mediaUrls: ['b', 'c'] }))).toEqual(['b', 'c'])
    expect(artifactMediaUrls(base({ uri: 'a' }))).toEqual(['a'])
    expect(artifactMediaUrls(base({}))).toEqual([])
  })

  it('de-dupes and drops empty entries', () => {
    expect(artifactMediaUrls(base({ mediaUrls: ['a', 'a', '', 'b'] }))).toEqual(['a', 'b'])
  })
})
