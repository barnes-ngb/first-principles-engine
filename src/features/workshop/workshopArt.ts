import type { ImageGenRequest, ImageGenResponse } from '../../core/ai/useAI'
import type { AdventureTree, CardGameData, GeneratedArt, StoryInputs } from '../../core/types'

// ── DALL-E Prompt Builders ───────────────────────────────────────

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
  return `A colorful illustrated ${theme} themed game board background, top-down bird's eye view, ${boardStyle} layout visible, children's board game art style, vibrant, fun, no text`
}

function buildTitlePrompt(theme: string, title?: string): string {
  const titlePart = title ? `called '${title}', ` : ''
  return `A title card illustration for a children's board game ${titlePart}${theme} themed, exciting, colorful, storybook illustration style, centered composition, no text`
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
  return `A ${theme} themed ${desc}, children's game card art style, simple, colorful, no text`
}

function buildParentTokenPrompt(theme: string, parentName: string): string {
  return `A friendly cute ${theme}-themed game piece token for ${parentName}, pixel art style, circular icon, simple, colorful, on transparent background, no text`
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
        style: 'general',
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
  const theme = inputs.theme
  const art: GeneratedArt = {}
  const failures: string[] = []

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
      prompt: `A title card illustration for a children's choose-your-adventure story, ${theme} themed, exciting, colorful, storybook illustration style, centered composition, no text`,
    },
  ]

  for (const nodeId of keyNodeIds) {
    const node = adventure.nodes[nodeId]
    if (!node) continue
    const desc = node.illustration ?? node.text.slice(0, 100)
    requests.push({
      key: `scene-${nodeId}`,
      prompt: `A storybook illustration scene: ${desc}, ${theme} themed, colorful, children's book art style, no text`,
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

  const results = await Promise.allSettled(
    requests.map(async (req) => {
      const response = await generateImage({
        familyId,
        prompt: req.prompt,
        style: 'general',
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
  const theme = inputs.theme
  const art: GeneratedArt = {}
  const failures: string[] = []

  const requests: Array<{ key: string; prompt: string }>  = []

  // Title screen
  requests.push({
    key: 'title',
    prompt: `A title card illustration for a children's card game, ${theme} themed, exciting, colorful, storybook illustration style, centered composition, no text`,
  })

  // Card back design
  const cardBackDesc = inputs.cardBackStyle === 'custom' && inputs.cardBackCustom
    ? inputs.cardBackCustom
    : inputs.cardBackStyle === 'decorated'
      ? `detailed ${theme} illustrations`
      : `simple elegant pattern`
  requests.push({
    key: 'cardBack',
    prompt: `A card back design for a children's card game, ${theme} themed, ${cardBackDesc}, repeating pattern, symmetrical, colorful, no text`,
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
        prompt: `A children's card game illustration of ${card?.artPrompt ?? category}, ${theme} themed, colorful, simple, card art style, no text`,
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
        prompt: `A children's card game illustration of ${card?.artPrompt ?? category}, ${theme} themed, colorful, simple, card art style, no text`,
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
        prompt: `A children's card game battle card illustration of ${card.artPrompt}, ${theme} themed, dynamic, powerful, colorful, no text`,
      })
    }
    // Generic card for remaining
    requests.push({
      key: 'face-generic',
      prompt: `A generic children's card game battle card illustration, ${theme} themed, simple warrior/creature, colorful, no text`,
    })
  }

  // Cap total at 15
  const capped = requests.slice(0, 15)

  const results = await Promise.allSettled(
    capped.map(async (req) => {
      const response = await generateImage({
        familyId,
        prompt: req.prompt,
        style: 'general',
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
        style: 'general',
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
