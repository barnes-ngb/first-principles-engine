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
 *  1. the subscription is filtered to the child it was asked for, and what it
 *     answers is stamped with the FAMILY AND CHILD it answered for — so a caller
 *     can tell *settled for this record* from *the previous one's answer*;
 *  2. a FAILED read is not an empty record;
 *  3. a successful save reads back immediately, without waiting for a snapshot,
 *     and the snapshot that follows does not duplicate it; and
 *  4. a save confirmed for one child never splices its row into the list the
 *     screen is now showing for another — including across an A → B → A switch,
 *     which is the case a simple id comparison gets wrong.
 *
 * Round 4 P1 adds the deferred callback: a listener that has been unsubscribed, or
 * belongs to the account that has just signed out, may settle nothing — not its
 * rows and not its error — even when the child id is the same one. Each of those
 * cases carries its own control, because a test that asserts *nothing happened*
 * passes just as well when nothing can happen at all.
 */

/** One `onSnapshot` registration, kept so a deferred callback can be fired. */
interface Listener {
  next: (snap: unknown) => void
  error: (err: Error) => void
}

let familyId: string | null = 'fam-1'
const listeners: Listener[] = []
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
    listeners.push({ next, error })
    return unsubscribe
  },
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => familyId }))
vi.mock('../../../core/firebase/firestore', () => ({
  nativeProgressObservationsCollection: () => ({ __col: 'nativeProgressObservations' }),
}))

/**
 * `vi.hoisted`, because this one is read when the FACTORY runs — i.e. during the
 * import phase, before the module body — unlike `saveMock`, which is only read
 * when the function the factory returns is called. A plain `const` here was a
 * temporal-dead-zone error that stopped the whole file from loading.
 */
const { Refused } = vi.hoisted(() => ({ Refused: class Refused extends Error {} }))
const saveMock = vi.fn()
vi.mock('../../../core/firebase/nativeProgressWrites', () => ({
  NativeProgressRefused: Refused,
  saveNativeProgressObservation: (...a: unknown[]) => saveMock(...a),
}))

import {
  NATIVE_PROGRESS_SAVE_IN_FLIGHT,
  useNativeProgressObservations,
} from './useNativeProgressObservations'
// The real sentence, so this cannot assert wording the hook has stopped using.
import { failureNotice } from './nativeProgressRule'

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

/** The subscription that is current — the one a live snapshot comes from. */
const current = () => listeners[listeners.length - 1]

/** Deliver a snapshot the way Firestore would, on a chosen listener. */
function deliver(listener: Listener | undefined, rows: NativeProgressObservation[]) {
  listener?.next({ docs: rows.map((r) => ({ id: r.id, data: () => r })) })
}

const emit = (rows: NativeProgressObservation[]) => deliver(current(), rows)

const request = (childId: string, entryKey = 'draft-key-0001') => ({
  familyId: familyId ?? '',
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

/**
 * A write held open, so a switch can happen while it is still in the air.
 *
 * The release and the promise are held on objects rather than in a `let`, so the
 * assignment inside the promise's executor is visible to the type checker at the
 * use site.
 */
function heldSave() {
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
  return { gate, inFlight }
}

beforeEach(() => {
  familyId = 'fam-1'
  listeners.length = 0
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
  it('asks only for that child, and stamps the family and child it answers for', async () => {
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    expect(whereCalls).toEqual([['childId', '==', 'lincoln']])
    expect(result.current.loading).toBe(true)
    expect(result.current.observationsScope).toBeNull()

    act(() => emit([row()]))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-1',
      childId: 'lincoln',
    })
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
    expect(result.current.observationsScope).toBeNull()
    expect(result.current.loading).toBe(true)
    expect(whereCalls.at(-1)).toEqual(['childId', '==', 'london'])
  })

  it('a failed read is an error, not an empty record', async () => {
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    act(() => current()?.error(new Error('permission-denied')))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('permission-denied')
    expect(result.current.observations).toEqual([])
    // Stamped, so a caller can tell this failure from the other record's success
    // — and from a current read that genuinely found nothing.
    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-1',
      childId: 'lincoln',
    })
  })
})

/**
 * Round 4 P1 — a callback that arrives after its subscription stopped counting.
 *
 * The settlement used to stamp the child alone, so the queued answer of a family
 * that had signed out presented its rows as the new sign-in's answer for the same
 * id — one household's observations under another household's name. Every case
 * here fires a callback the hook has already moved past, and then fires the
 * CURRENT one, so a guard that blocked everything would fail just as loudly as
 * one that blocked nothing.
 */
describe('a deferred callback from a subscription that is no longer current', () => {
  /** Mount on fam-1/Lincoln, settle, then sign the next household in. */
  function switchAccount() {
    const view = renderHook(
      ({ childId }: { childId: string }) => useNativeProgressObservations(childId),
      { initialProps: { childId: 'lincoln' } },
    )
    const signedOut = current()
    act(() => deliver(signedOut, [row({ id: 'fam1__e1' })]))
    // The same child id in the next family, which is the case the child-only
    // stamp could not tell apart.
    familyId = 'fam-2'
    view.rerender({ childId: 'lincoln' })
    return { ...view, signedOut }
  }

  it('cannot settle the new account with the old account’s rows', () => {
    const { result, signedOut } = switchAccount()
    expect(result.current.observationsScope).toBeNull()

    act(() => deliver(signedOut, [row({ id: 'fam1__e1' })]))

    // Not settled, not shown, and still waiting on its own read.
    expect(result.current.observations).toEqual([])
    expect(result.current.observationsScope).toBeNull()
    expect(result.current.loading).toBe(true)

    // The control: delivery works, and this family's own listener settles it.
    act(() => emit([row({ id: 'fam2__e1' })]))
    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-2',
      childId: 'lincoln',
    })
    expect(result.current.observations.map((o) => o.id)).toEqual(['fam2__e1'])
  })

  it('cannot report the old account’s failure as this one’s', () => {
    const { result, signedOut } = switchAccount()
    act(() => emit([row({ id: 'fam2__e1' })]))

    act(() => signedOut?.error(new Error('permission-denied')))

    // The settled current read stands: no error, and the rows are not wiped.
    expect(result.current.error).toBeNull()
    expect(result.current.observations.map((o) => o.id)).toEqual(['fam2__e1'])
    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-2',
      childId: 'lincoln',
    })

    // The control: this family's own failure IS reported, and empties the list.
    act(() => current()?.error(new Error('resource-exhausted')))
    expect(result.current.error).toBe('resource-exhausted')
    expect(result.current.observations).toEqual([])
  })

  it('cannot restore rows on an A → B → A round trip by child', () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useNativeProgressObservations(childId),
      { initialProps: { childId: 'lincoln' } },
    )
    const firstVisit = current()
    act(() => deliver(firstVisit, [row({ id: 'lincoln__e1' })]))

    rerender({ childId: 'london' })
    act(() => emit([]))
    rerender({ childId: 'lincoln' })
    // This visit's own read, which is the later one: his earlier entry and the
    // one recorded since.
    act(() => emit([row({ id: 'lincoln__e1' }), row({ id: 'lincoln__e2' })]))

    act(() => deliver(firstVisit, [row({ id: 'lincoln__e1' })]))

    // The key is Lincoln's again; the VISIT is not. The first visit's listener
    // holds a frame of history, and settling it would take the newer row off a
    // list this collection only ever appends to.
    expect(result.current.observations.map((o) => o.id).sort()).toEqual([
      'lincoln__e1',
      'lincoln__e2',
    ])
    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-1',
      childId: 'lincoln',
    })

    // The control: this visit's listener does still speak for Lincoln.
    act(() => emit([row({ id: 'lincoln__e3' })]))
    expect(result.current.observations.map((o) => o.id)).toEqual(['lincoln__e3'])
  })

  it('cannot restore rows on a family A → B → A round trip', () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useNativeProgressObservations(childId),
      { initialProps: { childId: 'lincoln' } },
    )
    const firstSignIn = current()
    act(() => deliver(firstSignIn, [row({ id: 'fam1__e1' })]))

    familyId = 'fam-2'
    rerender({ childId: 'lincoln' })
    act(() => emit([]))
    familyId = 'fam-1'
    rerender({ childId: 'lincoln' })
    act(() => emit([row({ id: 'fam1__e1' }), row({ id: 'fam1__e2' })]))

    // The same family and the same child as the listener above, one sign-in
    // later — which is the pair an equal-id test cannot tell apart.
    act(() => deliver(firstSignIn, [row({ id: 'fam1__e1' })]))

    expect(result.current.observations.map((o) => o.id).sort()).toEqual([
      'fam1__e1',
      'fam1__e2',
    ])
    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-1',
      childId: 'lincoln',
    })

    // The control: this sign-in's own listener does still speak for it.
    act(() => emit([row({ id: 'fam1__e3' })]))
    expect(result.current.observations.map((o) => o.id)).toEqual(['fam1__e3'])
  })

  it('cannot settle a read that has not been asked for yet (no child)', () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useNativeProgressObservations(childId),
      { initialProps: { childId: 'lincoln' } },
    )
    const forLincoln = current()
    act(() => deliver(forLincoln, [row()]))

    // No child selected: nothing is subscribed, so nothing may settle either.
    rerender({ childId: '' })
    act(() => deliver(forLincoln, [row()]))

    expect(result.current.observations).toEqual([])
    expect(result.current.observationsScope).toBeNull()
    expect(result.current.loading).toBe(true)
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
    const { gate, inFlight } = heldSave()
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

  /**
   * Round 4 P2: the surface needs to know WHOSE write is in the air, not only
   * that one is — it attributes a pending save to a child in words.
   */
  it('names the record the in-flight write belongs to, and only the accepted one', async () => {
    const { gate, inFlight } = heldSave()
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    act(() => emit([]))

    act(() => {
      inFlight.promise = result.current.save(request('lincoln'))
    })
    await waitFor(() => expect(result.current.saving).toBe(true))
    expect(result.current.savingRequest).toEqual({
      familyId: 'fam-1',
      childId: 'lincoln',
      entryKey: 'draft-key-0001',
    })

    // A tap the latch refused never went anywhere, so it may not take the slot.
    await result.current.save(request('london', 'draft-key-0002'))
    expect(result.current.savingRequest).toEqual({
      familyId: 'fam-1',
      childId: 'lincoln',
      entryKey: 'draft-key-0001',
    })

    await act(async () => {
      gate.release?.()
      await inFlight.promise
    })
    expect(result.current.savingRequest).toBeNull()
    expect(result.current.saving).toBe(false)
  })

  it('reports a refusal with the writer’s own sentence, and any other failure as UNCONFIRMED', async () => {
    const { result } = renderHook(() => useNativeProgressObservations('lincoln'))
    act(() => emit([]))

    // A named refusal is determinate — the writer rejected the entry — so its own
    // accurate sentence comes straight back.
    saveMock.mockRejectedValueOnce(new Refused('The entry you were correcting is gone.'))
    let outcome = await result.current.save(request('lincoln'))
    expect(outcome).toEqual({ ok: false, message: 'The entry you were correcting is gone.' })

    // A transport failure is NOT: the transaction may have committed and the
    // answer been lost, so the message claims neither (PR-1897 review, round 2).
    saveMock.mockRejectedValueOnce(new Error('offline'))
    outcome = await result.current.save(request('lincoln'))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.message).toBe(failureNotice())
    expect(outcome.message).toMatch(/not confirmed as saved/i)
    expect(outcome.message).not.toMatch(/was not saved|did not save|nothing was written/i)
    // Nothing is added to the list by an unconfirmed save either way.
    expect(result.current.observations).toEqual([])
  })

  it('does not splice a save confirmed for one child into the other child’s list', async () => {
    const { gate, inFlight } = heldSave()
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
    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-1',
      childId: 'london',
    })
    expect(result.current.observations).toEqual([])
  })

  it('does not splice a save confirmed under one account into the next one’s list', async () => {
    // Round 4 P1, the readback half: the child id repeats across sign-ins, so the
    // scope a row is spliced onto is the family AND the child.
    const { gate, inFlight } = heldSave()
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useNativeProgressObservations(childId),
      { initialProps: { childId: 'lincoln' } },
    )
    act(() => emit([]))

    act(() => {
      inFlight.promise = result.current.save(request('lincoln'))
    })
    familyId = 'fam-2'
    rerender({ childId: 'lincoln' })
    act(() => emit([]))

    await act(async () => {
      gate.release?.()
      await inFlight.promise
    })

    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-2',
      childId: 'lincoln',
    })
    expect(result.current.observations).toEqual([])
  })

  it('an A → B → A switch is not mistaken for the visit the save started in', async () => {
    // The scope is compared by family|child, so returning to Lincoln genuinely is
    // Lincoln's list again — and his own row belongs in it.
    const { gate, inFlight } = heldSave()
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

    expect(result.current.observationsScope).toEqual({
      familyId: 'fam-1',
      childId: 'lincoln',
    })
    expect(result.current.observations.map((o) => o.childId)).toEqual(['lincoln'])
  })
})
