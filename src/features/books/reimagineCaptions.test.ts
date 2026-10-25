import { describe, it, expect } from 'vitest'

import {
  reimagineBand,
  reimagineCaption,
  REIMAGINE_LOOK_CHOICES,
  REIMAGINE_LEFT_LABEL,
  REIMAGINE_RIGHT_LABEL,
} from './reimagineCaptions'

describe('reimagineBand', () => {
  it('returns light at intensity 0', () => {
    expect(reimagineBand(0)).toBe('light')
  })

  it('returns light at boundary intensity 25', () => {
    expect(reimagineBand(25)).toBe('light')
  })

  it('returns medium just above light boundary (26)', () => {
    expect(reimagineBand(26)).toBe('medium')
  })

  it('returns medium at midpoint intensity 50', () => {
    expect(reimagineBand(50)).toBe('medium')
  })

  it('returns medium just below full boundary (74)', () => {
    expect(reimagineBand(74)).toBe('medium')
  })

  it('returns full at boundary intensity 75', () => {
    expect(reimagineBand(75)).toBe('full')
  })

  it('returns full at max intensity 100', () => {
    expect(reimagineBand(100)).toBe('full')
  })
})

describe('reimagineCaption', () => {
  it('returns watercolor caption for light band intensities', () => {
    const caption = reimagineCaption(10)
    expect(caption).toContain('watercolor')
  })

  it('returns watercolor caption for medium band intensities', () => {
    const caption = reimagineCaption(50)
    expect(caption).toContain('watercolor')
  })

  it('returns comic-book caption for full band intensities', () => {
    const caption = reimagineCaption(100)
    expect(caption).toContain('comic')
  })

  it('returns non-empty captions for all bands', () => {
    expect(reimagineCaption(0).length).toBeGreaterThan(0)
    expect(reimagineCaption(50).length).toBeGreaterThan(0)
    expect(reimagineCaption(100).length).toBeGreaterThan(0)
  })

  it('returns three distinct captions across bands', () => {
    const light = reimagineCaption(0)
    const medium = reimagineCaption(50)
    const full = reimagineCaption(100)
    expect(new Set([light, medium, full]).size).toBe(3)
  })

  it('default look intensity (50) maps to medium band', () => {
    expect(reimagineBand(50)).toBe('medium')
    const caption = reimagineCaption(50)
    expect(caption).toContain('watercolor')
    expect(caption).toContain('polished')
  })
})

describe('REIMAGINE_LOOK_CHOICES', () => {
  it('has exactly 2 entries', () => {
    expect(REIMAGINE_LOOK_CHOICES).toHaveLength(2)
  })

  it('first choice is intensity 50 with watercolor label', () => {
    expect(REIMAGINE_LOOK_CHOICES[0].intensity).toBe(50)
    expect(REIMAGINE_LOOK_CHOICES[0].label).toBe('Watercolor look')
  })

  it('second choice is intensity 100 with comic-book label', () => {
    expect(REIMAGINE_LOOK_CHOICES[1].intensity).toBe(100)
    expect(REIMAGINE_LOOK_CHOICES[1].label).toBe('Comic-book look')
  })
})

describe('label exports', () => {
  it('REIMAGINE_LEFT_LABEL is Watercolor look', () => {
    expect(REIMAGINE_LEFT_LABEL).toBe('Watercolor look')
  })

  it('REIMAGINE_RIGHT_LABEL is Comic-book look', () => {
    expect(REIMAGINE_RIGHT_LABEL).toBe('Comic-book look')
  })
})
