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
 * Every `setDoc` here is DEFERRED — the mock resolves nothing on its own — so
 * the tests can land a write completion in the visit it belongs to, in a later
 * visit, or after the child changed, which is where the remaining hazards live.
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
      fx.writes.push({ path: ref.path, payload, resolve, reject })
    })
  },
}))

vi.mock('../../../core/firebase/firestore', () => ({
  xpLedgerCollection: (familyId: string) => ({ kind: 'xpLedger', familyId }),
  stonebridgeProgressCollection: (familyId: string) => ({ kind: 'stonebridgeProgress', familyId }),
}))

const FAM = 'fam-1'
const LINCOLN = 'lincoln'
const LONDON = 'london'

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

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
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

    // THE INVERTED REPRODUCTION: the fresh `setDoc` that erased the lists.
    expect(fx.setDoc).not.toHaveBeenCalled()
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

    // The old code counted 0 and persisted an activeProgress of 0 / 8.
    expect(fx.setDoc).not.toHaveBeenCalled()
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
