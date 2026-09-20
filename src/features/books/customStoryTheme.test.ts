import { describe, expect, it } from 'vitest'
import {
  CUSTOM_STORY_THEME_MAX_LENGTH,
  normalizeCustomStoryTheme,
  hasCustomStoryTheme,
  chooseStoryTheme,
  themeIdForNote,
  customStoryThemeChipLabel,
  CUSTOM_STORY_THEME_CHIP_LABEL,
  CUSTOM_STORY_THEME_CHIP_LABEL_SET,
} from './customStoryTheme'
import type { StoryThemeSelection, StoryThemePick } from './customStoryTheme'

// ── normalizeCustomStoryTheme ─────────────────────────────────────────

describe('normalizeCustomStoryTheme', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeCustomStoryTheme('  a  spooky   forest  ')).toBe('a spooky forest')
  })

  it('returns empty string for non-strings', () => {
    expect(normalizeCustomStoryTheme(undefined)).toBe('')
    expect(normalizeCustomStoryTheme(null)).toBe('')
    expect(normalizeCustomStoryTheme(42)).toBe('')
    expect(normalizeCustomStoryTheme({})).toBe('')
    expect(normalizeCustomStoryTheme(true)).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeCustomStoryTheme('   ')).toBe('')
    expect(normalizeCustomStoryTheme('\t\n')).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(normalizeCustomStoryTheme('')).toBe('')
  })

  it('caps at CUSTOM_STORY_THEME_MAX_LENGTH', () => {
    const long = 'a'.repeat(300)
    const result = normalizeCustomStoryTheme(long)
    expect(result.length).toBeLessThanOrEqual(CUSTOM_STORY_THEME_MAX_LENGTH)
  })

  it('trims again after slicing (no trailing whitespace from mid-word cut)', () => {
    const input = 'a'.repeat(199) + ' b'
    const result = normalizeCustomStoryTheme(input)
    expect(result).not.toMatch(/\s$/)
  })

  it('collapses newlines and tabs into single spaces', () => {
    expect(normalizeCustomStoryTheme('line one\nline two\ttab')).toBe(
      'line one line two tab',
    )
  })
})

// ── hasCustomStoryTheme ───────────────────────────────────────────────

describe('hasCustomStoryTheme', () => {
  it('returns true for a non-empty note', () => {
    expect(hasCustomStoryTheme('a witch')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(hasCustomStoryTheme('')).toBe(false)
  })

  it('returns false for whitespace-only', () => {
    expect(hasCustomStoryTheme('   ')).toBe(false)
  })

  it('returns false for non-strings', () => {
    expect(hasCustomStoryTheme(null)).toBe(false)
    expect(hasCustomStoryTheme(undefined)).toBe(false)
    expect(hasCustomStoryTheme(99)).toBe(false)
  })
})

// ── chooseStoryTheme ──────────────────────────────────────────────────

describe('chooseStoryTheme', () => {
  const base: StoryThemeSelection = { theme: undefined, customTheme: '' }

  it('selecting a preset clears the note', () => {
    const current: StoryThemeSelection = { theme: undefined, customTheme: 'forest witch' }
    const pick: StoryThemePick = { kind: 'preset', id: 'adventure' }
    const result = chooseStoryTheme(current, pick)
    expect(result.theme).toBe('adventure')
    expect(result.customTheme).toBe('')
  })

  it('toggling the same preset off clears both', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: '' }
    const pick: StoryThemePick = { kind: 'preset', id: 'adventure' }
    const result = chooseStoryTheme(current, pick)
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('')
  })

  it('selecting a different preset switches the id', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: '' }
    const pick: StoryThemePick = { kind: 'preset', id: 'family' }
    const result = chooseStoryTheme(current, pick)
    expect(result.theme).toBe('family')
    expect(result.customTheme).toBe('')
  })

  it('saving a non-empty note clears the preset', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: '' }
    const pick: StoryThemePick = { kind: 'custom', note: 'spooky forest' }
    const result = chooseStoryTheme(current, pick)
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('spooky forest')
  })

  it('saving an empty note clears only the note, leaves preset alone', () => {
    const current: StoryThemeSelection = { theme: 'adventure', customTheme: 'old note' }
    const pick: StoryThemePick = { kind: 'custom', note: '' }
    const result = chooseStoryTheme(current, pick)
    expect(result.theme).toBe('adventure')
    expect(result.customTheme).toBe('')
  })

  it('saving a whitespace-only note is the same as empty', () => {
    const current: StoryThemeSelection = { theme: 'science', customTheme: '' }
    const pick: StoryThemePick = { kind: 'custom', note: '   ' }
    const result = chooseStoryTheme(current, pick)
    expect(result.theme).toBe('science')
    expect(result.customTheme).toBe('')
  })

  it('normalizes the custom note (trims, collapses whitespace)', () => {
    const pick: StoryThemePick = { kind: 'custom', note: '  a   spooky   forest  ' }
    const result = chooseStoryTheme(base, pick)
    expect(result.customTheme).toBe('a spooky forest')
  })

  it('one-or-the-other: preset and note are never both present after a preset pick', () => {
    const current: StoryThemeSelection = { theme: 'science', customTheme: 'forest' }
    const result = chooseStoryTheme(current, { kind: 'preset', id: 'faith' })
    expect(result.theme).toBe('faith')
    expect(result.customTheme).toBe('')
  })

  it('one-or-the-other: preset and note are never both present after a custom pick', () => {
    const current: StoryThemeSelection = { theme: 'science', customTheme: '' }
    const result = chooseStoryTheme(current, { kind: 'custom', note: 'a kind witch' })
    expect(result.theme).toBeUndefined()
    expect(result.customTheme).toBe('a kind witch')
  })
})

// ── themeIdForNote ────────────────────────────────────────────────────

describe('themeIdForNote', () => {
  it('returns the inferred id when there is no note', () => {
    expect(themeIdForNote('adventure', '')).toBe('adventure')
    expect(themeIdForNote('adventure', undefined)).toBe('adventure')
    expect(themeIdForNote('adventure', null)).toBe('adventure')
  })

  it('returns empty string when a note is present (note wins)', () => {
    expect(themeIdForNote('adventure', 'spooky forest')).toBe('')
  })

  it('returns undefined as-is when inferred is undefined and no note', () => {
    expect(themeIdForNote(undefined, '')).toBeUndefined()
  })

  it('returns empty string even when inferred is undefined but note is present', () => {
    expect(themeIdForNote(undefined, 'a note')).toBe('')
  })
})

// ── customStoryThemeChipLabel ─────────────────────────────────────────

describe('customStoryThemeChipLabel', () => {
  it('returns "Custom…" label when no note is set', () => {
    expect(customStoryThemeChipLabel('')).toBe(CUSTOM_STORY_THEME_CHIP_LABEL)
    expect(customStoryThemeChipLabel(undefined)).toBe(CUSTOM_STORY_THEME_CHIP_LABEL)
    expect(customStoryThemeChipLabel(null)).toBe(CUSTOM_STORY_THEME_CHIP_LABEL)
  })

  it('returns "Custom" (no ellipsis) label when a note is set', () => {
    expect(customStoryThemeChipLabel('spooky forest')).toBe(
      CUSTOM_STORY_THEME_CHIP_LABEL_SET,
    )
  })
})
