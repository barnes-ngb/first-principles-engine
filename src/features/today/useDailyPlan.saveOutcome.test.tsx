import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EnergyLevel, PlanType } from '../../core/types/enums'
import { DailyPlanSaveRefusal, dailyPlanSaveFailureNotice } from './dailyPlanGate'
import { useDailyPlan } from './useDailyPlan'

/**
 * UX-352 — the UX-345 gate is RIGHT and stays; only its silence was wrong.
 *
 * FIX-223 stopped one child's `sessions` being written onto his brother's day,
 * which was a real defect and is not weakened here. What it left was a
 * `saveDailyPlan` that opened with two bare `return`s and closed with a
 * `console.error`, so a tap that was declined — or a write that was rejected —
 * reached the parent as nothing at all, on a surface whose other control
 * announces every success with a *"Saved"* snack.
 *
 * POSITIVE CONTROL: restore the `Promise<void>` signature (a bare `return` in
 * each guard, a `console.error` in the catch) and every assertion below fails,
 * because there is nothing for the page to report.
 */

const setDoc = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
const getDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (_col: unknown, id: string) => ({ id }),
  getDoc: (ref: unknown) => getDoc(ref),
  setDoc: (ref: unknown, data: unknown, opts: unknown) => setDoc(ref, data, opts),
}))

vi.mock('../../core/firebase/firestore', () => ({
  dailyPlansCollection: () => ({}),
  dailyPlanDocId: (date: string, childId: string) => `${date}_${childId}`,
}))

function mount(childId = 'lincoln') {
  return renderHook(() =>
    useDailyPlan({ familyId: 'fam-1', childId, date: '2026-09-11' }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('saveDailyPlan answers whether the tap landed', () => {
  it('says ok when the write lands', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const { result } = mount()
    await waitFor(() => expect(result.current.isEditable).toBe(true))

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.saveDailyPlan(EnergyLevel.Low, PlanType.Mvd)
    })

    expect(outcome).toEqual({ ok: true })
  })

  it('names a rejected write rather than logging it and returning', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    setDoc.mockRejectedValueOnce(new Error('permission-denied'))
    const { result } = mount()
    await waitFor(() => expect(result.current.isEditable).toBe(true))

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.saveDailyPlan(EnergyLevel.Low, PlanType.Mvd)
    })

    expect(outcome).toEqual({ ok: false, reason: DailyPlanSaveRefusal.Rejected })
  })

  it('names a tap taken while the read is still open — and writes nothing', async () => {
    getDoc.mockReturnValue(new Promise(() => {}))
    const { result } = mount()

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.saveDailyPlan(EnergyLevel.Low, PlanType.Mvd)
    })

    expect(outcome).toEqual({ ok: false, reason: DailyPlanSaveRefusal.NotReady })
    // The gate itself is untouched: nothing reached Firestore.
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('tells a FAILED read apart from a slow one — the advice differs', async () => {
    getDoc.mockRejectedValue(new Error('unavailable'))
    const { result } = mount()
    await waitFor(() => expect(result.current.loadFailed).toBe(true))

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.saveDailyPlan(EnergyLevel.Low, PlanType.Mvd)
    })

    expect(outcome).toEqual({ ok: false, reason: DailyPlanSaveRefusal.ReadFailed })
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('names a missing target', async () => {
    getDoc.mockResolvedValue({ exists: () => false })
    const { result } = mount('')

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.saveDailyPlan(EnergyLevel.Low, PlanType.Mvd)
    })

    expect(outcome).toEqual({ ok: false, reason: DailyPlanSaveRefusal.NoTarget })
  })
})

describe('dailyPlanSaveFailureNotice', () => {
  it('tells a parent to wait for one state and to reload for the other', () => {
    expect(dailyPlanSaveFailureNotice(DailyPlanSaveRefusal.NotReady).text).toContain(
      'still loading',
    )
    expect(dailyPlanSaveFailureNotice(DailyPlanSaveRefusal.ReadFailed).text).toContain(
      'Reload',
    )
  })

  it('never claims anything about the day itself', () => {
    for (const reason of Object.values(DailyPlanSaveRefusal)) {
      const { text, severity } = dailyPlanSaveFailureNotice(reason)
      expect(severity).toBe('error')
      expect(text.toLowerCase()).not.toContain('no plan')
      expect(text).not.toContain('Saved')
    }
  })
})
