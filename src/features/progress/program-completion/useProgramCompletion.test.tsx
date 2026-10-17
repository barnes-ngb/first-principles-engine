import { useLayoutEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The hook's identity discipline (FEAT-242 review findings).
 *
 * Three behaviours, none of which a single-render test can show:
 *   1. a write result is accepted only by the VISIT it was issued from — an
 *      A → B → A switch makes the key equal again while the visit is new;
 *   2. the two subscriptions keep their OWN failures, so a later state success
 *      cannot erase an event-history failure; and
 *   3. a failed read is empty AND stamped, so a caller can refuse to say
 *      "nothing recorded".
 */

type SnapshotHandlers = {
  next: (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void
  error: (err: { message: string }) => void
}

/** Every live subscription, in creation order, keyed by collection. */
const subs: Array<{ col: string; handlers: SnapshotHandlers; live: boolean }> = []

vi.mock('firebase/firestore', () => ({
  query: (col: { __col: string }) => col,
  where: () => ({}),
  onSnapshot: (
    col: { __col: string },
    next: SnapshotHandlers['next'],
    error: SnapshotHandlers['error'],
  ) => {
    const entry = { col: col.__col, handlers: { next, error }, live: true }
    subs.push(entry)
    return () => {
      entry.live = false
    }
  },
}))

vi.mock('../../../core/firebase/firestore', () => ({
  programCompletionStateCollection: () => ({ __col: 'state' }),
  programCompletionEventsCollection: () => ({ __col: 'events' }),
}))

const confirmMock = vi.fn()
vi.mock('../../../core/firebase/programCompletionWrites', () => ({
  ProgramCompletionRefused: class extends Error {},
  confirmProgramCompletion: (...args: unknown[]) => confirmMock(...args),
  applyProgramCompletionProjection: vi.fn(),
  withdrawProgramCompletion: vi.fn(),
}))

let familyId: string | null = 'f1'
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => familyId }))

import { useProgramCompletion } from './useProgramCompletion'
import type { UseProgramCompletionResult } from './useProgramCompletion'
import { ProgramCompletionProgram } from '../../../core/types/programCompletion'

let latest: UseProgramCompletionResult | null = null

function Probe({ childId }: { childId: string }) {
  const result = useProgramCompletion(childId, ProgramCompletionProgram.FastPhonics)
  // Captured in a LAYOUT effect, not assigned during render: writing to a
  // variable outside the component while rendering is a side effect the hook
  // rules refuse, and it is not needed here — a layout effect is in step by the
  // end of the commit, so every assertion still reads what the render produced.
  useLayoutEffect(() => {
    latest = result
  })
  return null
}

const stateRow = (childId: string, entryKey: string) => ({
  id: `${childId}__fastPhonics`,
  data: () => ({
    id: `${childId}__fastPhonics`,
    childId,
    program: 'fastPhonics',
    activeEntryKey: entryKey,
    activeAssertion: null,
    activeConfirmedAt: null,
    activeMappingVersion: 1,
    projection: { status: 'applied' },
    eventCount: 1,
    lastEventAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
  }),
})

const subFor = (col: string) => subs.filter((s) => s.col === col && s.live).at(-1)!

beforeEach(() => {
  subs.length = 0
  latest = null
  familyId = 'f1'
  confirmMock.mockReset()
})

describe('useProgramCompletion — reads', () => {
  it('keeps each stream’s failure to itself', async () => {
    render(<Probe childId="c1" />)
    await act(async () => {
      subFor('events').handlers.error({ message: 'history unreadable' })
    })
    expect(latest!.eventStream.error).toBe('history unreadable')
    expect(latest!.eventStream.settled).toEqual({ familyId: 'f1', childId: 'c1' })

    // A later SUCCESS on the other stream must not clear it.
    await act(async () => {
      subFor('state').handlers.next({ docs: [] })
    })
    expect(latest!.stateStream.error).toBeNull()
    expect(latest!.eventStream.error).toBe('history unreadable')
    expect(latest!.events).toEqual([])
  })

  it('reports a failed state read as empty AND stamped — not as "none recorded"', async () => {
    render(<Probe childId="c1" />)
    await act(async () => {
      subFor('state').handlers.error({ message: 'state unreadable' })
    })
    expect(latest!.state).toBeNull()
    expect(latest!.stateStream.error).toBe('state unreadable')
    expect(latest!.stateStream.loading).toBe(false)
    expect(latest!.stateStream.settled).toEqual({ familyId: 'f1', childId: 'c1' })
  })

  it('clears the record during render on a child change, before anything paints', async () => {
    const view = render(<Probe childId="c1" />)
    await act(async () => {
      subFor('state').handlers.next({ docs: [stateRow('c1', 'k1')] })
    })
    expect(latest!.state?.activeEntryKey).toBe('k1')

    view.rerender(<Probe childId="c2" />)
    expect(latest!.state).toBeNull()
    expect(latest!.stateStream.settled).toBeNull()
    expect(latest!.stateStream.loading).toBe(true)
  })
})

describe('useProgramCompletion — write results and identity', () => {
  it('marks a result NOT current after an A → B → A round trip', async () => {
    const view = render(<Probe childId="c1" />)
    let release: ((v: unknown) => void) | null = null
    confirmMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )

    let outcome: Awaited<ReturnType<UseProgramCompletionResult['confirm']>> | null = null
    await act(async () => {
      void latest!
        .confirm({
          familyId: 'f1',
          childId: 'c1',
          entryKey: 'draft-key-0001',
          reviewed: {
            program: ProgramCompletionProgram.FastPhonics,
            observedOn: '2026-10-01',
            source: 'programReport',
            assistance: 'unknown',
          },
        })
        .then((o) => {
          outcome = o
        })
    })

    // A → B → A while the write is in the air: the key is equal again, the visit
    // is not.
    view.rerender(<Probe childId="c2" />)
    view.rerender(<Probe childId="c1" />)

    await act(async () => {
      release?.({
        state: stateRow('c1', 'draft-key-0001').data(),
        event: null,
        alreadyRecorded: false,
        applied: true,
        applicationPending: false,
        conceptIds: [],
        promotedConceptIds: [],
      })
    })

    expect(outcome).not.toBeNull()
    expect(outcome!.ok).toBe(true)
    expect(outcome!.current).toBe(false)
    // ...and the stale answer did not settle the current visit's record.
    expect(latest!.state).toBeNull()
  })

  it('marks a result NOT current after an account change', async () => {
    const view = render(<Probe childId="c1" />)
    let release: ((v: unknown) => void) | null = null
    confirmMock.mockImplementation(
      () => new Promise((resolve) => { release = resolve }),
    )
    let outcome: Awaited<ReturnType<UseProgramCompletionResult['confirm']>> | null = null
    await act(async () => {
      void latest!
        .confirm({
          familyId: 'f1',
          childId: 'c1',
          entryKey: 'draft-key-0001',
          reviewed: {
            program: ProgramCompletionProgram.FastPhonics,
            observedOn: '2026-10-01',
            source: 'programReport',
            assistance: 'unknown',
          },
        })
        .then((o) => {
          outcome = o
        })
    })
    familyId = 'f2'
    view.rerender(<Probe childId="c1" />)
    await act(async () => {
      release?.({
        state: stateRow('c1', 'draft-key-0001').data(),
        event: null,
        alreadyRecorded: false,
        applied: true,
        applicationPending: false,
        conceptIds: [],
        promotedConceptIds: [],
      })
    })
    expect(outcome!.current).toBe(false)
  })

  it('refuses a second tap while one write is in the air', async () => {
    render(<Probe childId="c1" />)
    confirmMock.mockImplementation(() => new Promise(() => {}))
    const request = {
      familyId: 'f1',
      childId: 'c1',
      entryKey: 'draft-key-0001',
      reviewed: {
        program: ProgramCompletionProgram.FastPhonics,
        observedOn: '2026-10-01',
        source: 'programReport' as const,
        assistance: 'unknown' as const,
      },
    }
    let second: Awaited<ReturnType<UseProgramCompletionResult['confirm']>> | null = null
    await act(async () => {
      void latest!.confirm(request)
      second = await latest!.confirm(request)
    })
    expect(second!.ok).toBe(false)
    expect(confirmMock).toHaveBeenCalledTimes(1)
  })
})
