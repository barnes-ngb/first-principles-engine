/**
 * Theme inference for a generated book — the surviving half of the retired
 * `useBookGenerator` (FEAT-187).
 *
 * That file held two things: the Story Guide wizard's whole generate-and-save
 * hook, and this pure keyword classifier. The wizard retired with FEAT-187
 * (one "Make a book" door, UX-102 / UX-116 / UX-118) and the hook went with it
 * — it had exactly one caller, `StoryGuidePage`. `inferBookTheme` did not: the
 * Generate chat (`useBookGenerateChat`) and Create a Sight Word Book both call
 * it, so it stays, under a filename that says what is in it.
 */
import type { BookTheme } from '../../core/types'

/**
 * Infer a BookTheme from the story idea text, sight words list, and style.
 * Simple keyword matching — no AI call needed.
 */
export function inferBookTheme(storyIdea: string, words: string[], style: string): BookTheme {
  if (words.length > 0) return 'sight_words'

  const text = (storyIdea + ' ' + style).toLowerCase()

  if (
    text.includes('minecraft') ||
    text.includes('creeper') ||
    text.includes('cave') ||
    text.includes('nether') ||
    text.includes('enderman') ||
    text.includes('pickaxe') ||
    text.includes('diamond') ||
    text.includes('crafting')
  ) return 'minecraft'

  if (
    text.includes('animal') ||
    text.includes('dog') ||
    text.includes('cat') ||
    text.includes('bunny') ||
    text.includes('rabbit') ||
    text.includes('bear') ||
    text.includes('lion') ||
    text.includes('horse') ||
    text.includes('pig') ||
    text.includes('bird') ||
    text.includes('fish') ||
    text.includes('fox') ||
    text.includes('deer') ||
    text.includes('whale') ||
    text.includes('elephant')
  ) return 'animals'

  if (
    text.includes('dragon') ||
    text.includes('fairy') ||
    text.includes('wizard') ||
    text.includes('magic') ||
    text.includes('princess') ||
    text.includes('castle') ||
    text.includes('unicorn') ||
    text.includes('enchant') ||
    text.includes('potion')
  ) return 'fantasy'

  if (
    text.includes('adventure') ||
    text.includes('quest') ||
    text.includes('hero') ||
    text.includes('journey') ||
    text.includes('explore') ||
    text.includes('mission') ||
    text.includes('treasure') ||
    text.includes('sword') ||
    text.includes('knight')
  ) return 'adventure'

  if (
    text.includes('family') ||
    text.includes('mom') ||
    text.includes('dad') ||
    text.includes('brother') ||
    text.includes('sister') ||
    text.includes('grandma') ||
    text.includes('grandpa')
  ) return 'family'

  if (
    text.includes('science') ||
    text.includes('robot') ||
    text.includes('space') ||
    text.includes('planet') ||
    text.includes('experiment') ||
    text.includes('lab')
  ) return 'science'

  if (
    text.includes('faith') ||
    text.includes('god') ||
    text.includes('jesus') ||
    text.includes('prayer') ||
    text.includes('bible') ||
    text.includes('church')
  ) return 'faith'

  return 'other'
}
