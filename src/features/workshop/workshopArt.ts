import type { ImageGenRequest, ImageGenResponse } from '../../core/ai/useAI'
import type { AdventureTree, CardGameData, GeneratedArt, StoryInputs } from '../../core/types'
import type { GameType } from '../../core/types/workshop'

// ── DALL-E Prompt Builders ───────────────────────────────────────

/**
 * The look every Game Workshop picture is drawn in (FEAT-193 / UX-163).
 *
 * Every call site here used to send `style: 'general'` — which resolves to the
 * empty prefix — while `artHelpContent.ts` told the parent "every picture is
 * made in one children's-game look; there is no style picker here". No look
 * table reached the Workshop at all. Its only art direction was three inline
 * adjective phrases ("children's board game art style, vibrant, fun";
 * "storybook illustration style"; "children's game card art style, simple,
 * colorful") interpolated into the prompts below — the exact adjective-only
 * strings FEAT-159 and FEAT-174 diagnosed as collapsing toward one generic
 * children's-illustration look.
 *
 * Those phrases are gone from the prompts and this style carries the look
 * instead: one `VisualRecipe` (`GAME_ART_RECIPE` in
 * `functions/src/ai/imageTasks/generateImage.ts`) naming palette, line and
 * shading, applied identically to boards, title cards, challenge cards and
 * tokens. The prompts below now carry only subject and format — what is in the
 * picture and what shape it has to be — which is the split FEAT-189 established.
 */
export const WORKSHOP_ART_STYLE = 'game-art' as const

export type ArtImageType =
  | 'board'
  | 'title'
  | 'card-reading'
  | 'card-math'
  | 'card-story'
  | 'card-action'
  | 'parent-token'

interface ArtRequest {
  imageType: ArtImageType
  prompt: string
  size: '1024x1024' | '256x256'
  /** For parent tokens, identifies which parent */
  parentId?: string
}

function buildBoardPrompt(theme: string, boardStyle: string): string {
  return `A ${theme} themed game board background, top-down bird's eye view, ${boardStyle} layout visible, no text`
}

function buildTitlePrompt(theme: string, title?: string): string {
  const titlePart = title ? `called '${title}', ` : ''
  return `A title card illustration for a children's board game ${titlePart}${theme} themed, centered composition, no text`
}

function buildCardPrompt(theme: string, cardType: string): string {
  const descriptions: Record<string, string> = {
    reading:
      'a reading challenge card illustration, an open book with magical sparkles',
    math: 'a math challenge card illustration, numbers and counting objects',
    story:
      'a storytelling challenge card illustration, a speech bubble with stars',
    action:
      'an action challenge card illustration, a character jumping or moving',
  }
  const desc = descriptions[cardType] ?? 'a challenge card illustration'
  return `A ${theme} themed ${desc}, centered on the card, no text`
}

function buildParentTokenPrompt(theme: string, parentName: string): string {
  return `A friendly cute ${theme}-themed game piece token for ${parentName}, circular icon, on transparent background, no text`
}

const BOARD_STYLE_LABELS: Record<string, string> = {
  winding: 'winding path',
  grid: 'grid',
  circle: 'circular',
}

// ── Art Request Assembly ─────────────────────────────────────────

export function buildArtRequests(
  inputs: StoryInputs,
  gameTitle?: string,
): ArtRequest[] {
  const theme = inputs.theme
  const boardStyle =
    BOARD_STYLE_LABELS[inputs.boardStyle] ?? inputs.boardStyle

  const requests: ArtRequest[] = [
    {
      imageType: 'board',
      prompt: buildBoardPrompt(theme, boardStyle),
      size: '1024x1024',
    },
    {
      imageType: 'title',
      prompt: buildTitlePrompt(theme, gameTitle),
      size: '1024x1024',
    },
    {
      imageType: 'card-reading',
      prompt: buildCardPrompt(theme, 'reading'),
      size: '1024x1024',
    },
    {
      imageType: 'card-math',
      prompt: buildCardPrompt(theme, 'math'),
      size: '1024x1024',
    },
    {
      imageType: 'card-story',
      prompt: buildCardPrompt(theme, 'story'),
      size: '1024x1024',
    },
    {
      imageType: 'card-action',
      prompt: buildCardPrompt(theme, 'action'),
      size: '1024x1024',
    },
  ]

  // Only generate parent tokens for selected parents
  for (const player of inputs.players) {
    if (player.id === 'parent-shelly' || player.id === 'parent-nathan') {
      const parentName =
        player.id === 'parent-shelly' ? 'Mom' : 'Dad'
      requests.push({
        imageType: 'parent-token',
        prompt: buildParentTokenPrompt(theme, parentName),
        size: '256x256',
        parentId: player.id,
      })
    }
  }

  return requests
}

// ── Parallel Art Generation ──────────────────────────────────────

export type GenerateImageFn = (request: ImageGenRequest) => Promise<ImageGenResponse | null>

export interface ArtGenerationResult {
  art: GeneratedArt
  /** Image types that failed to generate */
  failures: ArtImageType[]
}

/**
 * Fire all art generation requests in parallel using Promise.allSettled.
 * Individual failures are caught and logged — they never block game creation.
 */
export async function generateAllArt(
  generateImage: GenerateImageFn,
  familyId: string,
  inputs: StoryInputs,
  gameTitle?: string,
): Promise<ArtGenerationResult> {
  const requests = buildArtRequests(inputs, gameTitle)

  const results = await Promise.allSettled(
    requests.map(async (req) => {
      const response = await generateImage({
        familyId,
        prompt: req.prompt,
        style: WORKSHOP_ART_STYLE,
        size: '1024x1024',
      })
      return { ...req, response }
    }),
  )

  const art: GeneratedArt = {}
  const failures: ArtImageType[] = []

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Art generation failed:', result.reason)
      failures.push('board') // can't determine which — logged elsewhere
      continue
    }

    const { imageType, response, parentId } = result.value
    if (!response?.url) {
      failures.push(imageType)
      continue
    }

    switch (imageType) {
      case 'board':
        art.boardBackground = response.url
        break
      case 'title':
        art.titleScreen = response.url
        break
      case 'card-reading':
        art.cardArt = { ...art.cardArt, reading: response.url }
        break
      case 'card-math':
        art.cardArt = { ...art.cardArt, math: response.url }
        break
      case 'card-story':
        art.cardArt = { ...art.cardArt, story: response.url }
        break
      case 'card-action':
        art.cardArt = { ...art.cardArt, action: response.url }
        break
      case 'parent-token':
        if (parentId) {
          art.parentTokens = {
            ...art.parentTokens,
            [parentId]: response.url,
          }
        }
        break
    }
  }

  return { art, failures }
}

// ── Adventure Art Generation ─────────────────────────────────────

interface AdventureArtResult {
  art: GeneratedArt
  failures: string[]
}

/**
 * Generate art for an adventure: title screen + key scene illustrations.
 * Generates for root, major choice points, and endings (up to 5 scenes).
 */
export async function generateAdventureArt(
  generateImage: GenerateImageFn,
  familyId: string,
  inputs: StoryInputs,
  adventure: AdventureTree,
): Promise<AdventureArtResult> {
  const art: GeneratedArt = {}
  const failures: string[] = []
  const requests = buildAdventureArtRequests(inputs, adventure)

  const results = await Promise.allSettled(
    requests.map(async (req) => {
      const response = await generateImage({
        familyId,
        prompt: req.prompt,
        style: WORKSHOP_ART_STYLE,
        size: '1024x1024',
      })
      return { key: req.key, response }
    }),
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      failures.push('unknown')
      continue
    }
    const { key, response } = result.value
    if (!response?.url) {
      failures.push(key)
      continue
    }

    if (key === 'title') {
      art.titleScreen = response.url
    } else if (key.startsWith('scene-')) {
      const nodeId = key.replace('scene-', '')
      art.sceneArt = { ...art.sceneArt, [nodeId]: response.url }
    } else if (key.startsWith('card-')) {
      const cType = key.replace('card-', '') as 'reading' | 'math' | 'story' | 'action'
      art.cardArt = { ...art.cardArt, [cType]: response.url }
    }
  }

  return { art, failures }
}

/** One keyed picture request — the key says where the URL lands on `GeneratedArt`. */
export interface KeyedArtRequest {
  key: string
  prompt: string
}

/**
 * Every picture an adventure will make, in order: title, key scenes, one card
 * per challenge type. Pure and exported (FEAT-184) so the page can size the
 * batch — and reserve it whole against the weekly art budget — before a single
 * call is spent. `generateAdventureArt` consumes exactly this list; there is no
 * second definition of what an adventure draws.
 */
export function buildAdventureArtRequests(
  inputs: StoryInputs,
  adventure: AdventureTree,
): KeyedArtRequest[] {
  const theme = inputs.theme

  // Collect key nodes: root, nodes with illustration fields, and endings (max 5)
  const keyNodeIds: string[] = [adventure.rootNodeId]
  const nodes = Object.values(adventure.nodes)

  for (const node of nodes) {
    if (node.id === adventure.rootNodeId) continue
    if (node.illustration) keyNodeIds.push(node.id)
    if (node.isEnding && node.endingType === 'victory') keyNodeIds.push(node.id)
    if (keyNodeIds.length >= 6) break // title + 5 scenes
  }

  // Build requests
  const requests: Array<{ key: string; prompt: string }> = [
    {
      key: 'title',
      prompt: `A title card illustration for a children's choose-your-adventure story, ${theme} themed, centered composition, no text`,
    },
  ]

  for (const nodeId of keyNodeIds) {
    const node = adventure.nodes[nodeId]
    if (!node) continue
    const desc = node.illustration ?? node.text.slice(0, 100)
    requests.push({
      key: `scene-${nodeId}`,
      prompt: `An illustrated scene: ${desc}, ${theme} themed, no text`,
    })
  }

  // Card art for challenge types present in the adventure
  const challengeTypes = new Set<string>()
  for (const node of nodes) {
    if (node.challenge) challengeTypes.add(node.challenge.type)
  }
  for (const cType of challengeTypes) {
    requests.push({
      key: `card-${cType}`,
      prompt: buildCardPrompt(theme, cType),
    })
  }

  return requests
}

// ── Card Game Art Generation ─────────────────────────────────────

interface CardGameArtResult {
  art: GeneratedArt
  failures: string[]
}

/**
 * Generate art for a card game: title screen + card back + card face art.
 * Cost management:
 * - Matching: 1 image per pair (6-12 images)
 * - Collecting: 1 image per set (4-6 images)
 * - Battle: art for top 6-8 cards by power + 1 generic
 * Maximum 15 DALL-E calls (title + back + up to 13 card faces)
 */
export async function generateCardGameArt(
  generateImage: GenerateImageFn,
  familyId: string,
  inputs: StoryInputs,
  cardGame: CardGameData,
): Promise<CardGameArtResult> {
  const art: GeneratedArt = {}
  const failures: string[] = []
  const capped = buildCardGameArtRequests(inputs, cardGame)

  const results = await Promise.allSettled(
    capped.map(async (req) => {
      const response = await generateImage({
        familyId,
        prompt: req.prompt,
        style: WORKSHOP_ART_STYLE,
        size: '1024x1024',
      })
      return { key: req.key, response }
    }),
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      failures.push('unknown')
      continue
    }
    const { key, response } = result.value
    if (!response?.url) {
      failures.push(key)
      continue
    }

    if (key === 'title') {
      art.titleScreen = response.url
    } else if (key === 'cardBack') {
      art.cardBack = response.url
    } else if (key.startsWith('face-')) {
      const faceKey = key.replace('face-', '')
      art.cardFaces = { ...art.cardFaces, [faceKey]: response.url }
    }
  }

  return { art, failures }
}

/**
 * Every picture a card game will make, already capped at 15: title, card back,
 * then the faces the mechanic needs. Pure and exported (FEAT-184) so the page
 * can reserve the batch whole before spending it. `generateCardGameArt`
 * consumes exactly this list.
 */
export function buildCardGameArtRequests(
  inputs: StoryInputs,
  cardGame: CardGameData,
): KeyedArtRequest[] {
  const theme = inputs.theme

  const requests: KeyedArtRequest[] = []

  // Title screen
  requests.push({
    key: 'title',
    prompt: `A title card illustration for a children's card game, ${theme} themed, centered composition, no text`,
  })

  // Card back design
  const cardBackDesc = inputs.cardBackStyle === 'custom' && inputs.cardBackCustom
    ? inputs.cardBackCustom
    : inputs.cardBackStyle === 'decorated'
      ? `detailed ${theme} illustrations`
      : `simple elegant pattern`
  requests.push({
    key: 'cardBack',
    prompt: `A card back design for a children's card game, ${theme} themed, ${cardBackDesc}, repeating pattern, symmetrical, no text`,
  })

  // Card face art — varies by mechanic
  if (cardGame.mechanic === 'matching') {
    // 1 image per unique category (pair)
    const categories = new Set(cardGame.cards.map((c) => c.category).filter(Boolean))
    let count = 0
    for (const category of categories) {
      if (count >= 13) break // cap at 13 card faces
      const card = cardGame.cards.find((c) => c.category === category)
      requests.push({
        key: `face-${category}`,
        prompt: `A children's card game illustration of ${card?.artPrompt ?? category}, ${theme} themed, centered on the card, no text`,
      })
      count++
    }
  } else if (cardGame.mechanic === 'collecting') {
    // 1 image per set (category)
    const categories = new Set(cardGame.cards.map((c) => c.category).filter(Boolean))
    let count = 0
    for (const category of categories) {
      if (count >= 13) break
      const card = cardGame.cards.find((c) => c.category === category)
      requests.push({
        key: `face-${category}`,
        prompt: `A children's card game illustration of ${card?.artPrompt ?? category}, ${theme} themed, centered on the card, no text`,
      })
      count++
    }
  } else {
    // Battle: top cards by power value + 1 generic
    const sorted = [...cardGame.cards].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    const topCards = sorted.slice(0, 8)
    for (const card of topCards) {
      requests.push({
        key: `face-${card.id}`,
        prompt: `A children's card game battle card illustration of ${card.artPrompt}, ${theme} themed, dynamic, centered on the card, no text`,
      })
    }
    // Generic card for remaining
    requests.push({
      key: 'face-generic',
      prompt: `A generic children's card game battle card illustration, ${theme} themed, a simple warrior or creature, centered on the card, no text`,
    })
  }

  // Cap total at 15
  return requests.slice(0, WORKSHOP_ART_MAX_CALLS.cards)
}

// ── Sizing a game's art before it is made (FEAT-184) ────────────────────────

/**
 * The most pictures each game type can make in one "Create My Game!". The
 * board count is exact once the inputs are known (see
 * `estimateWorkshopArtCalls`); these two are ceilings, because an adventure's
 * scenes and a card game's faces are sized by the writing step that has not
 * run yet when the child is looking at the button.
 *
 *  - adventure: title (1) + key scenes (root + up to 5 = 6) + one card per
 *    challenge type (up to 4) = 11
 *  - cards: title + card back + up to 13 faces, hard-capped in
 *    `buildCardGameArtRequests` = 15
 */
export const WORKSHOP_ART_MAX_CALLS = {
  adventure: 11,
  cards: 15,
} as const

/**
 * The board flow makes one more picture than `buildArtRequests` lists: the
 * page draws a second title card *after* the writing step, with the game's
 * real title (`WorkshopPage` board branch). It is a paid call like the rest.
 */
export const BOARD_TITLE_AFTER_WORDS = 1

/**
 * How many pictures "Create My Game!" will spend for these inputs — the number
 * the hint prints and the number the page reserves. `atMost` says the figure
 * is a ceiling (adventure, cards) rather than the exact batch (board).
 */
export function estimateWorkshopArtCalls(
  gameType: GameType,
  inputs: StoryInputs,
  gameTitle?: string,
): { count: number; atMost: boolean } {
  switch (gameType) {
    case 'adventure':
      return { count: WORKSHOP_ART_MAX_CALLS.adventure, atMost: true }
    case 'cards':
      return { count: WORKSHOP_ART_MAX_CALLS.cards, atMost: true }
    default:
      return { count: buildArtRequests(inputs, gameTitle).length + BOARD_TITLE_AFTER_WORDS, atMost: false }
  }
}

/**
 * Regenerate only the art pieces that previously failed.
 * Returns a partial GeneratedArt with only the newly generated pieces.
 */
export async function regenerateFailedArt(
  generateImage: GenerateImageFn,
  familyId: string,
  inputs: StoryInputs,
  existingArt: GeneratedArt | undefined,
  gameTitle?: string,
): Promise<ArtGenerationResult> {
  const allRequests = buildArtRequests(inputs, gameTitle)

  // Filter to only missing art
  const missingRequests = allRequests.filter((req) => {
    if (!existingArt) return true
    switch (req.imageType) {
      case 'board':
        return !existingArt.boardBackground
      case 'title':
        return !existingArt.titleScreen
      case 'card-reading':
        return !existingArt.cardArt?.reading
      case 'card-math':
        return !existingArt.cardArt?.math
      case 'card-story':
        return !existingArt.cardArt?.story
      case 'card-action':
        return !existingArt.cardArt?.action
      case 'parent-token':
        return !existingArt.parentTokens?.[req.parentId ?? '']
      default:
        return true
    }
  })

  if (missingRequests.length === 0) {
    return { art: existingArt ?? {}, failures: [] }
  }

  const results = await Promise.allSettled(
    missingRequests.map(async (req) => {
      const response = await generateImage({
        familyId,
        prompt: req.prompt,
        style: WORKSHOP_ART_STYLE,
        size: '1024x1024',
      })
      return { ...req, response }
    }),
  )

  const art: GeneratedArt = { ...existingArt }
  const failures: ArtImageType[] = []

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Art regeneration failed:', result.reason)
      continue
    }

    const { imageType, response, parentId } = result.value
    if (!response?.url) {
      failures.push(imageType)
      continue
    }

    switch (imageType) {
      case 'board':
        art.boardBackground = response.url
        break
      case 'title':
        art.titleScreen = response.url
        break
      case 'card-reading':
        art.cardArt = { ...art.cardArt, reading: response.url }
        break
      case 'card-math':
        art.cardArt = { ...art.cardArt, math: response.url }
        break
      case 'card-story':
        art.cardArt = { ...art.cardArt, story: response.url }
        break
      case 'card-action':
        art.cardArt = { ...art.cardArt, action: response.url }
        break
      case 'parent-token':
        if (parentId) {
          art.parentTokens = {
            ...art.parentTokens,
            [parentId]: response.url,
          }
        }
        break
    }
  }

  return { art, failures }
}
