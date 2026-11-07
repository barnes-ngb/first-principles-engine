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
vi.mock('../BookGenerateChat', () => ({
  default: ({ resumeBookId }: { resumeBookId?: string }) => {
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
  },
}))
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
vi.mock('../../../components/CreativeTimer', () => ({
  default: () => {
    const [session] = useState(() => {
      fx.timerMounts += 1
      return `timer-${fx.timerMounts}`
    })
    return <div data-testid="creative-timer" data-session={session} />
  },
}))

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
 * which is why these two claims render the page themselves and re-render it.
 */
describe('a scope that moves under the mounted shelf', () => {
  function renderShelf() {
    const view = render(
      <MemoryRouter initialEntries={['/books']}>
        <BookshelfPage />
      </MemoryRouter>,
    )
    return {
      ...view,
      again: () =>
        view.rerender(
          <MemoryRouter initialEntries={['/books']}>
            <BookshelfPage />
          </MemoryRouter>,
        ),
    }
  }

  it('keeps the error frame but drops the way back when the identity read fails', async () => {
    /**
     * Two independent reads, two independent answers. The shelf's own read
     * failed — so the error and its one door stay — while the children read
     * then fails too, which is an affirmative answer that the identity is
     * UNKNOWN and ends the journey through the banner's own readiness watch.
     * A way back offered against an identity nobody can vouch for is the
     * `GATE` verdict's whole point, and ending it is more than hiding it.
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

    // The recovery, with the way back beside it while the identity holds.
    expect(await waitFor(() => screen.getByRole('alert'))).toBeInTheDocument()
    expect(wayBack()).toBeInTheDocument()

    await act(async () => {
      fx.childrenLoading = true
      fx.childrenLoadFailed = true
      again()
      await Promise.resolve()
    })

    // The shelf still says what happened to its own read, and still offers the
    // retry; what is gone is the journey.
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    expect(wayBack()).not.toBeInTheDocument()
    expect(getLibraryReturnFlow()).toBeNull()
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

  it('a parent’s selected child is not a new question — nothing reloads and nothing is lost', async () => {
    /**
     * The correction this test exists for: the family query's permission scope
     * is the family and the audience. The selected child filters the ANSWER, so
     * moving the app-bar chip must not re-ask the question, must not blank or
     * fail the shelf, and must not reach an open generation or a running timer.
     */
    fx.profile = 'parents'
    fx.isChildProfile = false
    const { again } = renderShelf()

    expect(outstanding()).toEqual(['all'])
    await answerTheShelfRead([
      makeBook({ id: 'l-1', title: 'Lincoln’s book', childId: LINCOLN.id }),
      makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON.id }),
    ])
    expect(await screen.findByText('Lincoln’s book')).toBeInTheDocument()
    const timerSession = sessionOf('creative-timer')
    const chatSession = await openGenerateChatWith('Once upon a mine')

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
    // The same generation, with the words still in it, and the same timer
    // session — not a new instance that merely looks like one.
    expect(sessionOf('generate-chat')).toBe(chatSession)
    expect(screen.getByLabelText('story so far')).toHaveValue('Once upon a mine')
    expect(sessionOf('creative-timer')).toBe(timerSession)
    expect(fx.timerMounts).toBe(1)
    expect(fx.chatMounts).toBe(1)
  })

  it('an audience replacement hides the old rows at once, and still keeps the session', async () => {
    /**
     * The actual permission-scope replacement, which is a different event from
     * the chip moving: Mom hands the phone over and the profile becomes a
     * child's, so the query stops being the family's. The rows she could see
     * are gone in the first render of the new owner — before any effect, before
     * the new read lands — while everything that is not the shelf stays.
     */
    fx.profile = 'parents'
    fx.isChildProfile = false
    const { again } = renderShelf()
    await answerTheShelfRead([
      makeBook({ id: 'l-1', title: 'Lincoln’s book', childId: LINCOLN.id }),
      makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON.id }),
    ])
    expect(await screen.findByText('Lincoln’s book')).toBeInTheDocument()
    const timerSession = sessionOf('creative-timer')
    const chatSession = await openGenerateChatWith('A half-made story')

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
    // The generation and the timer session are untouched by a read frame.
    expect(sessionOf('generate-chat')).toBe(chatSession)
    expect(screen.getByLabelText('story so far')).toHaveValue('A half-made story')
    expect(sessionOf('creative-timer')).toBe(timerSession)

    // Refused: the truth, one door, and still the same two neighbours.
    await refuseTheShelfRead()
    expect(await waitFor(() => screen.getByRole('alert'))).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    expect(sessionOf('creative-timer')).toBe(timerSession)
    expect(sessionOf('generate-chat')).toBe(chatSession)
    expect(screen.getByLabelText('story so far')).toHaveValue('A half-made story')

    // Try again asks the CHILD's question — the owner on screen now — and the
    // answer is theirs alone.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => {
      expect(outstanding().sort()).toEqual(['own', 'together'])
    })
    await answerTheShelfRead([makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON.id })])
    expect(await screen.findByText('London’s book')).toBeInTheDocument()
    expect(screen.queryByText('Lincoln’s book')).not.toBeInTheDocument()
    // One timer and one generation throughout: no remount anywhere in this
    // sequence, which is what a lost session would look like.
    expect(fx.timerMounts).toBe(1)
    expect(fx.chatMounts).toBe(1)
  })
})
