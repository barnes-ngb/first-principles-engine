import { describe, expect, it } from 'vitest'
import type { SightWordProgress } from '../../core/types'
import { computeMasteryLevel, recordEncounter, summarizeMastery } from './sightWordMastery'

function makeProgress(overrides: Partial<SightWordProgress> = {}): SightWordProgress {
  return {
    word: 'the',
    encounters: 0,
    selfReportedKnown: 0,
    helpRequested: 0,
    shellyConfirmed: false,
    masteryLevel: 'new',
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-01-01T00:00:00.000Z',
    lastLevelChange: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeMasteryLevel', () => {
  it('returns "new" when encounters < 3', () => {
    expect(computeMasteryLevel(makeProgress({ encounters: 2 }))).toBe('new')
  })

  it('returns "practicing" after 3+ encounters with no self-reports', () => {
    expect(computeMasteryLevel(makeProgress({ encounters: 5 }))).toBe('practicing')
  })

  it('returns "familiar" when selfReportedKnown >= 3 and encounters >= 3', () => {
    expect(computeMasteryLevel(makeProgress({ encounters: 5, selfReportedKnown: 3 }))).toBe('familiar')
  })

  it('returns "familiar" when encounters >= 10 and helpRate < 0.2', () => {
    expect(computeMasteryLevel(makeProgress({ encounters: 10, helpRequested: 1 }))).toBe('familiar')
  })

  it('returns "mastered" when encounters >= 15, helpRate < 0.1, and familiar criteria met', () => {
    expect(computeMasteryLevel(makeProgress({
      encounters: 20,
      selfReportedKnown: 5,
      helpRequested: 1,
    }))).toBe('mastered')
  })

  it('shellyConfirmed overrides everything to mastered', () => {
    expect(computeMasteryLevel(makeProgress({
      encounters: 1,
      shellyConfirmed: true,
    }))).toBe('mastered')
  })

  it('stays "practicing" with high help rate even with many encounters', () => {
    expect(computeMasteryLevel(makeProgress({
      encounters: 10,
      helpRequested: 5,
    }))).toBe('practicing')
  })

  it('returns "familiar" not "mastered" at 15 encounters if helpRate >= 0.1', () => {
    expect(computeMasteryLevel(makeProgress({
      encounters: 15,
      selfReportedKnown: 3,
      helpRequested: 2,
    }))).toBe('familiar')
  })
})

describe('recordEncounter', () => {
  it('creates new progress from null', () => {
    const result = recordEncounter(null, 'the', 'seen')
    expect(result.word).toBe('the')
    expect(result.encounters).toBe(1)
    expect(result.masteryLevel).toBe('new')
  })

  it('increments encounters on "seen"', () => {
    const existing = makeProgress({ encounters: 5, masteryLevel: 'practicing' })
    const result = recordEncounter(existing, 'the', 'seen')
    expect(result.encounters).toBe(6)
  })

  it('increments both encounters and helpRequested on "help"', () => {
    const existing = makeProgress({ encounters: 5 })
    const result = recordEncounter(existing, 'the', 'help')
    expect(result.encounters).toBe(6)
    expect(result.helpRequested).toBe(1)
  })

  it('increments selfReportedKnown on "known"', () => {
    const existing = makeProgress({ encounters: 5 })
    const result = recordEncounter(existing, 'the', 'known')
    expect(result.selfReportedKnown).toBe(1)
    expect(result.encounters).toBe(5) // not incremented
  })

  it('updates masteryLevel when it changes', () => {
    const existing = makeProgress({ encounters: 2, masteryLevel: 'new' })
    const result = recordEncounter(existing, 'the', 'seen')
    expect(result.encounters).toBe(3)
    expect(result.masteryLevel).toBe('practicing')
  })

  it('lowercases the word on new progress', () => {
    const result = recordEncounter(null, 'THE', 'seen')
    expect(result.word).toBe('the')
  })
})

describe('summarizeMastery', () => {
  it('counts each mastery level', () => {
    const progress: SightWordProgress[] = [
      makeProgress({ masteryLevel: 'mastered' }),
      makeProgress({ masteryLevel: 'mastered' }),
      makeProgress({ masteryLevel: 'familiar' }),
      makeProgress({ masteryLevel: 'practicing' }),
      makeProgress({ masteryLevel: 'new' }),
      makeProgress({ masteryLevel: 'new' }),
    ]
    const summary = summarizeMastery(progress)
    expect(summary).toEqual({
      mastered: 2,
      familiar: 1,
      practicing: 1,
      newCount: 2,
      total: 6,
    })
  })

  it('returns zeros for empty array', () => {
    expect(summarizeMastery([])).toEqual({
      mastered: 0,
      familiar: 0,
      practicing: 0,
      newCount: 0,
      total: 0,
    })
  })
})
