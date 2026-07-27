import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── The writer's no-guess bail, asserted at the Firestore boundary ──────────────
//
// `enqueueStuckRetests` runs a cheap model-free pre-resolve and returns BEFORE any
// Firestore read when neither path resolves (no bridged workbook position AND no
// mapped skillTag). The existing `stuckRetestQueue.test.ts` proves the resolver
// returns `[]`; these prove the writer actually stops there — no read, no write, no
// guess — which is what keeps an unmapped item from touching the learner model.
//
// Exercised through the FEAT-70 review-note reason, but the bail is a property of the
// writer shared by all four call-sites. The writer itself is UNTOUCHED by FEAT-70.

const getDoc = vi.fn()
const setDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ __ref: true })),
  getDoc: (...args: unknown[]) => getDoc(...args),
  setDoc: (...args: unknown[]) => setDoc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  learnerModelsCollection: () => ({}),
}))

import { GRADE_NOTE_RETEST_REASON, enqueueStuckRetests } from './stuckRetestQueue'
import { MathTags, WritingTags } from '../../core/types/skillTags'
import type { ChecklistItem } from '../../core/types/planning'
import type { LearnerModel } from '../../core/types/learnerModel'

const NOW = '2026-07-26T12:00:00.000Z'

function seededModel(): LearnerModel {
  return {
    childId: 'c1',
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

beforeEach(() => {
  getDoc.mockReset()
  setDoc.mockReset()
})

describe('FEAT-70 — no-guess: an unresolvable item never touches Firestore', () => {
  it('bails before any read for an item with no workbook link and an unmapped tag', async () => {
    // `writing.*` maps to [] by design in the curated tag bridge.
    const item: ChecklistItem = {
      label: 'Handwriting',
      completed: true,
      skillTags: [WritingTags.LetterFormation],
      reviewFlaggedTricky: true,
    }

    await enqueueStuckRetests('f1', 'c1', item, undefined, NOW, GRADE_NOTE_RETEST_REASON)

    expect(getDoc).not.toHaveBeenCalled()
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('bails for an item with no workbook link and NO tags at all', async () => {
    const item: ChecklistItem = { label: 'Free reading', completed: true }

    await enqueueStuckRetests('f1', 'c1', item, undefined, NOW, GRADE_NOTE_RETEST_REASON)

    expect(getDoc).not.toHaveBeenCalled()
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('bails without a familyId or childId', async () => {
    const item: ChecklistItem = {
      label: 'Regrouping practice',
      completed: true,
      skillTags: [MathTags.SubtractionRegroup],
    }

    await enqueueStuckRetests('', 'c1', item, undefined, NOW, GRADE_NOTE_RETEST_REASON)
    await enqueueStuckRetests('f1', '', item, undefined, NOW, GRADE_NOTE_RETEST_REASON)

    expect(getDoc).not.toHaveBeenCalled()
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('no-ops when the model has not been seeded — reads, then writes nothing', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const item: ChecklistItem = {
      label: 'Regrouping practice',
      completed: true,
      skillTags: [MathTags.SubtractionRegroup],
    }

    await enqueueStuckRetests('f1', 'c1', item, undefined, NOW, GRADE_NOTE_RETEST_REASON)

    expect(getDoc).toHaveBeenCalledTimes(1)
    expect(setDoc).not.toHaveBeenCalled()
  })
})

describe('FEAT-70 — the bail tests are not vacuous: a mapped item DOES write', () => {
  it('reads the model and merge-writes the queued ask with the FEAT-70 reason', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => seededModel() })
    const item: ChecklistItem = {
      label: 'Regrouping practice',
      completed: true,
      skillTags: [MathTags.SubtractionRegroup],
      reviewFlaggedTricky: true,
    }

    await enqueueStuckRetests('f1', 'c1', item, undefined, NOW, GRADE_NOTE_RETEST_REASON)

    expect(getDoc).toHaveBeenCalledTimes(1)
    expect(setDoc).toHaveBeenCalledTimes(1)

    const [, payload, options] = setDoc.mock.calls[0]
    expect(options).toEqual({ merge: true })

    const merged = payload as Partial<LearnerModel>
    const ask = merged.openQuestions?.find(
      (q) => q.conceptId === 'math.operations.regrouping',
    )
    expect(ask?.routedTo).toBe('quest')
    expect(ask?.reason).toBe(GRADE_NOTE_RETEST_REASON)

    // learnerModels-only, and no conceptState moved — a review note queues a check,
    // it does not assert a state.
    expect(Object.keys(merged).sort()).toEqual(
      ['changeFeed', 'openQuestions', 'synthesisStaleAt', 'updatedAt'].sort(),
    )
  })

  it('swallows a failing write — the parent-facing save is never blocked', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => seededModel() })
    setDoc.mockRejectedValue(new Error('offline'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const item: ChecklistItem = {
      label: 'Regrouping practice',
      completed: true,
      skillTags: [MathTags.SubtractionRegroup],
    }

    await expect(
      enqueueStuckRetests('f1', 'c1', item, undefined, NOW, GRADE_NOTE_RETEST_REASON),
    ).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
