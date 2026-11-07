import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  MemoryRouter,
  Outlet,
  RouterProvider,
  createMemoryRouter,
  useLocation,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Book } from '../../../core/types'

/**
 * The village → My Books journey when the shelf's own read does NOT land.
 *
 * ── What this file drives, and why it has to be this much of the app ─────────
 *
 * The claim is about one frame: the first frame of the shelf, before the books
 * have arrived. Three things meet in it — the shelf's own read, the page's
 * loading branch, and the one way back to Stonebridge the journey created — and
 * no existing suite has all three. `stonebridgeTown.route.test.tsx` and
 * `libraryReturn.route.test.tsx` drive the real journey against a STAND-IN
 * shelf; `libraryReturnShelf.test.tsx` drives the real shelf with
 * `useBookshelf` MOCKED to `loading: false`. So the page's own
 * `if (loading) return <LoadingState />` — which sits ABOVE the return banner
 * and the timer — is rendered by nothing that can see what it hides.
 *
 * Here the town page, the village, the location visit, the flow module, the
 * scope watches, the return banner, the shelf and `useBookshelf` are all the
 * real ones. The only boundary that is faked is Firestore itself: `getDocs`
 * hands back a promise this file resolves or REJECTS by hand, which is how a
 * rules rejection, an offline phone and a dropped query are reproduced without
 * an SDK, a network or a family record. Every book, child and family below is
 * synthetic.
 *
 * ── What is NOT claimed here ─────────────────────────────────────────────────
 *
 * Layout at phone / tablet / desktop, enlarged text, real browser focus, real
 * Firestore rules and anything about live family data — those are the
 * independent verification pass, and a synthetic check is not evidence about
 * any of them. The stubs are the surfaces this frame does not own: the generate
 * chat, the catalog dialog, the print dialog, the evaluation banner and the
 * creative timer, each reduced to a MARKER so that whether it is mounted is
 * still visible here while its behaviour stays with its own suite
 * (`libraryReturn.noExtraWrites.test.tsx` runs the real timer).
 */

const LINCOLN = { id: 'lincoln', name: 'Lincoln' }
const LONDON = { id: 'london', name: 'London' }

const fx = vi.hoisted(() => ({
  /** Every outstanding `getDocs`, with the target it was asked about. */
  reads: [] as {
    target: unknown
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
  }[],
  profile: 'lincoln' as string,
  activeChild: { id: 'lincoln', name: 'Lincoln' } as { id: string; name: string } | undefined,
  isChildProfile: true,
  childrenLoading: false,
  childrenLoadFailed: false,
  setActiveChildId: vi.fn(),
  retryLoad: vi.fn(),
  /** The village's progress, as its own hook would report it. */
  progress: null as unknown as StonebridgeProgressData,
  /**
   * How many times each stubbed neighbour has MOUNTED.
   *
   * Presence proves nothing about identity: a remounted timer is a new session
   * with a new lifetime, and a remounted chat is a generation gone. So each
   * stub takes a token once per mount and renders it, and the claims below
   * compare the token rather than asking whether something is on screen.
   */
  timerMounts: 0,
  chatMounts: 0,
}))

// ── The Firestore boundary, and nothing else about Firestore ────────────────
vi.mock('firebase/firestore', () => ({
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  doc: (...args: unknown[]) => args,
  getDocs: (target: unknown) =>
    new Promise((resolve, reject) => {
      fx.reads.push({ target, resolve, reject })
    }),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}))
vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: (family: string) => `families/${family}/artifacts`,
  booksCollection: (family: string) => `families/${family}/books`,
  hoursCollection: (family: string) => `families/${family}/hours`,
  stripUndefined: (value: unknown) => value,
}))
vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}))
vi.mock('../../../core/hooks/useDebounce', () => ({ useDebounce: () => vi.fn() }))
vi.mock('../../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn() }))
vi.mock('../../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn() }))

// ── Identity, exactly as the surfaces already read it ───────────────────────
vi.mock('../../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
  useAuth: () => ({ familyId: 'fam-1' }),
}))
vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: fx.profile }),
}))
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: fx.activeChild,
    activeChildId: fx.activeChild?.id ?? '',
    children: [LINCOLN, LONDON],
    setActiveChildId: fx.setActiveChildId,
    isChildProfile: fx.isChildProfile,
    isLoading: fx.childrenLoading,
    loadFailed: fx.childrenLoadFailed,
    retryLoad: fx.retryLoad,
  }),
}))

// ── The village's own reads: driven against the real hooks elsewhere ────────
vi.mock('../../avatar/stonebridge/useStonebridgeProgress', () => ({
  useStonebridgeProgress: () => fx.progress,
}))
vi.mock('../../avatar/stonebridge/useTownHeroProfile', () => ({
  TownHeroPhase: {
    Idle: 'idle',
    Loading: 'loading',
    Ready: 'ready',
    Missing: 'missing',
    Error: 'error',
  },
  TownHeroFailure: { Read: 'read', Mismatch: 'mismatch' },
  useTownHeroProfile: () => ({
    phase: 'missing',
    document: null,
    failure: null,
    exposureKey: '',
    retrying: false,
    retry: () => {},
  }),
}))
vi.mock('../../avatar/stonebridge/BannerRaiseCelebration', () => ({ default: () => null }))

// ── The shelf's neighbours, as marked stand-ins ─────────────────────────────
/**
 * The generate chat, standing in with the two things this file needs it to
 * have: a mount token, and a piece of local typed state of its own — what a
 * half-made generation IS. The real chat's behaviour is its own suites'; what
 * is asserted here is that the shelf never takes this instance away.
 */
vi.mock('../BookGenerateChat', () => {
  /**
   * Named, and named with a CAPITAL: a stub that holds hooks is a component, and
   * `default: () => …` is a function called `default` as far as the rules of
   * hooks are concerned — which is an error, not a style note, because the rule
   * cannot check a hook it does not believe is in a component.
   */
  function GenerateChatStub({ resumeBookId }: { resumeBookId?: string }) {
    const [session] = useState(() => {
      fx.chatMounts += 1
      return `chat-${fx.chatMounts}`
    })
    const [draft, setDraft] = useState('')
    return (
      <div data-testid="generate-chat" data-session={session} data-resume-id={resumeBookId ?? 'none'}>
        <input
          aria-label="story so far"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    )
  }
  return { default: GenerateChatStub }
})
vi.mock('../EvaluationBookBanner', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))
vi.mock('../useEvaluationBookSuggestions', () => ({
  useEvaluationBookSuggestions: () => ({ suggestions: [], loading: false }),
}))
vi.mock('../makeBookPdf', () => ({ makeBookPdf: vi.fn(async () => undefined) }))
vi.mock('../../business/CatalogPromoteDialog', () => ({ default: () => null }))
vi.mock('../../business/useCatalogProducts', () => ({
  useCatalogProducts: () => ({
    products: [],
    loading: false,
    error: null,
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
  }),
}))
/**
 * The creative timer, standing in with a mount token of its own.
 *
 * The real one writes compliance `hours` and binds a running session to the
 * child it was started for (`UX-327`); `libraryReturn.noExtraWrites.test.tsx`
 * runs that real component. What this file owns is narrower and is exactly what
 * the page decides: WHETHER a timer is mounted at all on a shelf that has never
 * loaded, and whether a read frame can replace the one that is mounted.
 */
vi.mock('../../../components/CreativeTimer', () => {
  // Same reason as the chat stub above: it holds a hook, so it is a component
  // with a component's name.
  function CreativeTimerStub() {
    const [session] = useState(() => {
      fx.timerMounts += 1
      return `timer-${fx.timerMounts}`
    })
    return <div data-testid="creative-timer" data-session={session} />
  }
  return { default: CreativeTimerStub }
})

// `vi.mock` is hoisted above these, so everything below is the real thing.
import BookshelfPage from '../BookshelfPage'
import { MAKE_BOOK_DOOR_LABEL } from '../makeBookDoor'
import { setActiveChildIdShared } from '../../../core/hooks/activeChildStore'
import StonebridgePage from '../../avatar/stonebridge/StonebridgePage'
import { getMission } from '../../avatar/stonebridge/missions'
import {
  LIBRARY_RETURN_LABEL,
} from '../../avatar/stonebridge/libraryReturnCopy'
import {
  STONEBRIDGE_TOWN_PATH,
} from '../../avatar/stonebridge/stonebridgeDestinations'
import type { StonebridgeProgressData } from '../../avatar/stonebridge/useStonebridgeProgress'
import {
  LibraryReturnOrigin,
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryIdentityEpoch,
  getLibraryReturnFlow,
} from '../../avatar/stonebridge/libraryReturnFlow'
import {
  useLibraryReturnIdentityWatch,
  useLibraryReturnReadinessWatch,
  useLibraryReturnRouteWatch,
} from '../../avatar/stonebridge/useLibraryReturnScopeWatch'

const LIBRARY = getMission('library_hut')!
const FORGE = getMission('the_forge')!

/** The Library is repaired — so its shelf door is there — and the Forge is next. */
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

type Scope = 'own' | 'together' | 'all'

function scopeOf(target: unknown): Scope {
  const text = JSON.stringify(target)
  if (text.includes('"array-contains"')) return 'together'
  if (text.includes('"childId"')) return 'own'
  return 'all'
}

function outstanding(): Scope[] {
  return fx.reads.map((r) => scopeOf(r.target))
}

function snapshot(books: Book[]): unknown {
  return {
    docs: books.map((book) => ({ id: book.id ?? 'missing-id', data: () => book })),
  }
}

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    childId: LINCOLN.id,
    title: 'A Book',
    pages: [],
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    subjectBuckets: [],
    ...overrides,
  } as Book
}

/** Refuse every outstanding read — the rejection the shelf has to survive. */
async function refuseTheShelfRead() {
  const pending = [...fx.reads]
  fx.reads.length = 0
  await act(async () => {
    for (const entry of pending) entry.reject(new Error('permission-denied'))
  })
}

/** Answer every outstanding read with the same set of books. */
async function answerTheShelfRead(books: Book[]) {
  const pending = [...fx.reads]
  fx.reads.length = 0
  await act(async () => {
    for (const entry of pending) entry.resolve(snapshot(books))
  })
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

/** The layout route, carrying the watches `AppShell` carries. */
function Shell() {
  const location = useLocation()
  useLibraryReturnRouteWatch(location.pathname)
  useLibraryReturnReadinessWatch(fx.childrenLoading, fx.childrenLoadFailed)
  return (
    <div>
      <span data-testid="where">{location.pathname}</span>
      <Outlet />
    </div>
  )
}

/** What sits ABOVE the router in the real app (`App.tsx`'s observer). */
function IdentityObserver() {
  useLibraryReturnIdentityWatch('fam-1', fx.profile)
  return null
}

function renderJourney(initial = STONEBRIDGE_TOWN_PATH) {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: STONEBRIDGE_TOWN_PATH, element: <StonebridgePage /> },
          { path: '/books', element: <BookshelfPage /> },
          { path: '/books/:bookId', element: <h1>Book editor</h1> },
          { path: '/books/:bookId/read', element: <h1>Book reader</h1> },
          { path: '/books/:bookId/review', element: <h1>Read it to me</h1> },
          { path: '/stickers', element: <h1>Stickers</h1> },
          { path: '/today', element: <h1>Today</h1> },
          // NotFound lives INSIDE the layout route, as `src/app/router.tsx`
          // wires it — otherwise an unsupported URL unmounts the route watch.
          { path: '*', element: <h1>Not found</h1> },
        ],
      },
    ],
    { initialEntries: [initial] },
  )
  render(
    <>
      <IdentityObserver />
      <RouterProvider router={router} />
    </>,
  )
  return { router }
}

function townRegion() {
  return within(screen.getByRole('region', { name: 'Stonebridge Village' }))
}

function tile(mission: { locationName: string }) {
  return townRegion().getByRole('button', {
    name: new RegExp(`^Visit ${mission.locationName}\\.`),
  })
}

/**
 * The actual journey: the town page, the Library's visit, its Books door — and
 * then the shelf, with its read still in flight.
 *
 * It waits on the ROUTE rather than on the shelf's heading, deliberately: the
 * page's loading branch renders no heading at all, so waiting for one would
 * hang on the very defect this file is about.
 */
async function leaveTheLibraryForTheShelf() {
  fireEvent.click(tile(LIBRARY))
  const visit = within(screen.getByRole('dialog', { name: LIBRARY.locationName }))
  fireEvent.click(visit.getByRole('button', { name: 'Open My Books' }))
  await waitFor(() => {
    expect(screen.getByTestId('where')).toHaveTextContent('/books')
  })
  // The journey really was created by the village, not by this file.
  expect(getLibraryReturnFlow()).not.toBeNull()
  // And the shelf really is reading, through the real hook.
  await waitFor(() => {
    expect(fx.reads.length).toBeGreaterThan(0)
  })
}

/** The shelf's own door, which must never be mistaken for the way back. */
function makeBookDoors() {
  return screen.queryAllByRole('button', { name: MAKE_BOOK_DOOR_LABEL })
}

function wayBack() {
  return screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })
}

beforeEach(() => {
  localStorage.clear()
  emulateReducedMotion()
  fx.reads.length = 0
  fx.profile = 'lincoln'
  fx.activeChild = LINCOLN
  fx.isChildProfile = true
  fx.childrenLoading = false
  fx.childrenLoadFailed = false
  fx.setActiveChildId.mockClear()
  fx.retryLoad.mockClear()
  fx.timerMounts = 0
  fx.chatMounts = 0
  fx.progress = LIBRARY_REPAIRED
  setActiveChildIdShared(LINCOLN.id)
  endLibraryReturnFlow()
})

afterEach(() => {
  endLibraryReturnFlow()
  window.matchMedia = realMatchMedia
})

describe('arriving at the shelf from the village, with the read still in flight', () => {
  it('is the shelf — with its title and the way back — not a bare spinner', async () => {
    renderJourney()
    await leaveTheLibraryForTheShelf()

    // The child is on My Books. A page that shows only a spinner has taken the
    // way back off the screen along with everything else, and the journey it
    // belongs to is live.
    expect(screen.getByRole('heading', { name: 'My Books' })).toBeInTheDocument()
    expect(wayBack()).toBeInTheDocument()
    // The ways to useful work are reachable while the shelf is not.
    expect(screen.getByRole('button', { name: 'Stickers' })).toBeInTheDocument()
  })

  it('and NOT the creative timer, which a shelf that has never loaded may not offer', async () => {
    renderJourney()
    await leaveTheLibraryForTheShelf()

    // The timer writes compliance hours. A cold pending read is not a shelf,
    // and offering a session to start on one would put a lifetime and a credit
    // behind a page that has not answered anything yet.
    expect(screen.queryByTestId('creative-timer')).not.toBeInTheDocument()
    expect(fx.timerMounts).toBe(0)
  })

  it('says it is still reading, and never that the shelf is empty', async () => {
    renderJourney()
    await leaveTheLibraryForTheShelf()

    // A read in flight is a pending read, said as one.
    expect(screen.getByRole('status')).toBeInTheDocument()
    // And it is not a count, not an empty state and not a failure.
    expect(screen.queryByText('No books yet!')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^All \(0\)$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('when that read is refused', () => {
  it('says so, offers one Try again, and keeps the way back', async () => {
    renderJourney()
    await leaveTheLibraryForTheShelf()
    expect(outstanding().sort()).toEqual(['own', 'together'])

    await refuseTheShelfRead()

    // The truth, in the same shape every other surface in this app uses for a
    // failed read: a statement, not an empty result.
    const notice = await waitFor(() => screen.getByRole('alert'))
    expect(notice.textContent ?? '').toMatch(/could ?n.t|could not/i)
    expect(screen.queryByText('No books yet!')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^All \(0\)$/ })).not.toBeInTheDocument()
    // One recovery door, not two, and not a second one hiding in the grid.
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    // The spinner is over: a failed read is not a read still arriving.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // The way back is exactly as eligible as it was a frame ago — the journey,
    // the identity and the origin have not changed.
    expect(wayBack()).toBeInTheDocument()
    // Still no timer: a read that failed has not made this a shelf either.
    expect(screen.queryByTestId('creative-timer')).not.toBeInTheDocument()
    expect(fx.timerMounts).toBe(0)
    // Recovery does not take the child anywhere by itself.
    expect(screen.getByTestId('where')).toHaveTextContent('/books')
  })

  it('and the way back still goes to the town the journey left', async () => {
    const { router } = renderJourney()
    await leaveTheLibraryForTheShelf()
    await refuseTheShelfRead()

    const back = await waitFor(() => {
      const control = wayBack()
      expect(control).not.toBeNull()
      return control as HTMLElement
    })
    fireEvent.click(back)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(STONEBRIDGE_TOWN_PATH)
    })
    // Back at the canonical town page, with its board on screen — the entry
    // this journey actually left from.
    expect(screen.getByRole('region', { name: 'Stonebridge Village' })).toBeInTheDocument()
  })

  it('Try again re-asks the same two queries, and the books then arrive', async () => {
    renderJourney()
    await leaveTheLibraryForTheShelf()
    await refuseTheShelfRead()

    const retry = await waitFor(() => screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(retry)

    // The child's own scope, re-asked. Not widened, and not the parent's
    // family-wide query.
    await waitFor(() => {
      expect(outstanding().sort()).toEqual(['own', 'together'])
    })

    await answerTheShelfRead([makeBook({ id: 'b1', title: 'The Creeper Story' })])

    expect(await screen.findByText('The Creeper Story')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    // The shelf's own one door is back, exactly once, and the way back is
    // still beside it. (On a shelf WITH books that door is the grid's first
    // tile; the empty shelf's is the button the next test counts.)
    expect(screen.getAllByTestId('new-book-tile')).toHaveLength(1)
    expect(wayBack()).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/books')
    // NOW there is a shelf, so the timer is offered — mounted once, for the
    // first time, by the answer rather than by the arrival.
    expect(screen.getByTestId('creative-timer')).toBeInTheDocument()
    expect(fx.timerMounts).toBe(1)
  })

  it('answers an honestly empty shelf as empty, with the way back still there', async () => {
    renderJourney()
    await leaveTheLibraryForTheShelf()

    await answerTheShelfRead([])

    // A settled read with nothing in it is the one state that may say so.
    expect(await screen.findByText('No books yet!')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The empty shelf's own door, and the way back above it.
    expect(makeBookDoors()).toHaveLength(1)
    expect(wayBack()).toBeInTheDocument()
    // An answered shelf is a shelf, even with nothing on it yet, so the timer
    // is offered here exactly as it is over a full one.
    expect(screen.getByTestId('creative-timer')).toBeInTheDocument()
  })
})

describe('a failed read invents nothing', () => {
  it('offers no way back on an ordinary direct visit to the shelf', async () => {
    // No journey at all: a refresh, a copied link, the nav's own My Books.
    renderJourney('/books')
    await waitFor(() => {
      expect(fx.reads.length).toBeGreaterThan(0)
    })
    await refuseTheShelfRead()

    // The recovery is the shelf's own and says nothing about Stonebridge.
    expect(await waitFor(() => screen.getByRole('alert'))).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    expect(wayBack()).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()
  })
})

/**
 * The same page, mounted directly, for the one thing a route cannot show.
 *
 * A profile switch does not navigate — `ProfileMenu` calls `selectProfile` and
 * nothing else, and `App.tsx`'s `ProfileGate` renders the same `<AppRouter />`
 * for every non-null profile — so the shelf is RE-RENDERED under a new audience
 * rather than remounted. A static route element is re-rendered by nothing here,
 * which is why these claims render the page themselves and re-render it.
 */
describe('a scope that moves under the mounted shelf', () => {
  function Where() {
    const location = useLocation()
    return <span data-testid="shelf-where">{location.pathname}</span>
  }

  /**
   * A FRESH element every time, deliberately: re-rendering the identical
   * element object makes React bail out of the subtree, so a stale tree would
   * assert that nothing changed by never asking the page to render again.
   */
  const shelfTree = () => (
    <MemoryRouter initialEntries={['/books']}>
      <BookshelfPage />
      <Where />
    </MemoryRouter>
  )

  function renderShelf() {
    const view = render(shelfTree())
    return { ...view, again: () => view.rerender(shelfTree()) }
  }

  it('an identity read that fails is said honestly, through ITS retry, and ends the journey', async () => {
    /**
     * Two reads, two owners, two answers. The shelf's own read failed first, so
     * the shelf says so and offers its own door. Then the children read fails —
     * which is an affirmative answer that the child is UNKNOWN, not a pause —
     * so WHOSE shelf this is becomes the honest thing to say, the recovery
     * offered is the children read's own existing `retryLoad`, and the journey
     * is over through the banner's unchanged readiness watch. A way back
     * offered against an identity nobody can vouch for is the `GATE` verdict's
     * whole point, and ending it is more than hiding it.
     */
    const journey = beginLibraryReturnFlow({
      familyId: 'fam-1',
      childId: LINCOLN.id,
      missionId: LIBRARY.id,
      origin: LibraryReturnOrigin.Town,
      observedEpoch: getLibraryIdentityEpoch(),
    })
    expect(journey).not.toBeNull()

    const { again } = renderShelf()
    await refuseTheShelfRead()

    // This read's own failure, with the way back beside it while the identity
    // still holds.
    expect(await waitFor(() => screen.getByText('Couldn’t load your books.'))).toBeInTheDocument()
    expect(wayBack()).toBeInTheDocument()

    await act(async () => {
      // `useChildren` reports a failure with `isLoading` still true, and keeps
      // the previous child object beside it — the shape that used to leave the
      // retained id being read for.
      fx.childrenLoading = true
      fx.childrenLoadFailed = true
      again()
      await Promise.resolve()
    })

    // One alert, and it is now about the identity rather than about this read.
    expect(screen.getByText('Couldn’t check whose books these are.')).toBeInTheDocument()
    expect(screen.queryByText('Couldn’t load your books.')).not.toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByText('No books yet!')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(wayBack()).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()

    // Exactly one recovery, and it is the children read's own. Nothing about
    // the books is re-asked, because there is nobody to ask for.
    const recover = screen.getAllByRole('button', { name: 'Try again' })
    expect(recover).toHaveLength(1)
    // The local rule this control is held to; the real measurement is Chrome's.
    expect(window.getComputedStyle(recover[0]).minHeight).toBe('44px')
    fireEvent.click(recover[0])
    expect(fx.retryLoad).toHaveBeenCalledTimes(1)
    expect(outstanding()).toEqual([])
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('and while that identity read is merely unsettled, the shelf waits instead of claiming anything', async () => {
    const { again } = renderShelf()
    await answerTheShelfRead([makeBook({ id: 'b1', title: 'A kid’s book' })])
    expect(await screen.findByText('A kid’s book')).toBeInTheDocument()

    await act(async () => {
      fx.childrenLoading = true
      again()
      await Promise.resolve()
    })

    // Not an empty shelf, not an error, and not the retained row either: the
    // child this shelf would read for is not confirmed at this moment.
    expect(screen.queryByText('A kid’s book')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('No books yet!')).not.toBeInTheDocument()
    expect(outstanding()).toEqual([])

    // It settles on the same child: one fresh read, and the rows are theirs
    // again. (Fresh because the question was withdrawn, not because the answer
    // changed — an unconfirmed child is not a child.)
    await act(async () => {
      fx.childrenLoading = false
      again()
      await Promise.resolve()
    })
    expect(outstanding().sort()).toEqual(['own', 'together'])
    await answerTheShelfRead([makeBook({ id: 'b1', title: 'A kid’s book' })])
    expect(await screen.findByText('A kid’s book')).toBeInTheDocument()
  })

  /** Open the door and pick the AI path, then type into what it opened. */
  async function openGenerateChatWith(story: string) {
    fireEvent.click(await screen.findByTestId('new-book-tile'))
    fireEvent.click(screen.getByTestId('make-book-choice-with-shelly'))
    const chat = screen.getByTestId('generate-chat')
    fireEvent.change(screen.getByLabelText('story so far'), { target: { value: story } })
    return chat.getAttribute('data-session')
  }

  function sessionOf(testId: string) {
    return screen.getByTestId(testId).getAttribute('data-session')
  }

  /** The parent's shelf, answered with one book each for two children. */
  async function parentShelfWithBothChildren() {
    fx.profile = 'parents'
    fx.isChildProfile = false
    const view = renderShelf()
    expect(outstanding()).toEqual(['all'])
    await answerTheShelfRead([
      makeBook({ id: 'l-1', title: 'Lincoln’s book', childId: LINCOLN.id }),
      makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON.id }),
    ])
    expect(await screen.findByText('Lincoln’s book')).toBeInTheDocument()
    return view
  }

  it('a parent’s selected child is not a new question — nothing reloads', async () => {
    /**
     * The family query's permission scope is the family and the audience. The
     * selected child filters the ANSWER, so moving the app-bar chip must not
     * re-ask the question, blank the shelf or fail it.
     *
     * Nothing is open over the page here on purpose: these are claims about
     * what a person can see and reach, so they are made by role.
     */
    const { again } = await parentShelfWithBothChildren()
    const timerSession = sessionOf('creative-timer')

    await act(async () => {
      fx.activeChild = LONDON
      again()
      await Promise.resolve()
    })

    // Nothing was asked again — and if a later change ever makes this emit a
    // query, it may only ever be the family's own.
    for (const scope of outstanding()) expect(scope).toBe('all')
    // The family's answer is still the answer, with no pending or failed frame.
    expect(screen.getByText('Lincoln’s book')).toBeInTheDocument()
    expect(screen.getByText('London’s book')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // The counts are still the family's, and still true. (The tab is named
    // rather than the "All (2)" chip, which the creator filter also carries.)
    expect(screen.getByRole('button', { name: /^Made by hand \(2\)$/ })).toBeInTheDocument()
    // And the same timer session, not a new instance that looks like one.
    expect(sessionOf('creative-timer')).toBe(timerSession)
    expect(fx.timerMounts).toBe(1)
  })

  it('an audience replacement hides the old rows at once, and recovers into the new ones', async () => {
    /**
     * The actual permission-scope replacement, which is a different event from
     * the chip moving: Mom hands the phone over and the profile becomes a
     * child's, so the query stops being the family's. The rows she could see
     * are gone in the first render of the new owner — before any effect, before
     * the new read lands. Again nothing is open over the page: this is the
     * reachable workflow, up to and including the tap on *Try again*.
     */
    const { again } = await parentShelfWithBothChildren()
    const timerSession = sessionOf('creative-timer')

    await act(async () => {
      fx.profile = 'london'
      fx.isChildProfile = true
      fx.activeChild = LONDON
      again()
      await Promise.resolve()
    })

    // The child's own pair is in flight, and the previous audience's rows are
    // not on screen, not counted and not tappable.
    expect(outstanding().sort()).toEqual(['own', 'together'])
    expect(screen.queryByText('Lincoln’s book')).not.toBeInTheDocument()
    expect(screen.queryByText('London’s book')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^All \(\d+\)$/ })).not.toBeInTheDocument()
    expect(screen.queryByText('No books yet!')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(sessionOf('creative-timer')).toBe(timerSession)

    // Refused: the truth, one door at the size this app holds controls to.
    await refuseTheShelfRead()
    expect(await waitFor(() => screen.getByText('Couldn’t load your books.'))).toBeInTheDocument()
    const recover = screen.getAllByRole('button', { name: 'Try again' })
    expect(recover).toHaveLength(1)
    // The local rule this control is held to; the real measurement is Chrome's.
    expect(window.getComputedStyle(recover[0]).minHeight).toBe('44px')
    expect(sessionOf('creative-timer')).toBe(timerSession)

    // Try again asks the CHILD's question — the owner on screen now — and the
    // answer is theirs alone.
    fireEvent.click(recover[0])
    await waitFor(() => {
      expect(outstanding().sort()).toEqual(['own', 'together'])
    })
    await answerTheShelfRead([makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON.id })])
    expect(await screen.findByText('London’s book')).toBeInTheDocument()
    expect(screen.queryByText('Lincoln’s book')).not.toBeInTheDocument()
    // One timer throughout: no remount anywhere in this sequence, which is what
    // a lost session would look like.
    expect(fx.timerMounts).toBe(1)
    expect(screen.getByTestId('shelf-where')).toHaveTextContent('/books')
  })

  /**
   * MOUNT CONTRACT, not a user workflow.
   *
   * With the Make-a-book dialog open, MUI marks the rest of the page
   * `aria-hidden` — correctly, because none of it is reachable while a modal is
   * up. So this claim is deliberately made WITHOUT role queries and without
   * clicking anything behind the modal: what it asserts is that a query
   * transition does not take an already-mounted composer or timer with it,
   * which is a fact about mounting and not about what a person can tap.
   *
   * The real composer → continue → save → close → retry workflow is Chrome's.
   */
  it('a query transition does not remount an open composer or the timer (mount contract)', async () => {
    const { again } = await parentShelfWithBothChildren()
    const timerSession = sessionOf('creative-timer')
    const chatSession = await openGenerateChatWith('A half-made story')

    // The chip moves: not a new question, and nothing to lose by it.
    await act(async () => {
      fx.activeChild = LONDON
      again()
      await Promise.resolve()
    })
    expect(sessionOf('generate-chat')).toBe(chatSession)
    expect(screen.getByLabelText('story so far')).toHaveValue('A half-made story')
    expect(sessionOf('creative-timer')).toBe(timerSession)

    // The audience is replaced, so the shelf behind the dialog is re-read …
    await act(async () => {
      fx.profile = 'london'
      fx.isChildProfile = true
      again()
      await Promise.resolve()
    })
    expect(sessionOf('generate-chat')).toBe(chatSession)
    expect(screen.getByLabelText('story so far')).toHaveValue('A half-made story')
    expect(sessionOf('creative-timer')).toBe(timerSession)

    // … and refused. The read frame behind the dialog is the shelf's business;
    // the paid generation in front of it is not the read's to discard.
    await refuseTheShelfRead()
    expect(sessionOf('generate-chat')).toBe(chatSession)
    expect(screen.getByLabelText('story so far')).toHaveValue('A half-made story')
    expect(sessionOf('creative-timer')).toBe(timerSession)
    expect(fx.chatMounts).toBe(1)
    expect(fx.timerMounts).toBe(1)
  })

  it('a read door over a row the shelf may no longer show is not a door', async () => {
    /**
     * The menu outlives the row. A parent opened a sibling's book menu, handed
     * the phone over, and *Read* was still there over a book the new reader may
     * not open — and it navigated. The menu is a door only while its row is
     * part of the answer the shelf is showing.
     */
    const { again } = await parentShelfWithBothChildren()

    const card = screen.getByText('London’s book').parentElement as HTMLElement
    fireEvent.click(within(card).getByRole('button'))
    expect(screen.getByRole('menuitem', { name: 'Read' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()

    // The chip moving does not change the answer, so the parent's own menu over
    // their own family's row stays exactly as it was.
    await act(async () => {
      fx.activeChild = LONDON
      again()
      await Promise.resolve()
    })
    expect(screen.getByRole('menuitem', { name: 'Read' })).toBeInTheDocument()

    // The audience IS replaced: the row is not part of the new answer, so the
    // doors over it are gone rather than waiting to be tapped.
    await act(async () => {
      fx.profile = 'london'
      fx.isChildProfile = true
      again()
      await Promise.resolve()
    })
    // Awaited because a closing MUI menu animates out; what matters is that it
    // is gone and that nothing could be tapped in the meantime — the items are
    // no longer rendered as doors the moment the answer changed.
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Read' })).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByText('London’s book')).not.toBeInTheDocument()
    // Nothing navigated on its own either.
    expect(screen.getByTestId('shelf-where')).toHaveTextContent('/books')
  })
})
