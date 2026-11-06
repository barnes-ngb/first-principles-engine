import { useLayoutEffect, useRef } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Outlet, RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setActiveChildIdShared } from '../../../core/hooks/activeChildStore'
import { getMission } from './missions'
import { LIBRARY_RETURN_LABEL, LIBRARY_RETURN_LINE } from './libraryReturnCopy'
import {
  clearForgeFocusRequest,
  consumeForgeFocus,
  useForgeFocusRouteWatch,
} from './forgeFocusHandoff'
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
  libraryReturnPath,
  liveLibraryReturnFlow,
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
  /**
   * The children read's own state, reported exactly as `useChildren` reports it.
   *
   * Two of these pairs are shapes the real hook really produces and the page has
   * to tell apart, so they are set by hand here rather than simulated:
   *
   *   • a COLD read — `activeChild` undefined with `isLoading` true, because the
   *     shared list that resolves the selected id has not arrived yet;
   *   • a FAILED read — `loadFailed` true with `isLoading` STILL TRUE, because a
   *     read that rejected is not a read that answered.
   */
  childrenLoading: false,
  childrenLoadFailed: false,
  /**
   * The hook's own retry and the hook's own setter, as spies.
   *
   * Spies and nothing more: neither one re-reads, recovers or selects here.
   * Loading the children and choosing a child belong to `useChildren` /
   * `useActiveChild`, and a fixture that flipped its own flags inside
   * `retryLoad` would be asserting the hook's behaviour while pretending it was
   * the page's. What the page owes is the delegation — that it calls this and
   * does nothing else — and a later read reporting something different, which
   * the test performs itself.
   */
  retryLoad: vi.fn(),
  setActiveChildId: vi.fn(),
  /**
   * What the town's own profile read reports.
   *
   * Default: a settled read that says this child has no saved character — the
   * state every existing claim in this file was written under, and the one that
   * puts no hero on the map.
   */
  hero: {
    phase: 'missing',
    document: null as unknown,
    failure: null as unknown,
    exposureKey: '',
    retrying: false,
    retry: vi.fn(),
  },
}))

vi.mock('./useStonebridgeProgress', () => ({
  useStonebridgeProgress: () => fx.data,
}))

/**
 * The town's own profile read, stubbed — the page no longer uses the shared
 * `useAvatarProfile` at all.
 *
 * The phase/failure tokens are restated here because mocking the module
 * replaces it whole, and importing the real one would pull the Firestore SDK
 * into a route test. The REAL tokens, bindings, stale-callback refusals and
 * retries are driven against the real hook in `useTownHeroProfile.test.ts`;
 * this file only needs the page's reaction to each phase.
 */
vi.mock('./useTownHeroProfile', () => ({
  TownHeroPhase: {
    Idle: 'idle',
    Loading: 'loading',
    Ready: 'ready',
    Missing: 'missing',
    Error: 'error',
  },
  TownHeroFailure: { Read: 'read', Mismatch: 'mismatch' },
  useTownHeroProfile: () => fx.hero,
}))

vi.mock('../../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1' }),
}))

vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'parents' }),
}))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: fx.activeChild,
    activeChildId: fx.activeChild?.id ?? '',
    children: [
      { id: 'lincoln', name: 'Lincoln' },
      { id: 'london', name: 'London' },
    ],
    setActiveChildId: fx.setActiveChildId,
    isChildProfile: false,
    isLoading: fx.childrenLoading,
    loadFailed: fx.childrenLoadFailed,
    retryLoad: fx.retryLoad,
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

/**
 * A saved hero, as the town's own read reports one.
 *
 * Synthetic and minimal: this file's claims are about what the PAGE does with a
 * settled read (draws a decorative hero, keeps every target, withdraws the
 * motion behind a dialog). What the appearance is made of — mixed per-piece
 * tiers, dyes, a face grid, unsafe colours, unequipped absence — is
 * `heroAppearance.test.ts`, against the real builder.
 */
const SAVED_HERO = {
  profile: {
    childId: 'lincoln',
    themeStyle: 'minecraft',
    pieces: [],
    currentTier: 'iron',
    characterFeatures: {
      skinTone: '#F5D6B8',
      hairColor: '#6B4C32',
      hairStyle: 'medium',
      hairLength: 'ear_length',
      eyeColor: '#4A6B7A',
    },
    equippedPieces: ['helmet', 'breastplate'],
    forgedPieces: {
      wood: { helmet: { forgedAt: '2026-01-01T00:00:00.000Z' } },
      iron: { breastplate: { forgedAt: '2026-02-01T00:00:00.000Z' } },
    },
    totalXp: 400,
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  hasSavedFeatures: true,
} as unknown

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

/** The layout route, carrying the three watches `AppShell` carries. */
function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  useLibraryReturnRouteWatch(location.pathname)
  useLibraryReturnReadinessWatch(fx.childrenLoading, fx.childrenLoadFailed)
  // The armor request's route bound, mounted where the shell mounts it.
  useForgeFocusRouteWatch(location.pathname)
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

/**
 * One of the town's three ordinary doors, wherever the page is keeping it.
 *
 * On a HEALTHY town they live behind one compact *Quick links* disclosure, so
 * reaching one is two taps rather than one; in every state with no village on
 * screen they are rendered directly and the disclosure is not there at all.
 * This resolves either form, so the claims about where a door LEADS stay about
 * that and not about the form.
 */
function townDoor(name: string) {
  const toggle = screen.queryByRole('button', { name: 'Quick links' })
  if (toggle && toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  return screen.getByRole('button', { name })
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
  fx.retryLoad.mockClear()
  fx.setActiveChildId.mockClear()
  fx.hero = {
    phase: 'missing',
    document: null,
    failure: null,
    exposureKey: '',
    retrying: false,
    retry: vi.fn(),
  }
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

  it('the places are the buildings themselves, and the picture stays a picture', () => {
    renderTown()
    const town = townRegion()

    // On the page as in the modal, the board opens on the map: the control for
    // a place is a native button over its building, and `tile()` — the helper
    // every page test here finds a place by — resolves to it.
    const target = town.getByTestId('map-target-library_hut')
    expect(target.tagName).toBe('BUTTON')
    expect(target).toHaveAccessibleName('Visit The Library Hut. Fixed.')
    expect(tile(LIBRARY)).toBe(target)
    // The drawing keeps its single name and holds no control of its own.
    const picture = town.getByRole('img', { name: /^Stonebridge village:/ })
    expect(within(picture).queryAllByRole('button')).toHaveLength(0)
    expect(picture).not.toContainElement(target)
    // Exactly one control per place, and the way to the other view.
    expect(town.getAllByRole('button', { name: /^Visit The Library Hut\./ })).toHaveLength(1)
    expect(town.getByRole('button', { name: 'Show the places list' })).toBeInTheDocument()
  })

  it('a visit opened from a building comes back to that building', async () => {
    // The page has no board transition behind the visit, so this is the page's
    // own hand-off: the visit's `onExited` is the last modal transition in
    // play, and the focus goes to the exact control it was opened from.
    renderTown()
    const target = townRegion().getByTestId('map-target-library_hut')
    target.focus()
    fireEvent.click(target)

    const visit = within(screen.getByRole('dialog', { name: 'The Library Hut' }))
    expect(visit.getByText('You fixed this place.')).toBeInTheDocument()
    fireEvent.click(visit.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByText('You fixed this place.')).not.toBeInTheDocument()
    })
    await waitFor(() => expect(townRegion().getByTestId('map-target-library_hut')).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  it('switching to the places list moves the tab stops, not the focus', async () => {
    renderTown()
    const town = townRegion()
    const places = town.getByRole('button', { name: 'Show the places list' })
    places.focus()
    fireEvent.click(places)

    // One set of place controls at a time, and the control that switched is
    // not remounted by switching — so the keyboard stays on it.
    expect(town.queryByTestId('map-target-library_hut')).not.toBeInTheDocument()
    expect(tile(LIBRARY)).toHaveAccessibleName('Visit The Library Hut. Fixed.')
    expect(places).toHaveFocus()
    expect(places).toHaveAttribute('aria-pressed', 'true')

    // And a visit opened from the list comes back to the list's own tile.
    fireEvent.click(tile(LIBRARY))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Library Hut' })).getByRole('button', {
        name: 'Close',
      }),
    )
    await waitFor(() => {
      expect(screen.queryByText('You fixed this place.')).not.toBeInTheDocument()
    })
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
  })

  it('offers the ordinary doors beside it, compactly', () => {
    // The redundancy the owner named: three standing buttons for three actions
    // the shell's own nav already carries, on every state of the page. On a
    // healthy town they are one disclosure — closed, so the village is what the
    // page is showing — and the doors themselves are unchanged behind it.
    renderTown()
    const toggle = screen.getByRole('button', { name: 'Quick links' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    for (const label of ['My Books', 'Today', 'My armor']) {
      expect(screen.queryByRole('button', { name: label }), label).not.toBeInTheDocument()
    }

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    for (const label of ['My Books', 'Today', 'My armor']) {
      expect(screen.getByRole('button', { name: label }), label).toBeInTheDocument()
    }
  })

  it('and the disclosure closes again with the child', async () => {
    // Scoped UI state, like everything else the town holds: an open panel is
    // not a fact about the family, and a sibling's town does not inherit it.
    const { router } = renderTown()
    fireEvent.click(screen.getByRole('button', { name: 'Quick links' }))
    expect(screen.getByRole('button', { name: 'My Books' })).toBeInTheDocument()

    // The brother, reported as the shell's resolved child — the same way every
    // other switch in this file is performed.
    fx.activeChild = { id: 'london', name: 'London' }
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })

    expect(screen.getByRole('button', { name: 'Quick links' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('button', { name: 'My Books' })).not.toBeInTheDocument()
  })

  it('and a settled read with no saved character puts no hero on the map', () => {
    // `missing` is the default fixture: a successful read that says this child
    // has no saved hero yet. It is not a hero and is not drawn as one — and it
    // says honestly that a personal character has not been saved yet.
    renderTown()
    expect(screen.queryByTestId('stonebridge-hero')).not.toBeInTheDocument()
    expect(screen.queryByTestId('hero-stage')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('No saved hero yet. You can make one in My armor.')).toBeInTheDocument()
  })

  it('a saved hero stands on the map, decoratively, over nobody’s target', () => {
    fx.hero = { ...fx.hero, phase: 'ready', exposureKey: 'fam-1_lincoln|0|0@0', document: SAVED_HERO }
    renderTown()
    const town = townRegion()
    const stage = town.getByTestId('hero-stage')

    // Decorative, and structurally unable to take a tap or the keyboard.
    expect(stage).toHaveAttribute('aria-hidden', 'true')
    expect(stage.style.pointerEvents).toBe('none')
    expect(within(stage).queryAllByRole('button')).toHaveLength(0)
    // The picture keeps its one name and does not contain the hero layer.
    expect(town.getByRole('img', { name: /^Stonebridge village:/ })).not.toContainElement(stage)
    // And the places are still exactly one control each.
    expect(town.getAllByRole('button', { name: /^Visit The Library Hut\./ })).toHaveLength(1)
  })

  it('and tapping a place still opens it immediately, with the motion withdrawn', () => {
    emulateReducedMotion(false)
    fx.hero = { ...fx.hero, phase: 'ready', exposureKey: 'fam-1_lincoln|0|0@0', document: SAVED_HERO }
    renderTown()
    const stage = townRegion().getByTestId('hero-stage')
    expect(stage).toHaveAttribute('data-hero-running', 'true')

    // No delay, no travel, no waiting for a walk: the dialog is open in the
    // same tick as the tap, which is also what hides the map underneath it.
    fireEvent.click(tile(LIBRARY))
    expect(screen.getByRole('dialog', { name: 'The Library Hut' })).toBeInTheDocument()
    expect(stage).toHaveAttribute('data-hero-running', 'false')
  })

  it('a hero read that FAILS says so, offers its own door, and blocks nothing', () => {
    const retry = vi.fn()
    fx.hero = { ...fx.hero, phase: 'error', failure: 'read', retry }
    renderTown()

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your hero.")
    expect(screen.queryByTestId('stonebridge-hero')).not.toBeInTheDocument()
    // The village is untouched by it, and so are the ordinary ways on.
    expect(screen.getByRole('region', { name: 'Stonebridge Village' })).toBeInTheDocument()
    expect(tile(LIBRARY)).toBeInTheDocument()
    expect(townDoor('My Books')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show my hero' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('and a document that names another child is refused, with no retry offered', () => {
    fx.hero = { ...fx.hero, phase: 'error', failure: 'mismatch', document: SAVED_HERO }
    renderTown()

    expect(screen.getByRole('alert')).toHaveTextContent('That hero is not yours.')
    expect(screen.queryByTestId('stonebridge-hero')).not.toBeInTheDocument()
    // Re-reading would say the same thing, so no door pretends otherwise.
    expect(screen.queryByRole('button', { name: 'Show my hero' })).not.toBeInTheDocument()
  })

  it('and a village that is NOT healthy keeps the three doors in plain sight', () => {
    // The other half of the trade, and the one that matters most: when there is
    // no current village to look at, the way to useful work is not behind
    // anything. Stale is the subtle case — the board IS on screen, with last
    // known numbers and a notice — and it still gets the plain strip.
    fx.data = { ...LIBRARY_REPAIRED, stale: true, retry: vi.fn() }
    renderTown()
    expect(screen.queryByRole('button', { name: 'Quick links' })).not.toBeInTheDocument()
    for (const label of ['My Books', 'Today', 'My armor']) {
      expect(screen.getByRole('button', { name: label }), label).toBeInTheDocument()
    }
  })

  it.each(['loading', 'failed'] as const)('cached-child %s still shows three direct fallback doors', (state) => {
    fx.childrenLoading = true
    fx.childrenLoadFailed = state === 'failed'
    fx.hero = { ...fx.hero, phase: 'idle' }
    renderTown()
    expect(screen.queryByRole('button', { name: 'Quick links' })).not.toBeInTheDocument()
    for (const label of ['My Books', 'Today', 'My armor']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    expect(screen.queryByTestId('stonebridge-hero')).not.toBeInTheDocument()
    if (state === 'failed') {
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't confirm the selected child.")
      fireEvent.click(screen.getByRole('button', { name: 'Reload children' }))
      expect(fx.retryLoad).toHaveBeenCalledTimes(1)
    } else expect(screen.getByText('Checking the selected child…')).toBeInTheDocument()
  })

  it('reports hero loading without blocking useful places', () => {
    fx.hero = { ...fx.hero, phase: 'loading' }
    renderTown()
    expect(screen.getByText('Loading your saved hero…')).toBeInTheDocument()
    expect(tile(LIBRARY)).toBeInTheDocument()
  })

  it('qualifies a legacy/default saved appearance', () => {
    fx.hero = { ...fx.hero, phase: 'ready', exposureKey: 'legacy', document: {
      ...(SAVED_HERO as object), hasSavedFeatures: false,
    } }
    renderTown()
    expect(screen.getByText(/Your saved hero uses some shared appearance defaults/)).toBeInTheDocument()
    expect(screen.getByTestId('stonebridge-hero')).toBeInTheDocument()
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
    // SETTLED and genuinely nobody: the read answered, and choosing is the one
    // thing that would actually help.
    fx.activeChild = undefined
    renderTown()
    expect(screen.getByText('Pick a child to see the village.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    // The doors are still there, and nothing was selected on anyone's behalf.
    expect(screen.getByRole('button', { name: 'My Books' })).toBeInTheDocument()
    expect(fx.setActiveChildId).not.toHaveBeenCalled()
  })
})

/**
 * "No child" is three different facts, and the page used to tell only one.
 *
 * `useActiveChild` resolves the selected id against the shared children list, so
 * a COLD read has `activeChild` undefined while the id is already populated —
 * and a FAILED read keeps `isLoading` true on purpose, because a read that
 * rejected is not a read that answered. Reading only `activeChild` therefore
 * told a family whose list had not arrived to *pick a child*: an instruction
 * they cannot act on, with nothing to retry.
 *
 * All three readings come from values `useActiveChild` already publishes. The
 * page adds no flag, no store, no lookup and no selection, and the retry it
 * offers is the hook's own.
 */
describe('the three readings of "no child yet"', () => {
  it('an unsettled read says it is loading, and does not instruct a selection', () => {
    // The cold-read shape: no resolved child, the read still in flight.
    fx.activeChild = undefined
    fx.childrenLoading = true
    renderTown()

    expect(screen.getByText('Loading your village…')).toBeInTheDocument()
    expect(screen.queryByText('Pick a child to see the village.')).not.toBeInTheDocument()
    // Nothing to retry while it is still coming, and no village claimed.
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
    // And the ordinary ways on are still ways on.
    for (const label of ['My Books', 'Today', 'My armor']) {
      expect(screen.getByRole('button', { name: label }), label).toBeInTheDocument()
    }
  })

  it('a FAILED read says so and offers the hook’s own retry — with isLoading still true', () => {
    // The shape that makes the order load-bearing: `loadFailed` arrives WITH
    // `isLoading` true. A loading-first branch would show "loading" for a read
    // that is never coming back, and gating the retry on `!isLoading` would
    // disable it forever.
    fx.activeChild = undefined
    fx.childrenLoading = true
    fx.childrenLoadFailed = true
    renderTown()

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your village.")
    expect(screen.queryByText('Loading your village…')).not.toBeInTheDocument()
    expect(screen.queryByText('Pick a child to see the village.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    for (const label of ['My Books', 'Today', 'My armor']) {
      expect(screen.getByRole('button', { name: label }), label).toBeInTheDocument()
    }
  })

  it('and its retry delegates to the children-load owner and does nothing else', () => {
    fx.activeChild = undefined
    fx.childrenLoading = true
    fx.childrenLoadFailed = true
    const { router } = renderTown()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    // Delegated, once, to the hook that owns the read.
    expect(fx.retryLoad).toHaveBeenCalledTimes(1)
    // And the page did nothing of its own: it did not move, and it did not
    // choose a child to get itself out of the state.
    expect(fx.setActiveChildId).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe(STONEBRIDGE_TOWN_PATH)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your village.")
    expect(screen.queryByRole('region', { name: 'Stonebridge Village' })).not.toBeInTheDocument()
  })

  it('and a read that comes back with a child shows that child’s village', async () => {
    // The recovery, and the honest division of labour in it: the page's part is
    // the delegation above, and `useChildren` owns actually re-reading. So each
    // later read is reported HERE — not from inside the retry spy, which would
    // be the fixture doing the hook's job and calling it the page's. What the
    // two reads below report is `useChildren`'s own published contract, pinned
    // against the real hook in `core/hooks/useChildren.load.test.tsx`.
    fx.activeChild = undefined
    fx.childrenLoading = true
    fx.childrenLoadFailed = true
    const { router } = renderTown()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(fx.retryLoad).toHaveBeenCalledTimes(1)

    // A retry's own state: the failure is cleared and the read is in flight
    // again. The page has to stop saying it failed and say it is loading —
    // which is the ordering doing its work in the other direction.
    fx.childrenLoadFailed = false
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    expect(screen.getByText('Loading your village…')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()

    // And then it lands, with a child.
    fx.activeChild = { id: 'lincoln', name: 'Lincoln' }
    fx.childrenLoading = false
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })

    await screen.findByRole('region', { name: 'Stonebridge Village' })
    expect(tile(LIBRARY)).toBeInTheDocument()
    // Still nothing selected by the page, at any point in that sequence.
    expect(fx.setActiveChildId).not.toHaveBeenCalled()
  })

  it('a child already KNOWN never reaches any of those three', () => {
    // The state the family is in almost all the time, and the one none of this
    // may disturb: the list is populated, the child resolves, the town renders.
    renderTown()
    expect(screen.getByRole('region', { name: 'Stonebridge Village' })).toBeInTheDocument()
    for (const sentence of [
      'Pick a child to see the village.',
      'Loading your village…',
      "Couldn't load your village.",
    ]) {
      expect(screen.queryByText(sentence), sentence).not.toBeInTheDocument()
    }
  })

  it('and a known child whose read goes unknown under them keeps the board', () => {
    // `isLoading` going true again for a child who IS resolved is a re-read, not
    // an unknown identity: `activeChild` still answers, so this page is not in
    // the branch at all and the village it is already showing stays.
    fx.childrenLoading = true
    fx.childrenLoadFailed = true
    renderTown()
    expect(screen.getByRole('region', { name: 'Stonebridge Village' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  it('retires an unserved focus when the journey expires under a HELD read', async () => {
    // The blocker. The page adopts the request in the render phase, but the
    // village is only rendered once the read has produced a board — and in that
    // window the module journey can end: a raw same-tick `A → B → A`, an
    // unsettled children read, a failed one. The LOCAL request used to outlive
    // it, so the recovered read rendered the board and the Library tile took the
    // focus for a journey that was already over. The generation guard on
    // `serveLibraryReturn` cannot prevent that: it refuses the consume AFTER the
    // focus has happened.
    fx.data = { ...LIBRARY_REPAIRED, loading: true, mission: null, active: null }
    const { router } = renderTown('/books')
    act(() => {
      requestLibraryReturn(begin()!.generation)
    })
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    // Adopted, with nothing on screen yet to serve it.
    await screen.findByText('Loading your village…')

    act(() => {
      setActiveChildIdShared('london')
      setActiveChildIdShared('lincoln')
    })
    expect(getLibraryReturnFlow()).toBeNull()

    // The read lands. Re-entered at the SAME path deliberately: going away and
    // coming back would unmount this page and reset its state, which is exactly
    // what hid the defect.
    fx.data = LIBRARY_REPAIRED
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await screen.findByRole('region', { name: 'Stonebridge Village' })
    expect(tile(LIBRARY)).not.toHaveFocus()
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and the same holds when the children read goes unknown instead', async () => {
    fx.data = { ...LIBRARY_REPAIRED, loading: true, mission: null, active: null }
    const { router } = renderTown('/books')
    act(() => {
      requestLibraryReturn(begin()!.generation)
    })
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await screen.findByText('Loading your village…')

    // The shell's own read fails under the page: the identity is unknown, so the
    // journey is over even though the selected child never changed.
    fx.childrenLoading = true
    fx.childrenLoadFailed = true
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    expect(getLibraryReturnFlow()).toBeNull()

    fx.childrenLoading = false
    fx.childrenLoadFailed = false
    fx.data = LIBRARY_REPAIRED
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await screen.findByRole('region', { name: 'Stonebridge Village' })
    expect(tile(LIBRARY)).not.toHaveFocus()
  })

  it('but a held read that simply RECOVERS still serves the return', async () => {
    // The control that matters most: what is retired is an expired journey, not
    // the feature. Nothing moves here, so the request waits for the read and is
    // served when it lands.
    fx.data = { ...LIBRARY_REPAIRED, loading: true, mission: null, active: null }
    const { router } = renderTown('/books')
    act(() => {
      requestLibraryReturn(begin()!.generation)
    })
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await screen.findByText('Loading your village…')
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)

    fx.data = LIBRARY_REPAIRED
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
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
    fireEvent.click(townDoor('My armor'))

    await screen.findByRole('heading', { name: 'Hero Hub' })
    expect(router.state.location.pathname).toBe(LIBRARY_RETURN_VILLAGE_PATH)
    // No invented `/forge` route, and the request is for THIS child. The
    // compact disclosure changed where the door is, not what it does: the
    // epoch is still read at the tap and travels with the request.
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

  it('refuses the ARMOR departure when the identity moved during the close', async () => {
    // The blocker this test exists for. The armor door used to be the ONE
    // departure the epoch did not guard: the village called a no-argument
    // callback and the page then sampled a fresh epoch of its own AFTER the
    // visit had closed, so a raw same-tick `A → B → A` inside that transition
    // left the scope string reading Lincoln, the fresh reading matched, and the
    // tap still reached `/avatar` with a request stamped for whoever was there.
    emulateReducedMotion(false)
    renderTown()
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
      expect(screen.queryByRole('dialog', { name: 'The Forge' })).not.toBeInTheDocument()
    })
    // No navigation…
    expect(screen.getByTestId('where')).toHaveTextContent(STONEBRIDGE_TOWN_PATH)
    expect(screen.queryByRole('heading', { name: 'Hero Hub' })).not.toBeInTheDocument()
    // …and no new intent: nothing is left for the hub to serve later.
    expect(consumeForgeFocus({ familyId: 'fam-1', childId: 'lincoln' })).toBe(false)
    expect(consumeForgeFocus({ familyId: 'fam-1', childId: 'london' })).toBe(false)
    // The refusal still owes the focus, and pays it to this page.
    const town = screen.getByRole('region', { name: 'Stonebridge Village' })
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.contains(town)).toBe(true)
  })

  it('and the request it does make carries the TAP’s epoch, not a later one', async () => {
    // The positive control for the test above, and the half a fresh reading got
    // wrong: with nothing moving, the same real close departs and the hub
    // accepts the request — which it can only do if the epoch travelled with it.
    emulateReducedMotion(false)
    renderTown()
    fireEvent.click(tile(FORGE))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'The Forge' })).getByRole('button', {
        name: 'See your armor',
      }),
    )
    await screen.findByRole('heading', { name: 'Hero Hub' })
    expect(consumeForgeFocus({ familyId: 'fam-1', childId: 'lincoln' })).toBe(true)
  })

  it('and an unserved request is retired by leaving the hub', async () => {
    // The hub stand-in has no gallery, which is the real page's state until its
    // profile read lands: the request arrives and waits. Leaving before it is
    // served retires it, so a later ordinary visit to the hub is ordinary.
    const { router } = renderTown()
    fireEvent.click(townDoor('My armor'))
    await screen.findByRole('heading', { name: 'Hero Hub' })

    await act(async () => {
      await router.navigate(STONEBRIDGE_TODAY_PATH)
    })
    await screen.findByRole('heading', { name: 'Today' })
    expect(consumeForgeFocus({ familyId: 'fam-1', childId: 'lincoln' })).toBe(false)
  })

  it('and a child switch on the way makes the hub refuse it', async () => {
    renderTown()
    fireEvent.click(townDoor('My armor'))
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

/**
 * ── A return taken before the shelf's own arrival had been observed ──────────
 *
 * The one ordering the suite above cannot pin, and the one a real child hits:
 * the way back is tapped in the window between the shelf's route COMMITTING and
 * that commit's passive effects being flushed. The screen is fully there — the
 * banner is on it, the button is hit-testable — but a route watch reported from
 * a passive effect has not yet said that `/books` is where the child now is. So
 * the journey moves to `returning`, and the pending observation of `/books` then
 * lands on it and reads "not at its own entry" as an ABANDONED return.
 *
 * Everything here is the real thing: the real page, the real village, the real
 * banner, the real flow module and the real watches. Two deliberate differences
 * from the fixture above, both only about WHEN the tap happens:
 *
 *   • the watches are hosted in `<ShellWatches />`, the shell's FIRST child,
 *     and the probe is its LAST — React runs layout effects children-first and
 *     siblings in order, which is the only thing that deterministically places
 *     the tap after the watch's own commit-time observation. In the app the
 *     watch sits on the layout route itself and the tap comes from the browser,
 *     which can only dispatch once the whole commit is done — the same side of
 *     the same boundary, pinned here without depending on a scheduler;
 *   • the tap is performed as the banner's own handler performs it —
 *     `requestLibraryReturn(live.generation)` then
 *     `navigate(libraryReturnPath(returning))`, read off the live flow exactly
 *     as `LibraryReturnBanner` reads it — because dispatching a DOM click from
 *     inside a commit would make React flush from a lifecycle rather than model
 *     a browser event. That those two calls ARE what the button does is held by
 *     the clicks in the suite above, and the probe records whether the real
 *     control was on screen at that instant, so the window it taps in is a
 *     window the child really had.
 *
 * Against the passive watch these fail on the focus itself — the town arrives
 * with nothing to serve — and not on anything about how the source is written.
 */
const probe = {
  /** How many taps the probe performed; a loop must not read as a pass. */
  taps: 0,
  /** Was the real *Come back* control on screen at the instant of the tap? */
  sawControl: false,
}

/**
 * The three watches `AppShell` carries, hosted in a child of the shell.
 *
 * Identical calls, with the same values, in the same order; see the block
 * comment above for why they are not called on the shell itself here.
 */
function ShellWatches() {
  const { pathname } = useLocation()
  useLibraryReturnRouteWatch(pathname)
  useLibraryReturnReadinessWatch(fx.childrenLoading, fx.childrenLoadFailed)
  useForgeFocusRouteWatch(pathname)
  return null
}

/** The child's tap, made at the commit that put the shelf on screen. */
function ReturnTapProbe({ at }: { at: string }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const tapped = useRef(false)
  useLayoutEffect(() => {
    if (tapped.current || pathname !== at) return
    // Whose journey it is, and its generation, asked the way the banner asks.
    const live = liveLibraryReturnFlow(getLibraryReturnFlow(), {
      familyId: 'fam-1',
      childId: 'lincoln',
    })
    if (!live) return
    tapped.current = true
    probe.taps += 1
    probe.sawControl = Boolean(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL }))
    const returning = requestLibraryReturn(live.generation)
    if (!returning) return
    navigate(libraryReturnPath(returning))
  }, [at, pathname, navigate])
  return null
}

function ProbeShell() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <ShellWatches />
      <span data-testid="where">{location.pathname}</span>
      <button onClick={() => navigate(STONEBRIDGE_TOWN_PATH)}>Nav Stonebridge</button>
      <button onClick={() => navigate(LIBRARY_RETURN_VILLAGE_PATH)}>Nav My Hero</button>
      <button onClick={() => navigate('/books')}>Nav My Books</button>
      <Outlet />
      {/* LAST, deliberately: the tap is the last thing in the commit, which is
          the earliest moment a browser could have dispatched it. */}
      <ReturnTapProbe at={STONEBRIDGE_BOOKS_PATH} />
    </div>
  )
}

/** The same routes as `renderTown`, under the shell that carries the probe. */
function renderTownWithTapProbe(initial = STONEBRIDGE_TOWN_PATH) {
  const router = createMemoryRouter(
    [
      {
        element: <ProbeShell />,
        children: [
          { path: STONEBRIDGE_TOWN_PATH, element: <StonebridgePage /> },
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

/** Leave the town from a place, without waiting for the shelf to settle. */
function departFromLocation(mission: { locationName: string }) {
  fireEvent.click(tile(mission))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: mission.locationName })).getByRole('button', {
      name: 'Open My Books',
    }),
  )
}

describe('a return taken in the window before the shelf’s arrival was observed', () => {
  beforeEach(() => {
    probe.taps = 0
    probe.sawControl = false
  })

  it('reaches the town page and the place it left', async () => {
    renderTownWithTapProbe()
    departFromLocation(LIBRARY)

    // The tap happened once, in a window in which the child really was being
    // offered the way back.
    await waitFor(() => expect(probe.taps).toBe(1))
    expect(probe.sawControl).toBe(true)

    // And it was honoured: the town page, and the Library tile the journey
    // named. Against the passive watch the arrival had nothing to serve — the
    // `/books` observation had ended the journey as abandoned — and no focus
    // hand-off was attempted at all.
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(STONEBRIDGE_TOWN_PATH),
    )
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())
    expect(screen.queryByRole('dialog', { name: 'The Library Hut' })).not.toBeInTheDocument()
    // Served rather than abandoned: the journey is spent BY the hand-off.
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and is still consumed once: the next arrival is an ordinary town', async () => {
    const { router } = renderTownWithTapProbe()
    departFromLocation(LIBRARY)
    await waitFor(() => expect(tile(LIBRARY)).toHaveFocus())

    // Ordinary navigation to the shelf: nothing is owed a way back, so there is
    // nothing for the probe to tap a second time either.
    fireEvent.click(screen.getByRole('button', { name: 'Nav My Books' }))
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    expect(probe.taps).toBe(1)

    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('but a real departure after the return is still observed, and still ends it', async () => {
    // The negative control the fix may not buy its way out of: moving the
    // observation to its own commit must not stop a `returning` journey being
    // ended by a route it really does arrive at. The child gives up and opens a
    // book instead, which is an arrival outside the journey's own entry.
    const { router } = renderTownWithTapProbe('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      requestLibraryReturn(begin()!.generation)
    })
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)

    await act(async () => {
      await router.navigate('/books/book-1/read')
    })
    await screen.findByRole('heading', { name: 'Book reader' })
    expect(getLibraryReturnFlow()).toBeNull()

    // And a later ordinary visit to the town is an ordinary town.
    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await screen.findByRole('region', { name: 'Stonebridge Village' })
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())
    expect(probe.taps).toBe(0)
  })

  it('and a HUB journey’s return is not adopted by the town it arrives at', async () => {
    // The other half of the same boundary: the observation still keeps the two
    // doors apart. A journey that left from the Hero Hub's board ends when it
    // reaches the town page, and the town serves nothing.
    const { router } = renderTownWithTapProbe('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      requestLibraryReturn(begin({ origin: LibraryReturnOrigin.Hub })!.generation)
    })

    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await screen.findByRole('region', { name: 'Stonebridge Village' })
    expect(getLibraryReturnFlow()).toBeNull()
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())
  })

  it('and an identity that moved leaves the shelf’s own window with nothing in it', async () => {
    // The identity rail at this boundary. The journey is ended by a same-tick
    // raw `A → B → A` while the child is reading, and the shelf is then arrived
    // at again — so the probe DOES get its window at a real `/books` commit and
    // finds nothing in it: no control to offer, no journey to take, and an
    // ordinary town afterwards.
    const { router } = renderTownWithTapProbe('/books')
    await screen.findByRole('heading', { name: 'My Books' })
    act(() => {
      begin()
    })
    await act(async () => {
      await router.navigate('/books/book-1/read')
    })
    await screen.findByRole('heading', { name: 'Book reader' })

    act(() => {
      setActiveChildIdShared('london')
      setActiveChildIdShared('lincoln')
    })
    expect(getLibraryReturnFlow()).toBeNull()

    // Back to the shelf: a real arrival, a real window, and nothing in it.
    await act(async () => {
      await router.navigate('/books')
    })
    await screen.findByRole('heading', { name: 'My Books' })
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    expect(probe.taps).toBe(0)

    await act(async () => {
      await router.navigate(STONEBRIDGE_TOWN_PATH)
    })
    await screen.findByRole('region', { name: 'Stonebridge Village' })
    await waitFor(() => expect(tile(LIBRARY)).not.toHaveFocus())
  })
})
