import { describe, expect, it } from 'vitest'

import { buildRecalcLedgerDoc } from './avatarAdminWrites'

describe('buildRecalcLedgerDoc', () => {
  it('preserves an existing sources object verbatim', () => {
    const sources = { routines: 80, quests: 20, books: 12 }
    const doc = buildRecalcLedgerDoc('child-1', 112, sources)
    expect(doc.childId).toBe('child-1')
    expect(doc.totalXp).toBe(112)
    expect(doc.sources).toEqual({ routines: 80, quests: 20, books: 12 })
  })

  it('falls back to zero-sources when the existing doc has no sources field', () => {
    // This is the bug case: a cumulative ledger doc that exists but is missing
    // `sources` would otherwise write `undefined` and be rejected by Firestore.
    const doc = buildRecalcLedgerDoc('child-1', 500, undefined)
    expect(doc.sources).toEqual({ routines: 0, quests: 0, books: 0 })
    expect(doc.totalXp).toBe(500)
  })

  it('never lets an undefined field reach the write', () => {
    const doc = buildRecalcLedgerDoc('child-1', 0, undefined)
    for (const [key, value] of Object.entries(doc)) {
      expect(value, `key "${key}" should not be undefined`).not.toBeUndefined()
    }
  })

  it('does not add a dedupKey (cumulative docs omit it)', () => {
    const doc = buildRecalcLedgerDoc('child-1', 42, { routines: 42, quests: 0, books: 0 })
    expect('dedupKey' in doc).toBe(false)
  })

  it('does not mutate the caller-provided sources object', () => {
    const sources = { routines: 10, quests: 5, books: 0 }
    const doc = buildRecalcLedgerDoc('child-1', 15, sources)
    // The shared (recursive) stripper deep-copies, so values are preserved
    // without aliasing the caller's object — and the original is untouched.
    expect(doc.sources).toEqual(sources)
    expect(sources).toEqual({ routines: 10, quests: 5, books: 0 })
  })

  it('writes a fresh zero-sources object, not the shared constant', () => {
    // Two undefined-sources calls must not share a mutable reference.
    const a = buildRecalcLedgerDoc('child-1', 1, undefined)
    const b = buildRecalcLedgerDoc('child-2', 2, undefined)
    expect(a.sources).not.toBe(b.sources)
    expect(a.sources).toEqual(b.sources)
  })

  it('preserves the exact totalXp value (no clamping or drift)', () => {
    expect(buildRecalcLedgerDoc('c', 9999, undefined).totalXp).toBe(9999)
    expect(buildRecalcLedgerDoc('c', 0, undefined).totalXp).toBe(0)
  })
})
