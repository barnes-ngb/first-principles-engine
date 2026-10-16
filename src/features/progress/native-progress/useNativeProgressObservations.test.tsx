import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../../../core/types/nativeProgress'

/**
 * Reading back what was recorded, per child (FEAT-241).
 *
 * The four things these pin:
 *
 *  1. the subscription is filtered to the child it was asked for, and the rows it
 *     returns are stamped with that child — so a caller can tell *settled for this
 *     child* from *the previous child's answer*;
 *  2. a FAILED read is not an empty record;
 *  3. a successful save reads back immediately, without waiting for a snapshot,
 *     and the snapshot that follows does not duplicate it; and
 *  4. a save confirmed for one child never splices its row into the list the
 *     screen is now showing for another — including across an A → B → A switch,
 *     which is the case a simple id comparison gets wrong.
 */

let snapshotNext: ((snap: unknown) => void) | null = null
let snapshotError: ((err: Error) => void) | null = null
const whereCalls: Array<[string, string, string]> = []
const unsubscribe = vi.fn()

vi.mock('firebase/firestore', () => ({
  query: (...parts: unknown[]) => ({ __query: parts }),
  where: (field: string, op: string, value: string) => {
    whereCalls.push([field, op, value])
    return { __where: [field, op, value] }
  },
  onSnapshot: (
    _q: unknown,
    next: (snap: unknown) => void,
    error: (err: Error) => void,
  ) => {
    snapshotNext = next
    snapshotError = error
    return unsubscribe
  },
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))
vi.mock('../../../core/firebase/firestore', () => ({
  nativeProgressObservationsCollection: () => ({ __col: 'nativeProgressObservations' }),
}))

class Refused extends Error {}
const saveMock = vi.fn()
vi.mock('../../../core/firebase/nativeProgressWrites', () => ({
  NativeProgressRefused: Refused,
  saveNativeProgressObservation: (...a: unknown[]) => saveMock(...a),
}))

import {
  NATIVE_PROGRESS_SAVE_IN_FLIGHT,
  useNativeProgressObservations,
} from './useNativeProgressObservations'

function row(overrides: Partial<NativeProgressObservation> = {}): NativeProgressObservation {
  return {
    id: 'lincoln__e1',
    childId: 'lincoln',
    program: NativeProgressProgram.Mathseeds,
    nativeNumber: 42,
    meaning: NativeProgressMeaning.WorkingOn,
    observedOn: '2026-10-12',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-10-14T15:00:00.000Z',
    entryKey: 'e1',
    ...overrides,
  }
}

/** Deliver a snapshot the way Firestore would. */
function emit(rows: NativeProgressObservation[]) {
  snapshotNext?.({ docs: rows.map((r) => ({ id: r.id, data: () => r })) })
}

const request = (childId: string, entryKey = 'draft-key-0001') => ({
  familyId: 'fam-1',
  childId,
  entryKey,
  observation: {
    program: NativeProgressProgram.Mathseeds,
    nativeNumber: 42,
    meaning: NativeProgressMeaning.WorkingOn,
    observedOn: '2026-10-12',
    source: NativeProgressSource.ParentReport,
  },
})

beforeEach(() => {
  snapshotNext = null
  snapshotError = null
  whereCalls.length = 0
  unsubscribe.mockClear()
  saveMock.mockReset()
  saveMock.mockImplementation(async (args: { childId: string; entryKey: string }) => ({
    observation: row({
      id: `${args.childId}__${args.entryKey}`,
      childId: args.childId,
      entryKey: args.entryKey,
    }),
    alreadyRecorded: false,
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('reading one child back', () => {
  it('asks only for that child, and stamps what it answers', async () => {
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    expect(whereCalls).toEqual([['childId', '==', 'lincoln']])
    expect(result.current.loading).toBe(true)
    expect(result.current.observationsChildId).toBeNull()

    act(() => emit([row()]))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.observationsChildId).toBe('lincoln')
    expect(result.current.observations.map((o) => o.id)).toEqual(['lincoln__e1'])
  })

  it('drops the previous child during render, so no row is shown under the wrong name', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useNativeProgressObservations(childId),
      { initialProps: { childId: 'lincoln' } },
    )
    act(() => emit([row()]))
    await waitFor(() => expect(result.current.observations).toHaveLength(1))

    rerender({ childId: 'london' })

    // Not one render of Lincoln's rows stamped 'london'.
    expect(result.current.observations).toEqual([])
    expect(result.current.observationsChildId).toBeNull()
    expect(result.current.loading).toBe(true)
    expect(whereCalls.at(-1)).toEqual(['childId', '==', 'london'])
  })

  it('a failed read is an error, not an empty record', async () => {
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    act(() => snapshotError?.(new Error('permission-denied')))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('permission-denied')
    expect(result.current.observations).toEqual([])
    // Stamped, so a caller can tell this failure from the other child's success.
    expect(result.current.observationsChildId).toBe('lincoln')
  })
})

describe('recording', () => {
  it('passes the pinned family, child and draft key straight through', async () => {
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    act(() => emit([]))

    await act(async () => {
      await result.current.save(request('lincoln'))
    })

    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: 'fam-1',
        childId: 'lincoln',
        entryKey: 'draft-key-0001',
      }),
    )
  })

  it('reads the saved row back immediately, and the later snapshot does not duplicate it', async () => {
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    act(() => emit([]))

    await act(async () => {
      await result.current.save(request('lincoln'))
    })
    expect(result.current.observations.map((o) => o.id)).toEqual([
      'lincoln__draft-key-0001',
    ])

    act(() => emit([row({ id: 'lincoln__draft-key-0001', entryKey: 'draft-key-0001' })]))
    expect(result.current.observations).toHaveLength(1)
  })

  it('refuses a second save while one is in flight', async () => {
    // Held on an object rather than in a `let`, so the assignment inside the
    // promise's executor is visible to the type checker at the use site.
    const gate: { release?: () => void } = {}
    const inFlight: { promise?: Promise<unknown> } = {}
    saveMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          gate.release = () =>
            resolve({ observation: row({ id: 'lincoln__draft-key-0001' }), alreadyRecorded: false })
        }),
    )
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    act(() => emit([]))

    act(() => {
      inFlight.promise = result.current.save(request('lincoln'))
    })
    const second = await result.current.save(request('lincoln'))

    expect(second).toEqual({ ok: false, message: NATIVE_PROGRESS_SAVE_IN_FLIGHT })
    expect(saveMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      gate.release?.()
      await inFlight.promise
    })
    expect(result.current.saving).toBe(false)
  })

  it('reports a refusal with the writer’s own sentence, and a failure as unsaved', async () => {
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    act(() => emit([]))

    saveMock.mockRejectedValueOnce(new Refused('The entry you were correcting is gone.'))
    let outcome = await result.current.save(request('lincoln'))
    expect(outcome).toEqual({ ok: false, message: 'The entry you were correcting is gone.' })

    saveMock.mockRejectedValueOnce(new Error('offline'))
    outcome = await result.current.save(request('lincoln'))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message).toMatch(/not saved/i)
    // Nothing was added to the list by a failure.
    expect(result.current.observations).toEqual([])
  })

  it('does not splice a save confirmed for one child into the other child’s list', async () => {
    const gate: { release?: () => void } = {}
    const inFlight: { promise?: Promise<unknown> } = {}
    saveMock.mockImplementation(
      (a: { childId: string; entryKey: string }) =>
        new Promise((resolve) => {
          gate.release = () =>
            resolve({
              observation: row({ id: `${a.childId}__${a.entryKey}`, childId: a.childId }),
              alreadyRecorded: false,
            })
        }),
    )
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useNativeProgressObservations(childId),
      { initialProps: { childId: 'lincoln' } },
    )
    act(() => emit([]))

    act(() => {
      inFlight.promise = result.current.save(request('lincoln'))
    })
    rerender({ childId: 'london' })
    act(() => emit([]))

    await act(async () => {
      gate.release?.()
      await inFlight.promise
    })

    // The write went to Lincoln (the pinned id above). The LIST is London's.
    expect(result.current.observationsChildId).toBe('london')
    expect(result.current.observations).toEqual([])
  })

  it('an A → B → A switch is not mistaken for the visit the save started in', async () => {
    // The scope is compared by family|child, so returning to Lincoln genuinely is
    // Lincoln's list again — and his own row belongs in it.
    const gate: { release?: () => void } = {}
    const inFlight: { promise?: Promise<unknown> } = {}
    saveMock.mockImplementation(
      (a: { childId: string; entryKey: string }) =>
        new Promise((resolve) => {
          gate.release = () =>
            resolve({
              observation: row({ id: `${a.childId}__${a.entryKey}`, childId: a.childId }),
              alreadyRecorded: false,
            })
        }),
    )
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useNativeProgressObservations(childId),
      { initialProps: { childId: 'lincoln' } },
    )
    act(() => emit([]))

    act(() => {
      inFlight.promise = result.current.save(request('lincoln'))
    })
    rerender({ childId: 'london' })
    act(() => emit([]))
    rerender({ childId: 'lincoln' })
    act(() => emit([]))

    await act(async () => {
      gate.release?.()
      await inFlight.promise
    })

    expect(result.current.observationsChildId).toBe('lincoln')
    expect(result.current.observations.map((o) => o.childId)).toEqual(['lincoln'])
  })
})
