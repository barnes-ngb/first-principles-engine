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
