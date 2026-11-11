import { describe, expect, it } from 'vitest'

/**
 * UX-494 — the frozen run, and the rules a recovery control is bound by.
 *
 * All pure: no React, no Firestore, no clock. The hook-level behaviour these
 * underpin is asserted in `useQuestSession.saveRecovery.test.tsx`.
 */

import {
  finalizedQuestSourcePayload,
  isLiveRun,
  mayRecoverQuestSource,
  mayRetrySavingQuestPayload,
  nextRunStamp,
  questAbandonRefusal,
  questRecoveryScopeKey,
  questResumeRefusal,
  questRunId,
  questRunInstanceId,
  resumableQuestSourcePayload,
  type QuestRun,
} from './questRun'
import type { QuestState, SessionQuestion } from './questTypes'

const NOW = '2026-11-10T12:00:00.000Z'

function run(partial: Partial<QuestRun> = {}): QuestRun {
  return {
    runId: 'interactive_lincoln_1000',
    instanceId: 'interactive_lincoln_1000#1',
    familyId: 'fam-1',
    childId: 'lincoln',
    childName: 'Lincoln',
    domain: 'reading',
    questMode: 'phonics',
    targetPlan: [],
    startedAt: NOW,
    ...partial,
  }
}

function questState(partial: Partial<QuestState> = {}): QuestState {
  return {
    currentLevel: 3,
    consecutiveCorrect: 1,
    consecutiveWrong: 0,
    levelDownsInARow: 0,
    wrongAtFloor: 0,
    totalQuestions: 5,
    totalCorrect: 4,
    questionsThisLevel: 2,
    startedAt: NOW,
    elapsedSeconds: 120,
    ...partial,
  }
}

function answer(i: number, extra: Partial<SessionQuestion> = {}): SessionQuestion {
  return {
    id: `q${i}`,
    type: 'multiple-choice',
    level: 2,
    skill: 'phonics.cvc',
    prompt: `q${i}`,
    options: ['a', 'b', 'c'],
    correctAnswer: 'a',
    childAnswer: 'a',
    correct: true,
    responseTimeMs: 1000,
    timestamp: NOW,
    ...extra,
  }
}

const FIVE = [0, 1, 2, 3, 4].map((i) => answer(i))
const PLAN = [
  { conceptId: 'reading.phonics.cvc', rowIndex: 0, digest: 'abcd1234', modelSeededAt: NOW },
]

describe('run identity', () => {
  it('keeps the id shape and makes the stamp strictly increasing', () => {
    expect(questRunId('lincoln', 1000)).toBe('interactive_lincoln_1000')
    // Two taps in one millisecond must not share a document, a reward key set
    // or an evidence sourceId.
    expect(nextRunStamp(1000, 1000)).toBe(1001)
    expect(nextRunStamp(1000, 1500)).toBe(1500)
  })

  it('distinguishes two mounts of ONE saved source, which Resume reuses', () => {
    const first = run({ instanceId: questRunInstanceId('interactive_lincoln_1000', 1) })
    const second = run({ instanceId: questRunInstanceId('interactive_lincoln_1000', 2) })
    expect(first.runId).toBe(second.runId) // Resume deliberately reuses the id
    expect(isLiveRun(second, first)).toBe(false) // …but not the live identity
    expect(isLiveRun(second, second)).toBe(true)
    expect(isLiveRun(null, first)).toBe(false)
  })
})

describe('questRecoveryScopeKey', () => {
  const base = { familyId: 'fam-1', childId: 'lincoln', profile: 'parent', identityEpoch: 1 }

  it('changes with family, child, profile and the identity epoch', () => {
    const key = questRecoveryScopeKey(base)
    expect(questRecoveryScopeKey({ ...base, familyId: 'fam-2' })).not.toBe(key)
    expect(questRecoveryScopeKey({ ...base, childId: 'london' })).not.toBe(key)
    expect(questRecoveryScopeKey({ ...base, profile: 'child' })).not.toBe(key)
    expect(questRecoveryScopeKey({ ...base, identityEpoch: 2 })).not.toBe(key)
  })

  /** The A → B → A case: family and child come back, the epoch does not. */
  it('does not come back the same after a round trip through another child', () => {
    expect(questRecoveryScopeKey({ ...base, identityEpoch: 3 })).not.toBe(
      questRecoveryScopeKey(base),
    )
  })
})

describe('who may act on a source', () => {
  it('a SAVED source needs the actual active child, not roster membership', () => {
    const payload = { familyId: 'fam-1', childId: 'lincoln' }
    expect(mayRecoverQuestSource({ familyId: 'fam-1', childId: 'lincoln' }, payload)).toBe(true)
    expect(mayRecoverQuestSource({ familyId: 'fam-1', childId: 'london' }, payload)).toBe(false)
    expect(mayRecoverQuestSource({ familyId: 'fam-2', childId: 'lincoln' }, payload)).toBe(false)
    expect(mayRecoverQuestSource({ familyId: null, childId: 'lincoln' }, payload)).toBe(false)
  })

  it('a HELD payload needs only the family — it carries its own owner (UX-339)', () => {
    const payload = { familyId: 'fam-1', childId: 'lincoln' }
    // The header moved to his brother; his answers are still his, and refusing
    // here would throw them away.
    expect(mayRetrySavingQuestPayload({ familyId: 'fam-1' }, payload)).toBe(true)
    expect(mayRetrySavingQuestPayload({ familyId: 'fam-2' }, payload)).toBe(false)
    expect(mayRetrySavingQuestPayload({ familyId: null }, payload)).toBe(false)
  })
})

describe('finalizedQuestSourcePayload', () => {
  const input = {
    run: run(),
    questions: FIVE,
    finalState: questState(),
    timedOut: false,
    findings: [],
    recommendations: [],
    summary: 'five of five',
    streakDays: 2,
    nowIso: NOW,
  }

  it('takes its id, child, domain, mode and plan from the FROZEN run', () => {
    const payload = finalizedQuestSourcePayload({
      ...input,
      run: run({ targetPlan: PLAN }),
      sufficient: true,
    })
    expect(payload).toMatchObject({
      childId: 'lincoln',
      domain: 'reading',
      questMode: 'phonics',
      questRunId: 'interactive_lincoln_1000',
      status: 'complete',
      sourceCommittedAt: NOW,
      targetPlan: PLAN,
    })
  })

  it('carries NO resume point, so a finished session cannot be reopened', () => {
    const payload = finalizedQuestSourcePayload({ ...input, sufficient: true })
    expect(payload.savedQuestState).toBeUndefined()
    expect(payload.savedCurrentQuestion).toBeUndefined()
  })

  it('is eligible for the graph only when sufficient AND a request was selected', () => {
    expect(
      finalizedQuestSourcePayload({ ...input, run: run({ targetPlan: PLAN }), sufficient: true })
        .modelProjection,
    ).toBe('pending')
    // An ordinary untagged quest: skipped from the moment it is written, so the
    // close makes no model attempt and no surface offers it a retry.
    expect(finalizedQuestSourcePayload({ ...input, sufficient: true }).modelProjection).toBe(
      'skipped',
    )
    expect(
      finalizedQuestSourcePayload({ ...input, run: run({ targetPlan: PLAN }), sufficient: false })
        .modelProjection,
    ).toBe('skipped')
  })

  it('preserves the existing partial/complete labelling and its counts', () => {
    const short = finalizedQuestSourcePayload({
      ...input,
      questions: [answer(0), answer(1, { skipped: true, correct: false })],
      sufficient: false,
    })
    expect(short.status).toBe('partial')
    expect(short.skippedCount).toBe(1)
    expect(short.diamondsMined).toBe(questState().totalCorrect)
  })
})

describe('resumableQuestSourcePayload', () => {
  it('saves the plan and the resume point under the run’s own id', () => {
    const payload = resumableQuestSourcePayload({
      run: run({ targetPlan: PLAN }),
      questions: FIVE.slice(0, 2),
      questState: questState({ totalQuestions: 2, totalCorrect: 2 }),
      currentQuestion: null,
      findings: [],
      bonusRoundUsed: false,
      streakDays: 1,
      nowIso: NOW,
    })
    expect(payload).toMatchObject({
      status: 'partial',
      questRunId: 'interactive_lincoln_1000',
      targetPlan: PLAN,
    })
    expect(payload.savedQuestState).toEqual(questState({ totalQuestions: 2, totalCorrect: 2 }))
    expect(payload.summary).toContain('2/2')
  })
})

describe('questResumeRefusal', () => {
  const resumable = {
    sessionType: 'interactive' as const,
    status: 'partial' as const,
    childId: 'lincoln',
    savedQuestState: questState(),
    savedCurrentQuestion: { id: 'q9' },
  }

  it('accepts a genuinely resumable partial, legacy or not', () => {
    expect(questResumeRefusal(resumable as never, 'lincoln')).toBeNull()
    // A legacy partial has no run id and no plan field and still resumes.
    expect(questResumeRefusal({ ...resumable } as never, 'lincoln')).toBeNull()
  })

  it('refuses what is stored NOW rather than the card’s stale copy', () => {
    expect(questResumeRefusal(null, 'lincoln')).toBe('missing')
    expect(questResumeRefusal({ ...resumable, sessionType: 'fluency' } as never, 'lincoln')).toBe(
      'not-interactive',
    )
    // Finalized by a delayed close between the card's read and the tap.
    expect(questResumeRefusal({ ...resumable, status: 'complete' } as never, 'lincoln')).toBe(
      'finalized',
    )
    expect(
      questResumeRefusal({ ...resumable, sourceCommittedAt: NOW } as never, 'lincoln'),
    ).toBe('finalized')
    expect(questResumeRefusal(resumable as never, 'london')).toBe('wrong-child')
    expect(
      questResumeRefusal({ ...resumable, savedCurrentQuestion: undefined } as never, 'lincoln'),
    ).toBe('no-resume-point')
  })

  it('refuses a status nothing plays answers into', () => {
    // A parent already closed this one out with *Start fresh instead*.
    expect(questResumeRefusal({ ...resumable, status: 'abandoned' } as never, 'lincoln')).toBe(
      'abandoned',
    )
    expect(questResumeRefusal({ ...resumable, status: 'queued' } as never, 'lincoln')).toBe(
      'not-resumable',
    )
    expect(questResumeRefusal({ ...resumable, status: undefined } as never, 'lincoln')).toBe(
      'not-resumable',
    )
  })

  it('keeps every eligible legacy status resumable', () => {
    for (const status of ['partial', 'in-progress', 'resumed']) {
      expect(questResumeRefusal({ ...resumable, status } as never, 'lincoln'), status).toBeNull()
    }
  })
})

describe('questAbandonRefusal', () => {
  const closable = {
    sessionType: 'interactive' as const,
    status: 'partial' as const,
    childId: 'lincoln',
  }

  it('allows closing out a partial that has no resume point', () => {
    // Not resumable, but still the row the card's secondary action is for.
    expect(questResumeRefusal(closable as never, 'lincoln')).toBe('no-resume-point')
    expect(questAbandonRefusal(closable as never, 'lincoln')).toBeNull()
  })

  it('refuses exactly what Resume refuses otherwise', () => {
    expect(questAbandonRefusal(null, 'lincoln')).toBe('missing')
    expect(questAbandonRefusal({ ...closable, status: 'complete' } as never, 'lincoln')).toBe(
      'finalized',
    )
    expect(questAbandonRefusal(closable as never, 'london')).toBe('wrong-child')
  })
})
