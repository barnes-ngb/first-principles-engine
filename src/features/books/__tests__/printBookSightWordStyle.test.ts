import { describe, expect, it } from 'vitest'
import { shouldRenderPlainSightWordText } from '../printBook'

describe('printBook sightWordStyle handling', () => {
  it('uses the normal text path when sightWordStyle is plain', () => {
    expect(shouldRenderPlainSightWordText(new Set(['the']), 'plain')).toBe(true)
  })

  it('does not force plain path for highlighted style with sight words', () => {
    expect(shouldRenderPlainSightWordText(new Set(['the']), 'highlighted')).toBe(false)
  })
})
