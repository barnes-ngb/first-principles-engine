import { describe, expect, it } from 'vitest'

import {
  CUSTOM_STORY_THEME_CHIP_LABEL,
  CUSTOM_STORY_THEME_CHIP_LABEL_SET,
  CUSTOM_STORY_THEME_HINT,
  CUSTOM_STORY_THEME_MAX_LENGTH,
  chooseStoryTheme,
  customStoryThemeChipLabel,
  hasCustomStoryTheme,
  normalizeCustomStoryTheme,
} from '../customStoryTheme'

/**
 * FEAT-194 — the one-off "what should this story feel like?" note that replaced
 * the saved-theme library.
 */

describe('normalizeCustomStoryTheme', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeCustomStoryTheme('  a spooky   forest \n with a witch ')).toBe(
      'a spooky forest with a witch',
    )
  })

  it('caps the note — the field is a note, not a design brief', () => {
    const long = 'x'.repeat(CUSTOM_STORY_THEME_MAX_LENGTH + 50)
    expect(normalizeCustomStoryTheme(long)).toHaveLength(CUSTOM_STORY_THEME_MAX_LENGTH)
  })

  it('is `\'\'` for anything that is not words a parent typed', () => {
    expect(normalizeCustomStoryTheme(undefined)).toBe('')
    expect(normalizeCustomStoryTheme(null)).toBe('')
    expect(normalizeCustomStoryTheme(7)).toBe('')
    expect(normalizeCustomStoryTheme({ note: 'hi' })).toBe('')
    expect(normalizeCustomStoryTheme('   ')).toBe('')
  })

  it('treats `\'\'` and absent as the same thing', () => {
    expect(hasCustomStoryTheme('')).toBe(false)
    expect(hasCustomStoryTheme(undefined)).toBe(false)
    expect(hasCustomStoryTheme('warm and gentle')).toBe(true)
  })
})

describe('chooseStoryTheme — one or the other, never both', () => {
  it('picking a preset clears the note', () => {
    expect(
      chooseStoryTheme({ theme: undefined, customTheme: 'spooky but kind' }, {
        kind: 'preset',
        id: 'fantasy',
      }),
    ).toEqual({ theme: 'fantasy', customTheme: '' })
  })

  it('saving a note clears the preset', () => {
    expect(
      chooseStoryTheme({ theme: 'fantasy', customTheme: '' }, {
        kind: 'custom',
        note: 'spooky but kind',
      }),
    ).toEqual({ theme: undefined, customTheme: 'spooky but kind' })
  })

  it('picking the selected preset again clears it (the chips toggle)', () => {
    expect(
      chooseStoryTheme({ theme: 'fantasy', customTheme: '' }, { kind: 'preset', id: 'fantasy' }),
    ).toEqual({ theme: undefined, customTheme: '' })
  })

  it('clearing the note leaves the preset alone — it must not re-select a replaced one', () => {
    expect(
      chooseStoryTheme({ theme: undefined, customTheme: 'spooky' }, { kind: 'custom', note: '' }),
    ).toEqual({ theme: undefined, customTheme: '' })
  })

  it('normalizes the note it stores', () => {
    expect(
      chooseStoryTheme({ theme: undefined, customTheme: '' }, {
        kind: 'custom',
        note: '  warm   and gentle  ',
      }),
    ).toEqual({ theme: undefined, customTheme: 'warm and gentle' })
  })

  it('never returns both a preset and a note, from any starting point', () => {
    const starts = [
      { theme: undefined, customTheme: '' },
      { theme: 'fantasy', customTheme: '' },
      { theme: undefined, customTheme: 'spooky' },
    ]
    const picks = [
      { kind: 'preset' as const, id: 'fantasy' },
      { kind: 'preset' as const, id: 'animals' },
      { kind: 'custom' as const, note: 'warm' },
      { kind: 'custom' as const, note: '' },
    ]
    for (const start of starts) {
      for (const pick of picks) {
        const next = chooseStoryTheme(start, pick)
        expect(Boolean(next.theme) && Boolean(next.customTheme)).toBe(false)
      }
    }
  })
})

describe('the chip label', () => {
  it('invites when there is no note and states when there is', () => {
    expect(customStoryThemeChipLabel('')).toBe(CUSTOM_STORY_THEME_CHIP_LABEL)
    expect(customStoryThemeChipLabel('spooky but kind')).toBe(
      CUSTOM_STORY_THEME_CHIP_LABEL_SET,
    )
  })
})

describe('the hint', () => {
  /**
   * The dropped fourth field, said out loud. The dialog this replaced asked
   * "What style should pictures be?" and that text reached nothing. There is no
   * replacement here on purpose (UX-177), so the hint must not imply the note
   * changes the pictures — it has to say the opposite.
   */
  it('says the note shapes the story and not the pictures', () => {
    expect(CUSTOM_STORY_THEME_HINT.toLowerCase()).toContain('not the pictures')
    expect(CUSTOM_STORY_THEME_HINT.toLowerCase()).toContain('story')
  })
})
