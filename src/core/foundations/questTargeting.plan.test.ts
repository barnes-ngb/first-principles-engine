import { describe, expect, it } from 'vitest'

/**
 * UX-494 — the selected request identity.
 *
 * A session used to carry only the concept IDS it was seeded with, and close
 * resolved ANY unresolved `routedTo:'quest'` ask for a probed concept. So a
 * request appended while the child was playing was consumed by a run that never
 * saw it. These are the pure rules that fixed it: capture the row, validate both
 * payload generations, and match the exact row again at close.
 *
 * It also pins the property the row index depends on — that every queue producer
 * APPENDS — so a producer that starts reordering fails here rather than silently
 * resolving the wrong ask.
 */

import {
  applyQuestResultsToModel,
  captureQuestTargetPlan,
  computeQuestConceptResults,
  parseQuestTargetPlan,
  questAskDigest,
  questAskRowMatches,
  selectQuestTargets,
} from './questTargeting'
import { applyReviewActionToModel } from '../../features/foundations-review/foundationsReviewActions'
import type { LearnerModel, OpenQuestion } from '../types/learnerModel'

const CVC = 'reading.phonics.cvc'
const BLENDS = 'reading.phonics.blends'
const SEEDED = '2026-07-01T00:00:00.000Z'
const NOW = '2026-11-10T12:00:00.000Z'

function ask(conceptId: string, overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    conceptId,
    question: `Test "${conceptId}" with a quick quest?`,
    routedTo: 'quest',
    reason: 'Parent asked to verify this by testing.',
    ...overrides,
  }
}

function model(partial: Partial<LearnerModel> = {}): LearnerModel {
  return {
    childId: 'child-1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {},
    modalityCalibration: { reading: { note: '' }, writing: { note: '' }, math: { note: '' } },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: SEEDED,
    updatedAt: SEEDED,
    ...partial,
  }
}

describe('questAskDigest', () => {
  it('is stable for the same row and differs when an immutable field changes', () => {
    const row = ask(CVC)
    expect(questAskDigest(row)).toBe(questAskDigest({ ...row }))
    expect(questAskDigest({ ...row, reason: 'Struggled today' })).not.toBe(questAskDigest(row))
    expect(questAskDigest({ ...row, conceptId: BLENDS })).not.toBe(questAskDigest(row))
  })

  it('keeps the parent’s ask prose out of what gets stored', () => {
    const digest = questAskDigest(ask(CVC, { question: 'Can he read mop, tap and sun yet?' }))
    expect(digest).toMatch(/^[0-9a-f]{8}$/)
    expect(digest).not.toContain('mop')
  })
})

describe('captureQuestTargetPlan', () => {
  it('captures the row each selected target came from, with the model’s seededAt', () => {
    const rows = [ask(BLENDS), ask(CVC)]
    const m = model({ openQuestions: rows })
    const targets = selectQuestTargets(m, { domain: 'reading' })
    const plan = captureQuestTargetPlan(m, targets.map((t) => t.conceptId))

    expect(plan).toEqual([
      { conceptId: BLENDS, rowIndex: 0, digest: questAskDigest(rows[0]), modelSeededAt: SEEDED },
      { conceptId: CVC, rowIndex: 1, digest: questAskDigest(rows[1]), modelSeededAt: SEEDED },
    ])
  })

  it('takes the OLDEST waiting row per concept — the row selectQuestTargets chose', () => {
    const first = ask(CVC)
    const second = ask(CVC, { reason: 'Struggled today' })
    const plan = captureQuestTargetPlan(model({ openQuestions: [first, second] }), [CVC])
    expect(plan).toHaveLength(1)
    expect(plan[0].rowIndex).toBe(0)
  })

  it('skips a resolved row and a concept with no waiting request', () => {
    const m = model({ openQuestions: [ask(CVC, { resolvedAt: NOW })] })
    expect(captureQuestTargetPlan(m, [CVC])).toEqual([])
    expect(captureQuestTargetPlan(model(), [CVC])).toEqual([])
  })

  it('answers an empty plan for an absent model or an empty selection', () => {
    expect(captureQuestTargetPlan(null, [CVC])).toEqual([])
    expect(captureQuestTargetPlan(model({ openQuestions: [ask(CVC)] }), [])).toEqual([])
  })
})

describe('parseQuestTargetPlan — both payload generations', () => {
  it('gives a LEGACY partial with no plan field an empty target list', () => {
    expect(parseQuestTargetPlan(undefined)).toEqual([])
    expect(parseQuestTargetPlan(null)).toEqual([])
    // The shape a pre-UX-494 document could not have carried at all.
    expect(parseQuestTargetPlan('reading.phonics.cvc')).toEqual([])
  })

  it('round-trips a saved plan', () => {
    const plan = captureQuestTargetPlan(model({ openQuestions: [ask(CVC)] }), [CVC])
    expect(parseQuestTargetPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
  })

  it('drops a malformed row rather than guessing at it', () => {
    const good = { conceptId: CVC, rowIndex: 0, digest: 'abcd1234', modelSeededAt: SEEDED }
    expect(
      parseQuestTargetPlan([
        good,
        { conceptId: '', rowIndex: 1, digest: 'x', modelSeededAt: SEEDED },
        { conceptId: BLENDS, rowIndex: -1, digest: 'x', modelSeededAt: SEEDED },
        { conceptId: BLENDS, rowIndex: 1.5, digest: 'x', modelSeededAt: SEEDED },
        { conceptId: BLENDS, rowIndex: 1, digest: '', modelSeededAt: SEEDED },
        { conceptId: BLENDS, rowIndex: 1, digest: 'x' },
        null,
      ]),
    ).toEqual([good])
  })
})

describe('questAskRowMatches', () => {
  const row = { conceptId: CVC, rowIndex: 1, digest: questAskDigest(ask(CVC)), modelSeededAt: SEEDED }

  it('matches the exact row it selected, still waiting', () => {
    expect(questAskRowMatches(model({ openQuestions: [ask(BLENDS), ask(CVC)] }), row)).toBe(true)
  })

  it('refuses a replaced model document, a moved row, an edited row and a resolved row', () => {
    expect(
      questAskRowMatches(model({ seededAt: NOW, openQuestions: [ask(BLENDS), ask(CVC)] }), row),
    ).toBe(false)
    expect(questAskRowMatches(model({ openQuestions: [ask(CVC)] }), row)).toBe(false)
    expect(
      questAskRowMatches(
        model({ openQuestions: [ask(BLENDS), ask(CVC, { reason: 'rewritten' })] }),
        row,
      ),
    ).toBe(false)
    expect(
      questAskRowMatches(
        model({ openQuestions: [ask(BLENDS), ask(CVC, { resolvedAt: NOW })] }),
        row,
      ),
    ).toBe(false)
  })
})

describe('computeQuestConceptResults excludes a flagged question', () => {
  it('counts neither the correct nor the total of a question flagged as broken', () => {
    const results = computeQuestConceptResults(
      [
        { targetConceptId: CVC, correct: true },
        { targetConceptId: CVC, correct: true, flaggedAsError: true },
        { targetConceptId: CVC, correct: false, skipped: true },
      ],
      [CVC],
    )
    expect(results).toEqual([{ conceptId: CVC, correct: 1, total: 1 }])
  })
})

describe('applyQuestResultsToModel — dedup per concept and source', () => {
  const results = [{ conceptId: CVC, correct: 2, total: 2 }]

  it('a one-source replay appends no second ref, moves no state and adds no change line', () => {
    const start = model({
      conceptStates: { [CVC]: { state: 'forming', evidence: [] } },
      openQuestions: [ask(CVC)],
    })
    const plan = captureQuestTargetPlan(start, [CVC])

    const first = applyQuestResultsToModel(start, results, 'sess-1', NOW, { plan })
    expect(first.projectedConceptIds).toEqual([CVC])
    expect(first.model.conceptStates[CVC].state).toBe('solid')
    expect(first.model.changeFeed).toHaveLength(1)

    const second = applyQuestResultsToModel(first.model, results, 'sess-1', NOW, { plan })
    expect(second.projectedConceptIds).toEqual([])
    expect(second.model.conceptStates[CVC].evidence).toHaveLength(1)
    expect(second.model.changeFeed).toHaveLength(1)
    expect(second.model.conceptStates[CVC].state).toBe('solid')
  })

  it('a DIFFERENT source still lands its own evidence', () => {
    const start = model({ conceptStates: { [CVC]: { state: 'frontier', evidence: [] } } })
    const once = applyQuestResultsToModel(start, results, 'sess-1', NOW)
    const twice = applyQuestResultsToModel(once.model, results, 'sess-2', NOW)
    expect(twice.model.conceptStates[CVC].evidence).toHaveLength(2)
  })
})

describe('applyQuestResultsToModel — only the selected row is resolved', () => {
  const results = [{ conceptId: CVC, correct: 2, total: 2 }]

  it('leaves a request appended after the session started open', () => {
    const original = ask(CVC)
    const start = model({ openQuestions: [original] })
    const plan = captureQuestTargetPlan(start, [CVC])

    // The struggle chip queues the same concept while the child is playing.
    const withLater = model({ openQuestions: [original, ask(CVC, { reason: 'Struggled today' })] })
    const applied = applyQuestResultsToModel(withLater, results, 'sess-1', NOW, { plan })

    expect(applied.model.openQuestions[0].resolvedAt).toBe(NOW)
    expect(applied.model.openQuestions[1].resolvedAt).toBeUndefined()
  })

  it('with NO plan keeps the original concept-match behaviour (the pure unit path)', () => {
    const applied = applyQuestResultsToModel(
      model({ openQuestions: [ask(CVC)] }),
      results,
      'sess-1',
      NOW,
    )
    expect(applied.model.openQuestions[0].resolvedAt).toBe(NOW)
  })
})

describe('the queue producers preserve append positions', () => {
  it('a queued test is APPENDED, so a captured row index stays valid', () => {
    // `applyReviewActionToModel`'s `queueTest` is the one path both the
    // Foundations Review Chat and the Today stuck-signal enqueue write through.
    const start = model({ openQuestions: [ask(CVC), ask(BLENDS)] })
    const plan = captureQuestTargetPlan(start, [CVC])

    const after = applyReviewActionToModel(
      start,
      {
        kind: 'queueTest',
        childId: 'child-1',
        conceptId: 'reading.decoding.multisyllable',
        reason: 'Struggled today',
      },
      NOW,
    ).model

    expect(after.openQuestions.slice(0, 2)).toEqual(start.openQuestions.slice(0, 2))
    expect(after.openQuestions).toHaveLength(3)
    expect(questAskRowMatches(after, plan[0])).toBe(true)
  })

  it('resolving an ask keeps every row in place', () => {
    const start = model({ openQuestions: [ask(BLENDS), ask(CVC)] })
    const plan = captureQuestTargetPlan(start, [CVC])
    const applied = applyQuestResultsToModel(
      start,
      [{ conceptId: CVC, correct: 2, total: 2 }],
      'sess-1',
      NOW,
      { plan },
    )
    expect(applied.model.openQuestions.map((q) => q.conceptId)).toEqual([BLENDS, CVC])
  })
})
