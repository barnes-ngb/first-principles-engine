import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { AdventureNode, AdventureTree, CardGameData, StoryInputs } from '../../core/types'
import {
  buildAdventureArtRequests,
  buildArtRequests,
  buildCardGameArtRequests,
  generateAdventureArt,
  generateAllArt,
  generateCardGameArt,
  regenerateFailedArt,
  WORKSHOP_ART_STYLE,
} from './workshopArt'
import type { GenerateImageFn } from './workshopArt'
import { artHelp } from '../books/artHelpContent'

// ── FEAT-193 / UX-163: the Workshop's look is real, and the help says so ────
//
// Every Workshop picture was sent as `style: 'general'` — which resolves to
// `STYLE_PREFIXES.general`, the empty string — so no look table reached the
// Workshop at all, while `artHelpContent` told the parent "every picture is made
// in one children's-game look; there is no style picker here". The only art
// direction it had was three inline adjective phrases ("children's board game
// art style, vibrant, fun") interpolated into the prompts, which are the exact
// adjective-only strings FEAT-159 and FEAT-174 found collapsing.

const inputs = (over: Partial<StoryInputs> = {}): StoryInputs =>
  ({
    theme: 'underwater',
    boardStyle: 'winding',
    players: [{ id: 'child-1', name: 'London' }],
    parents: [{ id: 'p1', name: 'Dad' }],
    ...over,
  }) as unknown as StoryInputs

const adventure = (): AdventureTree =>
  ({
    rootNodeId: 'n0',
    nodes: {
      n0: { id: 'n0', text: 'Scene n0', choices: [], illustration: 'a reef' },
    } as unknown as Record<string, AdventureNode>,
  }) as unknown as AdventureTree

const cardGame = (): CardGameData =>
  ({
    mechanic: 'matching',
    cards: [{ id: 'c0', category: 'fish', artPrompt: 'a fish', value: 1 }],
  }) as unknown as CardGameData

const recordingGenerator = () => {
  const styles: (string | undefined)[] = []
  const fn: GenerateImageFn = vi.fn(async (req) => {
    styles.push(req.style)
    return { url: `https://x/${styles.length}.png`, storagePath: '' }
  })
  return { fn, styles }
}

describe('every Workshop picture is sent in the one game look', () => {
  it('names a style that is not the empty `general` prefix', () => {
    expect(WORKSHOP_ART_STYLE).toBe('game-art')
    expect(WORKSHOP_ART_STYLE).not.toBe('general')
  })

  it('board art sends it', async () => {
    const { fn, styles } = recordingGenerator()
    await generateAllArt(fn, 'fam-1', inputs())
    expect(styles.length).toBeGreaterThan(0)
    expect(new Set(styles)).toEqual(new Set([WORKSHOP_ART_STYLE]))
  })

  it('adventure art sends it', async () => {
    const { fn, styles } = recordingGenerator()
    await generateAdventureArt(fn, 'fam-1', inputs(), adventure())
    expect(styles.length).toBeGreaterThan(0)
    expect(new Set(styles)).toEqual(new Set([WORKSHOP_ART_STYLE]))
  })

  it('card game art sends it', async () => {
    const { fn, styles } = recordingGenerator()
    await generateCardGameArt(fn, 'fam-1', inputs(), cardGame())
    expect(styles.length).toBeGreaterThan(0)
    expect(new Set(styles)).toEqual(new Set([WORKSHOP_ART_STYLE]))
  })

  it('"Regenerate Art" sends it', async () => {
    const { fn, styles } = recordingGenerator()
    await regenerateFailedArt(fn, 'fam-1', inputs(), undefined, undefined)
    expect(styles.length).toBeGreaterThan(0)
    expect(new Set(styles)).toEqual(new Set([WORKSHOP_ART_STYLE]))
  })

  it('the after-the-words title card sends it too', () => {
    // The fifth call site is inline in `WorkshopPage` (it needs the title the
    // writing step just produced), so it is checked at source: no Workshop
    // generation may go out as `general`.
    const page = readFileSync(
      join(__dirname, 'WorkshopPage.tsx'),
      'utf8',
    )
    expect(page).toContain('style: WORKSHOP_ART_STYLE,')
    expect(page).not.toContain("style: 'general',")
  })
})

describe('the prompts carry subject and format, never a look', () => {
  // The look now lives in one place — the `game-art` recipe on the server. A
  // second art direction in the prompt would be exactly the collapse FEAT-159
  // named, and the "one recipe, ever" rule `buildEnhancePrompt` states.
  const LOOK_PHRASES = [
    'art style',
    'illustration style',
    'vibrant',
    'colorful',
    'pixel art',
    'storybook',
  ]

  const allPrompts = () => [
    ...buildArtRequests(inputs(), 'The Reef').map((r) => r.prompt),
    ...buildAdventureArtRequests(inputs(), adventure()).map((r) => r.prompt),
    ...buildCardGameArtRequests(inputs(), cardGame()).map((r) => r.prompt),
  ]

  it('names no look adjective in any built prompt', () => {
    for (const prompt of allPrompts()) {
      const named = LOOK_PHRASES.filter((phrase) =>
        prompt.toLowerCase().includes(phrase),
      )
      expect(named, `"${prompt}" still carries ${named.join(', ')}`).toHaveLength(0)
    }
  })

  it('keeps the subject and the format', () => {
    const prompts = allPrompts()
    expect(prompts.some((p) => p.includes('underwater'))).toBe(true)
    expect(prompts.every((p) => p.includes('no text'))).toBe(true)
  })
})

describe('the help sheet describes the look that is actually sent', () => {
  it('still claims one fixed look, and now it is one', () => {
    const lines = artHelp('workshop', 'parent').sections.flatMap((s) => s.lines)
    const claim = lines.find((line) => line.includes("children's-game look"))
    expect(claim).toBeDefined()
    expect(claim).toContain('no style picker')
  })
})
