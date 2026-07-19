import { describe, expect, it } from 'vitest'

import { batchExtraSummary } from './unifiedCaptureBatch'

describe('batchExtraSummary', () => {
  it('uses the singular noun for one extra page', () => {
    expect(batchExtraSummary(1)).toBe('+1 more page saved')
  })

  it('pluralizes for more than one extra page', () => {
    expect(batchExtraSummary(2)).toBe('+2 more pages saved')
    expect(batchExtraSummary(5)).toBe('+5 more pages saved')
  })
})
