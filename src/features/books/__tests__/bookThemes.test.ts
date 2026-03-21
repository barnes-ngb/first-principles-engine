import { describe, expect, it } from 'vitest'
import { inferBookTheme } from '../useBookGenerator'
import { BOOK_THEMES } from '../../../core/types'
import type { BookTheme } from '../../../core/types'

// ── inferBookTheme ────────────────────────────────────────────────

describe('inferBookTheme', () => {
  it('returns sight_words when words are provided', () => {
    expect(inferBookTheme('any story', ['the', 'is'], 'storybook')).toBe('sight_words')
  })

  it('returns sight_words even if storyIdea has minecraft keywords', () => {
    expect(inferBookTheme('creeper in the nether', ['jump', 'run'], 'minecraft')).toBe('sight_words')
  })

  it('infers minecraft from story idea with creeper', () => {
    expect(inferBookTheme('a creeper appeared in the cave', [], 'storybook')).toBe('minecraft')
  })

  it('infers minecraft from style', () => {
    expect(inferBookTheme('hero goes on a journey', [], 'minecraft')).toBe('minecraft')
  })

  it('infers minecraft from story idea with diamond', () => {
    expect(inferBookTheme('Steve found a diamond pickaxe', [], 'storybook')).toBe('minecraft')
  })

  it('infers animals from story idea with bunny', () => {
    expect(inferBookTheme('a bunny went to the garden', [], 'storybook')).toBe('animals')
  })

  it('infers animals from story idea with elephant', () => {
    expect(inferBookTheme('the elephant helped its friend', [], 'storybook')).toBe('animals')
  })

  it('infers fantasy from story idea with dragon', () => {
    expect(inferBookTheme('a dragon guards the magic castle', [], 'storybook')).toBe('fantasy')
  })

  it('infers fantasy from story idea with unicorn', () => {
    expect(inferBookTheme('a unicorn with enchanted powers', [], 'storybook')).toBe('fantasy')
  })

  it('infers adventure from story idea with treasure', () => {
    expect(inferBookTheme('seeking treasure on a quest', [], 'storybook')).toBe('adventure')
  })

  it('infers adventure from story idea with knight', () => {
    expect(inferBookTheme('a brave knight on a journey', [], 'storybook')).toBe('adventure')
  })

  it('infers family from story idea with grandma', () => {
    expect(inferBookTheme('grandma and grandpa baked a pie', [], 'storybook')).toBe('family')
  })

  it('infers science from story idea with robot', () => {
    expect(inferBookTheme('a robot in a space lab experiment', [], 'storybook')).toBe('science')
  })

  it('infers faith from story idea with bible', () => {
    expect(inferBookTheme('a prayer from the bible', [], 'storybook')).toBe('faith')
  })

  it('returns other when no keywords match', () => {
    expect(inferBookTheme('a story about drawing', [], 'storybook')).toBe('other')
  })

  it('returns other for empty storyIdea', () => {
    expect(inferBookTheme('', [], 'storybook')).toBe('other')
  })
})

// ── BOOK_THEMES array ─────────────────────────────────────────────

describe('BOOK_THEMES', () => {
  it('has exactly 9 items', () => {
    expect(BOOK_THEMES).toHaveLength(9)
  })

  it('has all unique IDs', () => {
    const ids = BOOK_THEMES.map((t) => t.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('contains all required theme IDs', () => {
    const ids = BOOK_THEMES.map((t) => t.id) as BookTheme[]
    const required: BookTheme[] = [
      'adventure', 'animals', 'family', 'fantasy', 'minecraft',
      'science', 'sight_words', 'faith', 'other',
    ]
    for (const id of required) {
      expect(ids).toContain(id)
    }
  })

  it('every item has a non-empty label and emoji', () => {
    for (const theme of BOOK_THEMES) {
      expect(theme.label.length).toBeGreaterThan(0)
      expect(theme.emoji.length).toBeGreaterThan(0)
    }
  })
})

// ── Bookshelf additive filtering ──────────────────────────────────

describe('bookshelf additive filtering', () => {
  type BookStub = { bookType?: string; theme?: BookTheme }

  function applyFilters(
    books: BookStub[],
    typeFilter: 'all' | 'creative' | 'generated' | 'sight-word',
    themeFilter: BookTheme | 'all',
  ): BookStub[] {
    let filtered = books
    if (typeFilter === 'creative') {
      filtered = books.filter((b) => b.bookType !== 'sight-word' && b.bookType !== 'generated')
    } else if (typeFilter === 'generated') {
      filtered = books.filter((b) => b.bookType === 'generated')
    } else if (typeFilter === 'sight-word') {
      filtered = books.filter((b) => b.bookType === 'sight-word')
    }
    if (themeFilter !== 'all') {
      filtered = filtered.filter((b) => b.theme === themeFilter)
    }
    return filtered
  }

  const books: BookStub[] = [
    { bookType: 'generated', theme: 'animals' },
    { bookType: 'generated', theme: 'minecraft' },
    { bookType: 'creative', theme: 'animals' },
    { bookType: 'sight-word', theme: 'sight_words' },
    { bookType: 'creative', theme: undefined },
  ]

  it('type=all + theme=all returns all books', () => {
    expect(applyFilters(books, 'all', 'all')).toHaveLength(5)
  })

  it('type=generated + theme=all returns all generated books', () => {
    expect(applyFilters(books, 'generated', 'all')).toHaveLength(2)
  })

  it('type=generated + theme=animals returns only generated animal books', () => {
    const result = applyFilters(books, 'generated', 'animals')
    expect(result).toHaveLength(1)
    expect(result[0].theme).toBe('animals')
    expect(result[0].bookType).toBe('generated')
  })

  it('type=creative + theme=animals returns creative animal books only', () => {
    const result = applyFilters(books, 'creative', 'animals')
    expect(result).toHaveLength(1)
    expect(result[0].bookType).toBe('creative')
  })

  it('type=all + theme=minecraft returns only minecraft books', () => {
    const result = applyFilters(books, 'all', 'minecraft')
    expect(result).toHaveLength(1)
    expect(result[0].theme).toBe('minecraft')
  })

  it('theme filter that matches nothing returns empty array', () => {
    expect(applyFilters(books, 'all', 'faith')).toHaveLength(0)
  })
})

// ── Sticker tag auto-suggestion ────────────────────────────────────

// Inline the suggestTagsFromPrompt function for isolated testing
function suggestTagsFromPrompt(prompt: string): string[] {
  const text = prompt.toLowerCase()
  const suggestions: string[] = []

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

describe('sticker tag auto-suggestion', () => {
  it('suggests animal for "a cute pig"', () => {
    expect(suggestTagsFromPrompt('a cute pig')).toContain('animal')
  })

  it('suggests minecraft for "a creeper"', () => {
    expect(suggestTagsFromPrompt('a creeper')).toContain('minecraft')
  })

  it('suggests minecraft for "a sword"', () => {
    expect(suggestTagsFromPrompt('a sword')).toContain('minecraft')
  })

  it('suggests fantasy for "a dragon"', () => {
    expect(suggestTagsFromPrompt('a dragon')).toContain('fantasy')
  })

  it('suggests nature for "a flower"', () => {
    expect(suggestTagsFromPrompt('a flower')).toContain('nature')
  })

  it('suggests vehicle for "a rocket"', () => {
    expect(suggestTagsFromPrompt('a rocket ship')).toContain('vehicle')
  })

  it('suggests food for "a pizza"', () => {
    expect(suggestTagsFromPrompt('a pizza slice')).toContain('food')
  })

  it('returns at most 3 tags', () => {
    // A prompt with many keywords
    const tags = suggestTagsFromPrompt('a dragon pig in a forest with a minecraft sword')
    expect(tags.length).toBeLessThanOrEqual(3)
  })

  it('defaults to object when no keywords match', () => {
    expect(suggestTagsFromPrompt('a glowing orb')).toContain('object')
  })
})

// ── Migration defaults ────────────────────────────────────────────

describe('sticker migration defaults', () => {
  function withDefaults(sticker: { id?: string; tags?: string[]; childProfile?: string }): { tags: string[]; childProfile: string } {
    return {
      ...sticker,
      tags: sticker.tags ?? ['other'],
      childProfile: sticker.childProfile ?? 'both',
    }
  }

  it('applies default tags when sticker has no tags', () => {
    const result = withDefaults({ id: 'abc' })
    expect(result.tags).toEqual(['other'])
  })

  it('applies default childProfile when sticker has none', () => {
    const result = withDefaults({ id: 'abc' })
    expect(result.childProfile).toBe('both')
  })

  it('preserves existing tags', () => {
    const result = withDefaults({ id: 'abc', tags: ['animal', 'fantasy'] })
    expect(result.tags).toEqual(['animal', 'fantasy'])
  })

  it('preserves existing childProfile', () => {
    const result = withDefaults({ id: 'abc', childProfile: 'lincoln' })
    expect(result.childProfile).toBe('lincoln')
  })
})
