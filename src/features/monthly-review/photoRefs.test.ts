import { describe, it, expect } from 'vitest'
import { getModePhotos } from './photoRefs'
import type { MonthlyReviewPage, PhotoRef } from '../../core/types'

describe('getModePhotos', () => {
  const kidPhoto: PhotoRef = { url: 'https://example.com/kid.jpg', caption: 'kid view' }
  const parentPhoto: PhotoRef = { url: 'https://example.com/parent.jpg', caption: 'parent view' }

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
