import { describe, expect, it } from 'vitest'

import type { KitRoster } from '../../core/types/business'
import {
  buildBadgeSection,
  buildBookletSection,
  buildClueCardsSection,
  buildCoverSection,
  buildDefenseMapSection,
  buildParentCardSection,
  buildPrintableKitHtml,
  buildStickerSheetSection,
  clip,
  CLUE_CARD_COUNT,
  MAP_STOP_COUNT,
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

  it('never prints blank <strong> tags when the first cast row has a power/menace but no name', () => {
    // namedDefenders/namedInvaders retain a row with only a power/menace, so the
    // battle beat must fall back on the rendered name being empty (Codex P2).
    const html = buildBookletSection(
      roster({
        defenders: [{ id: 'd1', name: '', power: 'shoots sap' }],
        invaders: [{ id: 'i1', name: '', menace: 'digs holes' }],
      }),
    )
    expect(html).not.toContain('<strong></strong>')
    expect(html).toContain('the defenders')
    expect(html).toContain('the invaders')
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

describe('buildDefenseMapSection', () => {
  it('renders start → five stops → the vault, each stop labeled with a defender', () => {
    const html = buildDefenseMapSection(roster())
    expect(html).toContain('kit-map')
    expect((html.match(/map-stop/g) ?? []).length).toBe(MAP_STOP_COUNT)
    expect(html).toContain('Start')
    expect(html).toContain('Seed Vault')
    expect(html).toContain('Place your sticker')
    expect(html).toContain('Peashooter Pete') // defenders cycle to fill 5 stops
  })

  it('invites a drawing at every stop when no defenders are named', () => {
    const html = buildDefenseMapSection(roster({ defenders: [] }))
    expect((html.match(/draw a defender here!/g) ?? []).length).toBe(MAP_STOP_COUNT)
  })
})

describe('buildClueCardsSection', () => {
  it('renders five quarter-sheet clue cards referencing real cast names', () => {
    const html = buildClueCardsSection(roster())
    expect(html).toContain('kit-clues')
    expect((html.match(/clue-card/g) ?? []).length).toBe(CLUE_CARD_COUNT)
    // Real defenders + invaders are woven in by name.
    expect(html).toContain('Peashooter Pete')
    expect(html).toContain('Blocky Bog Monster')
    expect(html).toContain('Dig Bug')
    // The five patterns are all present.
    for (const title of ['Find', 'Count', 'Match', 'Follow', 'Defend']) {
      expect(html).toContain(title)
    }
  })

  it('falls back to warm generics on an empty cast (never blank, never crashes)', () => {
    const html = buildClueCardsSection(roster({ defenders: [], invaders: [] }))
    expect((html.match(/clue-card/g) ?? []).length).toBe(CLUE_CARD_COUNT)
    expect(html).toContain('a plant defender')
    expect(html).toContain('a garden invader')
  })
})

describe('buildBadgeSection', () => {
  it('renders a circular badge with the official caption and hero art/frame', () => {
    const withArt = buildBadgeSection(
      roster({ art: { hero: { url: 'https://x/hero.png', storagePath: 'p', generatedAt: 't' } } }),
    )
    expect(withArt).toContain('kit-badge')
    expect(withArt).toContain('Official Garden Defender')
    expect(withArt).toContain('https://x/hero.png')

    const noArt = buildBadgeSection(roster())
    expect(noArt).toContain('draw Sunflower Sam here!')
  })
})

describe('buildParentCardSection', () => {
  it('renders the adult setup card with the vault + hero for context', () => {
    const html = buildParentCardSection(roster())
    expect(html).toContain('kit-parent')
    expect(html).toContain('For the Grown-Up')
    expect(html).toContain('Ages 5+')
    expect(html).toContain('Seed Vault')
    expect(html).toContain('Sunflower Sam')
  })
})

describe('buildPrintableKitHtml (full document)', () => {
  it('emits all seven sections in a complete HTML document', () => {
    const html = buildPrintableKitHtml(roster(), 'Lincoln')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    for (const section of [
      'kit-cover',
      'kit-booklet',
      'kit-stickers',
      'kit-map',
      'kit-clues',
      'kit-badge',
      'kit-parent',
    ]) {
      expect(html).toContain(section)
    }
    expect(html).toContain('A Garden Defense Quest by Lincoln')
    expect(html).toContain('You win when all the seeds are safe in the vault!')
  })

  it('never crashes and stays byte-safe on a fully-empty roster', () => {
    const empty = roster({
      vaultName: '',
      heroName: '',
      heroLook: '',
      heroMove: '',
      defenders: [],
      invaders: [],
      winCondition: '',
    })
    const html = buildPrintableKitHtml(empty, '')
    expect(html).toContain('kit-parent')
    expect(html).toContain('A Garden Defense Quest') // no author suffix, no crash
  })
})

describe('escaping (kid text verbatim but HTML-safe)', () => {
  it('escapes crafted markup in a kid field', () => {
    const html = buildCoverSection(roster({ vaultName: '<script>alert(1)</script>' }), 'Lincoln')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes crafted markup woven into a clue card via a cast name', () => {
    const html = buildClueCardsSection(
      roster({ defenders: [{ id: 'd1', name: '<img src=x onerror=1>', power: 'zap' }] }),
    )
    expect(html).not.toContain('<img src=x onerror=1>')
    expect(html).toContain('&lt;img')
  })

  it('is a pure read — an empty title clip check confirms no roster mutation', () => {
    const r = roster()
    const before = JSON.stringify(r)
    buildPrintableKitHtml(r, 'Lincoln')
    expect(JSON.stringify(r)).toBe(before)
  })
})
