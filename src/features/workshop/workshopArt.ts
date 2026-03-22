import type { ImageGenRequest, ImageGenResponse } from '../../core/ai/useAI'
import type { GeneratedArt, StoryInputs } from '../../core/types'

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
