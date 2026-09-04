import { describe, expect, it } from 'vitest'

import {
  expectKidLine,
  expectKidWording,
  sentenceCount,
  syllableProxy,
} from '../../../test/kidReadability'
import {
  artBudgetLines,
  artHelp,
  artHelpStyles,
  generateHint,
  styleBlurb,
} from '../artHelpContent'
import type { ArtHelpAudience, ArtHelpDoor, ArtHelpSurface } from '../artHelpContent'
import { GENERATION_STYLES } from '../bookTypes'
import { FANCY_STYLE_OPTIONS } from '../drawingStickerStyles'

const SURFACES: ArtHelpSurface[] = ['stickers', 'sketch', 'bookImages', 'generateBook', 'kitArt', 'workshop', 'avatarPhoto']
const AUDIENCES: ArtHelpAudience[] = ['kid', 'parent']
const DOORS: ArtHelpDoor[] = [
  'makeSticker',
  'makeItFancy',
  'addVersion',
  'makeVersions',
  'bookScene',
  'illustrateBook',
  'kitArt',
  'kitArtBatch',
  'workshopGame',
  'workshopRegenerate',
  'avatarPhoto',
  'revisePagePicture',
]

// ── The readability proxy ───────────────────────────────────────
//
// FEAT-178 wrote the proxy here; FEAT-186 moved it to
// `src/test/kidReadability.ts` so the lock-and-gate wording pass could hold
// itself to the SAME bar rather than a second copy of it. What it measures,
// and why it is deliberately cheap, is documented there. Nothing about the
// assertions below changed: this suite still puts every kid line through
// `expectKidLine` (word count + syllables + a full stop).

describe('artHelpContent — the proxy itself', () => {
  it('counts the way the bar claims to', () => {
    expect(syllableProxy('picture')).toBe(2)
    expect(syllableProxy('pictures')).toBe(2)
    expect(syllableProxy('sticker')).toBe(2)
    expect(syllableProxy('grown')).toBe(1)
    expect(syllableProxy('3')).toBe(0)
    // The words this bar exists to catch.
    expect(syllableProxy('polished')).toBeGreaterThan(2)
    expect(syllableProxy('reimagine')).toBeGreaterThan(2)
    expect(syllableProxy('characters')).toBeGreaterThan(2)
  })
})

describe('artHelp — every surface, every audience', () => {
  it('returns a titled sheet with real sections', () => {
    for (const surface of SURFACES) {
      for (const audience of AUDIENCES) {
        const content = artHelp(surface, audience)
        expect(content.title.trim(), `${surface}/${audience}`).not.toBe('')
        expect(content.sections.length, `${surface}/${audience}`).toBeGreaterThan(0)
        for (const section of content.sections) {
          expect(section.heading.trim(), `${surface}/${audience}/${section.id}`).not.toBe('')
          if (section.id === 'styles') {
            // The one section the sheet fills from the picker lists.
            expect(artHelpStyles(surface).length, `${surface} styles`).toBeGreaterThan(0)
          } else {
            expect(section.lines.length, `${surface}/${audience}/${section.id}`).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  it('says what the surface never touches, on every sheet', () => {
    for (const surface of SURFACES) {
      for (const audience of AUDIENCES) {
        const ids = artHelp(surface, audience).sections.map((s) => s.id)
        expect(ids, `${surface}/${audience}`).toContain('never')
        expect(ids, `${surface}/${audience}`).toContain('budget')
      }
    }
  })

  it('only the book-images sheet explains show-the-whole-picture (FEAT-177)', () => {
    for (const surface of SURFACES) {
      for (const audience of AUDIENCES) {
        const ids = artHelp(surface, audience).sections.map((s) => s.id)
        expect(ids.includes('fit'), `${surface}/${audience}`).toBe(surface === 'bookImages')
      }
    }
  })

  it('never prints a budget number in the static copy', () => {
    // The live figures come from `artBudgetLines`, so a change to
    // `DEFAULT_WEEKLY_ART_QUOTA` can never leave a stale number in the help.
    for (const surface of SURFACES) {
      for (const audience of AUDIENCES) {
        const budget = artHelp(surface, audience).sections.find((s) => s.id === 'budget')
        for (const line of budget?.lines ?? []) {
          expect(line, `${surface}/${audience}`).not.toMatch(/\d/)
        }
      }
    }
  })
})

describe('styleBlurb — every look a picker offers', () => {
  it('covers every book illustration style', () => {
    for (const style of GENERATION_STYLES) {
      for (const audience of AUDIENCES) {
        const blurb = styleBlurb(style.value, audience)
        expect(blurb.trim(), `${style.value}/${audience}`).not.toBe('')
        expect(blurb, `${style.value}/${audience}`).not.toBe('A look for your picture.')
      }
    }
  })

  it('covers every sticker look', () => {
    for (const option of FANCY_STYLE_OPTIONS) {
      for (const audience of AUDIENCES) {
        const blurb = styleBlurb(option.id, audience)
        expect(blurb.trim(), `${option.id}/${audience}`).not.toBe('')
        expect(blurb, `${option.id}/${audience}`).not.toBe('A look for your picture.')
      }
    }
  })

  it('tells a parent which outside game each world look is like (FEAT-189)', () => {
    // The owner picked "Platformer World" from a bare label and could not tell
    // it was the Mario-ish one. Help copy only — it names a reference so a
    // parent can choose; it never reaches a prompt.
    expect(styleBlurb('platformer', 'parent')).toContain('Mario')
    expect(styleBlurb('garden-warfare', 'parent')).toContain('Plants vs. Zombies')
    expect(styleBlurb('minecraft', 'parent').toLowerCase()).toContain('voxel')

    // Not in the kid copy: the readability bar, and a six-year-old picks by what
    // the picture looks like.
    for (const id of ['platformer', 'garden-warfare', 'minecraft']) {
      expect(styleBlurb(id, 'kid')).not.toContain('Mario')
      expect(styleBlurb(id, 'kid')).not.toContain('Plants vs. Zombies')
    }
  })

  it('states the FEAT-189 set-dressing rule on the three world looks', () => {
    // What those looks now actually do: the props are conditional on the page's
    // own scene, so the help and the server recipe agree.
    for (const id of ['platformer', 'garden-warfare', 'minecraft']) {
      expect(styleBlurb(id, 'parent'), id).toContain('drops the props')
    }
  })

  it('lists the right looks per surface, with the picker’s own labels', () => {
    expect(artHelpStyles('bookImages').map((s) => s.id)).toEqual(
      GENERATION_STYLES.map((s) => s.value),
    )
    expect(artHelpStyles('generateBook').map((s) => s.id)).toEqual(
      GENERATION_STYLES.map((s) => s.value),
    )
    expect(artHelpStyles('sketch').map((s) => s.id)).toEqual(FANCY_STYLE_OPTIONS.map((o) => o.id))
    expect(artHelpStyles('stickers').map((s) => s.id)).toEqual(FANCY_STYLE_OPTIONS.map((o) => o.id))
    // The Kit Builder has no style picker — its stickers are one fixed look.
    expect(artHelpStyles('kitArt')).toEqual([])
    // FEAT-184: neither the Workshop nor the photo read offers a look.
    expect(artHelpStyles('workshop')).toEqual([])
    expect(artHelpStyles('avatarPhoto')).toEqual([])
  })
})

describe('generateHint — the FEAT-184 doors', () => {
  it('says "up to" when the batch is sized by a step that has not run yet', () => {
    expect(generateHint('workshopGame', 'kid', 15, { atMost: true })).toBe('Up to 15 pictures. Up to 15 art.')
    expect(generateHint('workshopGame', 'parent', 15, { atMost: true })).toBe(
      'The pictures for this game · up to 15 paid image calls',
    )
    // A known count reads as a plain count, `atMost` or not for zero.
    expect(generateHint('workshopGame', 'kid', 9)).toBe('Makes 9 pictures. Uses 9 art.')
    expect(generateHint('workshopRegenerate', 'parent', 8)).toBe('The missing pictures for this game · 8 paid image calls')
    expect(generateHint('workshopGame', 'kid', 0, { atMost: true })).toBe('Makes no pictures. Uses no art.')
  })

  it('never says the photo read makes a picture — it reads one', () => {
    expect(generateHint('avatarPhoto', 'kid')).toBe('Reads your photo. Uses 1 art.')
    expect(generateHint('avatarPhoto', 'parent')).toBe("Reads one photo into your hero's look · 1 paid image call")
  })

  it('holds the kid readability bar on the up-to form and the photo read', () => {
    expectKidWording(generateHint('workshopGame', 'kid', 15, { atMost: true }), 'workshopGame/atMost')
    expectKidWording(generateHint('avatarPhoto', 'kid'), 'avatarPhoto')
  })
})

describe('generateHint — what this tap makes and spends', () => {
  it('names a live count for the batch doors', () => {
    expect(generateHint('makeVersions', 'kid', 3)).toBe('Makes 3 pictures. Uses 3 art.')
    expect(generateHint('illustrateBook', 'kid', 14)).toBe('Makes 14 pictures. Uses 14 art.')
    expect(generateHint('makeVersions', 'parent', 3)).toContain('3 paid image calls')
    expect(generateHint('illustrateBook', 'parent', 14)).toContain('14 paid image calls')
  })

  it('reads singular for a one-picture door', () => {
    expect(generateHint('makeSticker', 'kid')).toBe('Makes 1 sticker. Uses 1 art.')
    expect(generateHint('bookScene', 'kid')).toBe('Makes 1 picture. Uses 1 art.')
    expect(generateHint('bookScene', 'parent')).toContain('1 paid image call')
  })

  it('never claims a fraction of a picture', () => {
    expect(generateHint('makeVersions', 'kid', 2.7)).toBe('Makes 2 pictures. Uses 2 art.')
  })

  it('says zero when zero is the truth (Codex P2, PR #1739)', () => {
    // A resumed Generate-a-Book draft rebuilt with no image prompts has no
    // scene-bearing page: the illustrate loop makes nothing and spends nothing.
    // Clamping to 1 promised a picture and a charge that never happen.
    expect(generateHint('illustrateBook', 'kid', 0)).toBe('Makes no pictures. Uses no art.')
    const parent = generateHint('illustrateBook', 'parent', 0)
    expect(parent).toBe('No pictures to make here · nothing to pay for')
    expect(parent).not.toMatch(/One picture per page/)
  })

  it('never tells an uncapped parent a tap spends their budget (Codex P2, PR #1739)', () => {
    // Every host picks the parent audience from the same capability answer that
    // decides the cap, and a parent's `recordGeneration` is a no-op — so a
    // "weekly art budget" clause contradicted the sheet behind the same "?".
    for (const door of DOORS) {
      for (const count of [1, 3]) {
        const hint = generateHint(door, 'parent', count)
        expect(hint, `${door}/${count}`).not.toMatch(/your weekly art budget/)
        expect(hint, `${door}/${count}`).toMatch(/paid image calls?/)
      }
    }
    // The kid wording is unchanged: a kid IS capped, so "art" is their counter.
    expect(generateHint('bookScene', 'kid', 3)).toBe('Makes 3 pictures. Uses 3 art.')
  })
})

describe('artBudgetLines — the only place a real number is printed', () => {
  it('prints what is actually left, not a baked-in cap', () => {
    expect(artBudgetLines('kid', { limit: 100, remaining: 37, capped: true })).toEqual([
      'You have 37 left this week.',
    ])
    expect(artBudgetLines('parent', { limit: 100, remaining: 37, capped: true })[0]).toContain(
      'out of 100',
    )
  })

  it('is honest and unshaming at nothing left', () => {
    const kid = artBudgetLines('kid', { limit: 100, remaining: 0, capped: true })[0]
    expect(kid).toContain('this week')
    expect(kid).not.toMatch(/fail|error|sorry|too much/i)
  })

  it('says a parent is not capped', () => {
    expect(artBudgetLines('parent', { limit: 100, remaining: Infinity, capped: false })[0]).toContain(
      'not capped',
    )
  })
})

describe('the kid readability bar', () => {
  it('holds for every kid line on every sheet', () => {
    for (const surface of SURFACES) {
      const content = artHelp(surface, 'kid')
      expectKidWording(content.title, `${surface} title`)
      for (const section of content.sections) {
        expectKidWording(section.heading, `${surface}/${section.id} heading`)
        for (const line of section.lines) {
          expectKidLine(line, `${surface}/${section.id}`)
        }
      }
    }
  })

  it('holds for every kid style blurb', () => {
    const ids = new Set([
      ...GENERATION_STYLES.map((s) => s.value as string),
      ...FANCY_STYLE_OPTIONS.map((o) => o.id),
    ])
    for (const id of ids) {
      expectKidLine(styleBlurb(id, 'kid'), `styleBlurb/${id}`)
    }
  })

  it('holds for every kid hint — none, one and many', () => {
    for (const door of DOORS) {
      expectKidLine(generateHint(door, 'kid', 0), `hint/${door}/none`)
      expectKidLine(generateHint(door, 'kid'), `hint/${door}`)
      expectKidLine(generateHint(door, 'kid', 14), `hint/${door}/batch`)
    }
  })

  it('holds for the live kid budget lines', () => {
    for (const budget of [
      { limit: 100, remaining: 37, capped: true },
      { limit: 100, remaining: 0, capped: true },
      { limit: 100, remaining: Infinity, capped: false },
    ]) {
      for (const line of artBudgetLines('kid', budget)) {
        expectKidLine(line, `budget/${budget.remaining}`)
      }
    }
  })
})

describe('the parent copy bar', () => {
  it('keeps every parent line to three sentences or fewer', () => {
    for (const surface of SURFACES) {
      const content = artHelp(surface, 'parent')
      for (const section of content.sections) {
        for (const line of section.lines) {
          expect(sentenceCount(line), `${surface}/${section.id}: "${line}"`).toBeLessThanOrEqual(3)
        }
      }
    }
    for (const id of [
      ...GENERATION_STYLES.map((s) => s.value as string),
      ...FANCY_STYLE_OPTIONS.map((o) => o.id),
    ]) {
      expect(sentenceCount(styleBlurb(id, 'parent')), `styleBlurb/${id}`).toBeLessThanOrEqual(3)
    }
  })
})
