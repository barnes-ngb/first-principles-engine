import { describe, it, expect } from 'vitest'
import {
  FANCY_STYLE_OPTIONS,
  DEFAULT_FANCY_STYLE_ID,
  fancyStyleLabel,
  resolveFancyEnhanceParams,
} from './drawingStickerStyles'
import { getPresetTheme } from '../../core/types/books'

// Valid base styles accepted by enhanceSketch (mirrors STYLE_HINTS keys /
// EnhanceSketchRequest['style']). A style on a fancy option must be one of these.
const VALID_BASE_STYLES = ['storybook', 'comic', 'realistic', 'minecraft']

describe('drawingStickerStyles', () => {
  it('default style is the first (clean cartoon house style)', () => {
    expect(DEFAULT_FANCY_STYLE_ID).toBe('cartoon')
    expect(FANCY_STYLE_OPTIONS[0].style).toBe('storybook')
    expect(FANCY_STYLE_OPTIONS[0].theme).toBeUndefined()
  })

  it('always resolves transparent sticker output', () => {
    for (const option of FANCY_STYLE_OPTIONS) {
      expect(resolveFancyEnhanceParams(option.id).transparent).toBe(true)
    }
  })

  it('mirrors the bookshelf themes — every themed option is a real preset theme', () => {
    for (const option of FANCY_STYLE_OPTIONS) {
      if (!option.theme) continue // the Cartoon house style is not a book theme
      const preset = getPresetTheme(option.theme)
      expect(preset, `theme "${option.theme}" must be a bookshelf preset theme`).not.toBeNull()
      // Emoji is derived from the book theme so the two can't drift.
      expect(option.emoji).toBe(preset?.emoji)
    }
  })

  it('has no dead style keys', () => {
    for (const option of FANCY_STYLE_OPTIONS) {
      if (option.style) expect(VALID_BASE_STYLES).toContain(option.style)
    }
  })

  it('surfaces the recommended theme set', () => {
    const ids = FANCY_STYLE_OPTIONS.map((o) => o.id)
    expect(ids).toEqual([
      'cartoon',
      'fantasy',
      'animals',
      'adventure',
      'space',
      'science',
      'faith',
      'family',
      'minecraft',
    ])
  })

  it('maps a theme-driven option to its theme with no style', () => {
    const params = resolveFancyEnhanceParams('fantasy')
    expect(params.theme).toBe('fantasy')
    expect(params.style).toBeUndefined()
  })

  it('maps the cartoon house style to storybook with no theme', () => {
    const params = resolveFancyEnhanceParams('cartoon')
    expect(params.style).toBe('storybook')
    expect(params.theme).toBeUndefined()
  })

  it('passes both style and theme for the blocky (minecraft) option', () => {
    const params = resolveFancyEnhanceParams('minecraft')
    expect(params.style).toBe('minecraft')
    expect(params.theme).toBe('minecraft')
  })

  it('relabels the minecraft theme as Blocky', () => {
    const blocky = FANCY_STYLE_OPTIONS.find((o) => o.id === 'minecraft')
    expect(blocky?.label).toBe('Blocky')
  })

  it('falls back to the default option for an unknown id', () => {
    const params = resolveFancyEnhanceParams('nope')
    expect(params.style).toBe('storybook')
    expect(params.theme).toBeUndefined()
    expect(params.transparent).toBe(true)
  })
})

// ── FEAT-158: styles you can tell apart ────────────────────────────

describe('drawingStickerStyles — distinctness (FEAT-158)', () => {
  it('every option sends a distinct {style, theme} payload', () => {
    // The test that would have caught a collapse: if two picker options resolve
    // to the same enhanceSketch params, no prompt change can tell them apart.
    const seen = new Map<string, string>()
    for (const option of FANCY_STYLE_OPTIONS) {
      const params = resolveFancyEnhanceParams(option.id)
      const key = `${params.style ?? '-'}|${params.theme ?? '-'}`
      expect(
        seen.has(key),
        `"${option.id}" sends the same payload as "${seen.get(key)}" (${key})`,
      ).toBe(false)
      seen.set(key, option.id)
    }
    expect(seen.size).toBe(FANCY_STYLE_OPTIONS.length)
  })

  it('keeps the existing option ids and default so saved stickers do not re-map', () => {
    // Saved stickers store the option id in `Sticker.theme`; changing an id
    // would orphan every version already in the library.
    expect(DEFAULT_FANCY_STYLE_ID).toBe('cartoon')
    expect(FANCY_STYLE_OPTIONS.map((o) => o.id)).toEqual([
      'cartoon',
      'fantasy',
      'animals',
      'adventure',
      'space',
      'science',
      'faith',
      'family',
      'minecraft',
    ])
  })
})

describe('fancyStyleLabel (FEAT-158)', () => {
  it('names the style that made a saved version', () => {
    expect(fancyStyleLabel('cartoon')).toBe('🎨 Cartoon')
    expect(fancyStyleLabel('minecraft')).toContain('Blocky')
    expect(fancyStyleLabel('fantasy')).toContain('Fantasy')
  })

  it('labels every option distinctly, so three versions read apart', () => {
    const labels = FANCY_STYLE_OPTIONS.map((o) => fancyStyleLabel(o.id))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('falls back to the raw id for an option no longer offered', () => {
    expect(fancyStyleLabel('dinosaurs')).toBe('dinosaurs')
  })
})
