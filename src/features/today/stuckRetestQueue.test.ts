import { describe, expect, it } from 'vitest'

import { STUCK_RETEST_REASON } from './stuckRetestQueue'
import { buildStuckBlock } from './masteryBlocker'
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
function enqueue(model: LearnerModel, concepts: string[]): LearnerModel {
  let m = model
  for (const conceptId of concepts) {
    m = applyReviewActionToModel(
      m,
      { kind: 'queueTest', childId: 'child-1', conceptId, reason: STUCK_RETEST_REASON },
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
