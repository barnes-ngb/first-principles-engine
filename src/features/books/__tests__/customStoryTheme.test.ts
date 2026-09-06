import { describe, it, expect } from 'vitest'
import {
  chooseStoryTheme,
  CUSTOM_STORY_THEME_MAX_LENGTH,
  customStoryThemeChipLabel,
  CUSTOM_STORY_THEME_CHIP_LABEL,
  CUSTOM_STORY_THEME_CHIP_LABEL_SET,
  hasCustomStoryTheme,
  normalizeCustomStoryTheme,
  themeIdForNote,
} from '../customStoryTheme'
import type { StoryThemeSelection } from '../customStoryTheme'

// ── normalizeCustomStoryTheme ───────────────────────────────────

describe('normalizeCustomStoryTheme', () => {
  it('returns a trimmed, whitespace-collapsed string', () => {
    expect(normalizeCustomStoryTheme('  a  spooky   forest  ')).toBe('a spooky forest')
  })

  it('returns empty for non-string inputs', () => {
    expect(normalizeCustomStoryTheme(undefined)).toBe('')
    expect(normalizeCustomStoryTheme(null)).toBe('')
    expect(normalizeCustomStoryTheme(42)).toBe('')
    expect(normalizeCustomStoryTheme({})).toBe('')
    expect(normalizeCustomStoryTheme(true)).toBe('')
  })

  it('returns empty for a whitespace-only string', () => {
    expect(normalizeCustomStoryTheme('   ')).toBe('')
    expect(normalizeCustomStoryTheme('\t\n')).toBe('')
  })

  it('caps at CUSTOM_STORY_THEME_MAX_LENGTH', () => {
    const long = 'a'.repeat(300)
    const result = normalizeCustomStoryTheme(long)
    expect(result.length).toBeLessThanOrEqual(CUSTOM_STORY_THEME_MAX_LENGTH)
    expect(result.length).toBe(CUSTOM_STORY_THEME_MAX_LENGTH)
  })

  it('trims after slicing so a mid-word cut does not leave trailing whitespace', () => {
    const input = 'a'.repeat(CUSTOM_STORY_THEME_MAX_LENGTH - 1) + ' b extra'
    const result = normalizeCustomStoryTheme(input)
    expect(result).not.toMatch(/\s$/)
  })

  it('handles an empty string', () => {
    expect(normalizeCustomStoryTheme('')).toBe('')
  })
})

// ── hasCustomStoryTheme ─────────────────────────────────────────

describe('hasCustomStoryTheme', () => {
  it('returns true for a non-empty note', () => {
    expect(hasCustomStoryTheme('a spooky forest')).toBe(true)
  })

  it('returns false for empty, whitespace, or non-string', () => {
    expect(hasCustomStoryTheme('')).toBe(false)
    expect(hasCustomStoryTheme('   ')).toBe(false)
    expect(hasCustomStoryTheme(null)).toBe(false)
    expect(hasCustomStoryTheme(undefined)).toBe(false)
  })
})

// ── chooseStoryTheme ────────────────────────────────────────────

describe('chooseStoryTheme', () => {
  const blank: StoryThemeSelection = { theme: undefined, customTheme: '' }
  const withPreset: StoryThemeSelection = { theme: 'adventure', customTheme: '' }
  const withCustom: StoryThemeSelection = { theme: undefined, customTheme: 'a spooky forest' }

  it('picking a preset clears the note', () => {
    const result = chooseStoryTheme(withCustom, { kind: 'preset', id: 'adventure' })
    expect(result.theme).toBe('adventure')
    expect(result.customTheme).toBe('')
  })

  it('picking the same preset toggles it off', () => {
    const result = chooseStoryTheme(withPreset, { kind: 'preset', id: 'adventure' })
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('')
  })

  it('picking a different preset switches it', () => {
    const result = chooseStoryTheme(withPreset, { kind: 'preset', id: 'fantasy' })
    expect(result.theme).toBe('fantasy')
    expect(result.customTheme).toBe('')
  })

  it('saving a note clears the preset', () => {
    const result = chooseStoryTheme(withPreset, { kind: 'custom', note: 'a kind witch' })
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('a kind witch')
  })

  it('saving an empty note clears the note but leaves the preset alone', () => {
    const result = chooseStoryTheme(withPreset, { kind: 'custom', note: '' })
    expect(result.theme).toBe('adventure')
    expect(result.customTheme).toBe('')
  })

  it('saving an empty note from a custom state does not re-select a preset', () => {
    const result = chooseStoryTheme(withCustom, { kind: 'custom', note: '' })
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('')
  })

  it('saving a whitespace-only note is treated as empty', () => {
    const result = chooseStoryTheme(withPreset, { kind: 'custom', note: '   ' })
    expect(result.theme).toBe('adventure')
    expect(result.customTheme).toBe('')
  })

  it('from blank: picking a preset sets it', () => {
    const result = chooseStoryTheme(blank, { kind: 'preset', id: 'space' })
    expect(result.theme).toBe('space')
  })

  it('from blank: saving a note sets it', () => {
    const result = chooseStoryTheme(blank, { kind: 'custom', note: 'forest' })
    expect(result.customTheme).toBe('forest')
    expect(result.theme).toBeUndefined()
  })
})

// ── themeIdForNote ──────────────────────────────────────────────

describe('themeIdForNote', () => {
  it('returns the inferred id when there is no note', () => {
    expect(themeIdForNote('adventure', '')).toBe('adventure')
    expect(themeIdForNote('adventure', undefined)).toBe('adventure')
    expect(themeIdForNote('adventure', null)).toBe('adventure')
  })

  it('returns empty string when the book has a custom note', () => {
    expect(themeIdForNote('adventure', 'a spooky forest')).toBe('')
  })

  it('preserves undefined inferred when there is no note', () => {
    expect(themeIdForNote(undefined, '')).toBeUndefined()
  })

  it('returns empty string even when inferred is undefined if note is present', () => {
    expect(themeIdForNote(undefined, 'forest')).toBe('')
  })
})

// ── customStoryThemeChipLabel ───────────────────────────────────

describe('customStoryThemeChipLabel', () => {
  it('returns the "set" label when a note is present', () => {
    expect(customStoryThemeChipLabel('forest')).toBe(CUSTOM_STORY_THEME_CHIP_LABEL_SET)
  })

  it('returns the default label when no note is present', () => {
    expect(customStoryThemeChipLabel('')).toBe(CUSTOM_STORY_THEME_CHIP_LABEL)
    expect(customStoryThemeChipLabel(undefined)).toBe(CUSTOM_STORY_THEME_CHIP_LABEL)
  })
})
