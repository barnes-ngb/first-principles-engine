import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CatalogProduct, KitArtRef, KitRoster } from '../../core/types/business'
import { BusinessItemType, CatalogProductStatus, KitRosterStatus } from '../../core/types/business'
import { defenderArtKey, HERO_ART_KEY, invaderArtKey } from './kitArt'
import {
  buildKitArtDownloads,
  buildProductImageDownloads,
  dedupeStems,
  downloadArtFiles,
  fetchImageBlob,
  kitArtZipName,
  productImagesZipName,
  slugifySegment,
  triggerBlobDownload,
} from './stickerArtExport'

function ref(url: string): KitArtRef {
  return { url, storagePath: `p/${url}`, generatedAt: '2026-07-18T00:00:00.000Z' }
}

/** The Neptune fixture the run prompt calls out for the three example filenames. */
function neptune(overrides: Partial<KitRoster> = {}): KitRoster {
  return {
    id: 'r1',
    childId: 'lincoln',
    source: 'kitBuilder',
    status: KitRosterStatus.Complete,
    vaultName: 'Neptune',
    heroName: 'Link',
    heroLook: 'green hero',
    heroMove: 'sword slash',
    defenders: [
      { id: 'd1', name: 'Fender', power: 'blocks' },
      { id: 'd2', name: 'Guard', power: 'shields' },
    ],
    invaders: [
      { id: 'i1', name: 'Zombie', menace: 'shambles' },
      { id: 'i2', name: 'Super Smart Zombie', menace: 'plans' },
    ],
    winCondition: 'save the seeds',
    art: {
      [HERO_ART_KEY]: ref('hero'),
      [defenderArtKey('d1')]: ref('def1'),
      [defenderArtKey('d2')]: ref('def2'),
      [invaderArtKey('i1')]: ref('inv1'),
      [invaderArtKey('i2')]: ref('inv2'),
    },
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('slugifySegment', () => {
  it('kebab-cases verbatim kid text into a safe filename segment', () => {
    expect(slugifySegment('Super Smart Zombie')).toBe('super-smart-zombie')
  })

  it('collapses punctuation runs and trims edges', () => {
    expect(slugifySegment("  Mr. Zap!! ")).toBe('mr-zap')
  })

  it('returns empty string for all-symbol / empty input (caller supplies fallback)', () => {
    expect(slugifySegment('***')).toBe('')
    expect(slugifySegment('')).toBe('')
  })

  it('length-caps a runaway name', () => {
    expect(slugifySegment('a'.repeat(200)).length).toBeLessThanOrEqual(40)
  })
})

describe('dedupeStems', () => {
  it('numbers colliding stems, first keeps its name', () => {
    const out = dedupeStems([{ stem: 'zombie' }, { stem: 'zombie' }, { stem: 'link' }, { stem: 'zombie' }])
    expect(out.map((o) => o.unique)).toEqual(['zombie', 'zombie-2', 'link', 'zombie-3'])
  })
})

describe('buildKitArtDownloads', () => {
  it('names every character kit-scoped, hero first — the three prompt examples', () => {
    const files = buildKitArtDownloads(neptune())
    const names = files.map((f) => f.filename)
    expect(names).toContain('neptune-hero-link.png')
    expect(names).toContain('neptune-defender-1-fender.png')
    expect(names).toContain('neptune-invader-2-super-smart-zombie.png')
    // Hero lands first (canonical order).
    expect(names[0]).toBe('neptune-hero-link.png')
    expect(files[0].url).toBe('hero')
  })

  it('only includes characters that actually have art', () => {
    const r = neptune({ art: { [HERO_ART_KEY]: ref('hero') } })
    const files = buildKitArtDownloads(r)
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('neptune-hero-link.png')
  })

  it('numbers a duplicate name collision-safe', () => {
    const r = neptune({
      invaders: [
        { id: 'i1', name: 'Zombie', menace: 'a' },
        { id: 'i2', name: 'Zombie', menace: 'b' },
      ],
      art: { [invaderArtKey('i1')]: ref('a'), [invaderArtKey('i2')]: ref('b') },
    })
    const names = buildKitArtDownloads(r).map((f) => f.filename)
    // Distinct role index already differs; stems still differ → no numeric suffix needed.
    expect(names).toEqual(['neptune-invader-1-zombie.png', 'neptune-invader-2-zombie.png'])
  })

  it('falls back to the role label for a drawn-but-nameless character', () => {
    const r = neptune({
      defenders: [{ id: 'd1', name: '', power: 'blocks' }],
      invaders: [],
      art: { [defenderArtKey('d1')]: ref('x') },
    })
    const names = buildKitArtDownloads(r).map((f) => f.filename)
    expect(names).toEqual(['neptune-defender-1.png'])
  })

  it('falls back to "kit" when the vault is unnamed', () => {
    const r = neptune({ vaultName: '', art: { [HERO_ART_KEY]: ref('hero') } })
    expect(buildKitArtDownloads(r)[0].filename).toBe('kit-hero-link.png')
  })

  it('is empty for a roster with no art', () => {
    expect(buildKitArtDownloads(neptune({ art: {} }))).toEqual([])
  })
})

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'p1',
    title: 'Steven the Sticker',
    type: BusinessItemType.StickerSheet,
    description: '',
    priceCents: 0,
    images: [{ url: 'a' }, { url: 'b' }],
    madeBy: ['Lincoln'],
    status: CatalogProductStatus.Listed,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildProductImageDownloads', () => {
  it('names images {title-slug}-{n}.png, 1-based', () => {
    const files = buildProductImageDownloads(product(), 'Steven the Sticker')
    expect(files.map((f) => f.filename)).toEqual([
      'steven-the-sticker-1.png',
      'steven-the-sticker-2.png',
    ])
    expect(files.map((f) => f.url)).toEqual(['a', 'b'])
  })

  it('skips empty-URL refs', () => {
    const files = buildProductImageDownloads(product({ images: [{ url: 'a' }, { url: '' }] }), 'Steven')
    expect(files).toHaveLength(1)
  })

  it('uses the passed (live) title, not the stored one', () => {
    const files = buildProductImageDownloads(product(), 'Renamed Kit')
    expect(files[0].filename).toBe('renamed-kit-1.png')
  })

  it('falls back to "product" for an empty title', () => {
    expect(buildProductImageDownloads(product({ images: [{ url: 'a' }] }), '')[0].filename).toBe(
      'product-1.png',
    )
  })
})

describe('zip names', () => {
  it('kit → {vault}-stickers.zip', () => {
    expect(kitArtZipName(neptune())).toBe('neptune-stickers.zip')
  })
  it('product → {title}-stickers.zip', () => {
    expect(productImagesZipName('Steven the Sticker')).toBe('steven-the-sticker-stickers.zip')
  })
})

// ── Side-effect layer ─────────────────────────────────────────────────

describe('download side-effects', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    createObjectURL = vi.fn(() => 'blob:mock')
    revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetchImageBlob throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response))
    await expect(fetchImageBlob('u')).rejects.toThrow(/404/)
  })

  it('triggerBlobDownload creates + revokes an object URL and clicks', () => {
    triggerBlobDownload('x.png', new Blob(['x']))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('downloadArtFiles is a no-op on an empty list (no fetch, no click)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await downloadArtFiles([], 'z.zip')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('a single file downloads directly (fetches its URL, no zip)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['img']) }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)
    await downloadArtFiles([{ url: 'the-url', filename: 'one.png' }], 'z.zip')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('the-url')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('many files fetch every URL and download one zip', async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (u: string) => {
      urls.push(u)
      return { ok: true, blob: async () => new Blob([u]) } as unknown as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    await downloadArtFiles(
      [
        { url: 'u1', filename: 'a.png' },
        { url: 'u2', filename: 'b.png' },
      ],
      'bundle.zip',
    )
    expect(urls).toEqual(['u1', 'u2'])
    // One click for the single zip (not one per file).
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
