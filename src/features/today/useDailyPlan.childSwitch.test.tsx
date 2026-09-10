import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EnergyLevel, PlanType } from '../../core/types/enums'

/**
 * UX-345 — one child's day sessions must never be written onto another child's
 * plan.
 *
 * `saveDailyPlan` builds its document id from the LIVE `childId` and its
 * payload from the loaded plan, and the loaded plan used to survive a child
 * change until the new read resolved. Today has its own `ChildSelector`, so
 * this is reachable with the header switcher off. The census filed the row as
 * SAFE having named this exact hazard and then dismissed it; Codex round 4 on
 * PR #1820 overturned it.
 *
 * The POSITIVE CONTROL is the last case in each block: remove the render-time
 * clear, or the `isEditable` guard, and the assertions below fail because the
 * previous child's `sessions` reach the write.
 */

const setDoc = vi.fn<(ref: unknown, data: unknown, opts: unknown) => Promise<void>>(
  async () => {},
)
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

const LINCOLN_SESSIONS = [{ id: 's1', label: "Lincoln's math block" }]

function planFor(childId: string, sessions: unknown[]) {
  return {
    exists: () => true,
    data: () => ({
      childId,
      date: '2026-09-10',
      energy: EnergyLevel.Normal,
      planType: PlanType.Normal,
      sessions,
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('useDailyPlan binds its payload to the child it read for', () => {
  it('drops the loaded plan on a child change, before the new read opens', async () => {
    const { useDailyPlan } = await import('./useDailyPlan')
    getDoc.mockResolvedValue(planFor('lincoln', LINCOLN_SESSIONS))

    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useDailyPlan({ familyId: 'fam-1', childId, date: '2026-09-10' }),
      { initialProps: { childId: 'lincoln' } },
    )

    await waitFor(() => expect(result.current.dailyPlan).not.toBeNull())

    // A read that never resolves — the window this defect lived in.
    getDoc.mockReturnValue(new Promise(() => {}))
    rerender({ childId: 'london' })

    // POSITIVE CONTROL — without the render-time clear this still held
    // Lincoln's plan while every write addressed London's document.
    expect(result.current.dailyPlan).toBeNull()
    expect(result.current.isEditable).toBe(false)
  })

  it('writes nothing at all while the new child’s read is still open', async () => {
    const { useDailyPlan } = await import('./useDailyPlan')
    getDoc.mockResolvedValue(planFor('lincoln', LINCOLN_SESSIONS))

    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useDailyPlan({ familyId: 'fam-1', childId, date: '2026-09-10' }),
      { initialProps: { childId: 'lincoln' } },
    )
    await waitFor(() => expect(result.current.isEditable).toBe(true))

    getDoc.mockReturnValue(new Promise(() => {}))
    rerender({ childId: 'london' })

    await act(async () => {
      await result.current.saveDailyPlan(EnergyLevel.Low, PlanType.Mvd)
    })

    // POSITIVE CONTROL — before the gate this wrote
    // `{ childId: 'london', sessions: [Lincoln's math block] }`.
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('writes the new child’s own plan once their read has settled', async () => {
    const { useDailyPlan } = await import('./useDailyPlan')
    getDoc.mockResolvedValue(planFor('lincoln', LINCOLN_SESSIONS))

    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useDailyPlan({ familyId: 'fam-1', childId, date: '2026-09-10' }),
      { initialProps: { childId: 'lincoln' } },
    )
    await waitFor(() => expect(result.current.isEditable).toBe(true))

    const londonSessions = [{ id: 's9', label: "London's letters" }]
    getDoc.mockResolvedValue(planFor('london', londonSessions))
    rerender({ childId: 'london' })
    await waitFor(() => expect(result.current.isEditable).toBe(true))

    await act(async () => {
      await result.current.saveDailyPlan(EnergyLevel.Low, PlanType.Mvd)
    })

    // The gate closes a hole; it does not disable the feature.
    expect(setDoc).toHaveBeenCalledTimes(1)
    const [ref, data, opts] = setDoc.mock.calls[0] as unknown as [
      { id: string },
      { childId: string; sessions: unknown[]; energy: string; planType: string },
      unknown,
    ]
    expect(ref.id).toBe('2026-09-10_london')
    expect(data.childId).toBe('london')
    expect(data.sessions).toEqual(londonSessions)
    // Nothing about the written document's shape changed: same merge, same
    // energy and plan type the caller passed.
    expect(opts).toEqual({ merge: true })
    expect(data.energy).toBe(EnergyLevel.Low)
    expect(data.planType).toBe(PlanType.Mvd)
  })

  it('stays un-editable after a FAILED read — not an affirmative empty day', async () => {
    const { useDailyPlan } = await import('./useDailyPlan')
    getDoc.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() =>
      useDailyPlan({ familyId: 'fam-1', childId: 'lincoln', date: '2026-09-10' }),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.loadFailed).toBe(true)
    expect(result.current.isEditable).toBe(false)

    await act(async () => {
      await result.current.saveDailyPlan(EnergyLevel.Normal, PlanType.Normal)
    })

    // POSITIVE CONTROL — before the flag, a dropped read looked exactly like a
    // day with no sessions, and this wrote `sessions: []` over a day that had
    // some, under `merge: true`.
    expect(setDoc).not.toHaveBeenCalled()
  })
})
