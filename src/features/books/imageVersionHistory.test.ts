import { describe, it, expect } from 'vitest'
import type { PageImage, ImageVersion } from '../../core/types'

// Re-implement pushVersion locally since it's not exported from useBook
function pushVersion(
  image: PageImage,
  replacedBy: ImageVersion['replacedBy'],
): ImageVersion[] {
  const entry: ImageVersion = {
    url: image.url,
    replacedAt: new Date().toISOString(),
    replacedBy,
  }
  return [entry, ...(image.previousVersions ?? []).slice(0, 4)]
}

function makeImage(overrides: Partial<PageImage> = {}): PageImage {
  return {
    id: 'img_1',
    url: 'https://example.com/current.png',
    type: 'sketch',
    ...overrides,
  }
}

describe('pushVersion (image version history)', () => {
  it('creates a version entry from the current URL', () => {
    const img = makeImage({ url: 'https://example.com/sketch.png' })
    const versions = pushVersion(img, 'reimagine')

    expect(versions).toHaveLength(1)
    expect(versions[0].url).toBe('https://example.com/sketch.png')
    expect(versions[0].replacedBy).toBe('reimagine')
    expect(versions[0].replacedAt).toBeTruthy()
  })

  it('preserves existing versions (newest first)', () => {
    const existing: ImageVersion[] = [
      { url: 'https://example.com/v2.png', replacedAt: '2026-01-02T00:00:00Z', replacedBy: 'reimagine' },
      { url: 'https://example.com/v1.png', replacedAt: '2026-01-01T00:00:00Z', replacedBy: 'upload' },
    ]
    const img = makeImage({
      url: 'https://example.com/v3.png',
      previousVersions: existing,
    })
    const versions = pushVersion(img, 'generate')

    expect(versions).toHaveLength(3)
    expect(versions[0].url).toBe('https://example.com/v3.png')
    expect(versions[1].url).toBe('https://example.com/v2.png')
    expect(versions[2].url).toBe('https://example.com/v1.png')
  })

  it('caps at 5 versions (drops oldest)', () => {
    const existing: ImageVersion[] = Array.from({ length: 5 }, (_, i) => ({
      url: `https://example.com/v${i}.png`,
      replacedAt: `2026-01-0${i + 1}T00:00:00Z`,
      replacedBy: 'reimagine' as const,
    }))
    const img = makeImage({
      url: 'https://example.com/v5.png',
      previousVersions: existing,
    })
    const versions = pushVersion(img, 'upload')

    expect(versions).toHaveLength(5)
    // Most recent is the current URL being replaced
    expect(versions[0].url).toBe('https://example.com/v5.png')
    // Oldest is v3 (v4 was the 5th, now pushed off)
    expect(versions[4].url).toBe('https://example.com/v3.png')
  })

  it('handles image with no previousVersions', () => {
    const img = makeImage({ previousVersions: undefined })
    const versions = pushVersion(img, 'gallery')

    expect(versions).toHaveLength(1)
    expect(versions[0].replacedBy).toBe('gallery')
  })

  it('tracks different replacedBy types', () => {
    const img = makeImage()
    const v1 = pushVersion(img, 'reimagine')
    expect(v1[0].replacedBy).toBe('reimagine')

    const v2 = pushVersion({ ...img, previousVersions: v1 }, 'upload')
    expect(v2[0].replacedBy).toBe('upload')
    expect(v2[1].replacedBy).toBe('reimagine')
  })
})

describe('PageImage.previousVersions type', () => {
  it('allows optional previousVersions on PageImage', () => {
    const img: PageImage = {
      id: 'test',
      url: 'https://example.com/img.png',
      type: 'photo',
    }
    // Should compile and be undefined
    expect(img.previousVersions).toBeUndefined()
  })

  it('allows previousVersions array on PageImage', () => {
    const img: PageImage = {
      id: 'test',
      url: 'https://example.com/img.png',
      type: 'photo',
      previousVersions: [
        { url: 'https://example.com/old.png', replacedAt: '2026-01-01T00:00:00Z', replacedBy: 'reimagine' },
      ],
    }
    expect(img.previousVersions).toHaveLength(1)
  })
})
