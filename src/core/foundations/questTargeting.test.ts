import { describe, expect, it } from 'vitest'

import {
  applyQuestResultsToModel,
  computeQuestConceptResults,
  DEFAULT_MAX_QUEST_TARGETS,
  selectQuestTargets,
  upgradedQuestState,
} from './questTargeting'
import { FOUNDATION_NODE_MAP } from './index'
import type { LearnerModel, OpenQuestion } from '../types/learnerModel'

const NOW = '2026-07-04T12:00:00.000Z'

function ask(conceptId: string, extra: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    conceptId,
    question: `Test "${conceptId}"?`,
    routedTo: 'quest',
    reason: 'queued by review chat',
    ...extra,
  }
}

function model(partial: Partial<LearnerModel>): LearnerModel {
  return {
    childId: 'child-1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {},
    modalityCalibration: {
      reading: { note: '' },
      writing: { note: '' },
      math: { note: '' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: NOW,
    updatedAt: NOW,
    ...partial,
  }
}

describe('selectQuestTargets', () => {
  it('returns [] for a model with no queued targets (zero-target characterization)', () => {
    expect(selectQuestTargets(model({ openQuestions: [] }))).toEqual([])
    expect(selectQuestTargets(null)).toEqual([])
    expect(selectQuestTargets(undefined)).toEqual([])
  })

  it('pulls unresolved routedTo:quest asks, oldest first, enriched from the graph', () => {
    const m = model({
      openQuestions: [ask('reading.phonics.blends'), ask('reading.phonics.digraphs')],
    })
    const targets = selectQuestTargets(m)
    expect(targets).toHaveLength(2)
    expect(targets[0]).toEqual({
      conceptId: 'reading.phonics.blends',
      name: FOUNDATION_NODE_MAP['reading.phonics.blends'].kidName,
      description: FOUNDATION_NODE_MAP['reading.phonics.blends'].parentDescription,
    })
    // Oldest-first = array order.
    expect(targets[1].conceptId).toBe('reading.phonics.digraphs')
  })

  it('skips resolved asks (they are non-blocking history)', () => {
    const m = model({
      openQuestions: [
        ask('reading.phonics.blends', { resolvedAt: NOW, resolvedBySessionId: 's1' }),
        ask('reading.phonics.digraphs'),
      ],
    })
    const targets = selectQuestTargets(m)
    expect(targets.map((t) => t.conceptId)).toEqual(['reading.phonics.digraphs'])
  })

  it('caps at max (default 3) and dedupes concepts', () => {
    const m = model({
      openQuestions: [
        ask('reading.phonics.cvc'),
        ask('reading.phonics.blends'),
        ask('reading.phonics.digraphs'),
        ask('reading.phonics.longVowels'),
        ask('reading.phonics.cvc'), // duplicate
      ],
    })
    expect(selectQuestTargets(m)).toHaveLength(DEFAULT_MAX_QUEST_TARGETS)
    expect(selectQuestTargets(m, { max: 2 })).toHaveLength(2)
  })

  it('domain-scopes so a reading quest never pulls a math ask', () => {
    const m = model({
      openQuestions: [ask('math.operations.addWithin20'), ask('reading.phonics.blends')],
    })
    expect(selectQuestTargets(m, { domain: 'reading' }).map((t) => t.conceptId)).toEqual([
      'reading.phonics.blends',
    ])
    expect(selectQuestTargets(m, { domain: 'math' }).map((t) => t.conceptId)).toEqual([
      'math.operations.addWithin20',
    ])
  })

  it('ignores asks for concepts that are not real graph nodes', () => {
    const m = model({ openQuestions: [ask('reading.bogus.concept')] })
    expect(selectQuestTargets(m)).toEqual([])
  })
})

describe('computeQuestConceptResults', () => {
  it('groups by targetConceptId, excluding skips and untagged questions', () => {
    const results = computeQuestConceptResults([
      { targetConceptId: 'reading.phonics.blends', correct: true },
      { targetConceptId: 'reading.phonics.blends', correct: false },
      { targetConceptId: 'reading.phonics.blends', correct: true, skipped: true }, // skip excluded
      { targetConceptId: 'reading.phonics.digraphs', correct: true },
      { correct: true }, // untagged — ignored
    ])
    const blends = results.find((r) => r.conceptId === 'reading.phonics.blends')
    expect(blends).toEqual({ conceptId: 'reading.phonics.blends', correct: 1, total: 2 })
    const digraphs = results.find((r) => r.conceptId === 'reading.phonics.digraphs')
    expect(digraphs).toEqual({ conceptId: 'reading.phonics.digraphs', correct: 1, total: 1 })
    expect(results).toHaveLength(2)
  })

  it('is empty when no question carries a target concept', () => {
    expect(
      computeQuestConceptResults([{ correct: true }, { correct: false }]),
    ).toEqual([])
  })

  it('drops stamps outside the session selected-target allowlist → zero model writes', () => {
    // The AI stamped a real graph node that was NOT among this session's targets.
    const questions = [
      { targetConceptId: 'reading.phonics.digraphs', correct: true },
      { targetConceptId: 'reading.phonics.digraphs', correct: true },
    ]
    const allowed = ['reading.phonics.blends'] // digraphs is not selected
    const results = computeQuestConceptResults(questions, allowed)
    expect(results).toEqual([])

    // …and an empty result set is a genuine no-op on the model (no evidence,
    // no upgrade, no ask-resolution).
    const m = model({
      conceptStates: { 'reading.phonics.digraphs': { state: 'not-yet', evidence: [], seededAt: NOW } },
      openQuestions: [ask('reading.phonics.digraphs')],
    })
    const applied = applyQuestResultsToModel(m, results, 's-wander', NOW)
    expect(applied.model).toBe(m)
    expect(applied.changedConceptIds).toEqual([])
    expect(applied.model.conceptStates['reading.phonics.digraphs'].evidence).toEqual([])
    expect(applied.model.openQuestions[0].resolvedAt).toBeUndefined()
  })

  it('keeps stamps that ARE in the allowlist', () => {
    const results = computeQuestConceptResults(
      [
        { targetConceptId: 'reading.phonics.blends', correct: true },
        { targetConceptId: 'reading.phonics.digraphs', correct: true },
      ],
      ['reading.phonics.blends'],
    )
    expect(results).toEqual([{ conceptId: 'reading.phonics.blends', correct: 1, total: 1 }])
  })
})

describe('upgradedQuestState', () => {
  it('upgrades forming/frontier → solid on all-correct (min 2)', () => {
    expect(upgradedQuestState('forming', { conceptId: 'x', correct: 2, total: 2 })).toBe('solid')
    expect(upgradedQuestState('frontier', { conceptId: 'x', correct: 3, total: 3 })).toBe('solid')
  })

  it('moves not-yet at most to forming', () => {
    expect(upgradedQuestState('not-yet', { conceptId: 'x', correct: 2, total: 2 })).toBe('forming')
  })

  it('leaves state unchanged on any wrong answer or fewer than 2 questions', () => {
    expect(upgradedQuestState('forming', { conceptId: 'x', correct: 1, total: 2 })).toBe('forming')
    expect(upgradedQuestState('frontier', { conceptId: 'x', correct: 1, total: 1 })).toBe('frontier')
    expect(upgradedQuestState('not-yet', { conceptId: 'x', correct: 1, total: 1 })).toBe('not-yet')
  })

  it('never downgrades (a solid concept stays solid)', () => {
    expect(upgradedQuestState('solid', { conceptId: 'x', correct: 0, total: 2 })).toBe('solid')
  })
})

describe('applyQuestResultsToModel — no-op on empty', () => {
  it('returns the same model and no changes when there are no results', () => {
    const m = model({})
    const applied = applyQuestResultsToModel(m, [], 's1', NOW)
    expect(applied.model).toBe(m)
    expect(applied.changedConceptIds).toEqual([])
  })
})

describe('applyQuestResultsToModel — worked examples', () => {
  it('upgrades a queued forming concept to solid on 2/2, appends quest evidence, a change line, and resolves the ask', () => {
    const conceptId = 'reading.phonics.blends'
    const m = model({
      conceptStates: {
        [conceptId]: {
          state: 'forming',
          evidence: [
            { kind: 'curriculumPosition', sourceId: 'fastPhonics', note: 'Covered in Fast Phonics Peak 13', observedAt: '2026-07-01T00:00:00.000Z' },
          ],
          seededAt: '2026-07-01T00:00:00.000Z',
        },
      },
      openQuestions: [ask(conceptId, { reason: 'Covered in Fast Phonics; confirm with a check.' })],
    })

    const results = computeQuestConceptResults([
      { targetConceptId: conceptId, correct: true },
      { targetConceptId: conceptId, correct: true },
    ])
    const { model: next, changedConceptIds } = applyQuestResultsToModel(m, results, 'interactive_child-1_123', NOW)

    // State moved up.
    expect(next.conceptStates[conceptId].state).toBe('solid')
    expect(changedConceptIds).toEqual([conceptId])
    // Prior evidence kept; a quest ref appended.
    const ev = next.conceptStates[conceptId].evidence
    expect(ev).toHaveLength(2)
    expect(ev[1].kind).toBe('quest')
    expect(ev[1].sourceId).toBe('interactive_child-1_123')
    expect(ev[1].note).toContain('2/2')
    // A deterministic change-feed line, sourced quest.
    expect(next.changeFeed.at(-1)).toMatchObject({ conceptId, from: 'forming', to: 'solid' })
    expect(next.changeFeed.at(-1)?.cause).toContain('quest:')
    // The consumed ask is resolved (kept, stamped) — non-blocking for future re-queue.
    expect(next.openQuestions[0].resolvedAt).toBe(NOW)
    expect(next.openQuestions[0].resolvedBySessionId).toBe('interactive_child-1_123')
    expect(selectQuestTargets(next)).toEqual([]) // no longer waiting
  })

  it('on a struggle (1/2) leaves state unchanged but appends evidence and still resolves the ask (no-shame)', () => {
    const conceptId = 'reading.phonics.longVowels'
    const m = model({
      conceptStates: {
        [conceptId]: { state: 'frontier', evidence: [], seededAt: NOW },
      },
      openQuestions: [ask(conceptId)],
    })
    const results = computeQuestConceptResults([
      { targetConceptId: conceptId, correct: true },
      { targetConceptId: conceptId, correct: false },
    ])
    const { model: next, changedConceptIds } = applyQuestResultsToModel(m, results, 's2', NOW)

    expect(next.conceptStates[conceptId].state).toBe('frontier') // unchanged
    expect(changedConceptIds).toEqual([]) // no state change → no change-feed entry
    expect(next.changeFeed).toHaveLength(0)
    expect(next.conceptStates[conceptId].evidence.at(-1)?.kind).toBe('quest') // evidence still recorded
    expect(next.openQuestions[0].resolvedAt).toBe(NOW) // the check happened — ask consumed
  })

  it('moves a queued not-yet concept at most to forming on 2/2', () => {
    const conceptId = 'reading.phonics.digraphs'
    const m = model({
      conceptStates: { [conceptId]: { state: 'not-yet', evidence: [], seededAt: NOW } },
      openQuestions: [ask(conceptId)],
    })
    const results = computeQuestConceptResults([
      { targetConceptId: conceptId, correct: true },
      { targetConceptId: conceptId, correct: true },
    ])
    const { model: next } = applyQuestResultsToModel(m, results, 's3', NOW)
    expect(next.conceptStates[conceptId].state).toBe('forming')
  })

  it('records evidence + upgrade for a tagged concept even with no queued ask', () => {
    const conceptId = 'reading.phonics.cvc'
    const m = model({
      conceptStates: { [conceptId]: { state: 'forming', evidence: [], seededAt: NOW } },
      openQuestions: [],
    })
    const results = computeQuestConceptResults([
      { targetConceptId: conceptId, correct: true },
      { targetConceptId: conceptId, correct: true },
    ])
    const { model: next } = applyQuestResultsToModel(m, results, 's4', NOW)
    expect(next.conceptStates[conceptId].state).toBe('solid')
    expect(next.openQuestions).toEqual([]) // nothing to resolve
  })
})
