import { describe, expect, it } from 'vitest'

import type { KitArtRef, KitRoster } from '../../core/types/business'
import { KitRosterStatus } from '../../core/types/business'
import {
  artToProductImages,
  buildKitCharacterPrompt,
  charactersNeedingArt,
  defenderArtKey,
  hasAnyArt,
  heroDescriptor,
  HERO_ART_KEY,
  invaderArtKey,
  KIT_STICKER_SCAFFOLD,
  MAX_PROMPT_FIELD,
  rosterCharacters,
  sanitizeKidText,
} from './kitArt'

function ref(url: string): KitArtRef {
  return { url, storagePath: `families/f/generated-images/${url}.png`, generatedAt: '2026-07-18T00:00:00.000Z' }
}

function roster(overrides: Partial<KitRoster> = {}): KitRoster {
  return {
    id: 'r1',
    childId: 'lincoln',
    source: 'kitBuilder',
    status: KitRosterStatus.InProgress,
    vaultName: 'Seed Vault',
    heroName: 'Zappy',
    heroLook: 'green pea in a helmet',
    heroMove: 'shoots sparks',
    defenders: [
      { id: 'd1', name: 'Thorny', power: 'grows a thorn wall' },
      { id: 'd2', name: 'Sappy', power: 'shoots sticky sap' },
    ],
    invaders: [{ id: 'i1', name: 'Digger', menace: 'digs under the fence' }],
    winCondition: 'protect all the seeds',
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('sanitizeKidText', () => {
  it('collapses whitespace runs and trims, but leaves words verbatim', () => {
    expect(sanitizeKidText('  grows   a\tthorn\nwall  ')).toBe('grows a thorn wall')
  })

  it('does not correct spelling or capitalization', () => {
    expect(sanitizeKidText('ZaPpY McSparkl')).toBe('ZaPpY McSparkl')
  })

  it('caps length defensively', () => {
    const long = 'a'.repeat(500)
    expect(sanitizeKidText(long)).toHaveLength(MAX_PROMPT_FIELD)
  })
})

describe('buildKitCharacterPrompt', () => {
  it("puts the kid's name + descriptor first and verbatim, then the style scaffold", () => {
    const prompt = buildKitCharacterPrompt({ name: 'Thorny', descriptor: 'grows a thorn wall' })
    expect(prompt).toBe(`Thorny, grows a thorn wall. ${KIT_STICKER_SCAFFOLD}.`)
    // kid's words appear before the scaffold
    expect(prompt.indexOf('Thorny')).toBeLessThan(prompt.indexOf(KIT_STICKER_SCAFFOLD))
  })

  it('keeps weird kid spelling verbatim (never improved)', () => {
    const prompt = buildKitCharacterPrompt({ name: 'Zappy McSparkl!!!', descriptor: 'shootz spraks' })
    expect(prompt).toContain('Zappy McSparkl!!!, shootz spraks.')
  })

  it('handles a name with no descriptor', () => {
    expect(buildKitCharacterPrompt({ name: 'Thorny', descriptor: '' })).toBe(
      `Thorny. ${KIT_STICKER_SCAFFOLD}.`,
    )
  })

  it('falls back to the scaffold alone when both fields are empty', () => {
    expect(buildKitCharacterPrompt({ name: '', descriptor: '   ' })).toBe(`${KIT_STICKER_SCAFFOLD}.`)
  })

  it('always includes the transparent-background sticker scaffold', () => {
    const prompt = buildKitCharacterPrompt({ name: 'Digger', descriptor: 'digs under the fence' })
    expect(prompt).toContain('transparent background')
    expect(prompt).toContain('no text')
  })
})

describe('character keys', () => {
  it('are stable ids, not indices', () => {
    expect(HERO_ART_KEY).toBe('hero')
    expect(defenderArtKey('d1')).toBe('defender:d1')
    expect(invaderArtKey('i1')).toBe('invader:i1')
  })
})

describe('heroDescriptor', () => {
  it('joins look + move in that order', () => {
    expect(heroDescriptor({ heroLook: 'green pea', heroMove: 'shoots sparks' })).toBe(
      'green pea, shoots sparks',
    )
  })

  it('drops an empty field', () => {
    expect(heroDescriptor({ heroLook: '', heroMove: 'shoots sparks' })).toBe('shoots sparks')
  })
})

describe('rosterCharacters', () => {
  it('enumerates hero, then defenders, then invaders in order', () => {
    const chars = rosterCharacters(roster())
    expect(chars.map((c) => c.key)).toEqual([
      'hero',
      'defender:d1',
      'defender:d2',
      'invader:i1',
    ])
    expect(chars[0]).toMatchObject({ label: 'Hero', name: 'Zappy', descriptor: 'green pea in a helmet, shoots sparks' })
    expect(chars[1]).toMatchObject({ label: 'Defender 1', name: 'Thorny', descriptor: 'grows a thorn wall' })
    expect(chars[3]).toMatchObject({ label: 'Invader 1', name: 'Digger', descriptor: 'digs under the fence' })
  })

  it('skips entirely-empty rows', () => {
    const chars = rosterCharacters(
      roster({
        heroName: '',
        heroLook: '',
        heroMove: '',
        defenders: [{ id: 'd1', name: '', power: '' }],
        invaders: [],
      }),
    )
    expect(chars).toEqual([])
  })
})

describe('artToProductImages', () => {
  it('orders hero first (images[0]), then defenders, then invaders', () => {
    const r = roster({
      art: {
        'invader:i1': ref('inv'),
        'defender:d1': ref('def1'),
        hero: ref('heroImg'),
      },
    })
    const images = artToProductImages(r)
    expect(images.map((i) => i.url)).toEqual(['heroImg', 'def1', 'inv'])
    expect(images[0]).toEqual({ url: 'heroImg', alt: 'Zappy' })
  })

  it('includes only characters that have art', () => {
    const r = roster({ art: { 'defender:d2': ref('def2') } })
    expect(artToProductImages(r)).toEqual([{ url: 'def2', alt: 'Sappy' }])
  })

  it('returns [] when the roster has no art', () => {
    expect(artToProductImages(roster())).toEqual([])
  })

  it('labels an unnamed character with a fallback', () => {
    const r = roster({ heroName: '  ', art: { hero: ref('heroImg') } })
    expect(artToProductImages(r)[0]).toEqual({ url: 'heroImg', alt: 'Hero' })
  })
})

describe('charactersNeedingArt / hasAnyArt', () => {
  it('lists characters with content but no art', () => {
    const r = roster({ art: { hero: ref('heroImg') } })
    expect(charactersNeedingArt(r).map((c) => c.key)).toEqual([
      'defender:d1',
      'defender:d2',
      'invader:i1',
    ])
  })

  it('hasAnyArt reflects whether any ref has a url', () => {
    expect(hasAnyArt(roster())).toBe(false)
    expect(hasAnyArt(roster({ art: { hero: ref('a') } }))).toBe(true)
  })
})
