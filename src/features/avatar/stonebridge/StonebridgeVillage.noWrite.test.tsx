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
 * Every write is deferred, exactly as in the hook's own recovery suite, so a
 * write completion lands where the test puts it — and, like that suite, the
 * persist is modelled as the TRANSACTION it is: a modelled datastore the
 * transaction reads (the listener speaks for it), a staged write counted by
 * `fx.setDoc`, and a commit acknowledgement the test hands over. A no-write
 * claim has to be made against the real writer to mean anything, and the real
 * writer is now create-if-absent / compare-and-set.
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
  path: string
  payload: StonebridgeProgress
  /** Acknowledge the commit: it lands in `fx.stored`, as a real one would. */
  resolve: () => void
  reject: (err: unknown) => void
}

const fx = vi.hoisted(() => ({
  reading: [] as Listener[],
  progress: [] as Listener[],
  writes: [] as PendingWrite[],
  /** The modelled datastore, keyed by document path. */
  stored: new Map<string, StonebridgeProgress>(),
  setDoc: vi.fn(),
}))

vi.mock('firebase/firestore', () => {
  type Snapshot = { exists: () => boolean; data: () => StonebridgeProgress | null }
  /** Here the listener always speaks for the server. */
  const mirror = (path: string, snap: unknown) => {
    const delivered = snap as Snapshot
    const data = delivered.exists() ? delivered.data() : null
    if (data) fx.stored.set(path, data)
    else fx.stored.delete(path)
  }
  return {
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
      const entry: Listener = {
        next: (snap: unknown) => {
          if (target.kind === 'doc') mirror(target.path, snap)
          next(snap)
        },
        error,
        closed: false,
        path: target.path,
      }
      ;(target.kind === 'query' ? fx.reading : fx.progress).push(entry)
      return () => {
        entry.closed = true
      }
    },
    runTransaction: async (
      _db: unknown,
      update: (tx: {
        get: (ref: { path: string }) => Promise<{
          exists: () => boolean
          data: () => StonebridgeProgress | undefined
        }>
        set: (ref: { path: string }, payload: StonebridgeProgress) => void
      }) => Promise<unknown>,
    ) => {
      const staged: { path: string; payload: StonebridgeProgress }[] = []
      const result = await update({
        get: async (ref: { path: string }) => {
          await Promise.resolve()
          const stored = fx.stored.get(ref.path)
          return { exists: () => stored !== undefined, data: () => stored }
        },
        set: (ref: { path: string }, payload: StonebridgeProgress) => {
          staged.push({ path: ref.path, payload })
        },
      })
      // Refused: nothing staged, nothing to acknowledge.
      if (staged.length === 0) return result
      const write = staged[staged.length - 1]
      fx.setDoc({ path: write.path }, write.payload)
      return new Promise((resolve, reject) => {
        fx.writes.push({
          path: write.path,
          payload: write.payload,
          resolve: () => {
            fx.stored.set(write.path, write.payload)
            resolve(result)
          },
          reject,
        })
      })
    },
  }
})

vi.mock('../../../core/firebase/firestore', () => ({
  db: { kind: 'db' },
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

/**
 * Settle the listeners, the transaction's deferred read and its decision. More
 * ticks than before, because the write is a transaction now and its read
 * resolves on its own tick; spare microtasks cost nothing.
 */
async function flush() {
  await act(async () => {
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve()
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
  fx.stored.clear()
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

  /**
   * The connected overview is a picture, and looking at it is free too.
   *
   * It is drawn from the same derived board the list is, with no state and no
   * reader of its own — so this walks the real hook past it and asserts that
   * the drawing of a repaired village costs nothing, and that the one way in
   * still hands the focus back to the exact tile it came from.
   */
  it('shows the connected village, and visiting from the list still writes nothing', async () => {
    const baseline = await mountSettled()

    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    const board = await boardRegion()

    // The picture: one name for the whole drawing, and no control on it.
    const picture = board.getByRole('img', { name: /^Stonebridge village:/ })
    expect(picture.getAttribute('aria-label')).toContain('Fixed so far: The Old Bridge, The Watchtower.')
    expect(within(picture).queryAllByRole('button')).toHaveLength(0)
    expect(within(picture).getByTestId('structure-old_bridge-repaired')).toBeInTheDocument()
    expect(within(picture).getByTestId('structure-library_hut-damaged')).toBeInTheDocument()

    // The list is the way in, and it is the exact tile the focus returns to.
    const listTile = board.getByRole('button', { name: 'Visit The Old Bridge. Fixed.' })
    listTile.focus()
    fireEvent.click(listTile)
    const visit = within(screen.getByRole('dialog', { name: 'The Old Bridge' }))
    expect(visit.getByText('You fixed this place.')).toBeInTheDocument()
    fireEvent.click(visit.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByText('You fixed this place.')).not.toBeInTheDocument()
    })
    const after = await boardRegion()
    await waitFor(() =>
      expect(after.getByRole('button', { name: 'Visit The Old Bridge. Fixed.' })).toHaveFocus(),
    )

    fireEvent.click(after.getByRole('button', { name: 'Close Stonebridge village' }))
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
