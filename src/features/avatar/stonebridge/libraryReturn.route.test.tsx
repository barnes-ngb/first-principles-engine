import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Outlet, RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setActiveChildIdShared } from '../../../core/hooks/activeChildStore'
import type { StonebridgeProgressData } from './useStonebridgeProgress'
import { STONEBRIDGE_BOOKS_PATH } from './stonebridgeDestinations'
import { getMission } from './missions'
import { LIBRARY_RETURN_LABEL, LIBRARY_RETURN_LINE } from './libraryReturnCopy'
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
import StonebridgeMissionCard from './StonebridgeMissionCard'
import {
  useLibraryReturnIdentityWatch,
  useLibraryReturnRouteWatch,
} from './useLibraryReturnScopeWatch'

/**
 * The village → My Books → village round trip, over a real router.
 *
 * ── Why a router and not a pair of mounted components ────────────────────────
 *
 * The thing being built is a journey that spans route transitions, and almost
 * everything that can go wrong with it is a transition: a return lost when the
 * reader navigates back to the shelf, a journey that survives a trip to Today, a
 * marker revived by the browser's Back button, a tap that lands after the child
 * underneath has changed. A test that rendered the shelf and the village side by
 * side would assert none of those — it would assert that two components can read
 * the same module, which is not the claim.
 *
 * So this is a real `createMemoryRouter` with a real layout route holding the
 * real scope watch, the real village card (its Firestore hook stubbed — this
 * file is about the journey, and `StonebridgeVillage.noWrite.test.tsx` drives
 * the real hook), and the real return banner. The stand-ins are deliberately
 * only the *pages* this feature does not own: each one does what the real page
 * does on the way out, which is `navigate('/books')` — and
 * `booksExits.source.test.ts` is what holds that true of the real ones.
 *
 * The `/avatar` route's wiring is a copy of `MyAvatarPage`'s two lines, pinned
 * to that file by `stonebridgeDestinations.test.tsx` rather than duplicated as a
 * claim here.
 *
 * NOT claimed here: layout at phone / tablet / desktop, enlarged text, and real
 * browser focus behaviour — Sol's independent pass.
 */

const fx = vi.hoisted(() => ({
  data: null as unknown as StonebridgeProgressData,
  activeChild: { id: 'lincoln', name: 'Lincoln' } as { id: string; name: string },
  /**
   * The children read's own state, reported beside the child exactly as
   * `useChildren` reports it: `isLoading` stays TRUE alongside a failure, and
   * the previous answer's `activeChild` object stays in place with the matching
   * id — which is the shape that used to hide the control and keep the journey.
   */
  childrenLoading: false,
  childrenLoadFailed: false,
  /**
   * How many times the hub's in-page Forge jump was actually performed.
   *
   * The real `MyAvatarPage` passes `focusForgeGallery`, which scrolls and
   * focuses the one gallery mounted below the card. Counting the CALL is what
   * lets this file assert that a departure the village refused performs nothing
   * at all, without mounting a 1,900-line host to watch a scroll.
   */
  forgeVisits: 0,
}))

vi.mock('./useStonebridgeProgress', () => ({
  useStonebridgeProgress: () => fx.data,
}))

vi.mock('../../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1' }),
}))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: fx.activeChild,
    activeChildId: fx.activeChild.id,
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
const OLD_BRIDGE = getMission('old_bridge')!
const FORGE = getMission('the_forge')!

/**
 * The Library is repaired and the Forge is the location being repaired now.
 *
 * The shape this slice exists for: before it, the Library's shelf door vanished
 * the moment Old Tomas thanked him.
 */
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

/**
 * Report a reduced-motion preference, or withdraw it.
 *
 * Most of this file uses `true`, which makes the dialog transitions instant so
 * the hand-offs are still exercised without a wait. The tap-to-close boundary
 * tests pass `false` on purpose: that boundary only EXISTS while a close is
 * actually taking time.
 */
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

/** The layout route: the one thing mounted across every route transition. */
function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  useLibraryReturnRouteWatch(location.pathname)
  return (
    <div>
      <span data-testid="where">{location.pathname}</span>
      {/* The app nav, as far as this journey is concerned: a way out of it. */}
      <button onClick={() => navigate('/today')}>Go to Today</button>
      {/* The nav's own My Hero entry — ordinary navigation to the hub. */}
      <button onClick={() => navigate(LIBRARY_RETURN_VILLAGE_PATH)}>Go to My Hero</button>
      <button onClick={() => navigate('/books')}>Go to My Books</button>
      <Outlet />
    </div>
  )
}

/** `/avatar` — the Hero Hub, wired exactly as `MyAvatarPage` wires it. */
function VillageRoute() {
  const navigate = useNavigate()
  return (
    <StonebridgeMissionCard
      familyId="fam-1"
      childId={fx.activeChild.id}
      isLincoln
      onOpenBooks={(fromMissionId, observedEpoch) => {
        beginLibraryReturnFlow({
          familyId: 'fam-1',
          childId: fx.activeChild.id,
          missionId: fromMissionId,
          // The hub's entry, which is what `MyAvatarPage` passes.
          origin: LibraryReturnOrigin.Hub,
          observedEpoch,
        })
        navigate(STONEBRIDGE_BOOKS_PATH)
      }}
      onVisitForge={() => {
        fx.forgeVisits += 1
      }}
    />
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
      <button onClick={() => navigate('/books/book-1')}>Edit a book</button>
      <button onClick={() => navigate('/stickers')}>Stickers</button>
    </div>
  )
}

/**
 * Every page the shelf opens, standing in for the real one by doing the one
 * thing the real one does on the way out: `navigate('/books')`.
 */
function BooksSubPage({ name }: { name: string }) {
  const navigate = useNavigate()
  return (
    <div>
      <h1>{name}</h1>
      <button onClick={() => navigate('/books')}>My Books</button>
    </div>
  )
}

/**
 * What sits ABOVE the router in the real app: the identity observer from
 * `App.tsx`, which outlives the routed shell. Here it also gives the harness a
 * way to close the gate — `signedIn={false}` is a logout — without pretending a
 * component inside the gate could have seen it.
 */
function IdentityObserver({ signedIn }: { signedIn: boolean }) {
  useLibraryReturnIdentityWatch(signedIn ? 'fam-1' : '', signedIn ? 'lincoln' : null)
  return null
}

function renderJourney(initial = LIBRARY_RETURN_VILLAGE_PATH) {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: LIBRARY_RETURN_VILLAGE_PATH, element: <VillageRoute /> },
          { path: '/books', element: <ShelfRoute /> },
          { path: '/books/:bookId', element: <BooksSubPage name="Book editor" /> },
          { path: '/books/:bookId/read', element: <BooksSubPage name="Book reader" /> },
          { path: '/books/:bookId/review', element: <BooksSubPage name="Read it to me" /> },
          { path: '/stickers', element: <BooksSubPage name="Stickers" /> },
          { path: '/today', element: <h1>Today</h1> },
          /**
           * `*` — NotFound, INSIDE the layout route, which is where
           * `src/app/router.tsx` wires it (`{ path: '*', element: <NotFoundPage
           * /> }`, the last child of the `AppShell` route).
           *
           * Load-bearing, not scenery. Without it an unsupported URL matches no
           * route at all, React Router renders its own 404 boundary INSTEAD of
           * the layout, and the scope watch is unmounted by the very navigation
           * it is supposed to report — so the journey survived here while the
           * real app ended it. That made this fixture's verdict on an
           * unsupported Books URL the opposite of the app's, which is the
           * failure a fixture exists to avoid.
           */
          { path: '*', element: <h1>Not found</h1> },
        ],
      },
    ],
    { initialEntries: [initial] },
  )
  const view = render(
    <>
      <IdentityObserver signedIn />
      <RouterProvider router={router} />
    </>,
  )
  /** Close the gate: the observer stays, the routed shell goes. */
  const signOut = () =>
    view.rerender(
      <>
        <IdentityObserver signedIn={false} />
      </>,
    )
  /** The same account and profile signing straight back in. */
  const signBackIn = () =>
    view.rerender(
      <>
        <IdentityObserver signedIn />
        <RouterProvider router={router} />
      </>,
    )
  return { router, signOut, signBackIn }
}

/** Begin a journey directly, against the epoch the module has observed. */
function begin(
  origin: {
    familyId?: string
    childId?: string
    missionId?: string
    origin?: LibraryReturnOrigin
  } = {},
) {
  return beginLibraryReturnFlow({
    familyId: 'fam-1',
    childId: 'lincoln',
    missionId: 'library_hut',
    origin: LibraryReturnOrigin.Hub,
    ...origin,
    observedEpoch: getLibraryIdentityEpoch(),
  })
}

function boardRegion() {
  return within(screen.getByRole('dialog', { name: 'Stonebridge Village' }))
}

function tile(mission: { locationName: string }) {
  return boardRegion().getByRole('button', {
    name: new RegExp(`^Visit ${mission.locationName}\\.`),
  })
}

/** Open the board, visit a location, and take its Books door. */
async function leaveFromLocation(mission: { locationName: string }) {
  fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
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
  fx.forgeVisits = 0
  setActiveChildIdShared('lincoln')
  endLibraryReturnFlow()
})

afterEach(() => {
  endLibraryReturnFlow()
  window.matchMedia = realMatchMedia
})

describe('the repaired Library is still a door to the real books', () => {
  it('offers the shelf, and reaches it', async () => {
    renderJourney()
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    expect(tile(LIBRARY)).toHaveAccessibleName('Visit The Library Hut. Fixed.')

    fireEvent.click(tile(LIBRARY))
    const visit = within(screen.getByRole('dialog', { name: 'The Library Hut' }))
    // What the place is, plainly — and the thank-you it already had.
    expect(visit.getByText('This opens your books.')).toBeInTheDocument()
    expect(visit.getByRole('button', { name: 'Hear the thank you' })).toBeInTheDocument()
    // Exactly one door, not two.
    expect(visit.getAllByRole('button', { name: 'Open My Books' })).toHaveLength(1)

    fireEvent.click(visit.getByRole('button', { name: 'Open My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.getByTestId('where')).toHaveTextContent('/books')
  })

  it('and no other repaired place grew one', async () => {
    renderJourney()
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    fireEvent.click(tile(OLD_BRIDGE))
    const visit = within(screen.getByRole('dialog', { name: 'The Old Bridge' }))
    expect(visit.getByText('You fixed this place.')).toBeInTheDocument()
    expect(visit.queryByRole('button', { name: 'Open My Books' })).not.toBeInTheDocument()
    expect(visit.queryByText('This opens your books.')).not.toBeInTheDocument()
  })

  it('keeps the active location’s door exactly as it was', async () => {
    renderJourney()
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    fireEvent.click(tile(FORGE))
    const visit = within(screen.getByRole('dialog', { name: 'The Forge' }))
    expect(visit.getByText('You are fixing this now.')).toBeInTheDocument()
    expect(visit.getByRole('button', { name: 'Open My Books' })).toBeInTheDocument()
    // The Forge's own armor door is untouched and not duplicated.
    expect(visit.getAllByRole('button', { name: 'See your armor' })).toHaveLength(1)
    // And no books caption on a location whose framing already says it.
    expect(visit.queryByText('This opens your books.')).not.toBeInTheDocument()
  })

  it('still offers it once the whole rally is finished', async () => {
    // The capstone case: the rally parks on Banner Hall with every location
    // repaired, and the Library is still the Library.
    fx.data = {
      ...LIBRARY_REPAIRED,
      mission: getMission('banner_hall')!,
      active: { missionId: 'banner_hall', current: 18, target: 18, percent: 100, complete: true },
      completedMissions: [
        'old_bridge',
        'watchtower',
        'library_hut',
        'the_forge',
        'lantern_path',
        'beacon_hill',
        'banner_hall',
      ],
      raisedBanners: [
        'old_bridge',
        'watchtower',
        'library_hut',
        'the_forge',
        'lantern_path',
        'beacon_hill',
        'banner_hall',
      ],
    }
    renderJourney()
    expect(screen.getByText('You fixed each place.')).toBeInTheDocument()

    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    fireEvent.click(tile(LIBRARY))
    const visit = within(screen.getByRole('dialog', { name: 'The Library Hut' }))
    expect(visit.getByRole('button', { name: 'Open My Books' })).toBeInTheDocument()
    // Nothing was invented to go with it: no bar, no counters, no re-earn.
    expect(visit.queryByText(/\d+ \/ \d+ done/)).not.toBeInTheDocument()
  })
})

describe('the way back', () => {
  it('comes back to the board, with the focus on the place it left', async () => {
    const { router } = renderJourney()
    await leaveFromLocation(LIBRARY)

    expect(screen.getByText(`🏰 ${LIBRARY_RETURN_LINE}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))

    // Back at the village, with the board already open — and the focus on the
    // Library tile rather than at the top of a board to be found again.
    await waitFor(() => expect(router.state.location.pathname).toBe(LIBRARY_RETURN_VILLAGE_PATH))
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
    // The board opened. That is all it did: no location visit was opened for
    // the child, so nothing claims they are looking at the Library.
    expect(screen.queryByRole('dialog', { name: 'The Library Hut' })).not.toBeInTheDocument()
    expect(screen.queryByText('This opens your books.')).not.toBeInTheDocument()
  })

  it('is consumed once: closing and reopening gives an ordinary board', async () => {
    renderJourney()
    await leaveFromLocation(LIBRARY)
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
    expect(getLibraryReturnFlow()).toBeNull()

    const closer = boardRegion().getByRole('button', { name: 'Close Stonebridge village' })
    fireEvent.click(closer)
    await waitFor(() => {
      expect(screen.queryByText('🎌 Banner Hall')).not.toBeInTheDocument()
    })
    // The focus goes back to the control that opened it, as it always has.
    await waitFor(() => expect(screen.getByText('🏰 Open Stonebridge')).toHaveFocus())

    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    const board = await screen.findByRole('dialog', { name: 'Stonebridge Village' })
    // Nothing taken over: an ordinary board, with the focus where MUI puts it.
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())
    expect(board).toBeInTheDocument()
  })

  it('can be taken again on the next journey', async () => {
    renderJourney()
    await leaveFromLocation(LIBRARY)
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())

    // A second trip, from a different place this time.
    fireEvent.click(tile(FORGE))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Forge' })).getByRole('button', {
        name: 'Open My Books',
      }),
    )
    await screen.findByRole('heading', { name: 'My Books' })
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    // Back to the place the SECOND journey started from.
    await waitFor(() => expect(tile(FORGE)).toHaveFocus())
  })

  it('survives the reader, the editor, the review and Stickers', async () => {
    // The negative control for the loss this slice is really about: a child who
    // actually reads a book must still have a way back afterwards.
    renderJourney()
    await leaveFromLocation(LIBRARY)

    for (const [go, page] of [
      ['Read a book', 'Book reader'],
      ['Edit a book', 'Book editor'],
      ['Stickers', 'Stickers'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: go }))
      await screen.findByRole('heading', { name: page })
      // The page's own exit, which is the only exit the real pages have.
      fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
      await screen.findByRole('heading', { name: 'My Books' })
      expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
  })

  it('is not offered on an ordinary visit to the shelf', async () => {
    renderJourney('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    // A direct URL, a refresh, a copied link, a bookmark: no journey exists, so
    // the shelf is the shelf.
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    expect(screen.queryByText(`🏰 ${LIBRARY_RETURN_LINE}`)).not.toBeInTheDocument()
  })
})

describe('leaving the journey ends it, and history cannot bring it back', () => {
  it('a trip to Today ends it — even with Back and Forward', async () => {
    const { router } = renderJourney()
    await leaveFromLocation(LIBRARY)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Go to Today' }))
    await screen.findByRole('heading', { name: 'Today' })
    expect(getLibraryReturnFlow()).toBeNull()

    // Back to the shelf by the browser's own history: the URL comes back, the
    // journey does not.
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()

    await act(async () => {
      await router.navigate(1)
    })
    await screen.findByRole('heading', { name: 'Today' })
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('stepping back to the village by hand ends it, and opens nothing', async () => {
    const { router } = renderJourney()
    await leaveFromLocation(LIBRARY)

    await act(async () => {
      await router.navigate(-1)
    })
    // The child is back at the hub without having asked to be. Nothing is
    // asked of the board — it stays closed and no return is served — and the
    // journey is over: they arrived at the place it would have taken them.
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('Library → Books → ordinary My Hero → Books offers nothing', async () => {
    renderJourney()
    await leaveFromLocation(LIBRARY)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()

    // The nav's own My Hero entry, not the way back.
    fireEvent.click(screen.getByRole('button', { name: 'Go to My Hero' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/avatar'))
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Go to My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
  })

  it('an unsupported Books URL ends it rather than passing as part of the area', async () => {
    const { router } = renderJourney()
    await leaveFromLocation(LIBRARY)

    await act(async () => {
      await router.navigate('/books/book-1/extra')
    })
    // The app's NotFound route is inside the shell, so the watch is still
    // mounted and the URL really was reported to it — assert that, so a fixture
    // that unmounted the watch can never pass this as an expiry.
    expect(screen.getByTestId('where')).toHaveTextContent('/books/book-1/extra')
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()

    // And back on the shelf there is nothing to offer: the journey ended, it was
    // not merely hidden by the page the child was on.
    await act(async () => {
      await router.navigate('/books')
    })
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
  })

  it('a logout ends it, and the same account signing back in gets nothing', async () => {
    // The module-memory failure the above-gates observer exists for: the routed
    // shell is unmounted by the gate, so nothing inside it can see the closure.
    const { signOut, signBackIn } = renderJourney()
    await leaveFromLocation(LIBRARY)
    expect(getLibraryReturnFlow()).not.toBeNull()

    act(() => signOut())
    expect(getLibraryReturnFlow()).toBeNull()

    act(() => signBackIn())
    // Nothing from the session before it: the journey is gone, so whatever the
    // shell mounts there is no way back on it.
    expect(getLibraryReturnFlow()).toBeNull()
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
  })
})

describe('an abandoned return does not fire later', () => {
  it('a failed village read, then back to the shelf, ends the request', async () => {
    fx.data = { ...LIBRARY_REPAIRED, loading: false, mission: null, active: null, readError: true }
    const { router } = renderJourney('/books')
    act(() => {
      begin()
    })
    fireEvent.click(await screen.findByRole('button', { name: LIBRARY_RETURN_LABEL }))

    // The honest recovery, and no board.
    await screen.findByText("Couldn't load your village.")
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)

    // The child gives up and goes back to the shelf.
    await act(async () => {
      await router.navigate('/books')
    })
    expect(getLibraryReturnFlow()).toBeNull()

    // A later ordinary visit to the hub opens an ordinary hub — the abandoned
    // request does not reopen the board now that the read works.
    fx.data = LIBRARY_REPAIRED
    await act(async () => {
      await router.navigate(LIBRARY_RETURN_VILLAGE_PATH)
    })
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    expect(screen.getByText('🏰 Open Stonebridge')).toBeInTheDocument()
  })

  it('and a journey that expires under a HELD read does not open the board later', async () => {
    // The card adopts a waiting return in the render phase — `open: true` plus
    // the tile to focus — but while the village read is held it renders its
    // loading branch, so there is a window in which the board is "open" in state
    // with nothing on screen. If the module journey ends in that window, the
    // cached request used to outlive it: the read recovered and the board opened
    // itself and focused the tile for a journey that was over. The generation
    // guard on `serveLibraryReturn` cannot prevent that — it refuses the consume
    // after the open and the focus have already happened.
    fx.data = { ...LIBRARY_REPAIRED, loading: true, mission: null, active: null }
    const { router } = renderJourney('/books')
    act(() => {
      requestLibraryReturn(begin()!.generation)
    })
    await act(async () => {
      await router.navigate(LIBRARY_RETURN_VILLAGE_PATH)
    })
    await screen.findByText('Loading your mission…')

    // A raw same-tick A → B → A: the selected child reads Lincoln again, so the
    // card's scope never moved and only the module knows the journey is over.
    act(() => {
      setActiveChildIdShared('london')
      setActiveChildIdShared('lincoln')
    })
    expect(getLibraryReturnFlow()).toBeNull()

    // The read lands. Re-entered at the SAME path on purpose: going away and
    // coming back would remount the card and reset its state, which is what hid
    // this defect.
    fx.data = LIBRARY_REPAIRED
    await act(async () => {
      await router.navigate(LIBRARY_RETURN_VILLAGE_PATH)
    })
    // The ordinary hub: the board did not open itself, and its own way in is
    // where it always is.
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    expect(screen.getByText('🏰 Open Stonebridge')).toBeInTheDocument()
  })

  it('but a held read that simply RECOVERS still opens the board and focuses the tile', async () => {
    // The control that matters most: what is retired is an expired journey, not
    // the feature.
    fx.data = { ...LIBRARY_REPAIRED, loading: true, mission: null, active: null }
    const { router } = renderJourney('/books')
    act(() => {
      requestLibraryReturn(begin()!.generation)
    })
    await act(async () => {
      await router.navigate(LIBRARY_RETURN_VILLAGE_PATH)
    })
    await screen.findByText('Loading your mission…')
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)

    fx.data = LIBRARY_REPAIRED
    await act(async () => {
      await router.navigate(LIBRARY_RETURN_VILLAGE_PATH)
    })
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and a board the child opened BY HAND is never closed by an expiry', async () => {
    // The other half of the rule: the retirement keys on an unserved return
    // request, so a board with no request behind it is not its business.
    renderJourney()
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    await screen.findByRole('dialog', { name: 'Stonebridge Village' })

    act(() => {
      setActiveChildIdShared('london')
      setActiveChildIdShared('lincoln')
    })
    expect(screen.getByRole('dialog', { name: 'Stonebridge Village' })).toBeInTheDocument()
  })

  it('and an already-SERVED return keeps its open board and its focus', async () => {
    // Nor does it undo an ordinary post-consumption state: the journey ended by
    // being served, and what it left behind is the child looking at the place
    // they asked to come back to.
    renderJourney()
    await leaveFromLocation(LIBRARY)
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
    expect(getLibraryReturnFlow()).toBeNull()

    act(() => {
      setActiveChildIdShared('london')
      setActiveChildIdShared('lincoln')
    })
    expect(screen.getByRole('dialog', { name: 'Stonebridge Village' })).toBeInTheDocument()
    expect(tile(LIBRARY)).toHaveFocus()
  })
})

describe('a scope change ends it under an open shelf', () => {
  it('takes the way back off the shelf the moment the child changes', async () => {
    renderJourney()
    await leaveFromLocation(LIBRARY)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()

    // The app-bar chip moves to his brother while the shelf is open.
    act(() => {
      fx.activeChild = { id: 'london', name: 'London' }
      setActiveChildIdShared('london')
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    })
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and a same-tick A → B → A does not bring it back', async () => {
    renderJourney()
    await leaveFromLocation(LIBRARY)

    // One handler, two synchronous writes, one render — which still reads
    // Lincoln. The store saw both; the journey is gone.
    act(() => {
      setActiveChildIdShared('london')
      setActiveChildIdShared('lincoln')
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    })
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('a same-tick A → B → A during a REAL close refuses the departure', async () => {
    // The tap-to-close window, with the transition actually running (no
    // reduced-motion shortcut): the board takes time to leave, the journey is
    // created only once it has, and nothing exists in between for the store
    // subscription to cancel. By the time the board has gone the selected child
    // is Lincoln again — so the scope string matches — and only the epoch
    // captured at the tap can tell that the shelf re-read for his brother and
    // back underneath it.
    emulateReducedMotion(false)
    renderJourney()
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
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

    // Let the whole close transition finish, then assert nothing happened.
    await waitFor(() => {
      expect(screen.queryByText('🎌 Banner Hall')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('where')).toHaveTextContent(LIBRARY_RETURN_VILLAGE_PATH)
    expect(getLibraryReturnFlow()).toBeNull()
    expect(screen.queryByRole('heading', { name: 'My Books' })).not.toBeInTheDocument()
  })

  it('and the refused departure leaves the focus on the hub, not on the body', async () => {
    // The accessibility half of the refusal above. The board turns MUI's own
    // focus restore off because it owns every hand-off, and the refusal used to
    // just return — so the keyboard was left on `document.body` and the next Tab
    // started again at the top of the page, with no sign anything had happened.
    emulateReducedMotion(false)
    renderJourney()
    const opener = screen.getByText('🏰 Open Stonebridge')
    fireEvent.click(opener)
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
      expect(screen.queryByText('🎌 Banner Hall')).not.toBeInTheDocument()
    })
    // Refused, as above — and the focus is back on the control that opened the
    // board, which is where a plain dismissal leaves it too.
    expect(getLibraryReturnFlow()).toBeNull()
    expect(screen.queryByRole('heading', { name: 'My Books' })).not.toBeInTheDocument()
    await waitFor(() => expect(opener).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
    // Nothing was reopened to put it there: no board, no visit.
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'The Library Hut' })).not.toBeInTheDocument()
  })

  it('but an untouched identity across the same real close still departs', async () => {
    // The positive control for the test above: with nothing moving, the same
    // delayed callback reaches the shelf and offers the way back.
    emulateReducedMotion(false)
    renderJourney()
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    fireEvent.click(tile(LIBRARY))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Library Hut' })).getByRole('button', {
        name: 'Open My Books',
      }),
    )

    await screen.findByRole('heading', { name: 'My Books' })
    expect(getLibraryReturnFlow()?.missionId).toBe('library_hut')
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()
  })

  it('a switch while the departure is held leaves the next child a closed board', async () => {
    // The held-boundary case: the way back was taken, and the chip moved before
    // the village was reached. The next child must not arrive at a board that
    // opened itself for somebody else's journey.
    const { router } = renderJourney('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      requestLibraryReturn(begin()!.generation)
    })
    act(() => {
      fx.activeChild = { id: 'london', name: 'London' }
      setActiveChildIdShared('london')
    })

    await act(async () => {
      await router.navigate(LIBRARY_RETURN_VILLAGE_PATH)
    })
    expect(getLibraryReturnFlow()).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    // His own hub, with his own way in, and nothing taken over.
    expect(screen.getByText('🏰 Open Stonebridge')).toBeInTheDocument()
  })

  it('and another family’s journey is never offered on this one’s shelf', async () => {
    renderJourney()
    await leaveFromLocation(LIBRARY)
    expect(getLibraryReturnFlow()?.familyId).toBe('fam-1')

    // Same child id, different family: the pair has to match, not either half.
    // (The shell's own family-change end is asserted against the real rule in
    // `libraryReturnFlow.test.ts`; the shell here is pinned to one family on
    // purpose, because a second mocked family would be testing the mock.)
    act(() => {
      begin({ familyId: 'fam-2' })
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    })
  })
})

describe('an unknown children read ENDS it, rather than only hiding the way back', () => {
  it('a shelf whose read has failed ends the journey, and clearing the flag revives nothing', async () => {
    const { router } = renderJourney()
    await leaveFromLocation(LIBRARY)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()
    const tapped = getLibraryIdentityEpoch()

    // The child reads a book, and while they are in the reader the family read
    // comes back REJECTED. `useChildren` keeps the previous answer beside the
    // failure, so `activeChild` is still the whole Lincoln object and the
    // selected id still matches the journey — the identity key the observer
    // above the gates watches has not moved at all. Only the read knows.
    fireEvent.click(screen.getByRole('button', { name: 'Read a book' }))
    await screen.findByRole('heading', { name: 'Book reader' })
    act(() => {
      fx.childrenLoading = true
      fx.childrenLoadFailed = true
    })
    fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })

    // Not offered — and not merely unrendered: the journey is over.
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()
    // The epoch moved with it, so a departure tapped before the failure cannot
    // create one after it either.
    expect(
      beginLibraryReturnFlow({
        familyId: 'fam-1',
        childId: 'lincoln',
        missionId: 'library_hut',
        // The departure this stands for was tapped on the HUB's board, which is
        // the entry this whole file drives — named rather than defaulted,
        // because an origin with a default would be an origin a caller can
        // forget to think about.
        origin: LibraryReturnOrigin.Hub,
        observedEpoch: tapped,
      }),
    ).toBeNull()

    // The read works again. That is a page that works, not a journey resuming:
    // the shelf is the ordinary shelf, with no way back handed back.
    act(() => {
      fx.childrenLoading = false
      fx.childrenLoadFailed = false
    })
    fireEvent.click(screen.getByRole('button', { name: 'Read a book' }))
    await screen.findByRole('heading', { name: 'Book reader' })
    fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()

    // The positive control, and the thing that must not be broken by any of the
    // above: a fresh, deliberate trip from the village still offers the way
    // back, so what expired was the old journey and not the feature.
    await act(async () => {
      await router.navigate(LIBRARY_RETURN_VILLAGE_PATH)
    })
    await leaveFromLocation(LIBRARY)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()
    expect(getLibraryReturnFlow()?.missionId).toBe('library_hut')
  })

  it('a shelf that has not answered YET keeps the journey and simply says nothing', async () => {
    // The negative control for the rule above: every fresh mount of
    // `useChildren` starts out loading, including the shelf the journey was
    // created for, so ending it on "not answered yet" would end it on the first
    // render of the page it is for. Hidden, held, and offered when the read
    // lands.
    renderJourney()
    await leaveFromLocation(LIBRARY)
    fireEvent.click(screen.getByRole('button', { name: 'Read a book' }))
    await screen.findByRole('heading', { name: 'Book reader' })

    act(() => {
      fx.childrenLoading = true
    })
    fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).not.toBeNull()

    // The read answers, with the same child it always had.
    act(() => {
      fx.childrenLoading = false
    })
    fireEvent.click(screen.getByRole('button', { name: 'Read a book' }))
    await screen.findByRole('heading', { name: 'Book reader' })
    fireEvent.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()
  })
})

describe('the hub’s own armor door is held to the same boundary', () => {
  it('refuses the jump when the identity moved while the board closed', async () => {
    // The epoch used to guard the Books departure only, on the reasoning that
    // the Forge "starts nothing". It is a departure like any other: the scope
    // string reads Lincoln again by the time the board has gone, and only the
    // epoch captured at the tap knows the reads underneath went to the brother
    // and back.
    emulateReducedMotion(false)
    renderJourney()
    const opener = screen.getByText('🏰 Open Stonebridge')
    fireEvent.click(opener)
    fireEvent.click(tile(FORGE))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Forge' })).getByRole('button', {
        name: 'See your armor',
      }),
    )

    act(() => {
      setActiveChildIdShared('london')
      setActiveChildIdShared('lincoln')
    })

    await waitFor(() => {
      expect(screen.queryByText('🎌 Banner Hall')).not.toBeInTheDocument()
    })
    // The jump never ran — no scroll, no focus, nothing granted.
    expect(fx.forgeVisits).toBe(0)
    // And the refusal still pays what it owes: the focus goes back to the
    // control that opened the board, exactly as a dismissal leaves it.
    await waitFor(() => expect(opener).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  it('but performs it when nothing moved at all', async () => {
    // The positive control: the ordinary armor door still works.
    renderJourney()
    fireEvent.click(screen.getByText('🏰 Open Stonebridge'))
    fireEvent.click(tile(FORGE))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Forge' })).getByRole('button', {
        name: 'See your armor',
      }),
    )
    await waitFor(() => expect(fx.forgeVisits).toBe(1))
    // It is a jump on this page, not a journey: nothing is owed a way back.
    expect(getLibraryReturnFlow()).toBeNull()
  })
})

describe('the hub serves only the journeys that left from the hub', () => {
  it('a town-page journey passing through the hub opens nothing here', async () => {
    // The canonical `/stonebridge` page is the other entry, and its returns are
    // its own. The hub must not adopt one just because it is for the right child
    // in the right phase — which is what a phase-only check would have done, and
    // the board would have opened itself over somebody else's journey.
    const { router } = renderJourney('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      requestLibraryReturn(begin({ origin: LibraryReturnOrigin.Town })!.generation)
    })

    await act(async () => {
      await router.navigate(LIBRARY_RETURN_VILLAGE_PATH)
    })
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    // The hub is the ordinary hub, with its own way in.
    expect(screen.getByText('🏰 Open Stonebridge')).toBeInTheDocument()
    // And the journey is over, because arriving anywhere that is not its own
    // entry ends it — so there is nothing left on the shelf either.
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('while its own journey still opens the board with the focus on the tile', async () => {
    // The positive control: the guard above distinguishes entries, it does not
    // simply refuse everything.
    renderJourney()
    await leaveFromLocation(LIBRARY)
    fireEvent.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
  })
})

describe('a marker that means nothing is simply ordinary navigation', () => {
  it('a place that is not on the board opens the board and takes no focus', async () => {
    renderJourney('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      begin({ missionId: 'not_a_place' })
    })

    const back = await screen.findByRole('button', { name: LIBRARY_RETURN_LABEL })
    fireEvent.click(back)
    const board = await screen.findByRole('dialog', { name: 'Stonebridge Village' })
    expect(board).toBeInTheDocument()
    // Nothing crashed, nothing was invented, and the request is spent.
    await waitFor(() => expect(getLibraryReturnFlow()).toBeNull())
    expect(tile(LIBRARY)).not.toHaveFocus()
  })

  it('a village read that has not answered yet holds the request honestly', async () => {
    fx.data = { ...LIBRARY_REPAIRED, loading: true, mission: null, active: null }
    renderJourney('/books')
    act(() => {
      begin()
    })
    fireEvent.click(await screen.findByRole('button', { name: LIBRARY_RETURN_LABEL }))

    await screen.findByText('Loading your mission…')
    // No board to open, so nothing is served and nothing is faked — the request
    // is still in hand for when the read answers.
    expect(getLibraryReturnFlow()).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
  })

  it('a village read that FAILED says so, and still invents nothing', async () => {
    fx.data = {
      ...LIBRARY_REPAIRED,
      loading: false,
      mission: null,
      active: null,
      readError: true,
    }
    renderJourney('/books')
    act(() => {
      begin()
    })
    fireEvent.click(await screen.findByRole('button', { name: LIBRARY_RETURN_LABEL }))

    // The existing honest recovery, unchanged: the sentence and the one door.
    await screen.findByText("Couldn't load your village.")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
  })
})
