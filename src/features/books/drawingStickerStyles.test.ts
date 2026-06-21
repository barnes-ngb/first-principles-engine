import { describe, it, expect } from 'vitest'
import {
  FANCY_STYLE_OPTIONS,
  DEFAULT_FANCY_STYLE_ID,
  resolveFancyEnhanceParams,
} from './drawingStickerStyles'

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

  it('maps a theme-driven option to its theme with no style', () => {
    const params = resolveFancyEnhanceParams('fantasy')
    expect(params.theme).toBe('fantasy')
    expect(params.style).toBeUndefined()
  })

  it('maps a style-driven option to its style with no theme', () => {
    const params = resolveFancyEnhanceParams('comic')
    expect(params.style).toBe('comic')
    expect(params.theme).toBeUndefined()
  })

  it('passes both style and theme when an option sets both', () => {
    const params = resolveFancyEnhanceParams('blocky')
    expect(params.style).toBe('minecraft')
    expect(params.theme).toBe('minecraft')
  })

  it('falls back to the default option for an unknown id', () => {
    const params = resolveFancyEnhanceParams('nope')
    expect(params.style).toBe('storybook')
    expect(params.theme).toBeUndefined()
    expect(params.transparent).toBe(true)
  })
})
