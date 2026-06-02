import { describe, it, expect } from 'vitest'

import type { SkillSnapshot, WorkingLevel } from '../../core/types/evaluation'
import { applyToSnapshot } from '../evaluate/skillSnapshotWrites'
import { hasSufficientCompletion } from './questBanking'
import type { SessionQuestion } from './questTypes'
import {
  canOverwriteWorkingLevel,
  computeQuestActivityMarker,
  computeWorkingLevelFromSession,
  sessionHighWaterLevel,
} from './workingLevels'

const AT = '2026-06-02T12:00:00.000Z'
const PRIOR_AT = '2026-05-01T00:00:00.000Z'

function q(overrides: Partial<SessionQuestion> & { level: number; correct: boolean }): SessionQuestion {
  return {
    id: overrides.id ?? `q-${Math.random()}`,
    type: overrides.type ?? 'multiple-choice',
    skill: overrides.skill ?? 'phonics.cvc',
    prompt: '',
    options: [],
    correctAnswer: '',
    childAnswer: '',
    responseTimeMs: 1000,
    timestamp: AT,
    ...overrides,
  }
}

/** Five answered questions, peaking (correct) at `peak`, ending at `endLevel`. */
function answeredSession(peak: number, endLevel: number): SessionQuestion[] {
  return [
    q({ level: 2, correct: true }),
    q({ level: 2, correct: true }),
    q({ level: peak, correct: true }),
    q({ level: peak, correct: true }),
    q({ level: endLevel, correct: true }),
  ]
}

function snapshotWith(workingLevels: SkillSnapshot['workingLevels']): SkillSnapshot {
  return {
    childId: 'lincoln',
    prioritySkills: [],
    supports: [],
    stopRules: [],
    evidenceDefinitions: [],
    conceptualBlocks: [],
    workingLevels,
    updatedAt: PRIOR_AT,
  }
}

describe('sessionHighWaterLevel', () => {
  it('is the highest level answered correctly', () => {
    expect(sessionHighWaterLevel(answeredSession(5, 4), 4)).toBe(5)
  })

  it('falls back to the session-end level when nothing was correct', () => {
    const wrongs = [q({ level: 3, correct: false }), q({ level: 3, correct: false })]
    expect(sessionHighWaterLevel(wrongs, 3)).toBe(3)
  })

  it('ignores skipped/flagged questions', () => {
    const qs = [
      q({ level: 6, correct: true, skipped: true }),
      q({ level: 6, correct: true, flaggedAsError: true }),
      q({ level: 4, correct: true }),
    ]
    expect(sessionHighWaterLevel(qs, 3)).toBe(4)
  })
})

describe('computeQuestActivityMarker', () => {
  it('a HOLD (new level == prior) records outcome "held" + the high-water mark', () => {
    const marker = computeQuestActivityMarker({
      priorLevel: 4,
      newLevel: 4,
      sessionHighWater: 5,
      at: AT,
    })
    expect(marker.outcome).toBe('held')
    expect(marker.levelReached).toBe(5)
    expect(marker.lastQuestAt).toBe(AT)
  })

  it('a RAISE (new level > prior) records outcome "rose"', () => {
    const marker = computeQuestActivityMarker({
      priorLevel: 4,
      newLevel: 5,
      sessionHighWater: 5,
      at: AT,
    })
    expect(marker.outcome).toBe('rose')
  })

  it('treats a first-ever signal (no prior level) as a climb', () => {
    const marker = computeQuestActivityMarker({
      priorLevel: undefined,
      newLevel: 3,
      sessionHighWater: 3,
      at: AT,
    })
    expect(marker.outcome).toBe('rose')
  })

  it('a conservative downstep is shown as "held", never a downgrade message', () => {
    const marker = computeQuestActivityMarker({
      priorLevel: 4,
      newLevel: 3,
      sessionHighWater: 4,
      at: AT,
    })
    expect(marker.outcome).toBe('held')
  })
})

describe('quest activity marker via the central writer — additive, never touches the level', () => {
  it('a sufficient quest that HOLDS records the marker and leaves the WorkingLevel (incl. updatedAt) untouched', () => {
    const heldLevel: WorkingLevel = { level: 4, updatedAt: PRIOR_AT, source: 'quest', evidence: 'prior' }
    const snap = snapshotWith({ phonics: heldLevel })

    const marker = computeQuestActivityMarker({
      priorLevel: 4,
      newLevel: 4, // held
      sessionHighWater: sessionHighWaterLevel(answeredSession(5, 4), 4),
      at: AT,
    })
    const { snapshot: next, changed, changedFields } = applyToSnapshot(snap, {
      masteredSkills: [],
      recordQuestActivity: { domain: 'phonics', marker },
      at: AT,
    })

    expect(changed).toBe(true)
    expect(changedFields.questActivity).toBe(true)
    // The marker landed in its OWN field.
    expect(next.questActivity?.phonics?.outcome).toBe('held')
    expect(next.questActivity?.phonics?.levelReached).toBe(5)
    expect(next.questActivity?.phonics?.lastQuestAt).toBe(AT)
    // The WorkingLevel — level value AND its updatedAt ("last level change") — is
    // byte-for-byte untouched: a held quest does NOT bump it.
    expect(next.workingLevels?.phonics).toEqual(heldLevel)
  })

  it('records "rose" when the quest raised the level (and the level write bumps WorkingLevel.updatedAt)', () => {
    const snap = snapshotWith({ phonics: { level: 4, updatedAt: PRIOR_AT, source: 'quest' } })

    // The (unchanged) level-derivation path produces a higher level with a fresh
    // updatedAt — that's the "bump" that accompanies a rose.
    const rose = computeWorkingLevelFromSession(answeredSession(5, 5), 5, 'phonics')
    expect(rose?.level).toBe(5)
    expect(rose?.updatedAt).not.toBe(PRIOR_AT)

    const marker = computeQuestActivityMarker({
      priorLevel: 4,
      newLevel: rose?.level,
      sessionHighWater: sessionHighWaterLevel(answeredSession(5, 5), 5),
      at: AT,
    })
    const { snapshot: next } = applyToSnapshot(snap, {
      masteredSkills: [],
      recordQuestActivity: { domain: 'phonics', marker },
      at: AT,
    })
    expect(next.questActivity?.phonics?.outcome).toBe('rose')
  })

  it('overwrites the marker last-write-wins without disturbing other domains', () => {
    const snap = snapshotWith({})
    const first = applyToSnapshot(snap, {
      masteredSkills: [],
      recordQuestActivity: {
        domain: 'math',
        marker: { lastQuestAt: PRIOR_AT, outcome: 'rose', levelReached: 3 },
      },
      at: PRIOR_AT,
    })
    const second = applyToSnapshot(first.snapshot, {
      masteredSkills: [],
      recordQuestActivity: {
        domain: 'phonics',
        marker: { lastQuestAt: AT, outcome: 'held', levelReached: 5 },
      },
      at: AT,
    })
    expect(second.snapshot.questActivity?.math?.lastQuestAt).toBe(PRIOR_AT)
    expect(second.snapshot.questActivity?.phonics?.lastQuestAt).toBe(AT)
  })
})

describe('guards left unchanged (#1326 sufficiency + manual override)', () => {
  it('a partial (sub-minimum answered) is NOT sufficient — its activity write never fires', () => {
    // The marker write sits behind the same `if (sufficient)` gate as the level
    // write, so a partial records no snapshot activity (#1326 intact).
    const partial = [q({ level: 3, correct: true }), q({ level: 3, correct: false })]
    expect(hasSufficientCompletion(partial)).toBe(false)

    const sufficient = answeredSession(5, 4)
    expect(hasSufficientCompletion(sufficient)).toBe(true)
  })

  it('a recent manual pin still blocks an automated write (so the activity write is skipped too)', () => {
    const recentManual: WorkingLevel = {
      level: 6,
      updatedAt: new Date().toISOString(),
      source: 'manual',
    }
    expect(canOverwriteWorkingLevel(recentManual)).toBe(false)

    const oldManual: WorkingLevel = {
      level: 6,
      updatedAt: '2020-01-01T00:00:00.000Z',
      source: 'manual',
    }
    expect(canOverwriteWorkingLevel(oldManual)).toBe(true)
  })

  it('recording activity never adds, removes, or reorders workingLevels keys', () => {
    const snap = snapshotWith({
      phonics: { level: 4, updatedAt: PRIOR_AT, source: 'quest' },
      math: { level: 3, updatedAt: PRIOR_AT, source: 'evaluation' },
    })
    const { snapshot: next } = applyToSnapshot(snap, {
      masteredSkills: [],
      recordQuestActivity: {
        domain: 'phonics',
        marker: { lastQuestAt: AT, outcome: 'held', levelReached: 5 },
      },
      at: AT,
    })
    expect(next.workingLevels).toEqual(snap.workingLevels)
  })
})
