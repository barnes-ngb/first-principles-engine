import { describe, expect, it } from 'vitest'
import type { LadderCardDefinition, LadderProgress } from '../../core/types/domain'
import { SessionSymbol, SupportLevel } from '../../core/types/enums'
import {
  applySession,
  compareSupportLevel,
  createInitialProgress,
  nextRungId,
} from './ladderProgress'

const testLadder: LadderCardDefinition = {
  ladderKey: 'test_ladder',
  title: 'Test Ladder',
  intent: 'For testing',
  workItems: ['Item 1'],
  metricLabel: 'One output',
  globalRuleText: 'Level up on 3 ✔ in a row with same or less support.',
  rungs: [
    { rungId: 'R0', name: 'Rung 0', evidenceText: 'E0', supportsText: 'S0' },
    { rungId: 'R1', name: 'Rung 1', evidenceText: 'E1', supportsText: 'S1' },
    { rungId: 'R2', name: 'Rung 2', evidenceText: 'E2', supportsText: 'S2' },
    { rungId: 'R3', name: 'Rung 3', evidenceText: 'E3', supportsText: 'S3' },
    { rungId: 'R4', name: 'Rung 4', evidenceText: 'E4', supportsText: 'S4' },
  ],
}

const baseProgress: LadderProgress = {
  childId: 'child-1',
  ladderKey: 'test_ladder',
  currentRungId: 'R0',
  streakCount: 0,
  lastSupportLevel: SupportLevel.None,
  history: [],
}

describe('compareSupportLevel', () => {
  it('returns 0 for same level', () => {
    expect(compareSupportLevel(SupportLevel.None, SupportLevel.None)).toBe(0)
  })

  it('returns negative when first is less support', () => {
    expect(compareSupportLevel(SupportLevel.None, SupportLevel.Prompts)).toBeLessThan(0)
  })

  it('returns positive when first is more support', () => {
    expect(compareSupportLevel(SupportLevel.HandOverHand, SupportLevel.None)).toBeGreaterThan(0)
  })
})

describe('nextRungId', () => {
  it('returns next rung for R0', () => {
    expect(nextRungId('R0', testLadder)).toBe('R1')
  })

  it('returns undefined for last rung', () => {
    expect(nextRungId('R4', testLadder)).toBeUndefined()
  })

  it('returns undefined for unknown rung', () => {
    expect(nextRungId('R99', testLadder)).toBeUndefined()
  })
})

describe('createInitialProgress', () => {
  it('starts at R0 with zero streak', () => {
    const p = createInitialProgress('child-1', testLadder)
    expect(p.childId).toBe('child-1')
    expect(p.ladderKey).toBe('test_ladder')
    expect(p.currentRungId).toBe('R0')
    expect(p.streakCount).toBe(0)
    expect(p.lastSupportLevel).toBe(SupportLevel.None)
    expect(p.history).toEqual([])
  })
})

describe('applySession', () => {
  it('increments streak on ✔ with same support', () => {
    const prev: LadderProgress = { ...baseProgress, streakCount: 1, lastSupportLevel: SupportLevel.Prompts }
    const result = applySession(prev, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.Prompts,
    }, testLadder)
    expect(result.progress.streakCount).toBe(2)
    expect(result.promoted).toBe(false)
  })

  it('increments streak on ✔ with less support', () => {
    const prev: LadderProgress = { ...baseProgress, streakCount: 1, lastSupportLevel: SupportLevel.Tools }
    const result = applySession(prev, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.Prompts,
    }, testLadder)
    expect(result.progress.streakCount).toBe(2)
    expect(result.promoted).toBe(false)
  })

  it('resets streak to 1 on ✔ with MORE support', () => {
    const prev: LadderProgress = { ...baseProgress, streakCount: 2, lastSupportLevel: SupportLevel.None }
    const result = applySession(prev, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.Prompts,
    }, testLadder)
    expect(result.progress.streakCount).toBe(1)
    expect(result.promoted).toBe(false)
  })

  it('resets streak to 0 on △', () => {
    const prev: LadderProgress = { ...baseProgress, streakCount: 2, lastSupportLevel: SupportLevel.None }
    const result = applySession(prev, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Partial,
      supportLevel: SupportLevel.None,
    }, testLadder)
    expect(result.progress.streakCount).toBe(0)
    expect(result.promoted).toBe(false)
  })

  it('resets streak to 0 on ✖', () => {
    const prev: LadderProgress = { ...baseProgress, streakCount: 2, lastSupportLevel: SupportLevel.None }
    const result = applySession(prev, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Miss,
      supportLevel: SupportLevel.None,
    }, testLadder)
    expect(result.progress.streakCount).toBe(0)
    expect(result.promoted).toBe(false)
  })

  it('promotes on 3rd consecutive ✔ with same/less support', () => {
    const prev: LadderProgress = { ...baseProgress, streakCount: 2, lastSupportLevel: SupportLevel.None }
    const result = applySession(prev, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.None,
    }, testLadder)
    expect(result.promoted).toBe(true)
    expect(result.progress.currentRungId).toBe('R1')
    expect(result.progress.streakCount).toBe(0)
    expect(result.newRungId).toBe('R1')
  })

  it('stays at last rung when already at R4 with 3 passes', () => {
    const prev: LadderProgress = {
      ...baseProgress,
      currentRungId: 'R4',
      streakCount: 2,
      lastSupportLevel: SupportLevel.None,
    }
    const result = applySession(prev, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.None,
    }, testLadder)
    expect(result.promoted).toBe(false)
    expect(result.progress.currentRungId).toBe('R4')
    expect(result.progress.streakCount).toBe(3)
  })

  it('records session in history', () => {
    const result = applySession(baseProgress, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.Environment,
      note: 'Great focus today',
    }, testLadder)
    expect(result.progress.history).toHaveLength(1)
    expect(result.progress.history[0].dateKey).toBe('2026-02-15')
    expect(result.progress.history[0].result).toBe('✔')
    expect(result.progress.history[0].supportLevel).toBe('environment')
    expect(result.progress.history[0].note).toBe('Great focus today')
  })

  it('first ✔ after fresh start sets streak to 1', () => {
    const result = applySession(baseProgress, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.None,
    }, testLadder)
    expect(result.progress.streakCount).toBe(1)
  })

  it('full promotion sequence: 3 passes in a row', () => {
    let progress = createInitialProgress('child-1', testLadder)
    const input = {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass as SessionSymbol,
      supportLevel: SupportLevel.None,
    }
    // Pass 1
    const r1 = applySession(progress, { ...input, dateKey: '2026-02-15' }, testLadder)
    expect(r1.progress.streakCount).toBe(1)
    expect(r1.promoted).toBe(false)
    progress = r1.progress

    // Pass 2
    const r2 = applySession(progress, { ...input, dateKey: '2026-02-16' }, testLadder)
    expect(r2.progress.streakCount).toBe(2)
    expect(r2.promoted).toBe(false)
    progress = r2.progress

    // Pass 3 → promotion
    const r3 = applySession(progress, { ...input, dateKey: '2026-02-17' }, testLadder)
    expect(r3.progress.streakCount).toBe(0)
    expect(r3.promoted).toBe(true)
    expect(r3.progress.currentRungId).toBe('R1')
  })

  it('interrupted streak: pass, pass, fail, pass resets correctly', () => {
    let progress = createInitialProgress('child-1', testLadder)
    const pass = { result: SessionSymbol.Pass as SessionSymbol, supportLevel: SupportLevel.None }
    const fail = { result: SessionSymbol.Miss as SessionSymbol, supportLevel: SupportLevel.None }

    progress = applySession(progress, { dateKey: '2026-02-15', ...pass }, testLadder).progress
    expect(progress.streakCount).toBe(1)

    progress = applySession(progress, { dateKey: '2026-02-16', ...pass }, testLadder).progress
    expect(progress.streakCount).toBe(2)

    progress = applySession(progress, { dateKey: '2026-02-17', ...fail }, testLadder).progress
    expect(progress.streakCount).toBe(0)

    progress = applySession(progress, { dateKey: '2026-02-18', ...pass }, testLadder).progress
    expect(progress.streakCount).toBe(1)
    expect(progress.currentRungId).toBe('R0') // no promotion
  })

  it('support escalation resets streak to 1', () => {
    let progress = createInitialProgress('child-1', testLadder)

    // Pass with no support
    progress = applySession(progress, {
      dateKey: '2026-02-15',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.None,
    }, testLadder).progress
    expect(progress.streakCount).toBe(1)

    // Pass with no support
    progress = applySession(progress, {
      dateKey: '2026-02-16',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.None,
    }, testLadder).progress
    expect(progress.streakCount).toBe(2)

    // Pass with MORE support → resets to 1
    progress = applySession(progress, {
      dateKey: '2026-02-17',
      result: SessionSymbol.Pass,
      supportLevel: SupportLevel.HandOverHand,
    }, testLadder).progress
    expect(progress.streakCount).toBe(1)
    expect(progress.currentRungId).toBe('R0') // no promotion
  })
})
