import { describe, it, expect } from 'vitest'
import { formatPriceCents } from './catalogPrice'

describe('formatPriceCents', () => {
  it('formats positive cents as dollar amount', () => {
    expect(formatPriceCents(500)).toBe('$5.00')
    expect(formatPriceCents(1299)).toBe('$12.99')
    expect(formatPriceCents(99)).toBe('$0.99')
  })

  it('preserves trailing zeros', () => {
    expect(formatPriceCents(100)).toBe('$1.00')
    expect(formatPriceCents(1000)).toBe('$10.00')
    expect(formatPriceCents(250)).toBe('$2.50')
  })

  it('returns "No price yet" for zero cents', () => {
    expect(formatPriceCents(0)).toBe('No price yet')
  })

  it('returns "No price yet" for negative cents', () => {
    expect(formatPriceCents(-100)).toBe('No price yet')
    expect(formatPriceCents(-1)).toBe('No price yet')
  })

  it('returns "No price yet" for NaN', () => {
    expect(formatPriceCents(NaN)).toBe('No price yet')
  })

  it('returns "No price yet" for Infinity', () => {
    expect(formatPriceCents(Infinity)).toBe('No price yet')
    expect(formatPriceCents(-Infinity)).toBe('No price yet')
  })

  it('handles small amounts (1 cent)', () => {
    expect(formatPriceCents(1)).toBe('$0.01')
  })

  it('handles large amounts', () => {
    expect(formatPriceCents(99999)).toBe('$999.99')
  })
})
