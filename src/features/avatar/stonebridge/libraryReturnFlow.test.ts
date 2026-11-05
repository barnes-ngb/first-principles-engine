import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getActiveChildId,
  setActiveChildIdShared,
} from '../../../core/hooks/activeChildStore'
import {
  LIBRARY_RETURN_VILLAGE_PATH,
  LibraryReturnPhase,
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryReturnFlow,
  liveLibraryReturnFlow,
  pathKeepsLibraryReturnFlow,
  reconcileLibraryReturnFlow,
  requestLibraryReturn,
  serveLibraryReturn,
  subscribeLibraryReturnFlow,
} from './libraryReturnFlow'

/**
 * The temporary way back, as a rule rather than as a screen.
 *
 * ── What this file is for ────────────────────────────────────────────────────
 *
 * The three things that make the flow safe are all invisible in a rendered
 * screenshot: that a scope change ends it **permanently**, that a stale callback
 * cannot act on it, and that nothing anywhere can bring it back. So they are
 * asserted here, against the real module — including the one case a rendered
 * test cannot reach at all: a synchronous `A → B → A`, which React batches into
 * a single render that still reads `A`. This file drives the shared
 * `activeChildStore` directly, which is where the switch really happens.
 *
 * The companion `libraryReturn.route.test.tsx` drives the same module through a
 * real router and the real components.
 */

const LINCOLN = 'lincoln'
const LONDON = 'london'
const FAM = 'fam-1'
const ORIGIN = { familyId: FAM, childId: LINCOLN, missionId: 'library_hut' }

beforeEach(() => {
  localStorage.clear()
  // The store is module-level, so each test starts from a known child and a
  // known empty flow — exactly as a fresh page load would.
  setActiveChildIdShared(LINCOLN)
  endLibraryReturnFlow()
})

afterEach(() => {
  endLibraryReturnFlow()
})

describe('beginning a journey', () => {
  it('records the family, the child and the place, away from the village', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)
    expect(flow).toMatchObject({
      familyId: FAM,
      childId: LINCOLN,
      missionId: 'library_hut',
      phase: LibraryReturnPhase.Away,
    })
    expect(getLibraryReturnFlow()).toBe(flow)
  })

  it('refuses an unsettled scope rather than binding to nobody', () => {
    // A failed or still-loading children read is not an affirmative answer, and
    // a flow bound to an empty id would match whoever arrived next.
    expect(beginLibraryReturnFlow({ ...ORIGIN, childId: '' })).toBeNull()
    expect(beginLibraryReturnFlow({ ...ORIGIN, familyId: '' })).toBeNull()
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('persists nothing — a reload has no journey to resume', () => {
    beginLibraryReturnFlow(ORIGIN)
    // The active child IS persisted by its own store; the journey is not.
    const keys = Object.keys(localStorage).filter((k) => k !== 'fpe_active_child_id')
    expect(keys).toEqual([])
    expect(JSON.stringify(localStorage)).not.toContain('library_hut')
  })

  it('gives every journey a generation that is never reused', () => {
    const first = beginLibraryReturnFlow(ORIGIN)!
    const second = beginLibraryReturnFlow(ORIGIN)!
    expect(second.generation).toBeGreaterThan(first.generation)
    endLibraryReturnFlow()
    const third = beginLibraryReturnFlow(ORIGIN)!
    expect(third.generation).toBeGreaterThan(second.generation)
  })

  it('notifies subscribers, so a mounted shelf sees it without polling', () => {
    const seen = vi.fn()
    const unsubscribe = subscribeLibraryReturnFlow(seen)
    beginLibraryReturnFlow(ORIGIN)
    expect(seen).toHaveBeenCalledTimes(1)
    endLibraryReturnFlow()
    expect(seen).toHaveBeenCalledTimes(2)
    unsubscribe()
    beginLibraryReturnFlow(ORIGIN)
    expect(seen).toHaveBeenCalledTimes(2)
  })
})

describe('whose journey it is', () => {
  it('is live only for the family AND child it was begun for', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)
    expect(liveLibraryReturnFlow(flow, { familyId: FAM, childId: LINCOLN })).toBe(flow)
    expect(liveLibraryReturnFlow(flow, { familyId: FAM, childId: LONDON })).toBeNull()
    expect(liveLibraryReturnFlow(flow, { familyId: 'fam-2', childId: LINCOLN })).toBeNull()
  })

  it('is never live for an unsettled scope', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)
    expect(liveLibraryReturnFlow(flow, { familyId: FAM, childId: '' })).toBeNull()
    expect(liveLibraryReturnFlow(flow, { familyId: '', childId: LINCOLN })).toBeNull()
    expect(liveLibraryReturnFlow(null, { familyId: FAM, childId: LINCOLN })).toBeNull()
  })

  it('answers about the phase that was asked about', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)
    const scope = { familyId: FAM, childId: LINCOLN }
    expect(liveLibraryReturnFlow(flow, scope, LibraryReturnPhase.Returning)).toBeNull()
    const returning = requestLibraryReturn(flow!.generation)
    expect(liveLibraryReturnFlow(returning, scope, LibraryReturnPhase.Returning)).toBe(returning)
    expect(liveLibraryReturnFlow(returning, scope, LibraryReturnPhase.Away)).toBeNull()
  })
})

describe('a child switch ends it permanently', () => {
  it('ends it the moment the shared store changes', () => {
    beginLibraryReturnFlow(ORIGIN)
    setActiveChildIdShared(LONDON)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and a same-tick A → B → A does not bring it back', () => {
    // The case a rendered comparison cannot see: both writes land in one tick,
    // React batches them into a single render, and that render reads `A` — the
    // child the flow belongs to. The store saw two writes, and the first of them
    // already ended the journey.
    const flow = beginLibraryReturnFlow(ORIGIN)!
    setActiveChildIdShared(LONDON)
    setActiveChildIdShared(LINCOLN)
    expect(getActiveChildId()).toBe(LINCOLN)
    expect(getLibraryReturnFlow()).toBeNull()
    // And the generation it was holding cannot be used to revive it.
    expect(requestLibraryReturn(flow.generation)).toBeNull()
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('even while the child is switched to the draft’s own owner', () => {
    // `BookshelfPage.handleResumeDraft` legitimately switches to a draft's child
    // before the chat mounts (FEAT-188). That resume is untouched — the flow
    // neither blocks it nor adds a question to it — and it ends the journey like
    // any other switch, because the shelf underneath has re-read for someone
    // else.
    beginLibraryReturnFlow(ORIGIN)
    setActiveChildIdShared(LONDON)
    expect(getLibraryReturnFlow()).toBeNull()
    expect(getActiveChildId()).toBe(LONDON)
  })

  it('does nothing on a write that does not change the child', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)
    setActiveChildIdShared(LINCOLN)
    expect(getLibraryReturnFlow()).toBe(flow)
  })

  it('holds with nothing mounted at all', () => {
    // The subscription lives in the module, not in a component, so the rule
    // cannot be evaded by a switch that happens while the shelf is unmounting.
    beginLibraryReturnFlow(ORIGIN)
    expect(getLibraryReturnFlow()).not.toBeNull()
    setActiveChildIdShared(LONDON)
    expect(getLibraryReturnFlow()).toBeNull()
  })
})

describe('a family change or leaving the journey ends it', () => {
  it('ends on a different family, and on a logout', () => {
    beginLibraryReturnFlow(ORIGIN)
    reconcileLibraryReturnFlow({ familyId: 'fam-2', pathname: '/books' })
    expect(getLibraryReturnFlow()).toBeNull()

    beginLibraryReturnFlow(ORIGIN)
    reconcileLibraryReturnFlow({ familyId: '', pathname: '/books' })
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('survives every place the shelf leads', () => {
    for (const path of [
      LIBRARY_RETURN_VILLAGE_PATH,
      '/books',
      '/books/',
      '/books/book-1',
      '/books/book-1/read',
      '/books/book-1/review',
      '/books/create-story',
      '/books/sight-words',
      '/books/story-guide',
      '/stickers',
    ]) {
      expect(pathKeepsLibraryReturnFlow(path), path).toBe(true)
      beginLibraryReturnFlow(ORIGIN)
      reconcileLibraryReturnFlow({ familyId: FAM, pathname: path })
      expect(getLibraryReturnFlow(), path).not.toBeNull()
    }
  })

  it('ends anywhere else — including the shelf’s look-alikes', () => {
    for (const path of [
      '/today',
      '/quest',
      '/workshop',
      '/business',
      '/settings',
      // A different feature with a different shelf: the monthly-review reader.
      '/books-about-me',
      '/books-about-me/review-1',
      '/booksomething',
      '/',
    ]) {
      expect(pathKeepsLibraryReturnFlow(path), path).toBe(false)
      beginLibraryReturnFlow(ORIGIN)
      reconcileLibraryReturnFlow({ familyId: FAM, pathname: path })
      expect(getLibraryReturnFlow(), path).toBeNull()
    }
  })

  it('reconciling with no journey in hand does nothing', () => {
    const seen = vi.fn()
    const unsubscribe = subscribeLibraryReturnFlow(seen)
    reconcileLibraryReturnFlow({ familyId: FAM, pathname: '/today' })
    expect(seen).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('taking the way back', () => {
  it('moves to returning, and only on the generation that was offered', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)!
    expect(requestLibraryReturn(flow.generation + 1)).toBeNull()
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
    expect(requestLibraryReturn(flow.generation)?.phase).toBe(LibraryReturnPhase.Returning)
  })

  it('cannot be asked for twice', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)!
    expect(requestLibraryReturn(flow.generation)).not.toBeNull()
    expect(requestLibraryReturn(flow.generation)).toBeNull()
  })

  it('a tap that lands after a switch sends nobody anywhere', () => {
    // The stale-callback case: a handler rendered for Lincoln, tapped after the
    // header moved. The request is refused, so the caller never navigates.
    const flow = beginLibraryReturnFlow(ORIGIN)!
    setActiveChildIdShared(LONDON)
    expect(requestLibraryReturn(flow.generation)).toBeNull()
  })

  it('a tap that lands after the journey was replaced is refused too', () => {
    const first = beginLibraryReturnFlow(ORIGIN)!
    beginLibraryReturnFlow({ ...ORIGIN, missionId: 'the_forge' })
    expect(requestLibraryReturn(first.generation)).toBeNull()
    expect(getLibraryReturnFlow()?.missionId).toBe('the_forge')
  })
})

describe('serving the return exactly once', () => {
  it('consumes the request and leaves no journey behind', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)!
    requestLibraryReturn(flow.generation)
    expect(serveLibraryReturn(flow.generation)).toBe(true)
    expect(getLibraryReturnFlow()).toBeNull()
    expect(serveLibraryReturn(flow.generation)).toBe(false)
  })

  it('refuses to serve a request that was never made', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)!
    expect(serveLibraryReturn(flow.generation)).toBe(false)
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
  })

  it('refuses a generation that is not the one in hand', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)!
    requestLibraryReturn(flow.generation)
    expect(serveLibraryReturn(flow.generation - 1)).toBe(false)
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)
  })

  it('keeps the request while a village read has not answered', () => {
    // The board cannot open yet, so nothing is served and nothing is faked: the
    // existing recovery notice and its Try again still own that moment.
    const flow = beginLibraryReturnFlow(ORIGIN)!
    requestLibraryReturn(flow.generation)
    reconcileLibraryReturnFlow({ familyId: FAM, pathname: LIBRARY_RETURN_VILLAGE_PATH })
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)
  })

  it('but a held request does not survive leaving the journey', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)!
    requestLibraryReturn(flow.generation)
    reconcileLibraryReturnFlow({ familyId: FAM, pathname: '/today' })
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('or a child switch while the departure is still in the air', () => {
    const flow = beginLibraryReturnFlow(ORIGIN)!
    requestLibraryReturn(flow.generation)
    setActiveChildIdShared(LONDON)
    expect(getLibraryReturnFlow()).toBeNull()
  })
})
