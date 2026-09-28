import { describe, expect, it } from 'vitest'

import {
  CUSTOM_STORY_THEME_MAX_LENGTH,
  chooseStoryTheme,
  customStoryThemeChipLabel,
  hasCustomStoryTheme,
  normalizeCustomStoryTheme,
  themeIdForNote,
  CUSTOM_STORY_THEME_CHIP_LABEL,
  CUSTOM_STORY_THEME_CHIP_LABEL_SET,
} from './customStoryTheme'
import type { StoryThemeSelection } from './customStoryTheme'

// --- normalizeCustomStoryTheme ---

describe('normalizeCustomStoryTheme', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeCustomStoryTheme('  a   spooky   forest  ')).toBe('a spooky forest')
  })

  it('returns empty for non-string inputs', () => {
    expect(normalizeCustomStoryTheme(null)).toBe('')
    expect(normalizeCustomStoryTheme(undefined)).toBe('')
    expect(normalizeCustomStoryTheme(42)).toBe('')
    expect(normalizeCustomStoryTheme({})).toBe('')
    expect(normalizeCustomStoryTheme(true)).toBe('')
  })

  it('returns empty for whitespace-only string', () => {
    expect(normalizeCustomStoryTheme('   ')).toBe('')
  })

  it('caps at CUSTOM_STORY_THEME_MAX_LENGTH', () => {
    const long = 'a'.repeat(300)
    const result = normalizeCustomStoryTheme(long)
    expect(result.length).toBeLessThanOrEqual(CUSTOM_STORY_THEME_MAX_LENGTH)
  })

  it('trims again after slicing (no trailing space from mid-word cut)', () => {
    const str = 'a '.repeat(150)
    const result = normalizeCustomStoryTheme(str)
    expect(result).not.toMatch(/\s$/)
  })

  it('passes through a clean short string unchanged', () => {
    expect(normalizeCustomStoryTheme('hello world')).toBe('hello world')
  })
})

// --- hasCustomStoryTheme ---

describe('hasCustomStoryTheme', () => {
  it('returns true for a real note', () => {
    expect(hasCustomStoryTheme('a forest')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(hasCustomStoryTheme('')).toBe(false)
  })

  it('returns false for whitespace', () => {
    expect(hasCustomStoryTheme('   ')).toBe(false)
  })

  it('returns false for non-string', () => {
    expect(hasCustomStoryTheme(null)).toBe(false)
    expect(hasCustomStoryTheme(undefined)).toBe(false)
    expect(hasCustomStoryTheme(42)).toBe(false)
  })
})

// --- chooseStoryTheme ---

describe('chooseStoryTheme', () => {
  const base: StoryThemeSelection = { theme: undefined, customTheme: '' }

  it('picking a preset sets the theme and clears the note', () => {
    const current: StoryThemeSelection = { theme: undefined, customTheme: 'old note' }
    const result = chooseStoryTheme(current, { kind: 'preset', id: 'adventure' })
    expect(result.theme).toBe('adventure')
    expect(result.customTheme).toBe('')
  })

  it('picking the same preset toggles it off', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: '' }
    const result = chooseStoryTheme(current, { kind: 'preset', id: 'adventure' })
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('')
  })

  it('picking a different preset replaces', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: '' }
    const result = chooseStoryTheme(current, { kind: 'preset', id: 'science' })
    expect(result.theme).toBe('science')
    expect(result.customTheme).toBe('')
  })

  it('saving a custom note clears the preset', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: '' }
    const result = chooseStoryTheme(current, { kind: 'custom', note: 'a kind witch' })
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('a kind witch')
  })

  it('saving an empty note clears the note but keeps the preset', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: 'old' }
    const result = chooseStoryTheme(current, { kind: 'custom', note: '' })
    expect(result.theme).toBe('adventure')
    expect(result.customTheme).toBe('')
  })

  it('saving a whitespace-only note clears the note but keeps the preset', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: 'old' }
    const result = chooseStoryTheme(current, { kind: 'custom', note: '   ' })
    expect(result.theme).toBe('adventure')
    expect(result.customTheme).toBe('')
  })

  it('custom note is normalized', () => {
    const result = chooseStoryTheme(base, {
      kind: 'custom',
      note: '  lots   of   spaces  ',
    })
    expect(result.customTheme).toBe('lots of spaces')
  })

  it('clearing the custom note with no preset leaves both empty', () => {
    const current: StoryThemeSelection = { theme: undefined, customTheme: 'old' }
    const result = chooseStoryTheme(current, { kind: 'custom', note: '' })
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('')
  })
})

// --- themeIdForNote ---

describe('themeIdForNote', () => {
  it('returns inferred when no custom note', () => {
    expect(themeIdForNote('adventure', '')).toBe('adventure')
    expect(themeIdForNote('adventure', null)).toBe('adventure')
    expect(themeIdForNote('adventure', undefined)).toBe('adventure')
  })

  it('returns empty string when custom note is present', () => {
    expect(themeIdForNote('adventure', 'a forest')).toBe('')
  })

  it('returns undefined as-is when no note and inferred is undefined', () => {
    expect(themeIdForNote(undefined, '')).toBeUndefined()
  })

  it('returns empty string when note present even if inferred is undefined', () => {
    expect(themeIdForNote(undefined, 'some note')).toBe('')
  })
})

// --- customStoryThemeChipLabel ---

describe('customStoryThemeChipLabel', () => {
  it('shows unset label when no note', () => {
    expect(customStoryThemeChipLabel('')).toBe(CUSTOM_STORY_THEME_CHIP_LABEL)
    expect(customStoryThemeChipLabel(null)).toBe(CUSTOM_STORY_THEME_CHIP_LABEL)
  })

  it('shows set label when note is present', () => {
    expect(customStoryThemeChipLabel('a witch')).toBe(CUSTOM_STORY_THEME_CHIP_LABEL_SET)
  })
})
