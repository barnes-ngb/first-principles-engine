import { describe, expect, it } from 'vitest'

import type { KitRoster } from '../../core/types/business'
import {
  buildBookletSection,
  buildCoverSection,
  buildStickerSheetSection,
  clip,
  namedDefenders,
  namedInvaders,
  NAME_CAP,
} from './printableKit'

/** A full, valid roster fixture — override per test. */
const roster = (over: Partial<KitRoster> = {}): KitRoster => ({
  id: 'r1',
  childId: 'c1',
  source: 'kitBuilder',
  status: 'Complete',
  vaultName: 'Seed Vault',
  heroName: 'Sunflower Sam',
  heroLook: 'a big yellow flower',
  heroMove: 'shoots sunbeams',
  defenders: [
    { id: 'd1', name: 'Peashooter Pete', power: 'shoots sticky sap' },
    { id: 'd2', name: 'Thorn Wall', power: 'grows a thorn wall' },
  ],
  invaders: [
    { id: 'i1', name: 'Blocky Bog Monster', menace: 'steals the seeds' },
    { id: 'i2', name: 'Dig Bug', menace: 'digs under the fence' },
  ],
  winCondition: 'You win when all the seeds are safe in the vault!',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  ...over,
})

describe('clip', () => {
  it('trims and passes short text through unchanged', () => {
    expect(clip('  hello  ', 80)).toBe('hello')
  })
  it('caps long text with an ellipsis', () => {
    const long = 'a'.repeat(NAME_CAP + 20)
    const out = clip(long, NAME_CAP)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(NAME_CAP + 1)
  })
})

describe('namedDefenders / namedInvaders', () => {
  it('drops entirely-empty rows but keeps a row with a name or a power', () => {
    const r = roster({
      defenders: [
        { id: 'a', name: '', power: '' },
        { id: 'b', name: 'Kept', power: '' },
        { id: 'c', name: '', power: 'has a power' },
      ],
      invaders: [{ id: 'x', name: '', menace: '' }],
    })
    expect(namedDefenders(r).map((d) => d.id)).toEqual(['b', 'c'])
    expect(namedInvaders(r)).toHaveLength(0)
  })
})

describe('buildCoverSection', () => {
  it('renders the vault name, the author credit, and the cover section class', () => {
    const html = buildCoverSection(roster(), 'Lincoln')
    expect(html).toContain('kit-cover')
    expect(html).toContain('Seed Vault')
    expect(html).toContain('A Garden Defense Quest by Lincoln')
  })

  it('shows the hero art when present, a draw-frame when absent', () => {
    const withArt = buildCoverSection(
      roster({ art: { hero: { url: 'https://x/hero.png', storagePath: 'p', generatedAt: 't' } } }),
      'Lincoln',
    )
    expect(withArt).toContain('https://x/hero.png')
    expect(withArt).not.toContain('draw ')

    const noArt = buildCoverSection(roster(), 'Lincoln')
    expect(noArt).toContain('draw Sunflower Sam here!')
    expect(noArt).not.toContain('<img')
  })
})

describe('buildBookletSection', () => {
  it('renders six paginated beats', () => {
    const html = buildBookletSection(roster())
    expect(html).toContain('kit-booklet')
    expect((html.match(/booklet-page/g) ?? []).length).toBe(6)
    expect(html).toContain('Page 6')
  })

  it('places the win condition verbatim as the climax', () => {
    const html = buildBookletSection(roster())
    expect(html).toContain('You win when all the seeds are safe in the vault!')
  })

  it('lists every invader (name + menace) and every defender (name + power)', () => {
    const html = buildBookletSection(roster())
    expect(html).toContain('Peashooter Pete')
    expect(html).toContain('shoots sticky sap')
    expect(html).toContain('Blocky Bog Monster')
    expect(html).toContain('steals the seeds')
  })

  it('degrades to warm generics on an empty roster (never blank, never crashes)', () => {
    const empty = roster({
      vaultName: '',
      heroName: '',
      heroLook: '',
      heroMove: '',
      defenders: [],
      invaders: [],
      winCondition: '',
    })
    const html = buildBookletSection(empty)
    expect((html.match(/booklet-page/g) ?? []).length).toBe(6)
    expect(html).toContain('the Seed Vault')
    expect(html).toContain('the Hero')
  })
})

describe('buildStickerSheetSection', () => {
  it('renders a cell for the hero and every named character, with dashed-cut grid', () => {
    const html = buildStickerSheetSection(roster())
    expect(html).toContain('kit-stickers')
    expect(html).toContain('sticker-grid')
    expect((html.match(/class="sticker"/g) ?? []).length).toBe(5) // hero + 2 defenders + 2 invaders
    expect(html).toContain('Sunflower Sam')
    expect(html).toContain('Thorn Wall')
    expect(html).toContain('Dig Bug')
  })

  it('uses generated art where present and a draw-frame where absent', () => {
    const html = buildStickerSheetSection(
      roster({
        art: { 'defender:d1': { url: 'https://x/pete.png', storagePath: 'p', generatedAt: 't' } },
      }),
    )
    expect(html).toContain('https://x/pete.png')
    // Thorn Wall has no art → draw-frame.
    expect(html).toContain('draw Thorn Wall here!')
  })
})

describe('escaping (kid text verbatim but HTML-safe)', () => {
  it('escapes crafted markup in a kid field', () => {
    const html = buildCoverSection(roster({ vaultName: '<script>alert(1)</script>' }), 'Lincoln')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
