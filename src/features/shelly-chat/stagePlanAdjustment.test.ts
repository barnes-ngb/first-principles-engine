import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { PlanAdjustmentAction } from './stagePlanAdjustment'

// ── Mocks ────────────────────────────────────────────────────────
// Mock Firestore so the stage/consume contract is testable without Firebase.
// `doc` returns a tagged path so we can assert the writer + reader resolve the
// SAME per-child inbox doc.
const setDoc = vi.fn()
const getDoc = vi.fn()
const deleteDoc = vi.fn()
const doc = vi.fn((...args: unknown[]) => ({ __path: args[1] as string }))
vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDoc(...args),
  getDoc: (...args: unknown[]) => getDoc(...args),
  deleteDoc: (...args: unknown[]) => deleteDoc(...args),
  doc: (...args: unknown[]) => doc(...args),
}))

vi.mock('../../core/firebase/firestore', () => ({
  db: { __db: true },
}))

import {
  stagePlanAdjustment,
  consumePlanAdjustment,
  pendingPlanAdjustmentRef,
} from './stagePlanAdjustment'

const ACTION: PlanAdjustmentAction = {
  kind: 'proposePlanAdjustment',
  childId: 'lincoln1',
  summary: 'Reduce math to 10 min/day next week',
  rationale: 'Frustration is spiking in math',
}

beforeEach(() => {
  vi.clearAllMocks()
  setDoc.mockResolvedValue(undefined)
  deleteDoc.mockResolvedValue(undefined)
})

describe('stagePlanAdjustment', () => {
  it('resolves the per-child inbox doc path', () => {
    pendingPlanAdjustmentRef('fam1', 'lincoln1')
    expect(doc).toHaveBeenCalledWith(
      { __db: true },
      'families/fam1/settings/pendingPlanAdjustment_lincoln1',
    )
  })

  it('writes the brief to the per-child inbox (no plan write)', async () => {
    await stagePlanAdjustment('fam1', ACTION)

    expect(setDoc).toHaveBeenCalledTimes(1)
    const [ref, payload] = setDoc.mock.calls[0]
    expect(ref).toEqual({ __path: 'families/fam1/settings/pendingPlanAdjustment_lincoln1' })
    expect(payload).toMatchObject({
      childId: 'lincoln1',
      summary: ACTION.summary,
      rationale: ACTION.rationale,
      stagedAt: expect.any(String),
    })
  })

  it('omits optional scope/targetWeek when absent', async () => {
    await stagePlanAdjustment('fam1', ACTION)
    const payload = setDoc.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('scope')
    expect(payload).not.toHaveProperty('targetWeek')
  })

  it('keeps scope/targetWeek when present', async () => {
    await stagePlanAdjustment('fam1', { ...ACTION, scope: 'math', targetWeek: '2026-06-22' })
    const payload = setDoc.mock.calls[0][1] as Record<string, unknown>
    expect(payload.scope).toBe('math')
    expect(payload.targetWeek).toBe('2026-06-22')
  })
})

describe('consumePlanAdjustment', () => {
  it('reads, returns, AND clears the brief (apply-once)', async () => {
    const staged = {
      childId: 'lincoln1',
      summary: ACTION.summary,
      rationale: ACTION.rationale,
      stagedAt: '2026-06-21T00:00:00.000Z',
    }
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => staged })

    const result = await consumePlanAdjustment('fam1', 'lincoln1')

    expect(result).toEqual(staged)
    // Cleared so a refresh / child-switch can't replay it.
    expect(deleteDoc).toHaveBeenCalledTimes(1)
    expect(deleteDoc).toHaveBeenCalledWith({
      __path: 'families/fam1/settings/pendingPlanAdjustment_lincoln1',
    })
  })

  it('returns null and clears nothing when the inbox is empty', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined })

    const result = await consumePlanAdjustment('fam1', 'lincoln1')

    expect(result).toBeNull()
    expect(deleteDoc).not.toHaveBeenCalled()
  })
})
