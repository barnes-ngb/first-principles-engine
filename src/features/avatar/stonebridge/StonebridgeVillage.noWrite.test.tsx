import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StonebridgeProgress } from '../../../core/types/stonebridge'
// Static imports: `vi.mock` is hoisted above them, so this is the REAL hook and
// the REAL card over mocked Firestore.
import StonebridgeMissionCard from './StonebridgeMissionCard'

/**
 * Looking at the village writes nothing.
 *
 * ── Why this file drives the real hook ───────────────────────────────────────
 *
 * A no-write claim asserted against a stubbed hook asserts nothing: the stub
 * has no writer to call. So this one mounts the actual card over the actual
 * `useStonebridgeProgress` with Firestore mocked at the module boundary, lets
 * the **legitimate** initial reconciliation happen and settle — the one write
 * this data genuinely owes, which a naive "zero writes" assertion would have to
 * pretend away — and takes that settled count as the baseline. Then it opens
 * the board, visits locations, replays a thank-you and closes, and the count is
 * the same number afterwards.
 *
 * Every `setDoc` is deferred, exactly as in the hook's own recovery suite, so a
 * write completion lands where the test puts it.
 *
 * The celebration overlay is NOT stubbed here either: the replay is one of the
 * interactions being claimed to be free, and a stub of it would make that claim
 * about the stub.
 */

type Listener = {
  next: (snap: unknown) => void
  error: (err: unknown) => void
  closed: boolean
  path: string
}

type PendingWrite = {
  payload: StonebridgeProgress
  resolve: () => void
  reject: (err: unknown) => void
}

const fx = vi.hoisted(() => ({
  reading: [] as Listener[],
  progress: [] as Listener[],
  writes: [] as PendingWrite[],
  setDoc: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: (col: { kind: string; familyId: string }, id: string) => ({
    kind: 'doc',
    path: `${col.familyId}/${col.kind}/${id}`,
  }),
  query: (col: { kind: string; familyId: string }) => ({
    kind: 'query',
    path: `${col.familyId}/${col.kind}`,
  }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  onSnapshot: (
    target: { kind: string; path: string },
    next: (snap: unknown) => void,
    error: (err: unknown) => void,
  ) => {
    const entry: Listener = { next, error, closed: false, path: target.path }
    ;(target.kind === 'query' ? fx.reading : fx.progress).push(entry)
    return () => {
      entry.closed = true
    }
  },
  setDoc: (ref: { path: string }, payload: StonebridgeProgress) => {
    fx.setDoc(ref, payload)
    return new Promise<void>((resolve, reject) => {
      fx.writes.push({ payload, resolve, reject })
    })
  },
}))

vi.mock('../../../core/firebase/firestore', () => ({
  xpLedgerCollection: (familyId: string) => ({ kind: 'xpLedger', familyId }),
  stonebridgeProgressCollection: (familyId: string) => ({ kind: 'stonebridgeProgress', familyId }),
}))

// The celebration overlay is the REAL one here: a no-write claim about
// replaying a thank-you cannot be made against a stub that has no replay in it.
// Only its Web Audio fanfare is mocked, because jsdom has no `AudioContext`.
vi.mock('./bannerRaiseSound', () => ({ playBannerRaiseFanfare: () => {} }))

/**
 * Two locations rebuilt and part-way through the third, with a **stale**
 * `activeProgress` (1 of 8 stored against 14 lifetime reading actions, which is
 * really 3 of 8). That staleness is what makes the first reconcile a real,
 * legitimate write rather than a no-op, so the baseline below is a settled
 * write count and not just zero.
 */
const SAVED: StonebridgeProgress = {
  childId: 'lincoln',
  currentMissionId: 'library_hut',
  activeProgress: { missionId: 'library_hut', current: 1, target: 8 },
  completedMissions: ['old_bridge', 'watchtower'],
  raisedBanners: ['old_bridge', 'watchtower'],
  missionBaselines: { old_bridge: 0, watchtower: 5, library_hut: 11 },
  updatedAt: '2026-10-20T10:00:00.000Z',
}

function readingSnapshot(count: number) {
  return { docs: Array.from({ length: count }, () => ({ data: () => ({ type: 'BOOK_READ' }) })) }
}
function progressSnapshot(docData: StonebridgeProgress | null) {
  return { exists: () => docData !== null, data: () => docData }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/**
 * The board and the visit as a reduced-motion user gets them: instant
 * transitions. Also what keeps the layering assertions honest here — a modal
 * that is still animating out is still registered, so its sibling board is
 * still `aria-hidden` and `getByRole` would not find it.
 */
function emulateReducedMotion() {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('prefers-reduced-motion'),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

/** The board, once whatever was over it has finished leaving. */
async function boardRegion() {
  return within(await screen.findByRole('dialog', { name: 'Stonebridge Village' }))
}

beforeEach(() => {
  fx.reading.length = 0
  fx.progress.length = 0
  fx.writes.length = 0
  fx.setDoc.mockClear()
  emulateReducedMotion()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

/** Mount, land both reads, and settle the one write the data owes. */
async function mountSettled() {
  render(<StonebridgeMissionCard familyId="fam-1" childId="lincoln" isLincoln />)
  act(() => {
    fx.reading[0].next(readingSnapshot(14))
    fx.progress[0].next(progressSnapshot(SAVED))
  })
  await flush()
  // The legitimate reconcile: the stored bar was behind the ledger.
  expect(fx.setDoc).toHaveBeenCalledTimes(1)
  expect(fx.writes).toHaveLength(1)
  await act(async () => {
    fx.writes[0].resolve()
    await Promise.resolve()
  })
  await flush()
  return fx.setDoc.mock.calls.length
}

describe('visiting the village is free', () => {
  it('opens, visits, replays and closes without a single further write', async () => {
    const baseline = await mountSettled()
    expect(baseline).toBe(1)

    // Open the board.
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    const board = await boardRegion()
    expect(board.getByText('🎌 Banner Hall')).toBeInTheDocument()

    // Visit a repaired location: the saved look and the saved thank-you.
    fireEvent.click(board.getByRole('button', { name: 'Visit The Old Bridge. Fixed.' }))
    const visit = within(screen.getByRole('dialog', { name: 'The Old Bridge' }))
    expect(visit.getByText('You fixed this place.')).toBeInTheDocument()

    // Replay it — the real celebration — and acknowledge it.
    fireEvent.click(visit.getByRole('button', { name: 'Hear the thank you' }))
    const replay = await screen.findByRole('dialog', { name: 'The Old Bridge repaired' })
    expect(within(replay).getByText('The Old Bridge repaired')).toBeVisible()
    expect(within(replay).getByText('The Old Bridge repaired').parentElement?.textContent)
      .toBe('The Old Bridge repaired!')
    fireEvent.click(within(replay).getByRole('button', { name: 'Keep going' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'The Old Bridge repaired' }),
      ).not.toBeInTheDocument()
    })
    await flush()

    // Visit the location being repaired now.
    fireEvent.click(
      (await boardRegion()).getByRole('button', { name: 'Visit The Library Hut. Being fixed now.' }),
    )
    expect(screen.getByText('You are fixing this now.')).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Library Hut' })).getByRole('button', {
        name: 'Close',
      }),
    )
    await waitFor(() => {
      expect(screen.queryByText('You are fixing this now.')).not.toBeInTheDocument()
    })

    // And an upcoming one.
    fireEvent.click(
      (await boardRegion()).getByRole('button', { name: 'Visit Beacon Hill. Not started yet.' }),
    )
    expect(screen.getByText('This place waits its turn.')).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Beacon Hill' })).getByRole('button', {
        name: 'Close',
      }),
    )
    await waitFor(() => {
      expect(screen.queryByText('This place waits its turn.')).not.toBeInTheDocument()
    })

    // Close the board.
    fireEvent.click(
      (await boardRegion()).getByRole('button', { name: 'Close Stonebridge village' }),
    )
    await waitFor(() => {
      expect(screen.queryByText('🎌 Banner Hall')).not.toBeInTheDocument()
    })
    await flush()

    // Not one write beyond the reconcile that was already owed.
    expect(fx.setDoc).toHaveBeenCalledTimes(baseline)
  })
})

describe('a failure while a visit is open keeps the one door reachable', () => {
  it('reports it in the topmost view, and a Retry re-reads without writing', async () => {
    const baseline = await mountSettled()

    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    fireEvent.click(
      (await boardRegion()).getByRole('button', { name: 'Visit The Library Hut. Being fixed now.' }),
    )
    const visitName = { name: 'The Library Hut' }
    expect(screen.getByRole('dialog', visitName)).toBeInTheDocument()

    // The read fails WHILE the visit is open — two layers above the card.
    act(() => {
      fx.progress[0].error(new Error('unavailable'))
    })
    await flush()

    const visit = within(screen.getByRole('dialog', visitName))
    expect(visit.getByText('Showing your last village.')).toBeInTheDocument()
    const retry = visit.getByRole('button', { name: 'Try again' })

    const listenersBefore = fx.progress.length
    fireEvent.click(retry)
    await flush()

    // It re-subscribed…
    expect(fx.progress.length).toBe(listenersBefore + 1)
    // …and wrote nothing from a failed read.
    expect(fx.setDoc).toHaveBeenCalledTimes(baseline)
  })

  it('and in the replayed thank-you, which covers even the visit', async () => {
    const baseline = await mountSettled()

    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    fireEvent.click(
      (await boardRegion()).getByRole('button', { name: 'Visit The Old Bridge. Fixed.' }),
    )
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Old Bridge' })).getByRole('button', {
        name: 'Hear the thank you',
      }),
    )
    const replay = await screen.findByRole('dialog', { name: 'The Old Bridge repaired' })

    // Three layers down, the read fails.
    act(() => {
      fx.progress[0].error(new Error('unavailable'))
    })
    await flush()

    expect(within(replay).getByText('Showing your last village.')).toBeInTheDocument()
    const listenersBefore = fx.progress.length
    fireEvent.click(within(replay).getByRole('button', { name: 'Try again' }))
    await flush()

    expect(fx.progress.length).toBe(listenersBefore + 1)
    // The celebration is still there: the door does not close the room.
    expect(screen.getByRole('dialog', { name: 'The Old Bridge repaired' })).toBeInTheDocument()
    expect(fx.setDoc).toHaveBeenCalledTimes(baseline)
  })
})
