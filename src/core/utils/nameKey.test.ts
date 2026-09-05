import { describe, expect, it } from 'vitest'

import { quickLogLabelKey } from '../../features/today/quickLogChips'
import { nameKey } from './nameKey'

describe('nameKey', () => {
  it('keeps letters and digits, lowercased', () => {
    expect(nameKey('GATB Math 3')).toBe('gatbmath3')
  })

  it('drops emoji, spaces and punctuation', () => {
    expect(nameKey('📚 Reading!')).toBe('reading')
    expect(nameKey('  Booster   cards  ')).toBe('boostercards')
  })

  it('is not fuzzy — a real word still separates two names', () => {
    expect(nameKey('The Good and the Beautiful Math')).not.toBe(
      nameKey('Good and the Beautiful Math'),
    )
  })

  it('handles a missing value so callers need no guard', () => {
    expect(nameKey(undefined)).toBe('')
    expect(nameKey(null)).toBe('')
    expect(nameKey('')).toBe('')
  })

  it('is the rule the quick-log row uses — one definition, not two', () => {
    for (const label of ['📚 Reading', 'Sight word games', 'Dad’s Lab: micro:bit', '']) {
      expect(quickLogLabelKey(label)).toBe(nameKey(label))
    }
  })
})
