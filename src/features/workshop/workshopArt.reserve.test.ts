import { describe, expect, it, vi } from 'vitest'

import type { AdventureNode, AdventureTree, CardGameData, StoryInputs } from '../../core/types'
import {
  BOARD_TITLE_AFTER_WORDS,
  buildAdventureArtRequests,
  buildArtRequests,
  buildCardGameArtRequests,
  estimateWorkshopArtCalls,
  generateAdventureArt,
  generateCardGameArt,
  WORKSHOP_ART_MAX_CALLS,
} from './workshopArt'
import type { GenerateImageFn } from './workshopArt'

// ── FEAT-184: the page sizes a game's art before it spends it ───────────────
//
// The builders are what the generators consume, so the number the page
// reserves is the number of calls the generator makes — by construction, not
// by a hand-kept count.

const inputs = (over: Partial<StoryInputs> = {}): StoryInputs =>
  ({
    theme: 'underwater',
    boardStyle: 'winding',
    players: [{ id: 'child-1', name: 'London' }],
    ...over,
  }) as unknown as StoryInputs

function node(id: string, over: Partial<AdventureNode> = {}): AdventureNode {
  return { id, text: `Scene ${id}`, choices: [], ...over } as unknown as AdventureNode
}

function adventure(nodeCount: number, challengeTypes: string[] = []): AdventureTree {
  const nodes: Record<string, AdventureNode> = {}
  for (let i = 0; i < nodeCount; i++) {
    const id = `n${i}`
    nodes[id] = node(id, {
      illustration: `illustration ${i}`,
      ...(challengeTypes[i] ? { challenge: { type: challengeTypes[i] } } : {}),
    } as Partial<AdventureNode>)
  }
  return { rootNodeId: 'n0', nodes } as unknown as AdventureTree
}

function cardGame(mechanic: 'matching' | 'collecting' | 'battle', faces: number): CardGameData {
  const cards = Array.from({ length: faces }, (_, i) => ({
    id: `c${i}`,
    category: `cat-${i}`,
    artPrompt: `thing ${i}`,
    value: i,
  }))
  return { mechanic, cards } as unknown as CardGameData
}

const recordingGenerator = () => {
  const prompts: string[] = []
  const fn: GenerateImageFn = vi.fn(async (req) => {
    prompts.push(req.prompt)
    return { url: `https://x/${prompts.length}.png`, storagePath: '' }
  })
  return { fn, prompts }
}

describe('the generators spend exactly what the builders list', () => {
  it('adventure: one call per built request, in order', async () => {
    const tree = adventure(4, ['reading', 'math'])
    const requests = buildAdventureArtRequests(inputs(), tree)
    const { fn, prompts } = recordingGenerator()
    await generateAdventureArt(fn, 'fam-1', inputs(), tree)
    expect(prompts).toEqual(requests.map((r) => r.prompt))
  })

  it('card game: one call per built request, already capped at 15', async () => {
    const game = cardGame('matching', 40)
    const requests = buildCardGameArtRequests(inputs(), game)
    expect(requests.length).toBe(WORKSHOP_ART_MAX_CALLS.cards)
    const { fn, prompts } = recordingGenerator()
    await generateCardGameArt(fn, 'fam-1', inputs(), game)
    expect(prompts).toEqual(requests.map((r) => r.prompt))
  })
})

describe('the ceilings hold for any writing-step output', () => {
  it('an adventure never lists more than the adventure ceiling', () => {
    const huge = adventure(40, ['reading', 'math', 'story', 'action', 'reading'])
    expect(buildAdventureArtRequests(inputs(), huge).length).toBeLessThanOrEqual(WORKSHOP_ART_MAX_CALLS.adventure)
    // title + root + 5 illustrated + 4 card types = the ceiling exactly
    expect(buildAdventureArtRequests(inputs(), huge).length).toBe(WORKSHOP_ART_MAX_CALLS.adventure)
  })

  it('a card game never lists more than the card ceiling, whatever the mechanic', () => {
    for (const mechanic of ['matching', 'collecting', 'battle'] as const) {
      expect(buildCardGameArtRequests(inputs(), cardGame(mechanic, 60)).length).toBeLessThanOrEqual(
        WORKSHOP_ART_MAX_CALLS.cards,
      )
    }
  })
})

describe('estimateWorkshopArtCalls — the number the hint prints and the page reserves', () => {
  it('board: exact — the board set plus the title drawn after the words', () => {
    const solo = inputs()
    expect(estimateWorkshopArtCalls('board', solo)).toEqual({
      count: buildArtRequests(solo).length + BOARD_TITLE_AFTER_WORDS,
      atMost: false,
    })
    // 6 base pictures + 1 title after the words, no grown-ups playing
    expect(estimateWorkshopArtCalls('board', solo).count).toBe(7)
    // Each grown-up in the game adds a token
    const withParents = inputs({
      players: [{ id: 'child-1', name: 'London' }, { id: 'parent-shelly', name: 'Mom' }, { id: 'parent-nathan', name: 'Dad' }],
    } as Partial<StoryInputs>)
    expect(estimateWorkshopArtCalls('board', withParents).count).toBe(9)
  })

  it('adventure and cards: a ceiling, flagged as one', () => {
    expect(estimateWorkshopArtCalls('adventure', inputs())).toEqual({ count: 11, atMost: true })
    expect(estimateWorkshopArtCalls('cards', inputs())).toEqual({ count: 15, atMost: true })
  })
})
