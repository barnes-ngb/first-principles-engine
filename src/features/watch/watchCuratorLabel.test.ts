import { describe, expect, it } from 'vitest'

import { watchCuratorLabel } from './watchCuratorLabel'

// FEAT-149 gave `addedBy` a second writer — the chat's confirmed vet-in, which
// stamps the confirming account's uid rather than the form's literal 'parent'.
// The uid is the right thing to store and the wrong thing to show, so the card
// reads the field through here.

describe('watchCuratorLabel (FEAT-149)', () => {
  it('shows a human label verbatim', () => {
    expect(watchCuratorLabel('parent')).toBe('parent')
    expect(watchCuratorLabel('Shelly')).toBe('Shelly')
    expect(watchCuratorLabel('Nathan B')).toBe('Nathan B')
  })

  it('reads a Firebase uid as "a parent" rather than 28 characters of base62', () => {
    expect(watchCuratorLabel('Xk9pQ2rL8mN4vB7cD1eF3gH5jK6a')).toBe('a parent')
    expect(watchCuratorLabel('abcdefghij0123456789')).toBe('a parent')
  })

  it('does not swallow a long human label that has spaces in it', () => {
    expect(watchCuratorLabel('Grandma on the tablet')).toBe('Grandma on the tablet')
  })

  it('falls back rather than rendering an empty chip', () => {
    expect(watchCuratorLabel('')).toBe('a parent')
    expect(watchCuratorLabel('   ')).toBe('a parent')
  })
})
