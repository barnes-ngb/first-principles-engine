import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Outlet, RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setActiveChildIdShared } from '../../../core/hooks/activeChildStore'
import { getMission } from './missions'
import { LIBRARY_RETURN_LABEL, LIBRARY_RETURN_LINE } from './libraryReturnCopy'
import { clearForgeFocusRequest, consumeForgeFocus } from './forgeFocusHandoff'
import {
  STONEBRIDGE_TOWN_PATH,
  STONEBRIDGE_BOOKS_PATH,
  STONEBRIDGE_TODAY_PATH,
} from './stonebridgeDestinations'
import type { StonebridgeProgressData } from './useStonebridgeProgress'
import {
  LIBRARY_RETURN_VILLAGE_PATH,
  LibraryReturnOrigin,
  LibraryReturnPhase,
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryIdentityEpoch,
  getLibraryReturnFlow,
  requestLibraryReturn,
} from './libraryReturnFlow'
// `vi.mock` is hoisted above these, so the components below are the real ones.
import LibraryReturnBanner from './LibraryReturnBanner'
import StonebridgePage from './StonebridgePage'
import {
  useLibraryReturnIdentityWatch,
  useLibraryReturnReadinessWatch,
  useLibraryReturnRouteWatch,
} from './useLibraryReturnScopeWatch'

/**
 * The canonical town entry — `/stonebridge` — over a real router.
 *
 * ── What this file is for ────────────────────────────────────────────────────
 *
 * `libraryReturn.route.test.tsx` drives the LEGACY entry: the Hero Hub's card,
 * its modal board, and a journey that comes back to `/avatar`. This is the same
 * claims for the new door, plus the two things only the page has: that the town
 * and its actions are there on arrival (no second *Open Stonebridge* to find),
 * and that a return's focus hand-off happens without any dialog transition to
 * wait for.
 *
 * It is the same shape as its sibling, for the same reason: the thing being
 * built spans route transitions, so the pages it does not own are stand-ins that
 * do the one thing the real ones do on the way out (`navigate('/books')`, held
 * true of the real pages by `booksExits.source.test.ts`), and everything else is
 * real — the real page, the real village, the real return banner, the real scope
 * watches mounted where `AppShell` mounts them.
 *
 * NOT claimed here: layout at phone / tablet / desktop, enlarged text, and real
 * browser focus behaviour — Sol's independent pass.
 */

const fx = vi.hoisted(() => ({
  data: null as unknown as StonebridgeProgressData,
  activeChild: { id: 'lincoln', name: 'Lincoln' } as { id: string; name: string } | undefined,
  childrenLoading: false,
  childrenLoadFailed: false,
}))

vi.mock('./useStonebridgeProgress', () => ({
  useStonebridgeProgress: () => fx.data,
}))

vi.mock('../useAvatarProfile', () => ({ useAvatarProfile: () => null }))

vi.mock('../../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1' }),
}))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: fx.activeChild,
    activeChildId: fx.activeChild?.id ?? '',
    children: [
      { id: 'lincoln', name: 'Lincoln' },
      { id: 'london', name: 'London' },
    ],
    setActiveChildId: () => {},
    isChildProfile: false,
    isLoading: fx.childrenLoading,
    loadFailed: fx.childrenLoadFailed,
  }),
}))

// A full-screen overlay with Web Audio behind it; this file is about routes.
vi.mock('./BannerRaiseCelebration', () => ({ default: () => null }))

const LIBRARY = getMission('library_hut')!
const FORGE = getMission('the_forge')!

/** The Library is repaired and the Forge is being repaired now. */
const LIBRARY_REPAIRED: StonebridgeProgressData = {
  mission: FORGE,
  active: { missionId: FORGE.id, current: 2, target: 10, percent: 20, complete: false },
  completedMissions: ['old_bridge', 'watchtower', 'library_hut'],
  raisedBanners: ['old_bridge', 'watchtower', 'library_hut'],
  totalReadingActions: 21,
  justCompletedMissionId: null,
  clearJustCompleted: () => {},
  loading: false,
  stale: false,
  readError: false,
  saveError: false,
  retrying: false,
  retry: () => {},
}

function emulateReducedMotion(reduce = true) {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const realMatchMedia = window.matchMedia

/** The layout route, carrying the two watches `AppShell` carries. */
function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  useLibraryReturnRouteWatch(location.pathname)
  useLibraryReturnReadinessWatch(fx.childrenLoading, fx.childrenLoadFailed)
  return (
    <div>
      <span data-testid="where">{location.pathname}</span>
      {/* The nav, as far as this journey is concerned: the new Stonebridge
          entry, and two ways out of the journey. */}
      <button onClick={() => navigate(STONEBRIDGE_TOWN_PATH)}>Nav Stonebridge</button>
      <button onClick={() => navigate(LIBRARY_RETURN_VILLAGE_PATH)}>Nav My Hero</button>
      <button onClick={() => navigate('/books')}>Nav My Books</button>
      <Outlet />
    </div>
  )
}

/** `/books` — the shelf, as far as this journey is concerned. */
function ShelfRoute() {
  const navigate = useNavigate()
  return (
    <div>
      <h1>My Books</h1>
      <LibraryReturnBanner />
      <button onClick={() => navigate('/books/book-1/read')}>Read a book</button>
    </div>
  )
}

function BooksSubPage({ name }: { name: string }) {
  const navigate = useNavigate()
  return (
    <div>
      <h1>{name}</h1>
      <button onClick={() => navigate('/books')}>My Books</button>
    </div>
  )
}

/** What sits ABOVE the router in the real app (`App.tsx`'s observer). */
function IdentityObserver({ signedIn }: { signedIn: boolean }) {
  useLibraryReturnIdentityWatch(signedIn ? 'fam-1' : '', signedIn ? 'lincoln' : null)
  return null
}

function renderTown(initial = STONEBRIDGE_TOWN_PATH) {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: STONEBRIDGE_TOWN_PATH, element: <StonebridgePage /> },
          // The hub, as far as this file is concerned: a real route that is NOT
          // the town page, which is what the armor door lands on.
          { path: LIBRARY_RETURN_VILLAGE_PATH, element: <h1>Hero Hub</h1> },
          { path: '/books', element: <ShelfRoute /> },
          { path: '/books/:bookId/read', element: <BooksSubPage name="Book reader" /> },
          { path: STONEBRIDGE_TODAY_PATH, element: <h1>Today</h1> },
          { path: '*', element: <h1>Not found</h1> },
        ],
      },
    ],
    { initialEntries: [initial] },
  )
  render(
    <>
      <IdentityObserver signedIn />
      <RouterProvider router={router} />
    </>,
  )
  return { router }
}

/** Begin a journey directly, against the epoch the module has observed. */
function begin(
  origin: { missionId?: string; origin?: LibraryReturnOrigin } = {},
) {
  return beginLibraryReturnFlow({
    familyId: 'fam-1',
    childId: 'lincoln',
    missionId: 'library_hut',
    origin: LibraryReturnOrigin.Town,
    ...origin,
    observedEpoch: getLibraryIdentityEpoch(),
  })
}

/** The town itself, which is a region on a page rather than a dialog. */
function townRegion() {
  return within(screen.getByRole('region', { name: 'Stonebridge Village' }))
}

function tile(mission: { locationName: string }) {
  return townRegion().getByRole('button', {
    name: new RegExp(`^Visit ${mission.locationName}\\.`),
  })
}

/** Visit a location from the town page and take its Books door. */
async function leaveFromLocation(mission: { locationName: string }) {
  fireEvent.click(tile(mission))
  const visit = within(screen.getByRole('dialog', { name: mission.locationName }))
  fireEvent.click(visit.getByRole('button', { name: 'Open My Books' }))
  await screen.findByRole('heading', { name: 'My Books' })
}

beforeEach(() => {
  localStorage.clear()
  emulateReducedMotion()
  fx.data = LIBRARY_REPAIRED
  fx.activeChild = { id: 'lincoln', name: 'Lincoln' }
  fx.childrenLoading = false
  fx.childrenLoadFailed = false
  setActiveChildIdShared('lincoln')
  endLibraryReturnFlow()
  clearForgeFocusRequest()
})

afterEach(() => {
  endLibraryReturnFlow()
  clearForgeFocusRequest()
  window.matchMedia = realMatchMedia
})

describe('arriving at the town', () => {
  it('shows the village and its places with no second tap', async () => {
    renderTown()
    // The town is there on arrival — not a card with a door to it.
    expect(screen.getByRole('region', { name: 'Stonebridge Village' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '🏰 Stonebridge Village' })).toBeInTheDocument()
    expect(tile(LIBRARY)).toHaveAccessibleName('Visit The Library Hut. Fixed.')
    expect(tile(FORGE)).toBeInTheDocument()
    expect(townRegion().getByText('🎌 Banner Hall')).toBeInTheDocument()
    // No board to open, and nothing to dismiss.
    expect(screen.queryByText('🏰 Open Stonebridge')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Close Stonebridge village' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers the ordinary doors beside it', () => {
    renderTown()
    for (const label of ['My Books', 'Today', 'My armor']) {
      expect(screen.getByRole('button', { name: label }), label).toBeInTheDocument()
    }
  })

  it('a deep link straight to a place still lands on the town, not a journey', () => {
    // A copied or typed URL carries no journey: the page is the ordinary page.
    renderTown(`${STONEBRIDGE_TOWN_PATH}?from=library_hut`)
    expect(screen.getByRole('region', { name: 'Stonebridge Village' })).toBeInTheDocument()
    expect(tile(LIBRARY)).not.toHaveFocus()
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('says so honestly while the village is loading, with the doors still there', () => {
    fx.data = { ...LIBRARY_REPAIRED, loading: true, mission: null, active: null }
    renderTown()
    expect(screen.getByText('Loading your village…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My Books' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    // No village is claimed, empty or otherwise.
    expect(screen.queryByRole('region', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    expect(screen.queryByText('🎌 Banner Hall')).not.toBeInTheDocument()
  })

  it('and when the read FAILS it says that, offers Try again, and keeps Books reachable', async () => {
    const retry = vi.fn()
    fx.data = {
      ...LIBRARY_REPAIRED,
      loading: false,
      mission: null,
      active: null,
      readError: true,
      retry,
    }
    const { router } = renderTown()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your village.")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)

    // The fallback is a real door, and it does not pretend the shelf is empty.
    fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(router.state.location.pathname).toBe(STONEBRIDGE_BOOKS_PATH)
  })

  it('a page with nobody selected asks for a child rather than choosing one', () => {
    fx.activeChild = undefined
    renderTown()
    expect(screen.getByText('Pick a child to see the village.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    // The doors are still there, and nothing was selected on anyone's behalf.
    expect(screen.getByRole('button', { name: 'My Books' })).toBeInTheDocument()
  })
})

describe('the town’s way to My Books, and back', () => {
  it('reaches the real shelf and offers one way back', async () => {
    const { router } = renderTown()
    await leaveFromLocation(LIBRARY)

    expect(router.state.location.pathname).toBe(STONEBRIDGE_BOOKS_PATH)
    expect(getLibraryReturnFlow()).toMatchObject({
      missionId: 'library_hut',
      origin: LibraryReturnOrigin.Town,
    })
    expect(screen.getByText(`🏰 ${LIBRARY_RETURN_LINE}`)).toBeInTheDocument()
  })

  it('comes back to the TOWN page, with the focus on the place it left', async () => {
    const { router } = renderTown()
    await leaveFromLocation(LIBRARY)
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))

    // The canonical return: the town page, not the Hero Hub.
    await waitFor(() => expect(router.state.location.pathname).toBe(STONEBRIDGE_TOWN_PATH))
    expect(screen.queryByRole('heading', { name: 'Hero Hub' })).not.toBeInTheDocument()
    // And the focus is on the Library, with no dialog transition to have waited
    // for — the page has none.
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
    // The town opened. That is all it did: no location visit, so nothing claims
    // the child is looking at the Library.
    expect(screen.queryByRole('dialog', { name: 'The Library Hut' })).not.toBeInTheDocument()
  })

  it('is consumed once: the next arrival is an ordinary town', async () => {
    const { router } = renderTown()
    await leaveFromLocation(LIBRARY)
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
    expect(getLibraryReturnFlow()).toBeNull()

    // Away and back by ordinary navigation.
    fireEvent.click(screen.getByRole('button', { name: 'Nav My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('survives the reader, and can be taken again on the next journey', async () => {
    renderTown()
    await leaveFromLocation(LIBRARY)

    fireEvent.click(screen.getByRole('button', { name: 'Read a book' }))
    await screen.findByRole('heading', { name: 'Book reader' })
    fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())

    // A second trip, from a different place.
    await leaveFromLocation(FORGE)
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await waitFor(() => expect(tile(FORGE)).toHaveFocus())
  })

  it('an ordinary visit to the town LATER expires the journey', async () => {
    renderTown()
    await leaveFromLocation(LIBRARY)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()

    // The nav's own Stonebridge entry, not the way back.
    fireEvent.click(screen.getByRole('button', { name: 'Nav Stonebridge' }))
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(STONEBRIDGE_TOWN_PATH),
    )
    expect(getLibraryReturnFlow()).toBeNull()
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'Nav My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
  })

  it('and so does an ordinary trip to the Hero Hub — the other village door', async () => {
    // The whitelist trap: `/avatar` is a village entry, but it is not THIS
    // journey's entry, so arriving there is leaving the journey.
    renderTown()
    await leaveFromLocation(LIBRARY)
    fireEvent.click(screen.getByRole('button', { name: 'Nav My Hero' }))
    await screen.findByRole('heading', { name: 'Hero Hub' })
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('a trip to Today ends it, and Back does not bring it back', async () => {
    const { router } = renderTown()
    await leaveFromLocation(LIBRARY)

    await act(async () => {
      await router.navigate(STONEBRIDGE_TODAY_PATH)
    })
    await screen.findByRole('heading', { name: 'Today' })
    expect(getLibraryReturnFlow()).toBeNull()

    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
  })
})

describe('a return the town cannot serve yet', () => {
  it('a failed village read holds the request, shows the honest notice, and fakes nothing', async () => {
    fx.data = {
      ...LIBRARY_REPAIRED,
      loading: false,
      mission: null,
      active: null,
      readError: true,
    }
    renderTown('/books')
    act(() => {
      begin()
    })
    fireEvent.click(await screen.findByRole('button', { name: LIBRARY_RETURN_LABEL }))

    await screen.findByText("Couldn't load your village.")
    // Nothing served, nothing invented, and no repaired village claimed.
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)
    expect(screen.queryByRole('region', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
  })

  it('and an ABANDONED return does not fire at a later ordinary visit', async () => {
    fx.data = {
      ...LIBRARY_REPAIRED,
      loading: false,
      mission: null,
      active: null,
      readError: true,
    }
    const { router } = renderTown('/books')
    act(() => {
      begin()
    })
    fireEvent.click(await screen.findByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await screen.findByText("Couldn't load your village.")

    // The child gives up and goes back to the shelf.
    await act(async () => {
      await router.navigate('/books')
    })
    expect(getLibraryReturnFlow()).toBeNull()

    // The read works again. A later ordinary visit is an ordinary town: the
    // request is gone, so nothing takes the focus.
    fx.data = LIBRARY_REPAIRED
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('a place that is not on the board consumes the request and takes no focus', async () => {
    renderTown('/books')
    act(() => {
      begin({ missionId: 'not_a_place' })
    })
    fireEvent.click(await screen.findByRole('button', { name: LIBRARY_RETURN_LABEL }))

    await screen.findByRole('region', { name: 'Stonebridge Village' })
    // Nothing crashed, nothing was invented, and the request is spent rather
    // than left to fire at the next arrival.
    await waitFor(() => expect(getLibraryReturnFlow()).toBeNull())
    expect(tile(LIBRARY)).not.toHaveFocus()
  })
})

describe('the identity under the town', () => {
  it('a child switch under an open shelf ends the journey', async () => {
    renderTown()
    await leaveFromLocation(LIBRARY)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()

    act(() => {
      fx.activeChild = { id: 'london', name: 'London' }
      setActiveChildIdShared('london')
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    })
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and a same-tick A → B → A during a real close refuses the departure', async () => {
    // The page's version of the tap-to-close boundary. There is no board
    // transition here — the location visit is the thing that takes time to
    // leave, and the departure is performed on ITS exit — so this is the window
    // in which no journey exists yet for the store subscription to cancel. By
    // the time the visit has gone the selected child is Lincoln again, so the
    // scope string matches and only the epoch captured at the tap can tell.
    emulateReducedMotion(false)
    renderTown()
    fireEvent.click(tile(LIBRARY))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Library Hut' })).getByRole('button', {
        name: 'Open My Books',
      }),
    )

    act(() => {
      setActiveChildIdShared('london')
      setActiveChildIdShared('lincoln')
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'The Library Hut' })).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('where')).toHaveTextContent(STONEBRIDGE_TOWN_PATH)
    expect(getLibraryReturnFlow()).toBeNull()
    expect(screen.queryByRole('heading', { name: 'My Books' })).not.toBeInTheDocument()
    // And the focus is not stranded on the body: the page's own anchor has it —
    // the element the town is rendered inside — which is what a dismissal gives
    // back to the opener in the hub. Asserted as "an ancestor of the town holds
    // the focus" rather than as one exact node, so the claim is about the
    // keyboard landing somewhere real on this page.
    const town = screen.getByRole('region', { name: 'Stonebridge Village' })
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.contains(town)).toBe(true)
  })

  it('but an untouched identity across the same real close still departs', async () => {
    // The positive control for the refusal above.
    emulateReducedMotion(false)
    renderTown()
    fireEvent.click(tile(LIBRARY))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Library Hut' })).getByRole('button', {
        name: 'Open My Books',
      }),
    )
    await screen.findByRole('heading', { name: 'My Books' })
    expect(getLibraryReturnFlow()?.origin).toBe(LibraryReturnOrigin.Town)
  })

  it('a switch while the departure is HELD leaves the next child an ordinary town', async () => {
    const { router } = renderTown('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      requestLibraryReturn(begin()!.generation)
    })
    act(() => {
      fx.activeChild = { id: 'london', name: 'London' }
      setActiveChildIdShared('london')
    })

    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    expect(getLibraryReturnFlow()).toBeNull()
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())
  })

  it('a children read that FAILS ends it, and clearing the flag revives nothing', async () => {
    renderTown()
    await leaveFromLocation(LIBRARY)
    const tapped = getLibraryIdentityEpoch()

    fireEvent.click(screen.getByRole('button', { name: 'Read a book' }))
    await screen.findByRole('heading', { name: 'Book reader' })
    act(() => {
      fx.childrenLoading = true
      fx.childrenLoadFailed = true
    })
    fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })

    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()
    // The epoch moved with it, so a departure tapped before the failure cannot
    // create a journey after it.
    expect(begin({ origin: LibraryReturnOrigin.Town })).not.toBeNull()
    endLibraryReturnFlow()
    expect(
      beginLibraryReturnFlow({
        familyId: 'fam-1',
        childId: 'lincoln',
        missionId: 'library_hut',
        origin: LibraryReturnOrigin.Town,
        observedEpoch: tapped,
      }),
    ).toBeNull()
  })
})

describe('the town’s armor door reaches the real hub', () => {
  it('navigates to /avatar and leaves a request the hub can serve', async () => {
    const { router } = renderTown()
    fireEvent.click(screen.getByRole('button', { name: 'My armor' }))

    await screen.findByRole('heading', { name: 'Hero Hub' })
    expect(router.state.location.pathname).toBe(LIBRARY_RETURN_VILLAGE_PATH)
    // No invented `/forge` route, and the request is for THIS child.
    expect(consumeForgeFocus({ familyId: 'fam-1', childId: 'lincoln' })).toBe(true)
  })

  it('the Forge visit’s own armor door does the same thing', async () => {
    const { router } = renderTown()
    fireEvent.click(tile(FORGE))
    const visit = within(screen.getByRole('dialog', { name: 'The Forge' }))
    expect(visit.getByText('This opens your armor.')).toBeInTheDocument()
    fireEvent.click(visit.getByRole('button', { name: 'See your armor' }))

    await screen.findByRole('heading', { name: 'Hero Hub' })
    expect(router.state.location.pathname).toBe(LIBRARY_RETURN_VILLAGE_PATH)
    expect(consumeForgeFocus({ familyId: 'fam-1', childId: 'lincoln' })).toBe(true)
    // It is not a journey: nothing on the shelf is owed a way back.
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and a child switch on the way makes the hub refuse it', async () => {
    renderTown()
    fireEvent.click(screen.getByRole('button', { name: 'My armor' }))
    await screen.findByRole('heading', { name: 'Hero Hub' })

    act(() => {
      fx.activeChild = { id: 'london', name: 'London' }
      setActiveChildIdShared('london')
    })
    // Not even for the child the request NAMES: the identity moved between the
    // tap and the arrival, so the page it would scroll is not the page that
    // asked. (Asked for Lincoln, so the refusal is the epoch's and not a
    // mismatched id — the brother's case is the module test's.)
    expect(consumeForgeFocus({ familyId: 'fam-1', childId: 'lincoln' })).toBe(false)
  })
})
