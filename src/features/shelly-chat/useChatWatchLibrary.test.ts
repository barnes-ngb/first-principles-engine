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

import { chatWatchLibraryCacheKey } from './useChatWatchLibrary'

describe('chatWatchLibraryCacheKey (FEAT-149)', () => {
  it('keeps apart id pairs that naive concatenation would collide', () => {
    // 'ab' + 'c' === 'a' + 'bc'. With no separator both subscriptions would
    // share a key, and one child's curated videos would still read as current
    // for the other — a sibling's private entry leaking into the gate that
    // decides what may be planned.
    expect(chatWatchLibraryCacheKey('ab', 'c')).not.toBe(
      chatWatchLibraryCacheKey('a', 'bc'),
    )
  })

  it('separates the ids with a NUL, the one byte a Firestore id cannot contain', () => {
    expect(chatWatchLibraryCacheKey('fam', 'kid')).toBe('fam\u0000kid')
  })
})
