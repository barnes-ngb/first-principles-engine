import { describe, it, expect } from 'vitest'
import type { Artifact, ChecklistItem } from '../../core/types'
import { EvidenceType, SubjectBucket } from '../../core/types/enums'
import { resolveDisplayPhotos } from './itemPhotos'

const makeArtifact = (overrides: Partial<Artifact> & { id: string }): Artifact => ({
  childId: 'child-1',
  title: 'Test',
  type: EvidenceType.Photo,
  createdAt: '2026-01-10T10:00:00',
  tags: {
    engineStage: 'Wonder' as never,
    domain: '',
    subjectBucket: SubjectBucket.Reading,
    location: 'Home',
  },
  ...overrides,
})

const makeItem = (overrides?: Partial<ChecklistItem>): ChecklistItem => ({
  label: 'Reading Eggs (45m)',
  completed: true,
  ...overrides,
})

describe('resolveDisplayPhotos', () => {
  it('returns empty array when no artifacts match', () => {
    const item = makeItem()
    const result = resolveDisplayPhotos(item, [])
    expect(result).toEqual([])
  })

  it('matches artifact by evidenceArtifactId', () => {
    const artifact = makeArtifact({ id: 'art-1', uri: 'https://example.com/photo1.jpg' })
    const item = makeItem({ evidenceArtifactId: 'art-1' })

    const result = resolveDisplayPhotos(item, [artifact])
    expect(result).toEqual([{ artifactId: 'art-1', uri: 'https://example.com/photo1.jpg' }])
  })

  it('matches artifact by planItem tag', () => {
    const artifact = makeArtifact({
      id: 'art-2',
      uri: 'https://example.com/photo2.jpg',
      tags: {
        engineStage: 'Build' as never,
        domain: '',
        subjectBucket: SubjectBucket.Reading,
        location: 'Home',
        planItem: 'Reading Eggs (45m)',
      },
    })
    const item = makeItem({ label: 'Reading Eggs (45m)' })

    const result = resolveDisplayPhotos(item, [artifact])
    expect(result).toEqual([{ artifactId: 'art-2', uri: 'https://example.com/photo2.jpg' }])
  })

  it('deduplicates URIs across evidenceArtifactId and planItem matches', () => {
    const artifact = makeArtifact({
      id: 'art-1',
      uri: 'https://example.com/photo.jpg',
      tags: {
        engineStage: 'Build' as never,
        domain: '',
        subjectBucket: SubjectBucket.Reading,
        location: 'Home',
        planItem: 'Reading Eggs (45m)',
      },
    })
    const item = makeItem({ evidenceArtifactId: 'art-1', label: 'Reading Eggs (45m)' })

    const result = resolveDisplayPhotos(item, [artifact])
    expect(result).toHaveLength(1)
  })

  it('uses mediaUrls when available over uri', () => {
    const artifact = makeArtifact({
      id: 'art-1',
      uri: 'https://example.com/single.jpg',
      mediaUrls: ['https://example.com/batch1.jpg', 'https://example.com/batch2.jpg'],
      tags: {
        engineStage: 'Build' as never,
        domain: '',
        subjectBucket: SubjectBucket.Reading,
        location: 'Home',
        planItem: 'Reading Eggs (45m)',
      },
    })
    const item = makeItem()

    const result = resolveDisplayPhotos(item, [artifact])
    expect(result).toHaveLength(2)
    expect(result[0].uri).toBe('https://example.com/batch1.jpg')
    expect(result[1].uri).toBe('https://example.com/batch2.jpg')
  })

  it('skips non-Photo artifacts', () => {
    const artifact = makeArtifact({
      id: 'art-1',
      type: EvidenceType.Note,
      uri: 'https://example.com/note.txt',
    })
    const item = makeItem({ evidenceArtifactId: 'art-1' })

    const result = resolveDisplayPhotos(item, [artifact])
    expect(result).toEqual([])
  })

  it('skips evidenceArtifactId when evidenceCollection is scans', () => {
    const artifact = makeArtifact({
      id: 'scan-1',
      uri: 'https://example.com/scan.jpg',
    })
    const item = makeItem({
      evidenceArtifactId: 'scan-1',
      evidenceCollection: 'scans' as never,
    })

    const result = resolveDisplayPhotos(item, [artifact])
    expect(result).toEqual([])
  })

  it('collects photos from multiple artifacts tagged to same plan item', () => {
    const artifacts = [
      makeArtifact({
        id: 'art-1',
        uri: 'https://example.com/photo1.jpg',
        tags: {
          engineStage: 'Build' as never,
          domain: '',
          subjectBucket: SubjectBucket.Reading,
          location: 'Home',
          planItem: 'Math Practice (20m)',
        },
      }),
      makeArtifact({
        id: 'art-2',
        uri: 'https://example.com/photo2.jpg',
        tags: {
          engineStage: 'Build' as never,
          domain: '',
          subjectBucket: SubjectBucket.Math,
          location: 'Home',
          planItem: 'Math Practice (20m)',
        },
      }),
    ]
    const item = makeItem({ label: 'Math Practice (20m)' })

    const result = resolveDisplayPhotos(item, artifacts)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.artifactId)).toEqual(['art-1', 'art-2'])
  })

  it('skips artifacts with no uri and no mediaUrls', () => {
    // makeArtifact leaves `uri` unset by default, so this artifact has neither uri nor mediaUrls.
    const artifact = makeArtifact({ id: 'art-1' })
    const item = makeItem({ evidenceArtifactId: 'art-1' })

    const result = resolveDisplayPhotos(item, [artifact])
    expect(result).toEqual([])
  })

  it('prioritizes evidenceArtifactId match before planItem matches', () => {
    const linkedArtifact = makeArtifact({
      id: 'linked',
      uri: 'https://example.com/linked.jpg',
    })
    const taggedArtifact = makeArtifact({
      id: 'tagged',
      uri: 'https://example.com/tagged.jpg',
      tags: {
        engineStage: 'Build' as never,
        domain: '',
        subjectBucket: SubjectBucket.Reading,
        location: 'Home',
        planItem: 'Reading Eggs (45m)',
      },
    })
    const item = makeItem({ evidenceArtifactId: 'linked' })

    const result = resolveDisplayPhotos(item, [linkedArtifact, taggedArtifact])
    expect(result[0].artifactId).toBe('linked')
    expect(result[1].artifactId).toBe('tagged')
  })
})
