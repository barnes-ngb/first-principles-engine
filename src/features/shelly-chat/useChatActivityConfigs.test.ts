import { describe, expect, it, vi } from 'vitest'

// The hook module imports firestore.ts, which calls initializeFirestore() at
// module load. Mock the firebase surface so importing it for the pure cache-key
// helper doesn't require a live Firebase app.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ withConverter: vi.fn(() => ({})) })),
  doc: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../core/firebase/firebase', () => ({ app: {} }))

import { chatActivityConfigsCacheKey } from './useChatActivityConfigs'

describe('chatActivityConfigsCacheKey', () => {
  it('keeps apart id pairs that naive concatenation would collide', () => {
    // 'ab' + 'c' === 'a' + 'bc'. With no separator both subscriptions would
    // share a key, and the first child's activity configs would still read as
    // current for the second — exactly the leak into the resolution gate the
    // key exists to prevent.
    expect(chatActivityConfigsCacheKey('ab', 'c')).not.toBe(
      chatActivityConfigsCacheKey('a', 'bc'),
    )
  })

  it('separates the ids with a NUL, the one byte a Firestore id cannot contain', () => {
    // Pins the separator itself, not just the fact that there is one: swapping
    // the NUL for a printable character (':', '|', …) reopens the collision for
    // any id containing that character.
    expect(chatActivityConfigsCacheKey('fam', 'kid')).toBe('fam\u0000kid')
  })
})
