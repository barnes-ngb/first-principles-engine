import { describe, expect, it } from 'vitest'

import { childScopedGateNote, childScopedReadIsSettled } from './childScopedGate'

/**
 * FIX-223 — GATE has one definition, and this is it. Both `useDailyPlan`
 * (UX-345) and `useSkillMap` (UX-344) delegate here, so the census's third
 * verdict cannot mean two different things on two surfaces fixed in the same
 * run.
 */
describe('childScopedReadIsSettled', () => {
  it.each([
    ['a settled successful read', { isLoading: false, loadFailed: false, hasTarget: true }, true],
    ['an open read', { isLoading: true, loadFailed: false, hasTarget: true }, false],
    ['a failed read', { isLoading: false, loadFailed: true, hasTarget: true }, false],
    ['no child at all', { isLoading: false, loadFailed: false, hasTarget: false }, false],
  ])('%s → %s', (_label, state, expected) => {
    expect(childScopedReadIsSettled(state)).toBe(expected)
  })
})

describe('childScopedGateNote', () => {
  const copy = { failed: 'it failed', waiting: 'it is loading' }

  it('ranks a failure above a slow read — a failure does not resolve on its own', () => {
    expect(childScopedGateNote({ isLoading: true, loadFailed: true, hasTarget: true }, copy))
      .toBe('it failed')
  })

  it('says nothing with no child, whatever the read is doing', () => {
    expect(childScopedGateNote({ isLoading: true, loadFailed: true, hasTarget: false }, copy))
      .toBeNull()
  })
})
