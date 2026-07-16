import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EvaluationFinding } from '../../core/types/evaluation'
import type { LearnerModel } from '../../core/types/learnerModel'

// ── Firestore mocks ──────────────────────────────────────────────
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

import { syncEvalFindingsToModel } from './evalModelWriteback'

const NOW = '2026-07-16T12:00:00.000Z'
const CVC = 'reading.phonics.cvc'

function finding(
  skill: string,
  status: EvaluationFinding['status'],
): EvaluationFinding {
  return { skill, status, evidence: 'observed', testedAt: NOW }
}

function seededModel(): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: { [CVC]: { state: 'frontier', evidence: [], seededAt: NOW } },
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

describe('syncEvalFindingsToModel', () => {
  it('writes the projected model + sets synthesisStaleAt on an existing model', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => seededModel() })
    setDoc.mockResolvedValue(undefined)

    await syncEvalFindingsToModel('fam-1', 'c1', 'sess-1', [finding('phonics.cvc', 'mastered')], NOW)

    expect(setDoc).toHaveBeenCalledTimes(1)
    const written = setDoc.mock.calls[0][1] as LearnerModel
    expect(written.conceptStates[CVC].state).toBe('solid')
    expect(written.conceptStates[CVC].evidence.some((e) => e.kind === 'eval')).toBe(true)
    expect(written.synthesisStaleAt).toBe(NOW)
    // merge-only
    expect(setDoc.mock.calls[0][2]).toEqual({ merge: true })
  })

  it('no-ops (no write) when the child has no seeded model', async () => {
    getDoc.mockResolvedValue({ exists: () => false })

    await syncEvalFindingsToModel('fam-1', 'c1', 'sess-1', [finding('phonics.cvc', 'mastered')], NOW)

    expect(setDoc).not.toHaveBeenCalled()
  })

  it('no-ops (no read, no write) when no finding maps to a graph concept', async () => {
    await syncEvalFindingsToModel('fam-1', 'c1', 'sess-1', [finding('phonics.cvc', 'not-tested')], NOW)

    expect(getDoc).not.toHaveBeenCalled()
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('swallows a thrown model write — never propagates (apply-isolation)', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => seededModel() })
    setDoc.mockRejectedValue(new Error('firestore down'))

    // Must resolve, not reject — a model write failure never breaks the apply.
    await expect(
      syncEvalFindingsToModel('fam-1', 'c1', 'sess-1', [finding('phonics.cvc', 'mastered')], NOW),
    ).resolves.toBeUndefined()
  })
})
