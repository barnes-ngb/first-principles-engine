import { describe, expect, it } from 'vitest'

import { anonymizeId } from './anonymize'

describe('anonymizeId', () => {
  it('returns a string starting with "a" followed by 8 hex characters', () => {
    const result = anonymizeId('user123')
    expect(result).toMatch(/^a[0-9a-f]{8}$/)
  })

  it('is deterministic — same input always produces same output', () => {
    const a = anonymizeId('familyABC')
    const b = anonymizeId('familyABC')
    expect(a).toBe(b)
  })

  it('produces different tokens for different inputs', () => {
    const a = anonymizeId('child-lincoln')
    const b = anonymizeId('child-london')
    expect(a).not.toBe(b)
  })

  it('handles empty string without error', () => {
    const result = anonymizeId('')
    expect(result).toMatch(/^a[0-9a-f]{8}$/)
  })

  it('produces a known hash for a pinned input (snapshot)', () => {
    // Pin the FNV-1a hash of "test" to catch accidental algorithm changes.
    // FNV-1a 32-bit of "test": 0xafd071e5
    const result = anonymizeId('test')
    expect(result).toBe('aafd071e5')
  })

  it('handles long strings', () => {
    const longId = 'a'.repeat(1000)
    const result = anonymizeId(longId)
    expect(result).toMatch(/^a[0-9a-f]{8}$/)
  })

  it('handles special characters', () => {
    const result = anonymizeId('user@example.com/child:123')
    expect(result).toMatch(/^a[0-9a-f]{8}$/)
  })

  it('handles Unicode characters', () => {
    const result = anonymizeId('用户名')
    expect(result).toMatch(/^a[0-9a-f]{8}$/)
    // Deterministic
    expect(anonymizeId('用户名')).toBe(result)
  })

  it('single-character differences produce distinct tokens', () => {
    const a = anonymizeId('abc')
    const b = anonymizeId('abd')
    expect(a).not.toBe(b)
  })
})
