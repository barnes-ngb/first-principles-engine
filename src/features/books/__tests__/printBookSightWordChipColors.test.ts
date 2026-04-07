import { describe, expect, it } from 'vitest'
import { getSightWordChipColors } from '../printBook'

describe('printBook sight word chip colors', () => {
  it('uses high-contrast white text on Lincoln chips', () => {
    expect(getSightWordChipColors(true)).toEqual({
      bg: '#1a3a4a',
      text: '#ffffff',
    })
  })

  it('uses dark text on light chips for non-Lincoln books', () => {
    expect(getSightWordChipColors(false)).toEqual({
      bg: '#fce4ec',
      text: '#333333',
    })
  })
})
