import { describe, expect, it, vi } from 'vitest'

// The hook module imports firestore.ts, which calls initializeFirestore() at
// module load. Mock the firebase surface so importing it for the pure cache-key
// helper doesn't require a live Firebase app.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ withConverter: vi.fn(() => ({})) })),
  doc: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('../../core/firebase/firebase', () => ({ app: {} }))

import { chatConceptArcsCacheKey } from './useChatConceptArcs'

describe('chatConceptArcsCacheKey (FEAT-157)', () => {
  it('keeps apart id pairs that naive concatenation would collide', () => {
    expect(chatConceptArcsCacheKey('ab', 'c')).not.toBe(chatConceptArcsCacheKey('a', 'bc'))
  })

  it('separates the ids with a NUL, the one byte a Firestore id cannot contain', () => {
    expect(chatConceptArcsCacheKey('fam', 'kid')).toBe('fam\u0000kid')
  })
})
