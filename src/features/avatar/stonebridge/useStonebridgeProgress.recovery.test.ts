import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StonebridgeProgress } from '../../../core/types/stonebridge'
// Static import: `vi.mock` is hoisted above it, so this is the REAL hook over
// mocked Firestore — the suite drives the actual subscriptions and writes.
import { useStonebridgeProgress } from './useStonebridgeProgress'

/**
 * Stonebridge read/retry recovery — the actual hook, with every callback and
 * every write completion driven by hand.
 *
 * ── The defect this file inverts ─────────────────────────────────────────────
 *
 * `useStonebridgeProgress` had ONE state per subscription and no state for
 * "failed". The progress listener's error callback set `doc: null`, which is
 * also how a successful snapshot said *the doc does not exist yet* — so a
 * listener error was read as "this child has no village" and the reconcile
 * effect issued a fresh `setDoc` that erased `completedMissions` and
 * `raisedBanners`. The reading listener's error callback set `count: 0`, which
 * is also how an empty event query says *no reading yet* — so a failed read
 * either corrupted the first-visit baseline (0 against existing lifetime
 * reading auto-completes missions nobody read for) or persisted a zeroed
 * active-mission bar over real progress.
 *
 * Both halves are reproduced below as the assertions they must now fail at: a
 * loaded village + a listener error writes NOTHING and keeps the banners on
 * screen; `missing` + a reading error writes NOTHING.
 *
 * POSITIVE CONTROL. Collapse either state back and this suite fails loudly:
 *  • make the progress error callback `{ phase: 'missing' }` → *"a progress
 *    listener error never writes over a village that loaded"* fails on a create
 *    whose `completedMissions` is `[]`;
 *  • make the reading error callback `{ phase: 'ready', count: 0 }` → *"a
 *    reading error is not zero"* fails on a create baselined at 0.
 *
 * Every write here is DEFERRED — the mock acknowledges nothing on its own — so
 * the tests can land a write completion in the visit it belongs to, in a later
 * visit, or after the child changed, which is where the remaining hazards live.
 *
 * ── The write is a transaction, and the mock models one ──────────────────────
 *
 * The persist is no longer an unconditional `setDoc`: it is a create-if-absent
 * or a compare-and-set inside one transaction (`stonebridgeProgressWrite.ts`),
 * because the blocker that reopened this file was a race between two CLIENTS
 * and no per-mount guard can see another client. So the mock carries a modelled
 * datastore (`fx.stored`) that the transaction reads, and three things are now
 * separate where they used to be one:
 *
 *  • what the SUBSCRIPTION reported — delivered by hand, as before;
 *  • what the DATASTORE holds at the moment the transaction reads it;
 *  • the commit ACKNOWLEDGEMENT, still deferred to `fx.writes[n].resolve()`.
 *
 * Delivering a progress snapshot also mirrors it into the datastore, because in
 * almost every test below the listener is simply speaking for the server. The
 * concurrency suite at the bottom moves the two apart on purpose with
 * {@link setStored} — which is exactly what an independent client is — and the
 * transaction's read resolves on a later tick so it can.
 *
 * `fx.setDoc` keeps its name: it counts the document write a transaction
 * STAGED and sent, which is the same count every assertion in this file was
 * written against. A refused create-if-absent or compare-and-set stages
 * nothing, so it does not move it.
 */

type Listener = {
  next: (snap: unknown) => void
  error: (err: unknown) => void
  closed: boolean
  path: string
}

/** A staged write whose commit has been sent and not yet acknowledged. */
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
  /** Transactions opened. A no-op that spun would show up here and nowhere else. */
  transactions: 0,
  setDoc: vi.fn(),
}))

vi.mock('firebase/firestore', () => {
  type Snapshot = { exists: () => boolean; data: () => StonebridgeProgress | null }
  /** The listener speaks for the server unless a test says otherwise. */
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
      fx.transactions += 1
      const staged: { path: string; payload: StonebridgeProgress }[] = []
      const result = await update({
        // The read resolves on a LATER TICK, and reads the store then — so a
        // test can model another client writing between this mount's snapshot
        // and this transaction's read, which is the whole lost-progress race.
        get: async (ref: { path: string }) => {
          await Promise.resolve()
          const stored = fx.stored.get(ref.path)
          return { exists: () => stored !== undefined, data: () => stored }
        },
        set: (ref: { path: string }, payload: StonebridgeProgress) => {
          staged.push({ path: ref.path, payload })
        },
      })
      // A transaction that staged nothing wrote nothing: it settles at once,
      // with the answer its callback returned.
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

const FAM = 'fam-1'
const LINCOLN = 'lincoln'
const LONDON = 'london'

/** Where a child's progress document lives in the modelled datastore. */
function progressPath(childId: string, familyId = FAM) {
  return `${familyId}/stonebridgeProgress/${childId}`
}

/**
 * Another client wrote. Called between delivering this mount's snapshot and
 * flushing — which is the real ordering: the subscription reported one thing,
 * somebody else's write landed, and only then does this client's transaction
 * read the document it is about to write.
 */
function setStored(childId: string, state: StonebridgeProgress, familyId = FAM) {
  fx.stored.set(progressPath(childId, familyId), state)
}

/** Another client (or a console) deleted it. */
function clearStored(childId: string, familyId = FAM) {
  fx.stored.delete(progressPath(childId, familyId))
}

/** A reading-activity query result — `count` BOOK_READ events, nothing else. */
function readingSnapshot(count: number) {
  return { docs: Array.from({ length: count }, () => ({ data: () => ({ type: 'BOOK_READ' }) })) }
}
/** A progress-doc snapshot. `null` is the *successful* "does not exist" answer. */
function progressSnapshot(docData: StonebridgeProgress | null) {
  return { exists: () => docData !== null, data: () => docData }
}

/**
 * A child who has already rebuilt two locations and is part-way through the
 * third: 14 lifetime reading actions, Library Hut at 3 / 8.
 */
const SAVED: StonebridgeProgress = {
  childId: LINCOLN,
  currentMissionId: 'library_hut',
  activeProgress: { missionId: 'library_hut', current: 3, target: 8 },
  completedMissions: ['old_bridge', 'watchtower'],
  raisedBanners: ['old_bridge', 'watchtower'],
  missionBaselines: { old_bridge: 0, watchtower: 5, library_hut: 11 },
  updatedAt: '2026-10-20T10:00:00.000Z',
}

/**
 * The brother, mid-Watchtower: one banner raised, 4 of the 6 reading actions
 * done (baseline 5, so a lifetime count of 11 finishes it).
 */
const LONDON_SAVED: StonebridgeProgress = {
  childId: LONDON,
  currentMissionId: 'watchtower',
  activeProgress: { missionId: 'watchtower', current: 4, target: 6 },
  completedMissions: ['old_bridge'],
  raisedBanners: ['old_bridge'],
  missionBaselines: { old_bridge: 0, watchtower: 5 },
  updatedAt: '2026-10-22T09:00:00.000Z',
}

/**
 * Settle everything queued: the listeners' dispatches, the transaction's
 * deferred read, its decision, and the reconcile the decision triggers.
 *
 * It takes more ticks than it used to because a write is now a transaction —
 * the read resolves on its own tick before anything is staged. These are
 * microtasks, so an unused one costs nothing; too few would make a positive
 * assertion flaky.
 */
async function flush() {
  await act(async () => {
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve()
  })
}

function mount(props: { familyId?: string; childId?: string } = {}) {
  return renderHook(
    ({ familyId, childId }: { familyId: string; childId: string }) =>
      useStonebridgeProgress(familyId, childId),
    { initialProps: { familyId: props.familyId ?? FAM, childId: props.childId ?? LINCOLN } },
  )
}

beforeEach(() => {
  fx.reading.length = 0
  fx.progress.length = 0
  fx.writes.length = 0
  fx.stored.clear()
  fx.transactions = 0
  fx.setDoc.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('a failed read is not an empty village', () => {
  it('says so, offers a retry, and writes nothing when it fails before any snapshot', async () => {
    const { result } = mount()
    expect(result.current.loading).toBe(true)

    act(() => {
      fx.progress[0].error(new Error('permission-denied'))
      fx.reading[0].error(new Error('permission-denied'))
    })
    // Settled, so "wrote nothing" is a statement about a finished turn rather
    // than about a transaction that had not got as far as its write yet.
    await flush()

    expect(result.current.readError).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.mission).toBeNull()
    expect(result.current.stale).toBe(false)
    // A failed read is not zero reading, and not an empty village.
    expect(result.current.totalReadingActions).toBeNull()
    expect(result.current.completedMissions).toEqual([])
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(typeof result.current.retry).toBe('function')
  })

  it('a progress listener error never writes over a village that loaded', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.raisedBanners).toEqual(['old_bridge', 'watchtower'])
    expect(fx.setDoc).not.toHaveBeenCalled() // nothing changed — no write

    act(() => {
      fx.progress[0].error(new Error('unavailable'))
    })
    await flush()

    // THE INVERTED REPRODUCTION: the fresh write that erased the lists.
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.transactions).toBe(0)
    // And the village the child rebuilt is still on screen, labelled honestly.
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.raisedBanners).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.mission?.id).toBe('library_hut')
    expect(result.current.active).toMatchObject({ current: 3, target: 8 })
    expect(result.current.stale).toBe(true)
    expect(result.current.readError).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('a reading-activity error keeps the bar it last read, and persists no zero', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    act(() => {
      fx.reading[0].error(new Error('unavailable'))
    })
    await flush()

    // The old code counted 0 and persisted an activeProgress of 0 / 8.
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.transactions).toBe(0)
    expect(result.current.active).toMatchObject({ missionId: 'library_hut', current: 3 })
    expect(result.current.totalReadingActions).toBe(14)
    expect(result.current.stale).toBe(true)
    expect(result.current.readError).toBe(true)
  })

  it('a reading error is not zero — missing progress + failed count writes nothing', async () => {
    const { result } = mount()
    act(() => {
      // A SUCCESSFUL snapshot saying the doc does not exist…
      fx.progress[0].next(progressSnapshot(null))
      // …and a reading count that FAILED. A baseline of 0 here would hand a
      // first-visit child every mission his existing lifetime reading covers.
      fx.reading[0].error(new Error('permission-denied'))
    })
    await flush()

    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(result.current.readError).toBe(true)
    expect(result.current.mission).toBeNull()

    // The same visit recovering on its own is enough — the count arrives and
    // the baseline is the real one.
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].payload.missionBaselines).toEqual({ old_bridge: 7 })
    expect(fx.writes[0].payload.completedMissions).toEqual([])
  })
})

describe('Retry', () => {
  it('re-subscribes, keeps the earned village on screen, and writes nothing by itself', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    act(() => {
      fx.progress[0].error(new Error('unavailable'))
    })
    expect(result.current.stale).toBe(true)

    act(() => {
      result.current.retry()
    })
    await flush()

    // A second pair of listeners, the first pair closed.
    expect(fx.progress).toHaveLength(2)
    expect(fx.reading).toHaveLength(2)
    expect(fx.progress[0].closed).toBe(true)
    expect(fx.reading[0].closed).toBe(true)
    // Nothing earned was cleared, and the tap authorised no write.
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.stale).toBe(true)
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(fx.setDoc).not.toHaveBeenCalled()

    act(() => {
      fx.reading[1].next(readingSnapshot(14))
      fx.progress[1].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.stale).toBe(false)
    expect(result.current.readError).toBe(false)
    expect(fx.setDoc).not.toHaveBeenCalled()
  })

  /**
   * The last-known village is retained by the snapshot transition itself now,
   * not by a second effect copying state into state. This pins the property
   * through the shape it is easiest to lose it in: a Retry resets the
   * generation, and the NEW generation then fails too.
   */
  it('keeps the earned village through a Retry whose own read fails', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    act(() => {
      fx.progress[0].error(new Error('unavailable'))
    })
    expect(result.current.stale).toBe(true)

    act(() => {
      result.current.retry()
    })
    // The new generation has nothing of its own yet…
    expect(result.current.raisedBanners).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.stale).toBe(true)
    expect(result.current.retrying).toBe(true)

    // …and then fails as well. The village is still his, and still labelled.
    act(() => {
      fx.progress[1].error(new Error('unavailable'))
      fx.reading[1].error(new Error('unavailable'))
    })
    await flush()

    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.active).toMatchObject({ missionId: 'library_hut', current: 3 })
    expect(result.current.totalReadingActions).toBe(14)
    expect(result.current.stale).toBe(true)
    expect(result.current.readError).toBe(true)
    expect(result.current.retrying).toBe(false)
    expect(fx.setDoc).not.toHaveBeenCalled()
  })

  it('creates from a GENUINELY missing doc after a failed first read, baselined at the real count', async () => {
    const { result } = mount()
    act(() => {
      fx.progress[0].error(new Error('unavailable'))
      fx.reading[0].error(new Error('unavailable'))
    })
    await flush()
    expect(fx.setDoc).not.toHaveBeenCalled()

    act(() => {
      result.current.retry()
    })
    act(() => {
      fx.reading[1].next(readingSnapshot(7))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].path).toBe(`${FAM}/stonebridgeProgress/${LINCOLN}`)
    expect(fx.writes[0].payload).toMatchObject({
      childId: LINCOLN,
      currentMissionId: 'old_bridge',
      completedMissions: [],
      raisedBanners: [],
      missionBaselines: { old_bridge: 7 },
    })
  })

  it('allows a genuine zero — an empty event query is a real baseline of 0', async () => {
    mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(0))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].payload.missionBaselines).toEqual({ old_bridge: 0 })
  })
})

describe('ordinary progression is untouched', () => {
  it('advances, carries the baseline forward, and celebrates only once acknowledged', async () => {
    const { result } = mount()
    act(() => {
      // 19 lifetime actions — Library Hut's 8 are done (baseline 11).
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].payload).toMatchObject({
      currentMissionId: 'the_forge',
      completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
      raisedBanners: ['old_bridge', 'watchtower', 'library_hut'],
      activeProgress: { missionId: 'the_forge', current: 0, target: 10 },
    })
    // Surplus carries forward additively: 11 + 8.
    expect(fx.writes[0].payload.missionBaselines.the_forge).toBe(19)
    // Not celebrated yet — the write has not been acknowledged.
    expect(result.current.justCompletedMissionId).toBeNull()

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    expect(result.current.justCompletedMissionId).toBe('library_hut')
    act(() => {
      result.current.clearJustCompleted()
    })
    expect(result.current.justCompletedMissionId).toBeNull()
    // The acknowledged write is not re-issued when its own completion settles.
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })

  it('replays no celebration for a completion the stored doc already holds', async () => {
    const already: StonebridgeProgress = {
      ...SAVED,
      currentMissionId: 'the_forge',
      activeProgress: { missionId: 'the_forge', current: 0, target: 10 },
      completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
      raisedBanners: ['old_bridge', 'watchtower', 'library_hut'],
      missionBaselines: { ...SAVED.missionBaselines, the_forge: 19 },
    }
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(already))
    })
    await flush()

    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(result.current.raisedBanners).toHaveLength(3)
  })
})

describe('a rejected persist is visible, re-armable, and does not loop', () => {
  it('reports a failed create once and stops writing for that visit', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    await act(async () => {
      fx.writes[0].reject(new Error('permission-denied'))
      await Promise.resolve()
    })
    await flush()

    expect(result.current.saveError).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    // More snapshots arrive in the same visit — no second attempt, no loop.
    act(() => {
      fx.reading[0].next(readingSnapshot(8))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    // The retry door is the one way back, and it re-arms the write.
    act(() => {
      result.current.retry()
    })
    expect(result.current.saveError).toBe(false)
    act(() => {
      fx.reading[1].next(readingSnapshot(8))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(2)
    expect(fx.writes[1].payload.missionBaselines).toEqual({ old_bridge: 8 })
  })

  it('keeps the village on screen after a failed advance, and claims no save', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    await act(async () => {
      fx.writes[0].reject(new Error('unavailable'))
      await Promise.resolve()
    })
    await flush()

    expect(result.current.saveError).toBe(true)
    // No celebration off a write that did not land.
    expect(result.current.justCompletedMissionId).toBeNull()
    // The read is fine, so the board is current, not stale.
    expect(result.current.stale).toBe(false)
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })

  it('issues no duplicate write and no fresh celebration from a Retry alone', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()
    expect(result.current.justCompletedMissionId).toBe('library_hut')
    act(() => {
      result.current.clearJustCompleted()
    })

    act(() => {
      result.current.retry()
    })
    // The new visit sees the pre-write doc (the listener has not caught up).
    act(() => {
      fx.reading[1].next(readingSnapshot(19))
      fx.progress[1].next(progressSnapshot(SAVED))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(result.current.justCompletedMissionId).toBeNull()
  })
})

describe('no family or no child is not a child with no village', () => {
  it('subscribes to nothing, writes nothing, and shows the quiet placeholder', async () => {
    const { result } = mount({ familyId: '', childId: '' })
    await flush()

    expect(fx.reading).toHaveLength(0)
    expect(fx.progress).toHaveLength(0)
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(true)
    expect(result.current.readError).toBe(false)
    expect(result.current.saveError).toBe(false)
    expect(result.current.totalReadingActions).toBeNull()

    // The door is inert rather than absent — tapping it must not subscribe or
    // write anything for a child who has not been chosen.
    act(() => {
      result.current.retry()
    })
    await flush()
    expect(fx.reading).toHaveLength(0)
    expect(fx.setDoc).not.toHaveBeenCalled()
  })

  it('drops a loaded village when the child is deselected', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])

    rerender({ familyId: FAM, childId: '' })
    await flush()

    expect(result.current.mission).toBeNull()
    expect(result.current.completedMissions).toEqual([])
    expect(result.current.totalReadingActions).toBeNull()
    expect(result.current.stale).toBe(false)
  })
})

describe('every snapshot, write and celebration is stamped with its visit', () => {
  it('refuses a late callback from the listeners of a replaced visit', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    rerender({ familyId: FAM, childId: LONDON })
    expect(result.current.loading).toBe(true)
    expect(result.current.completedMissions).toEqual([])

    // Lincoln's old listeners fire after the switch.
    act(() => {
      fx.reading[0].next(readingSnapshot(99))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    expect(result.current.loading).toBe(true)
    expect(result.current.completedMissions).toEqual([])
    expect(result.current.totalReadingActions).toBeNull()
    expect(fx.setDoc).not.toHaveBeenCalled()
  })

  /**
   * THE SECOND P1 the first candidate shipped — and the reason the guard sits at
   * the TOP of every callback rather than at the snapshot write.
   *
   * The stale callback was rejected for its DATA but had already run the
   * celebration seed on its way there: `celebratedRef` was replaced with the
   * previous child's completed list and `seededKeyRef` was stamped with his key.
   * The brother on screen then genuinely finished Watchtower, his write was
   * acknowledged — and no banner was raised, because the stale list already
   * contained `watchtower`.
   */
  it('a stale callback cannot seed the celebration state of the child on screen', async () => {
    const { result, rerender } = mount()
    // Lincoln first: his village already has Watchtower repaired.
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])

    rerender({ familyId: FAM, childId: LONDON })
    act(() => {
      fx.reading[1].next(readingSnapshot(9))
      fx.progress[1].next(progressSnapshot(LONDON_SAVED))
    })
    await flush()
    expect(result.current.completedMissions).toEqual(['old_bridge'])
    expect(fx.setDoc).not.toHaveBeenCalled()

    // Lincoln's listeners fire AFTER London's current snapshot — the ordering
    // that produced the defect. His completed list contains `watchtower`.
    act(() => {
      fx.progress[0].next(progressSnapshot(SAVED))
      fx.reading[0].next(readingSnapshot(14))
    })
    await flush()
    expect(result.current.completedMissions).toEqual(['old_bridge'])
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(fx.setDoc).not.toHaveBeenCalled()

    // London now genuinely finishes Watchtower: 11 − baseline 5 = his 6.
    act(() => {
      fx.reading[1].next(readingSnapshot(11))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].path).toBe(`${FAM}/stonebridgeProgress/${LONDON}`)
    expect(fx.writes[0].payload).toMatchObject({
      currentMissionId: 'library_hut',
      completedMissions: ['old_bridge', 'watchtower'],
      raisedBanners: ['old_bridge', 'watchtower'],
    })
    // Surplus carries forward: 5 + 6.
    expect(fx.writes[0].payload.missionBaselines.library_hut).toBe(11)

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    // The banner he earned is raised.
    expect(result.current.justCompletedMissionId).toBe('watchtower')
  })

  it("a prior visit's error callback cannot fail the visit that replaced it", async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    act(() => {
      result.current.retry()
    })
    act(() => {
      fx.reading[1].next(readingSnapshot(14))
      fx.progress[1].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.stale).toBe(false)
    expect(result.current.retrying).toBe(false)

    // Visit 1's listeners — same child, same key — now report failure.
    act(() => {
      fx.progress[0].error(new Error('unavailable'))
      fx.reading[0].error(new Error('unavailable'))
    })
    await flush()

    expect(result.current.readError).toBe(false)
    expect(result.current.stale).toBe(false)
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
  })

  it('writes nothing from a callback that arrives after unmount', async () => {
    const { unmount } = mount()
    unmount()

    // Nothing bumps the visit id on unmount, so this is the cleanup flag's job.
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()

    expect(fx.setDoc).not.toHaveBeenCalled()
  })

  it('refuses a late callback after leave-and-return to the SAME child', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    rerender({ familyId: FAM, childId: LONDON })
    rerender({ familyId: FAM, childId: LINCOLN })
    // Back on Lincoln with a third pair of listeners — and the key
    // `fam-1_lincoln` is identical to visit 1's, which is why the visit id
    // exists at all.
    expect(fx.progress).toHaveLength(3)
    expect(result.current.loading).toBe(true)

    act(() => {
      // Visit 1's listener, long closed, delivers a doc from before.
      fx.progress[0].next(progressSnapshot({ ...SAVED, completedMissions: [], raisedBanners: [] }))
      fx.reading[0].next(readingSnapshot(0))
    })
    await flush()

    expect(result.current.loading).toBe(true)
    expect(fx.setDoc).not.toHaveBeenCalled()

    act(() => {
      fx.reading[2].next(readingSnapshot(14))
      fx.progress[2].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.totalReadingActions).toBe(14)
    expect(fx.setDoc).not.toHaveBeenCalled()
  })

  it('a family change is a new visit too', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    rerender({ familyId: 'fam-2', childId: LINCOLN })
    act(() => {
      fx.reading[0].next(readingSnapshot(99))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    expect(result.current.loading).toBe(true)
    expect(result.current.completedMissions).toEqual([])
    expect(fx.setDoc).not.toHaveBeenCalled()

    act(() => {
      fx.reading[1].next(readingSnapshot(0))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()
    // The create goes to the family that asked for it.
    expect(fx.writes[0].path).toBe(`fam-2/stonebridgeProgress/${LINCOLN}`)
  })

  it('an old write keeps its target, and its rejection belongs to the visit that issued it', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(fx.writes).toHaveLength(1)
    expect(fx.writes[0].path).toBe(`${FAM}/stonebridgeProgress/${LINCOLN}`)

    // The parent switches child while that write is still in flight.
    rerender({ familyId: FAM, childId: LONDON })
    act(() => {
      fx.reading[1].next(readingSnapshot(2))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()

    // London does NOT wait behind Lincoln's write: the lane is per child.
    expect(fx.setDoc).toHaveBeenCalledTimes(2)
    expect(fx.writes[1].path).toBe(`${FAM}/stonebridgeProgress/${LONDON}`)
    expect(fx.writes[1].payload).toMatchObject({
      childId: LONDON,
      completedMissions: [],
      missionBaselines: { old_bridge: 2 },
    })

    await act(async () => {
      fx.writes[0].reject(new Error('permission-denied'))
      await Promise.resolve()
    })
    await flush()

    // Lincoln's failure is not London's error message, and it neither issues
    // nor cancels anything of London's.
    expect(result.current.saveError).toBe(false)
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(fx.setDoc).toHaveBeenCalledTimes(2)
  })

  /**
   * THE P1 the first candidate shipped. One global `pendingWriteRef` meant the
   * brother whose initialisation write never settles — offline, Firestore holds
   * the `setDoc` promise indefinitely — held the OTHER brother's first visit
   * hostage for as long as it stayed pending, and his village never got created
   * at all. A lane per child is the fix; a lane per child that is *cleared* on a
   * switch would be a different bug, so the second half of this block is the
   * dedup that has to survive it.
   */
  it('lets the second child create while the first child\'s write is still pending', async () => {
    const { rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.writes).toHaveLength(1)
    expect(fx.writes[0].path).toBe(`${FAM}/stonebridgeProgress/${LINCOLN}`)

    // Lincoln's create is never resolved or rejected below — that is the point.
    rerender({ familyId: FAM, childId: LONDON })
    act(() => {
      fx.reading[1].next(readingSnapshot(3))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(2)
    expect(fx.writes[1].path).toBe(`${FAM}/stonebridgeProgress/${LONDON}`)
    expect(fx.writes[1].payload.missionBaselines).toEqual({ old_bridge: 3 })
  })

  it('still refuses a duplicate create on returning to the child whose write is pending', async () => {
    const { rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    rerender({ familyId: FAM, childId: LONDON })
    rerender({ familyId: FAM, childId: LINCOLN })

    // Lincoln's third-visit listeners deliver a SUCCESSFUL "no doc yet" — true
    // as far as the server has told us, because the create from visit 1 has
    // still not landed. A second create here is the reset.
    act(() => {
      fx.reading[2].next(readingSnapshot(7))
      fx.progress[2].next(progressSnapshot(null))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })

  it('still refuses a duplicate create after the first one was acknowledged', async () => {
    const { rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()
    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    rerender({ familyId: FAM, childId: LONDON })
    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      // The listener has not caught up with the create, so it still says missing.
      fx.reading[2].next(readingSnapshot(7))
      fx.progress[2].next(progressSnapshot(null))
    })
    await flush()

    // The lane is free — the dedup is what refuses, not the lock.
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })

  /**
   * THE LAST BLOCKER, reproduced against the real hook: a rejection is the
   * CHILD's outcome, not a generation's, and nothing may be written for him
   * again without a tap.
   *
   * The sequence that caught it: a create is in flight for Lincoln, the parent
   * switches to London and back, Lincoln's current (and entirely truthful)
   * "no doc yet" + count arrive, and only THEN does the original promise
   * reject. The previous build released the signature and let the live
   * generation — which did have successful current data — re-issue immediately,
   * so the second create started with no error ever shown. A write nobody was
   * told about is the whole defect class this run exists to close.
   *
   * "No tight loop" is a claim about counts, so the counts are written out.
   */
  it('waits for a tap after a same-child rejection, even one that lands on a later visit', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    // Away and back while that create is still in flight.
    rerender({ familyId: FAM, childId: LONDON })
    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[2].next(readingSnapshot(7))
      fx.progress[2].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    // The original promise rejects now.
    await act(async () => {
      fx.writes[0].reject(new Error('unavailable'))
      await Promise.resolve()
    })
    await flush()

    // No second create starts on its own…
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    // …and the child who is on screen is told, with a door.
    expect(result.current.saveError).toBe(true)
    expect(typeof result.current.retry).toBe('function')

    // More truthful snapshots do not change that: the tap is the only re-arm.
    act(() => {
      fx.reading[2].next(readingSnapshot(8))
      fx.progress[2].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    // The tap re-reads and re-arms exactly ONE attempt.
    act(() => {
      result.current.retry()
    })
    expect(result.current.saveError).toBe(false)
    act(() => {
      fx.reading[3].next(readingSnapshot(8))
      fx.progress[3].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(2)
    expect(fx.writes[1].path).toBe(`${FAM}/stonebridgeProgress/${LINCOLN}`)
    expect(fx.writes[1].payload.missionBaselines).toEqual({ old_bridge: 8 })

    // And if that one fails too, it stops again rather than looping.
    await act(async () => {
      fx.writes[1].reject(new Error('unavailable'))
      await Promise.resolve()
    })
    await flush()
    expect(result.current.saveError).toBe(true)
    expect(fx.setDoc).toHaveBeenCalledTimes(2)
  })

  it('keeps one child\'s rejection off his brother, and still waiting on return', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()

    // London is on screen when Lincoln's create fails.
    rerender({ familyId: FAM, childId: LONDON })
    act(() => {
      fx.reading[1].next(readingSnapshot(3))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(2)

    await act(async () => {
      fx.writes[0].reject(new Error('permission-denied'))
      await Promise.resolve()
    })
    await flush()

    // London is neither blamed nor blocked: his own create is away, and his
    // screen says nothing about his brother's failure.
    expect(result.current.saveError).toBe(false)
    expect(fx.setDoc).toHaveBeenCalledTimes(2)
    act(() => {
      fx.reading[1].next(readingSnapshot(4))
    })
    await flush()
    expect(result.current.saveError).toBe(false)

    // Lincoln comes back. The failure is still his, and it is still waiting —
    // not silently retried.
    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[2].next(readingSnapshot(7))
      fx.progress[2].next(progressSnapshot(null))
    })
    await flush()
    expect(result.current.saveError).toBe(true)
    expect(fx.setDoc).toHaveBeenCalledTimes(2)

    act(() => {
      result.current.retry()
    })
    act(() => {
      fx.reading[3].next(readingSnapshot(7))
      fx.progress[3].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(3)
    expect(fx.writes[2].path).toBe(`${FAM}/stonebridgeProgress/${LINCOLN}`)
  })

  it('an old write landing late raises no banner on the child now on screen', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    rerender({ familyId: FAM, childId: LONDON })
    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    // The completion belonged to Lincoln's visit; London celebrates nothing.
    expect(result.current.justCompletedMissionId).toBeNull()

    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[2].next(readingSnapshot(19))
      fx.progress[2].next(progressSnapshot(SAVED))
    })
    await flush()
    // And it is not held over to be replayed when he comes back, either.
    expect(result.current.justCompletedMissionId).toBeNull()
  })

  it('keeps each child owning his own count across a switch and back', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.totalReadingActions).toBe(14)

    rerender({ familyId: FAM, childId: LONDON })
    act(() => {
      fx.reading[1].next(readingSnapshot(2))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.writes[0].path).toBe(`${FAM}/stonebridgeProgress/${LONDON}`)
    expect(fx.writes[0].payload.missionBaselines).toEqual({ old_bridge: 2 })
    // Lincoln's village is not showing under London while his doc is created.
    expect(result.current.completedMissions).toEqual([])
    expect(result.current.totalReadingActions).toBeNull()

    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[2].next(readingSnapshot(14))
      fx.progress[2].next(progressSnapshot(SAVED))
    })
    await flush()

    expect(result.current.totalReadingActions).toBe(14)
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.stale).toBe(false)
    // No write for Lincoln — nothing about his village changed.
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })
})

/**
 * THE BLOCKER the independent review reproduced on candidate 3, and the three
 * routes back to it.
 *
 * Candidate 3 stamped every snapshot, write and celebration with
 * `${familyId}_${childId}#${retryN}` and called that a generation. **That string
 * repeats.** Leave a child and come back and the new visit's stamp is
 * character-for-character the first visit's — same child, same Retry count — so
 * the reducer's guard, which was doing exactly what it was written to do,
 * accepted a write issued by a visit that had ended. A pending Watchtower
 * advance acknowledged after a switch-away-and-back therefore raised the
 * banner-raise celebration over a visit in which the child had completed
 * nothing: a party for a mission he finished before he left, replayed because
 * the identity could not tell the two visits apart.
 *
 * The repair is a visit id with a monotonically increasing serial
 * (`scope#retry@serial`), so no later visit can ever hold an earlier one's id.
 *
 * POSITIVE CONTROL. Drop the serial — make the visit id `${key}#${retryN}`
 * again — and all three tests below fail on a `justCompletedMissionId` of
 * `'watchtower'` / `'library_hut'` where they assert `null`. They are three
 * tests rather than one because the scope string can repeat along three
 * independent axes: the child, the family, and the empty selection in between.
 *
 * What must NOT be lost to the fix is written out too: the per-child write lane,
 * the issued-signature dedup and the rejection memory are keyed by CHILD and
 * must keep ignoring the serial entirely (asserted here as the write count that
 * does not move), and a completion the LATEST visit earns must still celebrate
 * however many returns preceded it.
 */
describe('an old visit’s acknowledgement cannot celebrate in a new one', () => {
  it('raises no banner when a pending advance acknowledges after A → B → A', async () => {
    const { result, rerender } = mount({ childId: LONDON })
    // London finishes Watchtower: 11 lifetime − baseline 5 = his 6.
    act(() => {
      fx.reading[0].next(readingSnapshot(11))
      fx.progress[0].next(progressSnapshot(LONDON_SAVED))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].path).toBe(`${FAM}/stonebridgeProgress/${LONDON}`)
    expect(fx.writes[0].payload.completedMissions).toEqual(['old_bridge', 'watchtower'])
    // Nothing is celebrated yet — that write has not been acknowledged, and it
    // is still in flight for the whole of the rest of this test.
    expect(result.current.justCompletedMissionId).toBeNull()

    // B: the brother, who has his own village and changes nothing.
    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[1].next(readingSnapshot(14))
      fx.progress[1].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    // Back to A, whose listener is still behind the in-flight write and so
    // delivers the progress saved BEFORE it — truthfully, as far as the server
    // has said anything.
    rerender({ familyId: FAM, childId: LONDON })
    act(() => {
      fx.reading[2].next(readingSnapshot(11))
      fx.progress[2].next(progressSnapshot(LONDON_SAVED))
    })
    await flush()
    // The dedup is the CHILD's, so the return issues no second write…
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    // …and the board shows what the server has told us, not what is in flight.
    expect(result.current.completedMissions).toEqual(['old_bridge'])
    expect(result.current.stale).toBe(false)
    expect(result.current.justCompletedMissionId).toBeNull()

    // THE REPRODUCTION: the first visit's write acknowledges now, during a visit
    // whose scope key and Retry count are identical to the one that issued it.
    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    expect(result.current.justCompletedMissionId).toBeNull()
    // It kept its own target and its own payload — the write was never cancelled
    // or re-aimed, it simply celebrates nothing here.
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].path).toBe(`${FAM}/stonebridgeProgress/${LONDON}`)

    // And the celebration is not merely deferred to the catch-up snapshot: the
    // banner is his, visible, and raised without a party being thrown for it.
    act(() => {
      fx.progress[2].next(progressSnapshot(fx.writes[0].payload))
    })
    await flush()
    expect(result.current.raisedBanners).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.mission?.id).toBe('library_hut')
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(result.current.stale).toBe(false)
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })

  it('raises no banner when the family goes away and comes back', async () => {
    const { result, rerender } = mount()
    // 19 lifetime actions completes Lincoln's Library Hut.
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].payload.completedMissions).toContain('library_hut')

    // The same child under a different family is a different child's document.
    rerender({ familyId: 'fam-2', childId: LINCOLN })
    act(() => {
      fx.reading[1].next(readingSnapshot(0))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.writes[1].path).toBe(`fam-2/stonebridgeProgress/${LINCOLN}`)

    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[2].next(readingSnapshot(19))
      fx.progress[2].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(2)

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    expect(result.current.justCompletedMissionId).toBeNull()
    expect(fx.setDoc).toHaveBeenCalledTimes(2)
  })

  it('raises no banner when the child is deselected and chosen again', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    // No child chosen: the quiet placeholder, and no subscription of its own.
    rerender({ familyId: FAM, childId: '' })
    await flush()
    expect(fx.progress).toHaveLength(1)
    expect(fx.progress[0].closed).toBe(true)
    expect(result.current.loading).toBe(true)
    expect(result.current.totalReadingActions).toBeNull()

    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[1].next(readingSnapshot(19))
      fx.progress[1].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    expect(result.current.justCompletedMissionId).toBeNull()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })

  /**
   * The other half of the property: the serial must not make celebrations
   * unreachable. A visit several returns deep still raises the banner for a
   * completion IT earned and IT had acknowledged.
   */
  it('still celebrates a completion the latest visit earned, after repeated returns', async () => {
    const { result, rerender } = mount()
    act(() => {
      // Nothing completes at 14 — Library Hut is 3 of 8.
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(fx.setDoc).not.toHaveBeenCalled()

    // Away and back, twice: four more visits, each with its own listener pair.
    rerender({ familyId: FAM, childId: LONDON })
    rerender({ familyId: FAM, childId: LINCOLN })
    rerender({ familyId: FAM, childId: LONDON })
    rerender({ familyId: FAM, childId: LINCOLN })
    expect(fx.progress).toHaveLength(5)
    expect(fx.reading).toHaveLength(5)
    expect(result.current.loading).toBe(true)

    // This visit reads the 19th action, and the completion is its own.
    act(() => {
      fx.reading[4].next(readingSnapshot(19))
      fx.progress[4].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].path).toBe(`${FAM}/stonebridgeProgress/${LINCOLN}`)
    expect(result.current.justCompletedMissionId).toBeNull()

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    expect(result.current.justCompletedMissionId).toBe('library_hut')
    act(() => {
      result.current.clearJustCompleted()
    })
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })
})

/**
 * THE RELEASE BLOCKER: the document has more than one writer.
 *
 * Everything above this line is about ONE mount — its visits, its lane, its
 * signatures, its celebrations. The lost-progress defect the independent review
 * reproduced is not in that space at all. Two clients are ordinary here (a
 * phone and a tablet, a second tab, the same village open twice), and:
 *
 *  • an earlier client whose subscription still said `missing` held an
 *    unconditional `setDoc`; a newer client created the village and repaired
 *    the bridge; the earlier create then committed and erased the completion,
 *    the banner and the baselines;
 *  • an earlier client's first-mission advance, computed before the newer
 *    client's completion, overwrote that completion the same way.
 *
 * No lane, signature or visit id can see another client, so none of them can
 * protect the document. The decision has to be made where the document is: one
 * transaction, create only while absent, advance only while the stored document
 * still equals the one the proposal was computed from.
 *
 * Each test below delivers this mount's snapshot FIRST and then has the other
 * client write, before flushing — which is the real ordering, and the reason
 * the modelled transaction reads on a later tick.
 *
 * POSITIVE CONTROL. Replace either transaction with the `setDoc` it replaced —
 * or drop the compare and keep the transaction — and the first two tests fail
 * on a datastore whose `completedMissions` is `[]`.
 */
describe('the datastore decides, because the document has another writer', () => {
  /** What another client built while this mount still saw no village at all. */
  const BUILT_BY_ANOTHER_CLIENT: StonebridgeProgress = {
    childId: LINCOLN,
    currentMissionId: 'watchtower',
    activeProgress: { missionId: 'watchtower', current: 2, target: 6 },
    completedMissions: ['old_bridge'],
    raisedBanners: ['old_bridge'],
    missionBaselines: { old_bridge: 0, watchtower: 5 },
    updatedAt: '2026-10-28T08:00:00.000Z',
  }

  /**
   * London, further along than this mount's own proposal would take him.
   *
   * The other client's reading subscription was ahead (19 actions where this
   * one has seen 11), so it legitimately finished Watchtower *and* the Library
   * Hut and queued the Forge. Nothing here may be rolled back to the village
   * this mount computed from an older count.
   */
  const LONDON_AHEAD: StonebridgeProgress = {
    childId: LONDON,
    currentMissionId: 'the_forge',
    activeProgress: { missionId: 'the_forge', current: 0, target: 10 },
    completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
    raisedBanners: ['old_bridge', 'watchtower', 'library_hut'],
    missionBaselines: { old_bridge: 0, watchtower: 5, library_hut: 11, the_forge: 19 },
    updatedAt: '2026-10-28T09:00:00.000Z',
  }

  it('refuses the delayed create of a village another client has already built', async () => {
    const { result } = mount()
    // Truthful as of its own snapshot: this client has not been told about any
    // village for Lincoln, and it has a real count of 7 to baseline from.
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    // …and in that window the other client creates the village and repairs the
    // Old Bridge.
    setStored(LINCOLN, BUILT_BY_ANOTHER_CLIENT)
    await flush()

    // THE REPRODUCTION, inverted: the create is refused at the document.
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.writes).toHaveLength(0)
    expect(fx.stored.get(progressPath(LINCOLN))).toEqual(BUILT_BY_ANOTHER_CLIENT)

    // The completion, the banner and the baselines are all still there, and
    // they are what this mount now shows — adopted, not argued with.
    expect(result.current.completedMissions).toEqual(['old_bridge'])
    expect(result.current.raisedBanners).toEqual(['old_bridge'])
    expect(result.current.mission?.id).toBe('watchtower')
    expect(result.current.active).toMatchObject({ missionId: 'watchtower', current: 2, target: 6 })
    // A refused write is not a completion: no banner-raise for somebody else's
    // repair, and nothing claims to have saved.
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(result.current.saveError).toBe(false)
    // One attempt, refused, and then nothing: a no-op must not spin.
    expect(fx.transactions).toBe(1)
  })

  it('refuses an advance computed before another client took him further', async () => {
    const { result } = mount({ childId: LONDON })
    // His 11th reading action finishes Watchtower, as far as this client knows.
    act(() => {
      fx.reading[0].next(readingSnapshot(11))
      fx.progress[0].next(progressSnapshot(LONDON_SAVED))
    })
    setStored(LONDON, LONDON_AHEAD)
    await flush()

    // THE SECOND REPRODUCTION: the advance that overwrote a newer completion.
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.stored.get(progressPath(LONDON))).toEqual(LONDON_AHEAD)
    // The attempt carried `watchtower` as a completion and still celebrates
    // nothing: the write did not happen.
    expect(result.current.justCompletedMissionId).toBeNull()
    // What is on screen is the authoritative village, not the one this client
    // proposed — three banners, not two, and the Forge queued.
    expect(result.current.completedMissions).toEqual([
      'old_bridge',
      'watchtower',
      'library_hut',
    ])
    expect(result.current.raisedBanners).toHaveLength(3)
    expect(result.current.mission?.id).toBe('the_forge')
    expect(result.current.stale).toBe(false)
    // Adopting it finds nothing left to do, so nothing is written and nothing
    // reattempts. (`advanceMissions` is unchanged and still monotonic here.)
    expect(fx.transactions).toBe(1)
  })

  it('commits while the stored village is still exactly the one it read', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()

    // The compare is against the SOURCE, so an unchanged document commits the
    // proposal exactly as `advanceMissions` returned it.
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].payload).toMatchObject({
      currentMissionId: 'the_forge',
      completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
      raisedBanners: ['old_bridge', 'watchtower', 'library_hut'],
    })
    expect(result.current.justCompletedMissionId).toBeNull()

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    // Acknowledged: it is in the datastore, and the banner it earned is raised.
    expect(fx.stored.get(progressPath(LINCOLN))).toEqual(fx.writes[0].payload)
    expect(result.current.justCompletedMissionId).toBe('library_hut')
    expect(fx.transactions).toBe(1)
  })

  it('initialises an absent village once, with the baseline unchanged', async () => {
    mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    // The same baseline `initialStonebridgeProgress` has always written: at the
    // count this client actually read, so existing lifetime reading does not
    // auto-complete the opening mission.
    expect(fx.writes[0].payload).toMatchObject({
      childId: LINCOLN,
      currentMissionId: 'old_bridge',
      completedMissions: [],
      raisedBanners: [],
      missionBaselines: { old_bridge: 7 },
    })

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()
    expect(fx.stored.get(progressPath(LINCOLN))).toEqual(fx.writes[0].payload)
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })

  /**
   * A conflict must not be a dead end either.
   *
   * The signature that dedups an attempt now includes the SOURCE document, for
   * exactly this: a refused write is a write that did not happen, so the same
   * proposal against a different authoritative document is legitimate later
   * work. Here another client touches the document without changing what it
   * says (a stamp refresh), the compare refuses, and the completion the child
   * really earned still lands — in one further attempt, not a spin.
   *
   * POSITIVE CONTROL. Take the source back out of `advanceSignature` and this
   * fails on a write count of 0: the re-issue is deduped against the attempt
   * that was refused, and the completion is suppressed for the life of the
   * mount.
   */
  it('re-reads after a conflict and still completes the work the child earned', async () => {
    const touched: StonebridgeProgress = { ...SAVED, updatedAt: '2026-10-28T10:00:00.000Z' }
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    setStored(LINCOLN, touched)
    await flush()

    // The first attempt was refused, and the second — against the document it
    // adopted — committed.
    expect(fx.transactions).toBe(2)
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].payload).toMatchObject({
      currentMissionId: 'the_forge',
      completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
    })
    expect(result.current.justCompletedMissionId).toBeNull()

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    expect(result.current.justCompletedMissionId).toBe('library_hut')
    // And it stops there: no third transaction, no second write.
    expect(fx.transactions).toBe(2)
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })

  it('lands no refused-write answer on the visit or the child that replaced it', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    // Another client is ahead, so Lincoln's attempt will be refused…
    setStored(LINCOLN, { ...SAVED, updatedAt: '2026-10-28T11:00:00.000Z' })
    // …and the parent switches child before it resolves.
    rerender({ familyId: FAM, childId: LONDON })
    await flush()

    // London's visit is told nothing by Lincoln's refusal: no village, no
    // banner, no error of his brother's.
    expect(result.current.loading).toBe(true)
    expect(result.current.completedMissions).toEqual([])
    expect(result.current.totalReadingActions).toBeNull()
    expect(result.current.justCompletedMissionId).toBeNull()
    expect(result.current.saveError).toBe(false)
    // Nothing was written for Lincoln either — the refusal stands.
    expect(fx.setDoc).not.toHaveBeenCalled()

    // London's own first visit is unaffected and creates his village.
    act(() => {
      fx.reading[1].next(readingSnapshot(3))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].path).toBe(progressPath(LONDON))
    expect(fx.writes[0].payload.missionBaselines).toEqual({ old_bridge: 3 })
  })
})

/**
 * A village that is GONE is not a village that was never there.
 *
 * Sol's refusal nuance, and the one case where `missing` must not authorise the
 * create it has always authorised: once this mount has seen a child's village
 * exist, a later `missing` — from a subscription or from the transaction's own
 * read — is a document that has disappeared. Writing a fresh baseline over it
 * would be a silent reset wearing a first visit's clothes, and the lists it
 * erased are the whole of the child's history.
 *
 * So nothing is written for him, and the hook reports it honestly instead: his
 * last known village, labelled as not fresh, with the one Retry door. The
 * refusal is per CHILD and survives a Retry and a switch away and back, because
 * it is a fact about the document. An authoritative existing document is the
 * only thing that clears it.
 *
 * THE LIMIT, stated rather than papered over: a completely fresh mount cannot
 * tell a deleted document from one that was never created — both are a
 * successful `missing`. Telling them apart needs a stored tombstone, which is a
 * schema change and is deliberately not made. The guarantee is bounded to a
 * mount that has watched the village exist.
 */
describe('missing where a village was is a recovery state, not a first visit', () => {
  it('never re-creates a village that vanished while this mount watched it', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])

    // The document is deleted out from under the app. The subscription reports
    // it, truthfully, as a successful snapshot with no document.
    act(() => {
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()

    // NOT a first visit: no create, no baseline, no reset — and no attempt.
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.transactions).toBe(0)
    expect(fx.stored.has(progressPath(LINCOLN))).toBe(false)
    // The honest report: his earned village, said to be last-known, with the
    // door. Not an empty village, and not a claim that anything saved.
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.raisedBanners).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.stale).toBe(true)
    // A read that did not produce his village — the sentence every surface
    // already has for that, and the reason the door is reachable.
    expect(result.current.readError).toBe(true)
    expect(result.current.saveError).toBe(false)
    expect(typeof result.current.retry).toBe('function')

    // A Retry re-reads and refuses again: `missing` a second time is still not
    // permission.
    act(() => {
      result.current.retry()
    })
    act(() => {
      fx.reading[1].next(readingSnapshot(14))
      fx.progress[1].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.transactions).toBe(0)

    // Away and back is not permission either — the refusal is the child's, not
    // the visit's — and it is still SAID, with nothing of his left on screen to
    // label: the switch took the last-known pair and left the refusal.
    rerender({ familyId: FAM, childId: LONDON })
    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[3].next(readingSnapshot(14))
      fx.progress[3].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.transactions).toBe(0)
    expect(result.current.readError).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.saveError).toBe(false)

    // An authoritative existing document is the one way out, and it clears the
    // refusal without having written anything in the meantime.
    act(() => {
      fx.progress[3].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.stale).toBe(false)
    expect(result.current.readError).toBe(false)
    expect(fx.setDoc).not.toHaveBeenCalled()
  })

  it('reports a village that vanished under an advance, and recreates nothing', async () => {
    const { result } = mount()
    // His 19th action completes the Library Hut, so there is a real advance to
    // write — and the document is deleted before the transaction reads it.
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    clearStored(LINCOLN)
    await flush()

    // The transaction found nothing where this mount had seen a village. That
    // is not permission to write the proposal as a fresh document.
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.stored.has(progressPath(LINCOLN))).toBe(false)
    // No completion is claimed off a write that did not happen.
    expect(result.current.justCompletedMissionId).toBeNull()
    // The subscription still reports the village it last read, and the hook
    // keeps showing it — labelled, because the document behind it is gone.
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.stale).toBe(true)
    expect(result.current.saveError).toBe(false)
    // The transaction's own read is a read that did not produce his village,
    // even though the listener is still reporting one.
    expect(result.current.readError).toBe(true)
    // One attempt, and then it waits for a real read rather than spinning
    // against the hole.
    expect(fx.transactions).toBe(1)
  })
})

/**
 * THE LIFECYCLE CASES Sol's independent review reproduced against the real
 * hook and the real card, where the first cut of this repair was still wrong.
 *
 * All five are the same shape: a transaction's answer and a subscription's
 * answer arriving in an order nobody chose, across a switch between brothers.
 * What they establish:
 *
 *  • a fact about a child's DOCUMENT (it exists) outlives the visit that
 *    learned it, while the DATA that came with it does not;
 *  • a refusal must be SAID, not just obeyed — including in a visit that has
 *    no last-known village of its own to label;
 *  • whether a delayed answer may speak for the screen is a question about
 *    which OBSERVATION is on screen, never about what the answer contains: two
 *    successive `missing` reads carry equal values and are different
 *    observations, and `ready → missing` is newer information;
 *  • releasing a lane is a state change, and the visit that was waiting behind
 *    it gets exactly one reconsideration.
 *
 * POSITIVE CONTROLS, one per test, named in each.
 */
describe('a transaction’s answer outliving its visit', () => {
  /** What another client built while this mount still saw no village. */
  const BUILT_ELSEWHERE: StonebridgeProgress = {
    childId: LINCOLN,
    currentMissionId: 'watchtower',
    activeProgress: { missionId: 'watchtower', current: 2, target: 6 },
    completedMissions: ['old_bridge'],
    raisedBanners: ['old_bridge'],
    missionBaselines: { old_bridge: 0, watchtower: 5 },
    updatedAt: '2026-10-28T08:00:00.000Z',
  }

  /** The same child, taken further by a client whose ledger read was ahead. */
  const AHEAD_ELSEWHERE: StonebridgeProgress = {
    ...SAVED,
    currentMissionId: 'the_forge',
    activeProgress: { missionId: 'the_forge', current: 0, target: 10 },
    completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
    raisedBanners: ['old_bridge', 'watchtower', 'library_hut'],
    missionBaselines: { ...SAVED.missionBaselines, the_forge: 19 },
    updatedAt: '2026-10-28T09:00:00.000Z',
  }

  /**
   * POSITIVE CONTROL: drop the recovery state out of `readError` and this fails
   * on `loading` — the card then renders *"Loading your mission…"* with no door
   * at all, which is what Sol's card test found.
   */
  it('says so on returning to a child whose village has gone, with no last-known data', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(14))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])

    // The brother, with a village of his own that changes nothing.
    rerender({ familyId: FAM, childId: LONDON })
    act(() => {
      fx.reading[1].next(readingSnapshot(9))
      fx.progress[1].next(progressSnapshot(LONDON_SAVED))
    })
    await flush()

    // Back to A, whose document has been deleted in the meantime. The switch
    // took his last-known pair with it, so there is nothing of his on screen
    // to label — and this is the case that used to say nothing at all.
    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[2].next(readingSnapshot(14))
      fx.progress[2].next(progressSnapshot(null))
    })
    await flush()

    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.transactions).toBe(0)
    expect(fx.stored.has(progressPath(LINCOLN))).toBe(false)
    // Visible, with the one door — not a spinner, and not a claimed save.
    expect(result.current.readError).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.saveError).toBe(false)
    expect(typeof result.current.retry).toBe('function')

    // The door re-reads, and `missing` a second time is still not permission.
    act(() => {
      result.current.retry()
    })
    act(() => {
      fx.reading[3].next(readingSnapshot(14))
      fx.progress[3].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(result.current.readError).toBe(true)

    // An authoritative existing document is the one thing that clears it, and
    // clearing it writes nothing.
    act(() => {
      fx.progress[3].next(progressSnapshot(SAVED))
    })
    await flush()
    expect(result.current.readError).toBe(false)
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(fx.setDoc).not.toHaveBeenCalled()
  })

  /**
   * POSITIVE CONTROL: gate the `exists` fact on the visit (as the first cut
   * did, by carrying it only through `adopt`) and this fails on a second
   * create — a fresh baseline over the village another client had built.
   */
  it('keeps a brother-time answer that A’s village exists, and refuses on return', async () => {
    const { result, rerender } = mount()
    // A's first visit truthfully sees no village, and its create goes away.
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    // Another client builds it in that window…
    setStored(LINCOLN, BUILT_ELSEWHERE)
    // …and the parent is looking at the brother when the answer lands.
    rerender({ familyId: FAM, childId: LONDON })
    await flush()

    // Nothing written, and nothing of A's on B's screen: the fact is kept, the
    // document is not adopted here, and nobody celebrates.
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.stored.get(progressPath(LINCOLN))).toEqual(BUILT_ELSEWHERE)
    expect(result.current.completedMissions).toEqual([])
    expect(result.current.loading).toBe(true)
    expect(result.current.readError).toBe(false)
    expect(result.current.justCompletedMissionId).toBeNull()

    // Back to A, whose listener still has not caught up and says `missing`.
    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[2].next(readingSnapshot(7))
      fx.progress[2].next(progressSnapshot(null))
    })
    await flush()

    // A refusal, not a first visit — and said out loud.
    expect(fx.setDoc).not.toHaveBeenCalled()
    expect(fx.transactions).toBe(1)
    expect(result.current.readError).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  /**
   * POSITIVE CONTROL: the same gating mistake for a create that SUCCEEDED —
   * without the fact, the return visit's `missing` is an ordinary first visit
   * and the only thing standing between it and a reset baseline is a dedup
   * signature that a Retry is allowed to release.
   */
  it('keeps a brother-time answer that A’s own create landed, and refuses on return', async () => {
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    await flush()
    expect(fx.setDoc).toHaveBeenCalledTimes(1)

    // The parent switches away, and only then does the create commit.
    rerender({ familyId: FAM, childId: LONDON })
    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()
    expect(result.current.loading).toBe(true)
    expect(result.current.readError).toBe(false)
    expect(result.current.justCompletedMissionId).toBeNull()

    // Back to A. His listener has not caught up, so it says `missing` — but his
    // village demonstrably exists, because this mount is what created it. A
    // second create here would baseline him at the NEW count.
    rerender({ familyId: FAM, childId: LINCOLN })
    act(() => {
      fx.reading[2].next(readingSnapshot(9))
      fx.progress[2].next(progressSnapshot(null))
    })
    await flush()

    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(result.current.readError).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  /**
   * POSITIVE CONTROL: decide ownership by comparing the answer's document to
   * what is on screen (the first cut's `answersForScreen`, which accepted any
   * `missing`) and this fails on three banners — the delayed conflict adopts
   * its village over a newer read that said there is none, and clears the
   * refusal with it.
   */
  it('lets no delayed conflict answer talk over a newer missing read', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    // The advance is away; then the listener reports — NEWER — that the
    // document is gone.
    act(() => {
      fx.progress[0].next(progressSnapshot(null))
    })
    // And the datastore holds a village another client moved on, so the
    // in-flight attempt will come back a conflict carrying it.
    setStored(LINCOLN, AHEAD_ELSEWHERE)
    await flush()

    expect(fx.setDoc).not.toHaveBeenCalled()
    // Last-known, not the conflict's document: two banners, not three.
    expect(result.current.completedMissions).toEqual(['old_bridge', 'watchtower'])
    expect(result.current.raisedBanners).toHaveLength(2)
    // The newer refusal stands, and nothing celebrates.
    expect(result.current.readError).toBe(true)
    expect(result.current.stale).toBe(true)
    expect(result.current.justCompletedMissionId).toBeNull()
  })

  /**
   * The same rule where the two observations carry EQUAL values — which is why
   * it cannot be a comparison of documents.
   *
   * POSITIVE CONTROL: accept the answer whenever the screen says `missing` and
   * this fails on an adopted village appearing in an observation that never
   * asked for it.
   */
  it('lets no delayed create answer talk over a newer missing read of equal value', async () => {
    const { result } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(7))
      fx.progress[0].next(progressSnapshot(null))
    })
    // A second `missing`: the same value, a different observation.
    act(() => {
      fx.progress[0].next(progressSnapshot(null))
    })
    setStored(LINCOLN, BUILT_ELSEWHERE)
    await flush()

    expect(fx.setDoc).not.toHaveBeenCalled()
    // Not adopted into the newer observation…
    expect(result.current.completedMissions).toEqual([])
    expect(result.current.mission).toBeNull()
    expect(result.current.justCompletedMissionId).toBeNull()
    // …and still a refusal, because the document is known to be there.
    expect(result.current.readError).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(fx.stored.get(progressPath(LINCOLN))).toEqual(BUILT_ELSEWHERE)
  })

  /**
   * POSITIVE CONTROL: bump the reconsideration only for a write that landed
   * (the first cut) and this fails on a write count of 0 — the completion the
   * child earned in the visit he is in sits unwritten behind a lane that has
   * already been freed.
   */
  it('wakes the live visit when a no-op frees the lane it was waiting behind', async () => {
    const touched: StonebridgeProgress = { ...SAVED, updatedAt: '2026-10-28T12:00:00.000Z' }
    const { result, rerender } = mount()
    act(() => {
      fx.reading[0].next(readingSnapshot(19))
      fx.progress[0].next(progressSnapshot(SAVED))
    })
    // Another client touches the document, so this attempt will be refused…
    setStored(LINCOLN, touched)
    // …and the parent goes to the brother and back while it is still away.
    rerender({ familyId: FAM, childId: LONDON })
    rerender({ familyId: FAM, childId: LINCOLN })

    // The new visit has a complete, current read of its own and real work to
    // do — and is held only by the lane the earlier attempt still owns.
    act(() => {
      fx.reading[2].next(readingSnapshot(19))
      fx.progress[2].next(progressSnapshot(touched))
    })
    expect(fx.setDoc).not.toHaveBeenCalled()

    // The old attempt resolves as a no-op and frees the lane.
    await flush()

    expect(fx.transactions).toBe(2)
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
    expect(fx.writes[0].payload).toMatchObject({
      currentMissionId: 'the_forge',
      completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
      raisedBanners: ['old_bridge', 'watchtower', 'library_hut'],
    })

    await act(async () => {
      fx.writes[0].resolve()
      await Promise.resolve()
    })
    await flush()

    // It is THIS visit's completion, so this visit is the one that celebrates.
    expect(result.current.justCompletedMissionId).toBe('library_hut')
    // And it stops there: one wake-up, not a loop.
    expect(fx.transactions).toBe(2)
    expect(fx.setDoc).toHaveBeenCalledTimes(1)
  })
})
