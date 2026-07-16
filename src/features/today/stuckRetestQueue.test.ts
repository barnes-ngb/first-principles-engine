import { describe, expect, it } from 'vitest'

import { ENGAGEMENT_RETEST_REASON, STUCK_RETEST_REASON } from './stuckRetestQueue'
import { buildStuckBlock } from './masteryBlocker'
import { MathTags, WritingTags } from '../../core/types/skillTags'
import { resolveStuckConcepts } from '../../core/foundations/dailySignalTargeting'
import { applyReviewActionToModel } from '../foundations-review/foundationsReviewActions'
import { selectQuestTargets } from '../../core/foundations/questTargeting'
import type { ActivityConfig, ChecklistItem } from '../../core/types/planning'
import type { LearnerModel } from '../../core/types/learnerModel'

// Integration-style: prove the FEAT-68 wire end-to-end using the SAME pure pieces
// `enqueueStuckRetests` composes (the async writer is a thin Firestore merge over
// these, following the untested-thin-writer convention of `workbookPositionSync`).
//   stuck chip on a bridged item → resolveStuckConcepts → queueTest apply
//     → openQuestion on the model → selectQuestTargets returns it as a target.

const NOW = '2026-07-16T12:00:00.000Z'

function seededModel(): LearnerModel {
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
  }
}

// A stuck Fast Phonics item at Lesson 65 → Peak 13 → blends + multisyllable.
const stuckItem: ChecklistItem = {
  label: 'Fast Phonics',
  completed: true,
  mastery: 'stuck',
  workbookConfigId: 'cfg-fp',
  subjectBucket: 'Reading' as ChecklistItem['subjectBucket'],
}
const fpConfig: ActivityConfig = {
  id: 'cfg-fp',
  name: 'Fast Phonics',
  type: 'workbook' as ActivityConfig['type'],
  subjectBucket: 'Reading' as ActivityConfig['subjectBucket'],
  defaultMinutes: 15,
  frequency: 'daily' as ActivityConfig['frequency'],
  childId: 'child-1',
  sortOrder: 0,
  scannable: true,
  completed: false,
  currentPosition: 65,
  createdAt: NOW,
  updatedAt: NOW,
}

/** Mirror the writer's fold: apply one queueTest per resolved concept. */
function enqueue(
  model: LearnerModel,
  concepts: string[],
  reason: string = STUCK_RETEST_REASON,
): LearnerModel {
  let m = model
  for (const conceptId of concepts) {
    m = applyReviewActionToModel(
      m,
      { kind: 'queueTest', childId: 'child-1', conceptId, reason },
      NOW,
    ).model
  }
  return m
}

describe('FEAT-68 loop — stuck chip seeds a re-test the Mine consumes', () => {
  it('a stuck bridged item queues an openQuestion selectQuestTargets returns', () => {
    const concepts = resolveStuckConcepts(stuckItem, fpConfig)
    expect(concepts).toContain('reading.phonics.blends')

    const model = enqueue(seededModel(), concepts)

    // The ask landed as a routedTo:quest openQuestion with the daily-signal reason.
    const blendsAsk = model.openQuestions.find(
      (q) => q.conceptId === 'reading.phonics.blends',
    )
    expect(blendsAsk).toBeDefined()
    expect(blendsAsk?.routedTo).toBe('quest')
    expect(blendsAsk?.reason).toBe(STUCK_RETEST_REASON)
    expect(blendsAsk?.resolvedAt).toBeUndefined()

    // FEAT-54's consumer picks it up as a preferred concept for the next session.
    const targets = selectQuestTargets(model, { domain: 'reading' })
    expect(targets.map((t) => t.conceptId)).toContain('reading.phonics.blends')
  })

  it('dedups — repeated struggles on the same concept do not pile up asks', () => {
    const concepts = resolveStuckConcepts(stuckItem, fpConfig)
    const once = enqueue(seededModel(), concepts)
    const twice = enqueue(once, concepts) // same concepts again (another stuck tap)
    const blendsAsks = twice.openQuestions.filter(
      (q) => q.conceptId === 'reading.phonics.blends' && !q.resolvedAt,
    )
    expect(blendsAsks).toHaveLength(1)
  })

  it('an unmapped source resolves to [] → nothing is queued (no guess)', () => {
    const concepts = resolveStuckConcepts(stuckItem, { ...fpConfig, name: 'Unbridged Co Math' })
    expect(concepts).toEqual([])
    const model = enqueue(seededModel(), concepts)
    expect(model.openQuestions).toEqual([])
  })

  it('does not touch conceptStates — a struggle only queues a check, no state change', () => {
    const concepts = resolveStuckConcepts(stuckItem, fpConfig)
    const model = enqueue(seededModel(), concepts)
    expect(model.conceptStates).toEqual({})
  })

  it('the parallel skillSnapshots.conceptualBlock path still fires from the same signal', () => {
    // No regression: the same stuck item still yields a conceptualBlock for the
    // (untouched, invariant-protected) snapshot write path that runs in parallel.
    const block = buildStuckBlock(stuckItem, NOW)
    expect(block?.status).toBe('ADDRESS_NOW')
    expect(block?.source).toBe('parent')
  })
})

// ── FEAT-69: NON-workbook struggle signals seed the same loop via skillTags ──

// A stuck item with NO workbook link — resolves purely by its mapped skillTag.
const tagOnlyStuckItem: ChecklistItem = {
  label: 'Regrouping practice',
  completed: true,
  mastery: 'stuck',
  subjectBucket: 'Math' as ChecklistItem['subjectBucket'],
  skillTags: [MathTags.SubtractionRegroup],
}

describe('FEAT-69 loop — a NON-workbook stuck chip seeds a re-test via its tag', () => {
  it('resolves via the tag bridge (no config) and the Mine picks it up', () => {
    const concepts = resolveStuckConcepts(tagOnlyStuckItem, undefined)
    expect(concepts).toEqual(['math.operations.regrouping'])

    const model = enqueue(seededModel(), concepts)
    const ask = model.openQuestions.find(
      (q) => q.conceptId === 'math.operations.regrouping',
    )
    expect(ask?.routedTo).toBe('quest')
    expect(ask?.reason).toBe(STUCK_RETEST_REASON)

    const targets = selectQuestTargets(model, { domain: 'math' })
    expect(targets.map((t) => t.conceptId)).toContain('math.operations.regrouping')
  })

  it('an unmapped-tag non-workbook item resolves to [] → nothing queued (no guess)', () => {
    const item: ChecklistItem = {
      label: 'Handwriting',
      completed: true,
      mastery: 'stuck',
      skillTags: [WritingTags.LetterFormation],
    }
    const concepts = resolveStuckConcepts(item, undefined)
    expect(concepts).toEqual([])
    expect(enqueue(seededModel(), concepts).openQuestions).toEqual([])
  })

  it('the parallel conceptualBlock path still fires for a tag-only item (no regression)', () => {
    const block = buildStuckBlock(tagOnlyStuckItem, NOW)
    expect(block?.status).toBe('ADDRESS_NOW')
    expect(block?.source).toBe('parent')
  })
})

describe("FEAT-69 loop — engagement:'struggled' seeds a re-test with its own reason", () => {
  it('queues the tag concept with the engagement reason the Mine consumes', () => {
    // The engagement flag rides the SAME item→concept bridge; the caller passes
    // ENGAGEMENT_RETEST_REASON so the parent-facing ask reads honestly.
    const concepts = resolveStuckConcepts(tagOnlyStuckItem, undefined)
    const model = enqueue(seededModel(), concepts, ENGAGEMENT_RETEST_REASON)

    const ask = model.openQuestions.find(
      (q) => q.conceptId === 'math.operations.regrouping',
    )
    expect(ask?.routedTo).toBe('quest')
    expect(ask?.reason).toBe(ENGAGEMENT_RETEST_REASON)
    expect(ask?.reason).not.toBe(STUCK_RETEST_REASON)

    const targets = selectQuestTargets(model, { domain: 'math' })
    expect(targets.map((t) => t.conceptId)).toContain('math.operations.regrouping')
  })

  it('dedups a struggled-engagement ask against a prior stuck-chip ask on the same concept', () => {
    const concepts = resolveStuckConcepts(tagOnlyStuckItem, undefined)
    const afterStuck = enqueue(seededModel(), concepts, STUCK_RETEST_REASON)
    const afterBoth = enqueue(afterStuck, concepts, ENGAGEMENT_RETEST_REASON)
    const asks = afterBoth.openQuestions.filter(
      (q) => q.conceptId === 'math.operations.regrouping' && !q.resolvedAt,
    )
    expect(asks).toHaveLength(1)
  })
})
