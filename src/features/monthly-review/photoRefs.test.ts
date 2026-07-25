import { describe, it, expect } from 'vitest'
import { getModePhotos } from './photoRefs'
import type { MonthlyReviewPage, PhotoRef } from '../../core/types'

describe('getModePhotos', () => {
  const kidPhoto: PhotoRef = {
    id: 'photo-kid',
    storagePath: 'families/f1/scans/kid.jpg',
    source: 'scan',
    sourceDocId: 'scan-1',
    capturedAt: '2026-07-01T10:00:00.000Z',
  }
  const parentPhoto: PhotoRef = {
    id: 'photo-parent',
    storagePath: 'families/f1/artifacts/parent.jpg',
    source: 'artifact',
    sourceDocId: 'artifact-1',
    capturedAt: '2026-07-01T11:00:00.000Z',
  }

  it('returns kid photos from new per-mode format', () => {
    const page = {
      photoRefs: {
        kid: [kidPhoto],
        parent: [parentPhoto],
      },
    } as unknown as MonthlyReviewPage

    expect(getModePhotos(page, 'kid')).toEqual([kidPhoto])
    expect(getModePhotos(page, 'parent')).toEqual([parentPhoto])
  })

  it('returns the same array for both modes from legacy flat format', () => {
    const page = {
      photoRefs: [kidPhoto, parentPhoto],
    } as unknown as MonthlyReviewPage

    expect(getModePhotos(page, 'kid')).toEqual([kidPhoto, parentPhoto])
    expect(getModePhotos(page, 'parent')).toEqual([kidPhoto, parentPhoto])
  })

  it('returns empty array when photoRefs is undefined', () => {
    const page = {} as MonthlyReviewPage

    expect(getModePhotos(page, 'kid')).toEqual([])
    expect(getModePhotos(page, 'parent')).toEqual([])
  })

  it('returns empty array when per-mode key is missing', () => {
    const page = {
      photoRefs: {
        kid: [kidPhoto],
      },
    } as unknown as MonthlyReviewPage

    expect(getModePhotos(page, 'parent')).toEqual([])
  })

  it('returns empty array when photoRefs is null', () => {
    const page = { photoRefs: null } as unknown as MonthlyReviewPage

    expect(getModePhotos(page, 'kid')).toEqual([])
  })
})
