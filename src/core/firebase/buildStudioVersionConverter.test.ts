import { describe, expect, it, vi } from 'vitest'

// Same stand-in as catalogOrderConverter.test.ts: importing firestore.ts must not
// need a live Firebase app.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ withConverter: vi.fn(() => ({})) })),
  doc: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
}))
vi.mock('./firebase', () => ({ app: {} }))

import { buildStudioVersionConverter, stripUndefined } from './firestore'

/** A class instance, like the SDK's FieldValue: its identity and prototype matter. */
class FakeServerTimestamp {
  readonly _methodName = 'serverTimestamp'
}

const toFirestore = (data: Record<string, unknown>) =>
  (buildStudioVersionConverter.toFirestore as (d: unknown) => Record<string, unknown>)(data)

describe('buildStudioVersionConverter.toFirestore', () => {
  it('documents the bug it works around: the repo-wide stripUndefined flattens a sentinel', () => {
    const sentinel = new FakeServerTimestamp()
    const out = stripUndefined({ acceptedAt: sentinel })
    expect(out.acceptedAt).not.toBe(sentinel)
    expect(out.acceptedAt instanceof FakeServerTimestamp).toBe(false)
  })

  it('keeps the very same server-timestamp value for acceptedAt', () => {
    const sentinel = new FakeServerTimestamp()
    const out = toFirestore({ childId: 'c', label: 'x', acceptedAt: sentinel })
    expect(out.acceptedAt).toBe(sentinel)
    expect(out.acceptedAt instanceof FakeServerTimestamp).toBe(true)
  })

  it('still strips undefined everywhere else, as before', () => {
    const sentinel = new FakeServerTimestamp()
    const out = toFirestore({
      childId: 'c',
      goalId: undefined,
      challengeAttempt: { attemptId: 'a', note: undefined },
      acceptedAt: sentinel,
    })
    expect('goalId' in out).toBe(false)
    expect(out.challengeAttempt).toEqual({ attemptId: 'a' })
  })

  it('a version with no acceptedAt is byte-for-byte what stripUndefined gave', () => {
    const data = { childId: 'c', label: 'x', goalId: undefined, fileCount: 3 }
    expect(toFirestore(data)).toEqual(stripUndefined(data))
    expect('acceptedAt' in toFirestore(data)).toBe(false)
  })

  it('an acceptedAt that is explicitly undefined is dropped, not written', () => {
    expect('acceptedAt' in toFirestore({ childId: 'c', acceptedAt: undefined })).toBe(false)
  })
})
