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
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryReturnFlow,
  requestLibraryReturn,
} from './libraryReturnFlow'
// `vi.mock` is hoisted above these, so the components below are the real ones.
import LibraryReturnBanner from './LibraryReturnBanner'
import StonebridgeMissionCard from './StonebridgeMissionCard'
import { useLibraryReturnScopeWatch } from './useLibraryReturnScopeWatch'

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

const realMatchMedia = window.matchMedia

/** The layout route: the one thing mounted across every transition. */
function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  useLibraryReturnScopeWatch({ familyId: 'fam-1', pathname: location.pathname })
  return (
    <div>
      <span data-testid="where">{location.pathname}</span>
      {/* The app nav, as far as this journey is concerned: a way out of it. */}
      <button onClick={() => navigate('/today')}>Go to Today</button>
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
      onOpenBooks={(fromMissionId) => {
        beginLibraryReturnFlow({
          familyId: 'fam-1',
          childId: fx.activeChild.id,
          missionId: fromMissionId,
        })
        navigate(STONEBRIDGE_BOOKS_PATH)
      }}
      onVisitForge={() => {}}
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
        ],
      },
    ],
    { initialEntries: [initial] },
  )
  render(<RouterProvider router={router} />)
  return router
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
    const router = renderJourney()
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
    const router = renderJourney()
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

  it('stepping back to the village by hand opens nothing', async () => {
    const router = renderJourney()
    await leaveFromLocation(LIBRARY)

    await act(async () => {
      await router.navigate(-1)
    })
    // The child is back at the village without having asked to be, so nothing
    // was asked of the board: it stays closed, and no return is served. The
    // journey itself is still live — they have not left it, and the village and
    // the shelf are both inside it — so going on to the shelf again still
    // offers the way back. What a browser's Back button cannot do is revive a
    // journey that has ENDED, which is the case above.
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()?.phase).toBe('away')
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

  it('a switch while the departure is held leaves the next child a closed board', async () => {
    // The held-boundary case: the way back was taken, and the chip moved before
    // the village was reached. The next child must not arrive at a board that
    // opened itself for somebody else's journey.
    const router = renderJourney('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      const flow = beginLibraryReturnFlow({
        familyId: 'fam-1',
        childId: 'lincoln',
        missionId: 'library_hut',
      })
      requestLibraryReturn(flow!.generation)
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
      beginLibraryReturnFlow({ familyId: 'fam-2', childId: 'lincoln', missionId: 'library_hut' })
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    })
  })
})

describe('a marker that means nothing is simply ordinary navigation', () => {
  it('a place that is not on the board opens the board and takes no focus', async () => {
    renderJourney('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      beginLibraryReturnFlow({
        familyId: 'fam-1',
        childId: 'lincoln',
        missionId: 'not_a_place',
      })
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
      beginLibraryReturnFlow({ familyId: 'fam-1', childId: 'lincoln', missionId: 'library_hut' })
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
      beginLibraryReturnFlow({ familyId: 'fam-1', childId: 'lincoln', missionId: 'library_hut' })
    })
    fireEvent.click(await screen.findByRole('button', { name: LIBRARY_RETURN_LABEL }))

    // The existing honest recovery, unchanged: the sentence and the one door.
    await screen.findByText("Couldn't load your village.")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
  })
})
