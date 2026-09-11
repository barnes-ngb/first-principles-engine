import { describe, expect, it } from 'vitest'

import { projectedThroughSummary } from './projectedThroughSummary'

describe('projectedThroughSummary (UX-384)', () => {
  it('returns null for NEVER RECORDED — a different state from "no levels"', () => {
    expect(projectedThroughSummary(undefined)).toBeNull()
    // Recorded with every slot empty is the second state, and reads as such.
    expect(projectedThroughSummary({ phonics: null, writing: null, math: null })).toBe(
      'math — · phonics — · writing —',
    )
  })

  it('names one slot per driving key, in a stable order', () => {
    expect(projectedThroughSummary({ phonics: 5, writing: null, math: 3 })).toBe(
      'math 3 · phonics 5 · writing —',
    )
  })

  it('takes the caller’s dash, so a markdown cell and a chip can differ', () => {
    expect(projectedThroughSummary({ phonics: 5, writing: null, math: 3 }, 'none')).toBe(
      'math 3 · phonics 5 · writing none',
    )
  })
})
