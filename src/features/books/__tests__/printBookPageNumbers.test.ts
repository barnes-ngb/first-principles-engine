import { describe, expect, it } from 'vitest'
import { shouldRenderPageNumbers } from '../printBook'

describe('shouldRenderPageNumbers (FEAT-99)', () => {
  it('keeps page numbers on full-document formats when enabled (characterization)', () => {
    expect(shouldRenderPageNumbers('letter', true)).toBe(true)
    expect(shouldRenderPageNumbers('a4', true)).toBe(true)
  })

  it('suppresses page numbers on picture-book formats even when enabled', () => {
    expect(shouldRenderPageNumbers('half-letter', true)).toBe(false)
    expect(shouldRenderPageNumbers('booklet', true)).toBe(false)
    expect(shouldRenderPageNumbers('mini-5x7', true)).toBe(false)
    expect(shouldRenderPageNumbers('square-6', true)).toBe(false)
  })

  it('honors the toggle: never renders when includePageNumbers is off', () => {
    expect(shouldRenderPageNumbers('letter', false)).toBe(false)
    expect(shouldRenderPageNumbers('a4', false)).toBe(false)
    expect(shouldRenderPageNumbers('half-letter', false)).toBe(false)
  })
})
