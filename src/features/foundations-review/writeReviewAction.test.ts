// The merge shape has exactly ONE definition (FEAT-66). These tests pin it, so a
// second write path can't quietly grow a different payload.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const setDocMock = vi.fn(async () => {})
vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...(args as [])),
}))

import { applyReviewActionToModel } from './foundationsReviewActions'
import type { FoundationsReviewAction } from './foundationsReviewActions'
import {
  applyAndWriteReviewAction,
  buildReviewActionMerge,
  writeReviewAction,
} from './writeReviewAction'
import type { LearnerModel } from '../../core/types/learnerModel'

const NOW = '2026-07-25T12:00:00.000Z'
const CVC = 'reading.phonics.cvc'
const LONG = 'reading.phonics.longVowels'

function emptyModel(): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'seeded',
    conceptStates: {
      [LONG]: { state: 'frontier', evidence: [] },
    },
    modalityCalibration: {
      reading: { note: '' },
      writing: { note: '' },
      math: { note: '' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

const attest: FoundationsReviewAction = {
  kind: 'attest',
  childId: 'c1',
  conceptId: CVC,
  state: 'solid',
  note: 'He read cat, run, sit',
}

// Stand-in for the typed DocumentReference — the writer only hands it to setDoc.
const REF = { path: 'families/f1/learnerModels/c1' } as never

beforeEach(() => vi.clearAllMocks())

describe('buildReviewActionMerge', () => {
  it('merges a SINGLE conceptStates key — never the whole map', () => {
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    const merge = buildReviewActionMerge(applied) as Record<string, unknown>

    expect(Object.keys(merge).sort()).toEqual([
      'changeFeed',
      'conceptStates',
      'openQuestions',
      'synthesisStaleAt',
      'updatedAt',
    ])
    const states = merge.conceptStates as Record<string, unknown>
    expect(Object.keys(states)).toEqual([CVC])
    // The untouched concept is absent from the payload entirely.
    expect(states[LONG]).toBeUndefined()
  })

  it('stamps synthesisStaleAt with the same updatedAt (FEAT-57 D4)', () => {
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    const merge = buildReviewActionMerge(applied) as Record<string, unknown>
    expect(merge.updatedAt).toBe(NOW)
    expect(merge.synthesisStaleAt).toBe(NOW)
  })

  it('omits conceptStates entirely for a queueTest (no state write)', () => {
    const applied = applyReviewActionToModel(
      emptyModel(),
      { kind: 'queueTest', childId: 'c1', conceptId: LONG },
      NOW,
    )
    const merge = buildReviewActionMerge(applied) as Record<string, unknown>
    expect(merge.conceptStates).toBeUndefined()
    expect(merge.openQuestions).toHaveLength(1)
  })
})

describe('writeReviewAction', () => {
  it('writes merge-only, once', async () => {
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    await writeReviewAction(REF, applied)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [ref, payload, opts] = setDocMock.mock.calls[0] as unknown[]
    expect(ref).toBe(REF)
    expect(opts).toEqual({ merge: true })
    expect((payload as Record<string, unknown>).conceptStates).toBeDefined()
  })

  it('propagates a write failure so callers can surface it', async () => {
    setDocMock.mockRejectedValueOnce(new Error('firestore down') as never)
    const applied = applyReviewActionToModel(emptyModel(), attest, NOW)
    await expect(writeReviewAction(REF, applied)).rejects.toThrow('firestore down')
  })
})

describe('applyAndWriteReviewAction', () => {
  it('applies then persists, returning the next model', async () => {
    const next = await applyAndWriteReviewAction(REF, emptyModel(), attest, NOW)
    expect(next.conceptStates[CVC].state).toBe('solid')
    expect(next.conceptStates[CVC].evidence.at(-1)).toMatchObject({
      kind: 'attestation',
      overriddenBy: 'parent',
      note: 'He read cat, run, sit',
    })
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('does not swallow a failed write', async () => {
    setDocMock.mockRejectedValueOnce(new Error('nope') as never)
    await expect(
      applyAndWriteReviewAction(REF, emptyModel(), attest, NOW),
    ).rejects.toThrow('nope')
  })
})
