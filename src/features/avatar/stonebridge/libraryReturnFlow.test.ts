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
  expireLibraryReturnForUnsettledIdentity,
  getLibraryIdentityEpoch,
  getLibraryReturnFlow,
  isBooksAreaPath,
  liveLibraryReturnFlow,
  observeLibraryReturnIdentity,
  reconcileLibraryReturnFlowPath,
  requestLibraryReturn,
  serveLibraryReturn,
  subscribeLibraryReturnFlow,
} from './libraryReturnFlow'

/**
 * The temporary way back, as a rule rather than as a screen.
 *
 * What makes the journey safe is invisible in a screenshot: that a scope change
 * ends it permanently, that a stale callback cannot act on it, that a delayed
 * callback captured before it existed cannot create it, and that leaving the
 * journey ends it. Those are asserted here against the real module — including
 * the two cases a rendered test cannot reach at all: a synchronous `A → B → A`
 * (React batches it into one render still reading `A`) and a logout, which
 * unmounts every screen that could have watched for it.
 *
 * `libraryReturn.route.test.tsx` drives the same module through a real router
 * and the real village components.
 */

const LINCOLN = 'lincoln'
const LONDON = 'london'
const FAM = 'fam-1'
const ORIGIN = { familyId: FAM, childId: LINCOLN, missionId: 'library_hut' }

/** Begin against the epoch the module has actually observed. */
function begin(origin: Partial<typeof ORIGIN> = {}) {
  return beginLibraryReturnFlow({
    ...ORIGIN,
    ...origin,
    observedEpoch: getLibraryIdentityEpoch(),
  })
}

/** A live journey that has already stepped into the Books area. */
function beginOnTheShelf() {
  const flow = begin()!
  reconcileLibraryReturnFlowPath('/books')
  return flow
}

beforeEach(() => {
  localStorage.clear()
  setActiveChildIdShared(LINCOLN)
  // A settled identity, so `''` below reads as a session ENDING rather than as
  // a page that has not loaded yet.
  observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
  endLibraryReturnFlow()
})

afterEach(() => {
  endLibraryReturnFlow()
})

describe('beginning a journey', () => {
  it('records the family, the child and the place, away from the village', () => {
    const flow = begin()
    expect(flow).toMatchObject({
      familyId: FAM,
      childId: LINCOLN,
      missionId: 'library_hut',
      phase: LibraryReturnPhase.Away,
    })
    expect(getLibraryReturnFlow()).toBe(flow)
  })

  it('refuses an unsettled scope rather than binding to nobody', () => {
    expect(begin({ childId: '' })).toBeNull()
    expect(begin({ familyId: '' })).toBeNull()
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('persists nothing — a reload has no journey to resume', () => {
    begin()
    const keys = Object.keys(localStorage).filter((k) => k !== 'fpe_active_child_id')
    expect(keys).toEqual([])
    expect(JSON.stringify(localStorage)).not.toContain('library_hut')
  })

  it('gives every journey a generation that is never reused', () => {
    const first = begin()!
    const second = begin()!
    expect(second.generation).toBeGreaterThan(first.generation)
    endLibraryReturnFlow()
    expect(begin()!.generation).toBeGreaterThan(second.generation)
  })

  it('notifies subscribers, so a mounted shelf sees it without polling', () => {
    const seen = vi.fn()
    const unsubscribe = subscribeLibraryReturnFlow(seen)
    begin()
    expect(seen).toHaveBeenCalledTimes(1)
    endLibraryReturnFlow()
    expect(seen).toHaveBeenCalledTimes(2)
    unsubscribe()
    begin()
    expect(seen).toHaveBeenCalledTimes(2)
  })
})

describe('the tap-to-close boundary', () => {
  it('refuses a departure whose identity moved after the tap', () => {
    // The village captures the epoch when the Books door is tapped; the journey
    // is created only once the board has finished closing. Nothing exists in
    // between for the store subscription to cancel, so the token is the guard.
    const tapped = getLibraryIdentityEpoch()
    setActiveChildIdShared(LONDON)
    expect(
      beginLibraryReturnFlow({ ...ORIGIN, childId: LONDON, observedEpoch: tapped }),
    ).toBeNull()
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('refuses it after a same-tick A → B → A, with the scope string restored', () => {
    // The exact case a scope-string comparison passes: by the time the board
    // has closed the selected child is `A` again, so `scopeKey` matches — while
    // the shelf underneath re-read for `B` and back.
    const tapped = getLibraryIdentityEpoch()
    setActiveChildIdShared(LONDON)
    setActiveChildIdShared(LINCOLN)
    expect(getActiveChildId()).toBe(LINCOLN)
    expect(getLibraryIdentityEpoch()).toBeGreaterThan(tapped)
    expect(beginLibraryReturnFlow({ ...ORIGIN, observedEpoch: tapped })).toBeNull()
  })

  it('and after a resolved profile round trip that never touched the store', () => {
    const tapped = getLibraryIdentityEpoch()
    observeLibraryReturnIdentity(`${FAM}|london|${LINCOLN}`)
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    expect(getActiveChildId()).toBe(LINCOLN)
    expect(beginLibraryReturnFlow({ ...ORIGIN, observedEpoch: tapped })).toBeNull()
  })

  it('accepts one whose identity held still', () => {
    const tapped = getLibraryIdentityEpoch()
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    setActiveChildIdShared(LINCOLN)
    expect(
      beginLibraryReturnFlow({ ...ORIGIN, observedEpoch: tapped }),
    ).not.toBeNull()
  })
})

describe('whose journey it is', () => {
  it('is live only for the family AND child it was begun for', () => {
    const flow = begin()
    expect(liveLibraryReturnFlow(flow, { familyId: FAM, childId: LINCOLN })).toBe(flow)
    expect(liveLibraryReturnFlow(flow, { familyId: FAM, childId: LONDON })).toBeNull()
    expect(liveLibraryReturnFlow(flow, { familyId: 'fam-2', childId: LINCOLN })).toBeNull()
  })

  it('is never live for an unsettled scope', () => {
    const flow = begin()
    expect(liveLibraryReturnFlow(flow, { familyId: FAM, childId: '' })).toBeNull()
    expect(liveLibraryReturnFlow(flow, { familyId: '', childId: LINCOLN })).toBeNull()
    expect(liveLibraryReturnFlow(null, { familyId: FAM, childId: LINCOLN })).toBeNull()
  })

  it('answers about the phase that was asked about', () => {
    const flow = begin()
    const scope = { familyId: FAM, childId: LINCOLN }
    expect(liveLibraryReturnFlow(flow, scope, LibraryReturnPhase.Returning)).toBeNull()
    const returning = requestLibraryReturn(flow!.generation)
    expect(liveLibraryReturnFlow(returning, scope, LibraryReturnPhase.Returning)).toBe(returning)
    expect(liveLibraryReturnFlow(returning, scope, LibraryReturnPhase.Away)).toBeNull()
  })
})

describe('an identity movement ends it permanently', () => {
  it('ends it the moment the shared store changes', () => {
    begin()
    setActiveChildIdShared(LONDON)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and a same-tick A → B → A does not bring it back', () => {
    const flow = begin()!
    setActiveChildIdShared(LONDON)
    setActiveChildIdShared(LINCOLN)
    expect(getActiveChildId()).toBe(LINCOLN)
    expect(getLibraryReturnFlow()).toBeNull()
    expect(requestLibraryReturn(flow.generation)).toBeNull()
  })

  it('ends it on a resolved profile change with no store write at all', () => {
    // `useActiveChild` locks a kid profile to its own child and leaves a valid
    // raw selection alone, so parents→London→parents moves the RESOLVED
    // identity while the raw store never changes. The observed key carries the
    // profile term for exactly this.
    begin()
    observeLibraryReturnIdentity(`${FAM}|london|${LINCOLN}`)
    expect(getLibraryReturnFlow()).toBeNull()
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('ends it on a family change', () => {
    begin()
    observeLibraryReturnIdentity(`fam-2|parents|${LINCOLN}`)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('does nothing when the identity is observed again unchanged', () => {
    const flow = begin()
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    expect(getLibraryReturnFlow()).toBe(flow)
    setActiveChildIdShared(LINCOLN)
    expect(getLibraryReturnFlow()).toBe(flow)
  })

  it('holds with nothing mounted at all', () => {
    // The store channel is subscribed in the module, so the rule cannot be
    // evaded by a switch that lands while the shelf is unmounting.
    begin()
    setActiveChildIdShared(LONDON)
    expect(getLibraryReturnFlow()).toBeNull()
  })
})

describe('an unknown children read ends it, with the identity string standing still', () => {
  it('ends a live journey even though the selected child never changed', () => {
    // The hole the identity key cannot see: it is built from the SELECTED child
    // id, and a read that is unsettled or has REJECTED leaves that id exactly
    // where it was — with `useChildren` keeping the previous answer's list, so
    // the matching `activeChild` object is still there too. Hiding the control
    // was never enough, because the flow is module memory.
    begin()
    expireLibraryReturnForUnsettledIdentity()
    expect(getActiveChildId()).toBe(LINCOLN)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and the read coming back does not hand the old journey over', () => {
    const flow = begin()!
    expireLibraryReturnForUnsettledIdentity()
    // The read works again — which is a page that works, not a journey that
    // resumes. There is no second copy to restore from, and the generation the
    // shelf was rendered with is spent.
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    expect(getLibraryReturnFlow()).toBeNull()
    expect(requestLibraryReturn(flow.generation)).toBeNull()
  })

  it('moves the epoch, so a departure tapped before it is refused', () => {
    // The pending-departure window: the board is closing, no flow exists yet,
    // and the read under it goes unknown. Clearing the flow alone would leave
    // the delayed callback free to create one against an identity nobody can
    // vouch for, so the expiry is a movement like every other.
    const tapped = getLibraryIdentityEpoch()
    expireLibraryReturnForUnsettledIdentity()
    expect(getLibraryIdentityEpoch()).toBeGreaterThan(tapped)
    expect(beginLibraryReturnFlow({ ...ORIGIN, observedEpoch: tapped })).toBeNull()
  })

  it('and a return already in the air expires with it', () => {
    const flow = begin()!
    requestLibraryReturn(flow.generation)
    expireLibraryReturnForUnsettledIdentity()
    expect(getLibraryReturnFlow()).toBeNull()
    expect(serveLibraryReturn(flow.generation)).toBe(false)
  })

  it('but a fresh, deliberate trip after the recovery is a perfectly good one', () => {
    // The positive control: what expired is the journey, not the feature.
    begin()
    expireLibraryReturnForUnsettledIdentity()
    const fresh = begin()
    expect(fresh).not.toBeNull()
    reconcileLibraryReturnFlowPath('/books')
    expect(liveLibraryReturnFlow(getLibraryReturnFlow(), {
      familyId: FAM,
      childId: LINCOLN,
    })).toBe(fresh)
  })
})

describe('the gate closing ends it, and signing back in does not restore it', () => {
  it('a logout or profile exit ends the journey', () => {
    begin()
    observeLibraryReturnIdentity('')
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('the SAME account and profile signing straight back in gets nothing', () => {
    // The module-memory failure this observer exists for: the routed shell is
    // unmounted by the gates, so only something above them can see the closure.
    begin()
    observeLibraryReturnIdentity('')
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and a departure tapped before the logout cannot create one after it', () => {
    const tapped = getLibraryIdentityEpoch()
    observeLibraryReturnIdentity('')
    observeLibraryReturnIdentity(`${FAM}|parents|${LINCOLN}`)
    expect(beginLibraryReturnFlow({ ...ORIGIN, observedEpoch: tapped })).toBeNull()
  })

  it('an unknown identity BEFORE anything resolved is a page still loading', () => {
    // Asserted at the module's own boundary: with nothing observed yet, an
    // empty identity must not count as a session ending, or a brand-new
    // arrival would be discarded. (The first `observeLibraryReturnIdentity('')`
    // here follows a resolved one, so the pair below is the real control.)
    observeLibraryReturnIdentity('')
    const before = getLibraryIdentityEpoch()
    observeLibraryReturnIdentity('')
    expect(getLibraryIdentityEpoch()).toBe(before)
  })
})

describe('the routes the journey actually lives on', () => {
  it('recognises every Books-area route the app mounts', () => {
    for (const path of [
      '/books',
      '/books/',
      '/books/book-1',
      '/books/book-1/read',
      '/books/book-1/read?call=1',
      '/books/book-1/review',
      '/books/create-story',
      '/books/sight-words',
      '/books/story-guide',
      '/stickers',
    ]) {
      expect(isBooksAreaPath(path), path).toBe(true)
    }
  })

  it('and nothing that merely looks like one', () => {
    for (const path of [
      // Renders NotFound: a journey surviving it would offer a way back from a
      // page that is not in the journey.
      '/books/book-1/extra',
      '/books/book-1/read/extra',
      // A different feature with a different shelf.
      '/books-about-me',
      '/books-about-me/review-1',
      '/booksomething',
      LIBRARY_RETURN_VILLAGE_PATH,
      '/today',
      '/quest',
      '/',
    ]) {
      expect(isBooksAreaPath(path), path).toBe(false)
    }
  })
})

describe('leaving the journey ends it', () => {
  it('survives every page the shelf opens', () => {
    for (const path of ['/books', '/books/b1', '/books/b1/read', '/books/b1/review', '/stickers']) {
      begin()
      reconcileLibraryReturnFlowPath(path)
      expect(getLibraryReturnFlow(), path).not.toBeNull()
      endLibraryReturnFlow()
    }
  })

  it('stands still on the hub it was begun from, before the first step', () => {
    // The flow is created while the child is at the hub, so arriving there is
    // not yet a departure.
    begin()
    reconcileLibraryReturnFlowPath(LIBRARY_RETURN_VILLAGE_PATH)
    expect(getLibraryReturnFlow()).not.toBeNull()
  })

  it('but ordinary navigation BACK to the hub ends it', () => {
    beginOnTheShelf()
    reconcileLibraryReturnFlowPath(LIBRARY_RETURN_VILLAGE_PATH)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('so Library → Books → hub → Books offers nothing', () => {
    beginOnTheShelf()
    reconcileLibraryReturnFlowPath(LIBRARY_RETURN_VILLAGE_PATH)
    reconcileLibraryReturnFlowPath('/books')
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('ends on anywhere else, including an unsupported Books URL', () => {
    for (const path of ['/today', '/quest', '/books-about-me', '/books/b1/extra', '/']) {
      beginOnTheShelf()
      reconcileLibraryReturnFlowPath(path)
      expect(getLibraryReturnFlow(), path).toBeNull()
    }
  })

  it('reconciling with no journey in hand notifies nobody', () => {
    const seen = vi.fn()
    const unsubscribe = subscribeLibraryReturnFlow(seen)
    reconcileLibraryReturnFlowPath('/today')
    expect(seen).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('taking the way back', () => {
  it('moves to returning, and only on the generation that was offered', () => {
    const flow = begin()!
    expect(requestLibraryReturn(flow.generation + 1)).toBeNull()
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
    expect(requestLibraryReturn(flow.generation)?.phase).toBe(LibraryReturnPhase.Returning)
  })

  it('cannot be asked for twice', () => {
    const flow = begin()!
    expect(requestLibraryReturn(flow.generation)).not.toBeNull()
    expect(requestLibraryReturn(flow.generation)).toBeNull()
  })

  it('a tap that lands after a switch sends nobody anywhere', () => {
    const flow = begin()!
    setActiveChildIdShared(LONDON)
    expect(requestLibraryReturn(flow.generation)).toBeNull()
  })

  it('a tap that lands after the journey was replaced is refused too', () => {
    const first = begin()!
    begin({ missionId: 'the_forge' })
    expect(requestLibraryReturn(first.generation)).toBeNull()
    expect(getLibraryReturnFlow()?.missionId).toBe('the_forge')
  })
})

describe('serving the return exactly once', () => {
  it('consumes the request and leaves no journey behind', () => {
    const flow = begin()!
    requestLibraryReturn(flow.generation)
    expect(serveLibraryReturn(flow.generation)).toBe(true)
    expect(getLibraryReturnFlow()).toBeNull()
    expect(serveLibraryReturn(flow.generation)).toBe(false)
  })

  it('refuses to serve a request that was never made', () => {
    const flow = begin()!
    expect(serveLibraryReturn(flow.generation)).toBe(false)
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Away)
  })

  it('refuses a generation that is not the one in hand', () => {
    const flow = begin()!
    requestLibraryReturn(flow.generation)
    expect(serveLibraryReturn(flow.generation - 1)).toBe(false)
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)
  })

  it('keeps the request while the village read has not answered', () => {
    // No board to open yet, so nothing is served and nothing is faked: the
    // existing recovery notice and its Try again own that moment.
    const flow = begin()!
    requestLibraryReturn(flow.generation)
    reconcileLibraryReturnFlowPath(LIBRARY_RETURN_VILLAGE_PATH)
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)
  })

  it('but an ABANDONED return expires instead of waiting to fire', () => {
    // The village read failed, the child went back to the shelf. The request
    // must not sit there and open the board on some later ordinary hub visit.
    const flow = begin()!
    requestLibraryReturn(flow.generation)
    reconcileLibraryReturnFlowPath(LIBRARY_RETURN_VILLAGE_PATH)
    reconcileLibraryReturnFlowPath('/books')
    expect(getLibraryReturnFlow()).toBeNull()
    reconcileLibraryReturnFlowPath(LIBRARY_RETURN_VILLAGE_PATH)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and so does a child switch while the departure is still in the air', () => {
    const flow = begin()!
    requestLibraryReturn(flow.generation)
    setActiveChildIdShared(LONDON)
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and a logout while it is in the air', () => {
    const flow = begin()!
    requestLibraryReturn(flow.generation)
    observeLibraryReturnIdentity('')
    expect(getLibraryReturnFlow()).toBeNull()
  })
})
