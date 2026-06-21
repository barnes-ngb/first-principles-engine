import type { StickerTag } from '../../core/types'

/** Canonical display order for sticker tags across the sticker UIs. */
export const STICKER_TAGS_ORDERED: StickerTag[] = [
  'animal', 'minecraft', 'fantasy', 'nature', 'character', 'object', 'vehicle', 'food', 'faith', 'other',
]

/** Suggest 2-3 tags from a prompt via keyword matching. */
export function suggestTagsFromPrompt(prompt: string): StickerTag[] {
  const text = prompt.toLowerCase()
  const suggestions: StickerTag[] = []

  if (text.includes('dog') || text.includes('cat') || text.includes('bunny') || text.includes('pig') ||
      text.includes('lion') || text.includes('bear') || text.includes('rabbit') || text.includes('horse') ||
      text.includes('bird') || text.includes('fish') || text.includes('animal') || text.includes('fox') ||
      text.includes('deer') || text.includes('elephant') || text.includes('whale')) {
    suggestions.push('animal')
  }
  if (text.includes('minecraft') || text.includes('creeper') || text.includes('sword') || text.includes('pickaxe') ||
      text.includes('diamond') || text.includes('enderman') || text.includes('cave') || text.includes('nether') ||
      text.includes('crafting') || text.includes('pixel')) {
    suggestions.push('minecraft')
  }
  if (text.includes('dragon') || text.includes('fairy') || text.includes('wizard') || text.includes('magic') ||
      text.includes('unicorn') || text.includes('enchant') || text.includes('potion') || text.includes('fantasy')) {
    suggestions.push('fantasy')
  }
  if (text.includes('tree') || text.includes('flower') || text.includes('nature') || text.includes('grass') ||
      text.includes('mountain') || text.includes('river') || text.includes('forest') || text.includes('ocean') ||
      text.includes('rainbow') || text.includes('sun') || text.includes('moon') || text.includes('star')) {
    suggestions.push('nature')
  }
  if (text.includes('car') || text.includes('truck') || text.includes('train') || text.includes('vehicle') ||
      text.includes('bus') || text.includes('plane') || text.includes('rocket') || text.includes('bike')) {
    suggestions.push('vehicle')
  }
  if (text.includes('food') || text.includes('cake') || text.includes('pizza') || text.includes('cookie') ||
      text.includes('fruit') || text.includes('apple') || text.includes('banana') || text.includes('ice cream')) {
    suggestions.push('food')
  }
  if (text.includes('god') || text.includes('jesus') || text.includes('faith') || text.includes('prayer') ||
      text.includes('cross') || text.includes('bible') || text.includes('angel')) {
    suggestions.push('faith')
  }
  if (suggestions.length === 0) suggestions.push('object')

  return suggestions.slice(0, 3)
}
