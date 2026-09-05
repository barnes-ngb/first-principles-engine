import { describe, expect, it, vi } from 'vitest'

import { PlanType } from '../types/enums'

// firestore.ts calls initializeFirestore() at module load and uses collection/doc
// inside its helpers. Mock the firebase surface so importing the module (for the
// real normalizer) doesn't require a live Firebase app.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ withConverter: vi.fn(() => ({})) })),
  doc: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
}))
vi.mock('./firebase', () => ({ app: {} }))

import { normalizePlanType } from './firestore'

/**
 * FEAT-200 adds a third `PlanType`. The legacy A/B normalization is the one
 * place a stored plan type is interpreted, so it is also the one place a new
 * member can be silently swallowed.
 */
describe('normalizePlanType', () => {
  it('round-trips the new Life member', () => {
    // Fails pre-FEAT-200: 'life' fell through to the 'normal' default, so a day
    // stored as a Life Day came back as an ordinary planned day.
    expect(normalizePlanType(PlanType.Life)).toBe(PlanType.Life)
  })

  it('leaves the two existing members exactly as they were', () => {
    expect(normalizePlanType('normal')).toBe(PlanType.Normal)
    expect(normalizePlanType('mvd')).toBe(PlanType.Mvd)
  })

  it('still maps the legacy A/B aliases', () => {
    expect(normalizePlanType('A')).toBe(PlanType.Normal)
    expect(normalizePlanType('B')).toBe(PlanType.Mvd)
  })

  it('falls back safely on anything it does not recognise', () => {
    // A future member read by an older client, a corrupt field, a missing one.
    // The day must render as an ordinary planned day, never throw or blank.
    for (const raw of ['', 'LIFE', 'life-day', 'C', 'undefined', '{}']) {
      expect(normalizePlanType(raw)).toBe(PlanType.Normal)
    }
  })

  it('normalizes every member of the union to itself', () => {
    // A guard on the next member added: a new PlanType that the converter does
    // not know collapses to 'normal', which is exactly the silent data loss this
    // suite exists to catch.
    for (const value of Object.values(PlanType)) {
      expect(normalizePlanType(value)).toBe(value)
    }
  })
})
