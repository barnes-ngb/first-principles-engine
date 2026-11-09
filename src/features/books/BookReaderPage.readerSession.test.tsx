import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileContext } from '../../core/profile/context'
import { computeHoursSummary } from '../records/records.logic'
import type { HoursEntry } from '../../core/types'

/**
 * WHOSE reading a reading session is, and WHEN one session becomes another.
 *
 * The reproduced defect, in one sentence: a locked child profile can open a
 * **sibling-owned** contributor / Together book off his own shelf, and every
 * record the session wrote — the `hours` entry, the `BOOK_READ` XP, the diamonds
 * and the Share artifact's `childId` — was addressed to `book.childId`, the
 * OTHER boy, while the Share artifact's own words named the child who actually
 * read. Two halves of one record naming different children.
 *
 * And the minutes were counted twice. `BookReaderPage` mounts `useBook`, whose
 * unmount cleanup writes a *"(page editing)"* `hours` entry for the session's
 * elapsed minutes — correct for the editor it was written for, wrong for a
 * reader that edited nothing. So a two-minute read folded to FOUR counted
 * minutes through the canonical path (`computeHoursSummary`). The owner approved
 * suppressing exactly that second emission (2026-11-08).
 *
 * The second half of this file is the LIFECYCLE, which is where the first
 * candidate was wrong in the opposite direction: a reader captured once per
 * mount cannot survive the three things this host really does while mounted — a
 * route-parameter move to another book, a family change, and a locked-profile
 * change — and a capture that cannot move finalises against a document it no
 * longer describes, losing BOTH reads. One session per committed scope; the
 * original is finalised against its own snapshot; the replacement starts with
 * its own clock and none of the first one's state.
 *
 * Driven through the REAL page and the REAL `useBook` — Firestore and the two
 * central award writers are the only things stubbed — so the numbers asserted
 * here are the payloads the writers would actually receive, folded by the same
 * counting path the Records page uses (DATA-11).
 *
 * POSITIVE CONTROLS, both directions:
 *  - revert the ACTOR choice (address the writes to `book.childId` again) and
 *    every attribution assertion fails;
 *  - revert the reader HOURS mode (drop `suppressEditingHours` at the `useBook`
 *    call) and the counted-time assertions fail independently, because the fold
 *    goes back to four minutes for a two-minute read.
 */

// ── Hoisted, mutable mock state ──────────────────────────────────────────────

const m = vi.hoisted(() => {
  const ops: Array<{
    kind: string
    collection: string
    family: string
    data: Record<string, unknown>
  }> = []
  return {
    ops,
    /** Every word interaction, stamped with the child the hook was keyed to. */
    words: [] as string[],
    search: '',
    familyId: 'family-1',
    bookId: 'book-1' as string | undefined,
    /** `${familyId}|${bookId}` → the document, or absent for "no such book". */
    books: new Map<string, Record<string, unknown>>(),
    /** While set, `getDoc` parks until released — a book that has not landed. */
    parked: null as null | (() => void),
    identity: {
      isChildProfile: true,
      activeChild: undefined as undefined | { id: string; name: string; birthdate?: string },
      isLoading: false,
      loadFailed: false,
    },
    xp: vi.fn(),
    diamond: vi.fn(),
    sightWordProgress: vi.fn(),
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ bookId: m.bookId }),
  useSearchParams: () => [new URLSearchParams(m.search), vi.fn()],
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => m.familyId }))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: m.identity.activeChild,
    activeChildId: m.identity.activeChild?.id ?? '',
    children: m.identity.activeChild ? [m.identity.activeChild] : [],
    setActiveChildId: () => {},
    isChildProfile: m.identity.isChildProfile,
    isLoading: m.identity.isLoading,
    loadFailed: m.identity.loadFailed,
    addChild: () => {},
  }),
}))

// The word lane, keyed exactly as the real hook keys its documents
// (`sightWordProgress/{childId}_{word}`) so a write can be attributed.
vi.mock('./useSightWordProgress', () => ({
  useSightWordProgress: (familyId: string, childId: string) => {
    m.sightWordProgress(familyId, childId)
    return {
      progressMap: new Map(),
      recordInteraction: (word: string, action: string) => {
        m.words.push(`${childId}_${word}:${action}`)
        return Promise.resolve()
      },
    }
  },
}))

vi.mock('./useComprehensionQuestions', () => ({
  useComprehensionQuestions: () => ({
    questions: [],
    loading: false,
    error: null,
    generateQuestions: vi.fn(),
    reset: vi.fn(),
  }),
}))

// Firestore: every write records the collection AND the family it was addressed
// to, so a reading row, an editing row and a Share artifact are told apart — and
// so a row written for a session that began in another family can be seen to
// have gone to THAT family.
vi.mock('firebase/firestore', () => ({
  addDoc: (collection: { name: string; familyId: string }, data: Record<string, unknown>) => {
    m.ops.push({
      kind: 'addDoc',
      collection: collection?.name ?? '?',
      family: collection?.familyId ?? '?',
      data,
    })
    return Promise.resolve({ id: 'written' })
  },
  setDoc: (ref: { collection?: string; familyId?: string }, data: Record<string, unknown>) => {
    m.ops.push({
      kind: 'setDoc',
      collection: ref?.collection ?? '?',
      family: ref?.familyId ?? '?',
      data,
    })
    return Promise.resolve()
  },
  doc: (collection: { name: string; familyId: string }, id: string) => ({
    collection: collection?.name,
    familyId: collection?.familyId,
    id,
  }),
  getDoc: async (ref: { familyId: string; id: string }) => {
    if (m.parked) await new Promise<void>((done) => { m.parked = done })
    const found = m.books.get(`${ref.familyId}|${ref.id}`)
    return { id: ref.id, exists: () => !!found, data: () => found }
  },
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}))

vi.mock('../../core/firebase/firestore', () => ({
  artifactsCollection: (familyId: string) => ({ name: 'artifacts', familyId }),
  booksCollection: (familyId: string) => ({ name: 'books', familyId }),
  hoursCollection: (familyId: string) => ({ name: 'hours', familyId }),
  stripUndefined: (value: unknown) => value,
}))
vi.mock('../../core/firebase/storage', () => ({ storage: {} }))

vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: m.xp }))
vi.mock('../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: m.diamond }))

vi.mock('../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('./PrintSettingsDialog', () => ({ default: () => null }))

import BookReaderPage from './BookReaderPage'

// ── Synthetic family and books (no live family record is read or written) ─────

const LINCOLN = { id: 'child-lincoln', name: 'Lincoln', birthdate: '2015-09-30' }
const LONDON = { id: 'child-london', name: 'London', birthdate: '2020-02-20' }

function bookDoc(overrides?: Record<string, unknown>) {
  return {
    id: 'book-1',
    childId: LINCOLN.id,
    title: 'The Brave Dog',
    status: 'complete',
    totalMinutes: 7,
    coverImageUrl: 'https://img/cover.png',
    sightWords: ['the', 'dog'],
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        text: 'The dog ran.',
        images: [],
        sightWordsOnPage: ['the', 'dog'],
        layout: 'image-top',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    subjectBuckets: [],
    ...overrides,
  }
}

/** A Together book London owns and Lincoln contributed to — on BOTH shelves. */
function siblingOwnedBook(overrides?: Record<string, unknown>) {
  return bookDoc({
    childId: LONDON.id,
    isTogetherBook: true,
    contributorIds: [LINCOLN.id, LONDON.id],
    ...overrides,
  })
}

const putBook = (familyId: string, bookId: string, doc: Record<string, unknown>) =>
  m.books.set(`${familyId}|${bookId}`, { ...doc, id: bookId })

// ── Clock control ────────────────────────────────────────────────────────────
//
// The elapsed rule is UNCHANGED and is `Math.round(ms / 60000)`, then a
// rounded-minute floor of 1 — so 29s rounds to 0 and writes nothing, 30s and 45s
// both round to 1, and 90s rounds to 2. These tests pin that rule rather than
// assuming a truncating floor.

let clock = 0
const seconds = (n: number) => { clock += n * 1000 }
const minutes = (n: number) => { clock += n * 60_000 }

// ── Readers over what the writers were actually handed ───────────────────────

const rowsIn = (collection: string) =>
  m.ops.filter((op) => op.kind === 'addDoc' && op.collection === collection)
const hoursRows = () => rowsIn('hours').map((op) => op.data)
const hoursFamilies = () => rowsIn('hours').map((op) => op.family)
const artifactRows = () => rowsIn('artifacts').map((op) => op.data)
const bookMerges = () =>
  m.ops.filter((op) => op.kind === 'setDoc' && op.collection === 'books').map((op) => op.data)

/** The canonical counted minutes for one child (DATA-11, the Records fold). */
const countedMinutes = (childId: string) =>
  computeHoursSummary([], hoursRows() as unknown as HoursEntry[], [], childId).totalMinutes

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The REAL React `onClick` the given dot was rendered with, retained so it can
 * be invoked after the session it belongs to has ended — the stale-dispatch
 * probe. It reads the handler off the DOM node rather than re-querying, so this
 * really is the closure that render produced.
 */
function retainedOnClick(start: Element): () => void {
  let node: Element | null = start
  while (node) {
    const bag = node as unknown as Record<string, unknown>
    const key = Object.keys(bag).find((k) => k.startsWith('__reactProps$'))
    const props = key ? (bag[key] as { onClick?: () => void }) : undefined
    if (typeof props?.onClick === 'function') return props.onClick
    node = node.parentElement
  }
  throw new Error('no rendered React onClick found — this probe must hold a real handler')
}

function retainedDotHandler(index: number): () => void {
  const dots = screen.getAllByRole('button', { name: /go to page/i })
  return retainedOnClick(dots[index])
}

/** The Web Speech API the word chips use. Absent from jsdom. */
function stubSpeech() {
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: class {
      rate = 1
      // An explicit field + assignment, not a parameter property: the latter
      // emits runtime code and `erasableSyntaxOnly` rejects it (TS1294).
      text: string
      constructor(text: string) {
        this.text = text
      }
    },
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'speechSynthesis', {
    value: { speak: () => {}, cancel: () => {} },
    configurable: true,
    writable: true,
  })
}

/** Tap a sight word and choose "Hear it" — the real help interaction. */
function tapWordForHelp(word: string) {
  fireEvent.click(screen.getByText(word))
  fireEvent.click(screen.getByRole('button', { name: /Hear it/ }))
}

type TouchPhase = 'touchstart' | 'touchmove' | 'touchend'
type SwipeHandlers = Record<TouchPhase, (event: unknown) => void>

const TOUCH_PROP: Record<TouchPhase, string> = {
  touchstart: 'onTouchStart',
  touchmove: 'onTouchMove',
  touchend: 'onTouchEnd',
}

/**
 * The CURRENT rendered swipe surface's handlers, re-found on every call.
 *
 * The companion of `retainedOnClick` and its opposite: a gesture delivered here
 * goes through the handler the screen the person is looking at really has, not
 * one retained from a session that has ended. That is the whole point of the
 * pending-gesture case — the live handler IS admitted, and what it measured the
 * finger-up against is the question at issue.
 */
function swipeHandlers(): SwipeHandlers {
  const found: SwipeHandlers[] = []
  for (const node of Array.from(document.querySelectorAll('*'))) {
    const bag = node as unknown as Record<string, unknown>
    const key = Object.keys(bag).find((k) => k.startsWith('__reactProps$'))
    const props = key ? (bag[key] as Record<string, unknown>) : undefined
    if (!props) continue
    if (!Object.values(TOUCH_PROP).every((prop) => typeof props[prop] === 'function')) continue
    // MUI's `ButtonBase` carries all three touch props for its ripple, and the
    // back-arrow button renders BEFORE the page area — so "the first node with
    // touch handlers" is a button, which is how a probe silently stops driving
    // the gesture it claims to drive. The reader's swipe surface is the one that
    // is not a control: no pointer or click handling of its own.
    if (typeof props.onMouseDown === 'function' || typeof props.onClick === 'function') continue
    found.push({
      touchstart: props.onTouchStart as (event: unknown) => void,
      touchmove: props.onTouchMove as (event: unknown) => void,
      touchend: props.onTouchEnd as (event: unknown) => void,
    })
  }
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one rendered swipe surface, found ${found.length} — this probe must drive the real gesture`,
    )
  }
  return found[0]
}

/**
 * One phase of a real gesture, through the handler the CURRENT screen has.
 *
 * jsdom has no constructible `TouchEvent` and a hand-rolled DOM event does not
 * survive React's touch delegation, so the probe invokes the rendered props the
 * way `retainedOnClick` invokes a rendered `onClick` — re-read from the live DOM
 * each phase, inside `act`, so every state update it causes is committed before
 * the next assertion. `touchend` carries an empty `touches` like the real event:
 * the finger is up, and `changedTouches` is where it left.
 */
function touch(phase: TouchPhase, clientX: number) {
  const handlers = swipeHandlers()
  const point = { clientX, clientY: 0 }
  const event =
    phase === 'touchend'
      ? { touches: [], targetTouches: [], changedTouches: [point] }
      : { touches: [point], targetTouches: [point], changedTouches: [point] }
  act(() => {
    handlers[phase](event)
  })
}

/** Jump to a page via the accessible dot indicators. */
function goToPage(index: number) {
  const dots = screen.getAllByRole('button', { name: /go to page/i })
  fireEvent.click(dots[index])
}
function goToBackCover() {
  const dots = screen.getAllByRole('button', { name: /go to page/i })
  fireEvent.click(dots[dots.length - 1])
}

/** The title of whichever book is currently expected on screen. */
async function waitForBook(title: RegExp) {
  await waitFor(() => expect(screen.getAllByText(title).length).toBeGreaterThan(0))
}

async function openReader(title: RegExp = /Brave Dog/) {
  const view = render(<BookReaderPage />)
  await waitForBook(title)
  return view
}

beforeEach(() => {
  clock = Date.parse('2026-11-08T15:00:00.000Z')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  m.ops.length = 0
  m.words.length = 0
  m.search = ''
  m.familyId = 'family-1'
  m.bookId = 'book-1'
  m.books = new Map()
  putBook('family-1', 'book-1', bookDoc())
  m.parked = null
  m.identity = { isChildProfile: true, activeChild: LINCOLN, isLoading: false, loadFailed: false }
  m.xp.mockReset()
  m.xp.mockResolvedValue(0)
  m.diamond.mockReset()
  m.diamond.mockResolvedValue(undefined)
  m.sightWordProgress.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance')
  Reflect.deleteProperty(globalThis, 'speechSynthesis')
})

describe('BookReaderPage — the reader of record (child profile)', () => {
  it('credits a sibling-owned contributor book to the child who actually read it, once', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount } = await openReader()
    goToBackCover()
    minutes(2)
    unmount()

    // ONE reading row, and it belongs to the reader — not to the book's owner.
    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({
      childId: LINCOLN.id,
      minutes: 2,
      subjectBucket: 'LanguageArts',
      date: today(),
    })
    expect(String(hoursRows()[0].notes)).toContain('completed')
    expect(String(hoursRows()[0].notes)).not.toContain('page editing')

    // The canonical fold: two real minutes for the reader, nothing for his brother.
    expect(countedMinutes(LINCOLN.id)).toBe(2)
    expect(countedMinutes(LONDON.id)).toBe(0)

    // The Share artifact's id and its words name the SAME child.
    expect(artifactRows()).toHaveLength(1)
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
    expect(String(artifactRows()[0].content)).toContain('Lincoln read "The Brave Dog"')

    // The two central award writers, amounts and dedup keys unchanged.
    expect(m.xp).toHaveBeenCalledTimes(1)
    expect(m.xp.mock.calls[0].slice(0, 5)).toEqual([
      'family-1',
      LINCOLN.id,
      'BOOK_READ',
      15,
      `book_book-1_${today()}`,
    ])
    expect(m.diamond).toHaveBeenCalledTimes(1)
    expect(m.diamond.mock.calls[0][0]).toMatchObject({
      familyId: 'family-1',
      childId: LINCOLN.id,
      amount: 3,
    })

    // Word interactions already agreed with the child reader; they still do.
    expect(m.sightWordProgress).toHaveBeenCalledWith('family-1', LINCOLN.id)
  })

  it('counts an own-shelf above-floor read exactly once (no second editing entry)', async () => {
    const { unmount } = await openReader()
    goToBackCover()
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(countedMinutes(LINCOLN.id)).toBe(2)
    // The legacy book-owned cumulative total still accumulates, in both modes.
    expect(bookMerges().some((d) => d.totalMinutes === 9)).toBe(true)
  })

  it('keeps the unchanged rounding rule: 29s writes nothing, 30s and 45s are one minute, 90s is two', async () => {
    const below = await openReader()
    goToBackCover()
    seconds(29)
    below.unmount()
    expect(hoursRows()).toHaveLength(0)

    m.ops.length = 0
    const half = await openReader()
    goToBackCover()
    seconds(30)
    half.unmount()
    expect(hoursRows()[0]).toMatchObject({ minutes: 1 })

    m.ops.length = 0
    const threeQuarters = await openReader()
    goToBackCover()
    seconds(45)
    threeQuarters.unmount()
    expect(hoursRows()[0]).toMatchObject({ minutes: 1 })

    m.ops.length = 0
    const long = await openReader()
    goToBackCover()
    seconds(90)
    long.unmount()
    expect(hoursRows()[0]).toMatchObject({ minutes: 2 })
  })

  it('below the rounded-minute floor: a PARTIAL read writes nothing, a COMPLETED one writes only the Share artifact', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    const partial = await openReader()
    seconds(29)
    partial.unmount()

    expect(hoursRows()).toHaveLength(0)
    expect(artifactRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
    expect(m.diamond).not.toHaveBeenCalled()
    expect(bookMerges()).toHaveLength(0)

    m.ops.length = 0
    const completed = await openReader()
    goToBackCover()
    seconds(29)
    completed.unmount()

    expect(artifactRows()).toHaveLength(1)
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
    expect(hoursRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
    expect(m.diamond).not.toHaveBeenCalled()
  })

  it('stamps the Story Call audience on the reader’s own records', async () => {
    m.search = 'call=1'
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount } = await openReader()
    goToBackCover()
    fireEvent.click(screen.getByText('Mimi'))
    fireEvent.click(screen.getByText('Papa')) // a corrected tap still wins
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(String(hoursRows()[0].notes)).toContain('Story Call — read to Papa')
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
    expect(String(artifactRows()[0].content)).toContain('Lincoln read')
    expect(String(artifactRows()[0].content)).toContain('Read aloud to Papa on a video call')
  })

  it('survives the StrictMode mount rehearsal that the app really runs under', async () => {
    // `main.tsx` wraps the app in `StrictMode`, which in development tears an
    // effect down and sets it up again on the initial mount. A once-only flag
    // spent by that rehearsal would leave a real read writing nothing at all.
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount } = render(
      <StrictMode>
        <BookReaderPage />
      </StrictMode>,
    )
    await waitForBook(/Brave Dog/)
    goToBackCover()
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(artifactRows()).toHaveLength(1)
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
    expect(m.xp).toHaveBeenCalledTimes(1)
    expect(m.diamond).toHaveBeenCalledTimes(1)
  })

  it('gives a second real session its own minutes under the same daily dedup key', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    const first = await openReader()
    goToBackCover()
    minutes(2)
    first.unmount()

    const second = await openReader()
    goToBackCover()
    minutes(3)
    second.unmount()

    expect(hoursRows()).toHaveLength(2)
    expect(hoursRows().every((row) => row.childId === LINCOLN.id)).toBe(true)
    expect(countedMinutes(LINCOLN.id)).toBe(5)
    expect(countedMinutes(LONDON.id)).toBe(0)

    // Per-child-per-book-per-day dedup stays the WRITER's job, unchanged: the
    // reader asks twice with the same key and the ledger refuses the second.
    const key = `book_book-1_${today()}`
    expect(m.xp.mock.calls.map((call) => call[4])).toEqual([key, key])
    expect(m.xp.mock.calls.every((call) => call[1] === LINCOLN.id)).toBe(true)
  })
})

describe('BookReaderPage — an actor that is not resolved is not guessed', () => {
  it('writes nothing while the child read has not settled', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    m.identity = { isChildProfile: true, activeChild: undefined, isLoading: true, loadFailed: false }
    const { unmount } = await openReader()
    goToBackCover()
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(0)
    expect(artifactRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
    expect(m.diamond).not.toHaveBeenCalled()
  })

  it('writes nothing when the child read FAILED — a failure is not an identity', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    m.identity = { isChildProfile: true, activeChild: undefined, isLoading: true, loadFailed: true }
    const { unmount } = await openReader()
    goToBackCover()
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
  })

  it('credits the whole session once a DELAYED actor resolves mid-read', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    m.identity = { isChildProfile: true, activeChild: undefined, isLoading: true, loadFailed: false }
    const { unmount, rerender } = await openReader()
    minutes(1)
    m.identity = { isChildProfile: true, activeChild: LINCOLN, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    goToBackCover()
    minutes(1)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    // The clock is NOT restarted because data settled: the session is two
    // minutes long, not the one minute since the actor landed.
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
  })

  it('drops the abandoned clock when the profile changes before either reader resolves', async () => {
    const renderReader = (profile: 'lincoln' | 'london') => (
      <ProfileContext.Provider value={{
        profile, themeMode: 'family', canEdit: false,
        selectProfile: vi.fn(), setThemeMode: vi.fn(), logout: vi.fn(),
      }}>
        <BookReaderPage />
      </ProfileContext.Provider>
    )
    m.identity = { isChildProfile: true, activeChild: undefined, isLoading: true, loadFailed: false }
    const { rerender, unmount } = render(renderReader('lincoln'))
    await waitForBook(/Brave Dog/)
    minutes(2)

    rerender(renderReader('london'))
    minutes(1)
    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(renderReader('london'))
    goToBackCover()
    minutes(1)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LONDON.id, minutes: 2 })
    expect(countedMinutes(LINCOLN.id)).toBe(0)
    expect(countedMinutes(LONDON.id)).toBe(2)
  })

  it('credits the whole session once a DELAYED book resolves mid-read', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    m.parked = () => {}
    const { unmount } = render(<BookReaderPage />)
    minutes(1)
    const release = m.parked
    m.parked = null
    release?.()
    await waitForBook(/Brave Dog/)
    goToBackCover()
    minutes(1)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
  })

  it('writes nothing at all when the book never resolves', async () => {
    m.books = new Map()
    const { unmount } = render(<BookReaderPage />)
    await waitFor(() => expect(screen.getByText(/Book not found/)).toBeInTheDocument())
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(0)
    expect(artifactRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
  })
})

describe('BookReaderPage — one session per committed scope', () => {
  it('finalises the first book and records the replacement when the route moves to another book', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    putBook('family-1', 'book-2', siblingOwnedBook({ title: 'The Second Book', totalMinutes: 0 }))
    const { unmount, rerender } = await openReader()
    goToBackCover()
    minutes(2)

    // A route-parameter navigation to another book's reader, host still mounted.
    m.bookId = 'book-2'
    rerender(<BookReaderPage />)
    await waitForBook(/Second Book/)
    goToBackCover()
    minutes(2)
    unmount()

    // BOTH reads are recorded, each against its own book, for the real reader.
    expect(hoursRows()).toHaveLength(2)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(String(hoursRows()[0].notes)).toContain('The Brave Dog')
    expect(hoursRows()[1]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(String(hoursRows()[1].notes)).toContain('The Second Book')
    expect(countedMinutes(LINCOLN.id)).toBe(4)

    // Each session's awards name its own book; neither is redirected.
    expect(m.xp.mock.calls.map((call) => call[4])).toEqual([
      `book_book-1_${today()}`,
      `book_book-2_${today()}`,
    ])
    // Two Share artifacts, one per completed book, both for the reader.
    expect(artifactRows()).toHaveLength(2)
    expect(artifactRows().every((row) => row.childId === LINCOLN.id)).toBe(true)
    expect(String(artifactRows()[1].content)).toContain('The Second Book')
  })

  it('keeps a finished session addressed to the family it was read in', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    putBook('family-2', 'book-1', siblingOwnedBook({ title: 'A Second Household Book' }))
    const { unmount, rerender } = await openReader()
    goToBackCover()
    minutes(2)

    m.familyId = 'family-2'
    rerender(<BookReaderPage />)
    await waitForBook(/Second Household/)
    goToBackCover()
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(2)
    // The first read stays in the household it happened in; it is not
    // redirected, and not merged with the replacement's state.
    expect(hoursFamilies()).toEqual(['family-1', 'family-2'])
    expect(String(hoursRows()[0].notes)).toContain('The Brave Dog')
    expect(String(hoursRows()[1].notes)).toContain('A Second Household Book')
    expect(m.xp.mock.calls.map((call) => call[0])).toEqual(['family-1', 'family-2'])
    expect(m.xp.mock.calls.every((call) => call[1] === LINCOLN.id)).toBe(true)
  })

  it('ends the first reader’s session and starts the replacement’s on a committed child change', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount, rerender } = await openReader()
    // A content page, so the word lane actually records something.
    goToPage(2)
    minutes(2)
    expect(m.words.some((w) => w.startsWith(`${LINCOLN.id}_the`))).toBe(true)
    expect(m.words.some((w) => w.startsWith(`${LONDON.id}_`))).toBe(false)

    // The locked profile really changes — a committed scope change.
    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    minutes(2)
    unmount()

    // Two sessions, two rows, each naming the child who read it.
    expect(hoursRows()).toHaveLength(2)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(hoursRows()[1]).toMatchObject({ childId: LONDON.id, minutes: 2 })
    expect(countedMinutes(LINCOLN.id)).toBe(2)
    expect(countedMinutes(LONDON.id)).toBe(2)

    // The word lane moved with the session boundary, not independently of it:
    // every word write names the child whose session was running at the time.
    expect(m.words.some((w) => w.startsWith(`${LONDON.id}_the`))).toBe(true)
    expect(m.sightWordProgress).toHaveBeenCalledWith('family-1', LINCOLN.id)
    expect(m.sightWordProgress).toHaveBeenCalledWith('family-1', LONDON.id)

    // Neither session completed (no back cover), so neither claims a Share.
    expect(artifactRows()).toHaveLength(0)
  })

  it('treats A → B → A as three sessions, not one eternal mounted one', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount, rerender } = await openReader()
    minutes(1)
    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    minutes(1)
    m.identity = { isChildProfile: true, activeChild: LINCOLN, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    minutes(1)
    unmount()

    expect(hoursRows().map((row) => [row.childId, row.minutes])).toEqual([
      [LINCOLN.id, 1],
      [LONDON.id, 1],
      [LINCOLN.id, 1],
    ])
    // The third session is its own session and asks for its own award; the
    // per-child daily dedup key is unchanged, so the ledger — not the reader —
    // is what refuses the repeat.
    expect(m.xp).toHaveBeenCalledTimes(3)
    expect(m.xp.mock.calls.map((call) => call[4])).toEqual(
      new Array(3).fill(`book_book-1_${today()}`),
    )
  })

  it('does not let a replacement session inherit the previous one’s completion or audience', async () => {
    m.search = 'call=1'
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount, rerender } = await openReader()
    goToBackCover()
    fireEvent.click(screen.getByText('Mimi'))
    minutes(2)

    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    minutes(2)
    unmount()

    // Lincoln's session completed and was read to Mimi; London's did neither —
    // he never left the back cover he inherited the view of.
    expect(artifactRows()).toHaveLength(1)
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
    expect(String(artifactRows()[0].content)).toContain('Read aloud to Mimi')

    const londonRow = hoursRows().find((row) => row.childId === LONDON.id)
    expect(londonRow).toBeDefined()
    expect(String(londonRow?.notes)).not.toContain('completed')
    expect(String(londonRow?.notes)).not.toContain('Mimi')
  })

  it('does not let a replacement session complete a swipe the previous reader began', async () => {
    // The phone sequence, exactly: Lincoln puts a finger down on a content page
    // and drags; the profile is committed to London on the same book; the finger
    // comes up on the CURRENT screen. The handler that receives it is London's
    // own and really is live, so no incarnation fence can refuse it — the
    // gesture itself is the thing that does not belong to his session.
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount, rerender } = await openReader()
    goToPage(2)
    touch('touchstart', 300)
    touch('touchmove', 200)
    minutes(2)

    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)

    // Past the 50px threshold, and far enough to be a page turn if it counted.
    touch('touchend', 100)

    // It did not: London is still on the content page he arrived on, and no
    // completion artifact exists for a read he has not finished.
    expect(screen.queryByText('Great reading!')).toBeNull()
    expect(artifactRows()).toHaveLength(0)

    // And the replacement's OWN gesture works, start to finish — the pending
    // one was dropped, not the swipe lane.
    touch('touchstart', 300)
    touch('touchmove', 150)
    touch('touchend', 100)
    expect(screen.getByText('Great reading!')).toBeTruthy()
    await waitFor(() => expect(artifactRows()).toHaveLength(1))
    expect(artifactRows()[0]).toMatchObject({ childId: LONDON.id })
    expect(String(artifactRows()[0].content)).toContain('The Brave Dog')

    minutes(2)
    unmount()

    // Two sessions, each with its own minutes; only London's completed, and the
    // completion came from his own swipe.
    expect(hoursRows().map((row) => [row.childId, row.minutes])).toEqual([
      [LINCOLN.id, 2],
      [LONDON.id, 2],
    ])
    expect(String(hoursRows()[0].notes)).not.toContain('completed')
    expect(String(hoursRows()[1].notes)).toContain('completed')
    expect(artifactRows()).toHaveLength(1)
  })
})

describe('BookReaderPage — a handler from a session that has ended cannot act', () => {
  /**
   * The stale-dispatch probe, run for each of the three committed transitions.
   *
   * An incarnation counter on its own does not fence DISPATCH: the retained
   * handler still runs, and what it does — move to the back cover — is what
   * creates a completion Share. So the handler carries the session it was
   * rendered under and is refused at the tap, while the live handler on the
   * screen the person is actually looking at still works.
   */
  const probeStaleDispatch = async (move: () => void, back: () => void, awayTitle: RegExp) => {
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount, rerender } = await openReader()
    // Retained from the FIRST A, while still on the cover.
    const staleLastPage = retainedDotHandler(3)
    minutes(2)

    move()
    rerender(<BookReaderPage />)
    await waitForBook(awayTitle)
    minutes(2)

    back()
    rerender(<BookReaderPage />)
    await waitForBook(/Brave Dog/)
    const artifactsBefore = artifactRows().length

    // The obsolete handler fires in the returned-A session.
    staleLastPage()
    expect(artifactRows()).toHaveLength(artifactsBefore)

    // The live control on the current screen still completes the read.
    goToBackCover()
    expect(artifactRows()).toHaveLength(artifactsBefore + 1)
    expect(artifactRows()[artifactsBefore]).toMatchObject({ childId: LINCOLN.id })
    expect(String(artifactRows()[artifactsBefore].content)).toContain('The Brave Dog')
    unmount()
  }

  it('refuses a retained last-page handler after a book move and back', async () => {
    putBook('family-1', 'book-2', siblingOwnedBook({ title: 'The Second Book' }))
    await probeStaleDispatch(
      () => { m.bookId = 'book-2' },
      () => { m.bookId = 'book-1' },
      /Second Book/,
    )
  })

  it('refuses a retained last-page handler after a family move and back', async () => {
    putBook('family-2', 'book-1', siblingOwnedBook({ title: 'A Second Household Book' }))
    await probeStaleDispatch(
      () => { m.familyId = 'family-2' },
      () => { m.familyId = 'family-1' },
      /Second Household/,
    )
  })

  it('refuses a retained last-page handler after a profile move and back', async () => {
    await probeStaleDispatch(
      () => {
        m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
      },
      () => {
        m.identity = { isChildProfile: true, activeChild: LINCOLN, isLoading: false, loadFailed: false }
      },
      /Brave Dog/,
    )
  })

  it('refuses an audience chip retained from a session that has ended', async () => {
    m.search = 'call=1'
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount, rerender } = await openReader()
    goToBackCover()
    const staleMimi = retainedOnClick(screen.getByText('Mimi'))
    minutes(2)

    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    staleMimi()
    minutes(2)
    unmount()

    // Lincoln's completed session has no audience (the chip was never tapped
    // while it was live), and London's session was not stamped by it either.
    expect(artifactRows()).toHaveLength(1)
    expect(String(artifactRows()[0].content)).not.toContain('Mimi')
    expect(hoursRows().every((row) => !String(row.notes).includes('Mimi'))).toBe(true)
  })
})

describe('BookReaderPage — a replacement document must prove it loaded', () => {
  it('writes the original family’s read once, and nothing at all for a replacement that never answers', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook({ title: 'Together synthetic story' }))
    putBook('family-2', 'book-1', siblingOwnedBook({ title: 'Unanswered replacement-family book' }))
    const { unmount, rerender } = await openReader(/Together synthetic story/)
    minutes(2)

    // The new family's document read is HELD, so the only book in hand on the
    // first render of the new scope is the previous family's.
    m.parked = () => {}
    m.familyId = 'family-2'
    rerender(<BookReaderPage />)
    minutes(2)
    unmount()

    // The original session ended AT the boundary: two minutes, not four.
    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(hoursFamilies()).toEqual(['family-1'])
    expect(String(hoursRows()[0].notes)).toContain('Together synthetic story')
    expect(m.xp).toHaveBeenCalledTimes(1)
    expect(m.xp.mock.calls[0][0]).toBe('family-1')

    // The late answer arrives after the reader is gone and changes nothing. In
    // particular no row ever carried the previous family's title under the new
    // family, which is what a matching book id alone allowed.
    const release = m.parked
    m.parked = null
    release?.()
    await waitFor(() => expect(hoursRows()).toHaveLength(1))
    expect(hoursRows().some((row) => String(row.notes).includes('Unanswered'))).toBe(false)
    expect(m.xp).toHaveBeenCalledTimes(1)
  })

  it('records the replacement normally once its own document really lands', async () => {
    putBook('family-1', 'book-1', siblingOwnedBook({ title: 'Together synthetic story' }))
    putBook('family-2', 'book-1', siblingOwnedBook({ title: 'Replacement family book' }))
    const { unmount, rerender } = await openReader(/Together synthetic story/)
    minutes(2)

    m.parked = () => {}
    m.familyId = 'family-2'
    rerender(<BookReaderPage />)
    minutes(2)
    const release = m.parked
    m.parked = null
    release?.()
    await waitForBook(/Replacement family book/)
    goToBackCover()
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(2)
    expect(hoursFamilies()).toEqual(['family-1', 'family-2'])
    // The first read is exactly its own two minutes — it ended at the boundary
    // and did not keep running through the replacement's load.
    expect(hoursRows()[0]).toMatchObject({ minutes: 2 })
    // The replacement's clock starts AT the boundary, so the two minutes its own
    // document took to answer belong to it, exactly as the wait for the first
    // document belongs to the session the route opened. It inherits none of the
    // first session's elapsed: 2 waiting + 2 reading, not 2 + 2 + 2.
    expect(hoursRows()[1]).toMatchObject({ childId: LINCOLN.id, minutes: 4 })
    expect(String(hoursRows()[1].notes)).toContain('Replacement family book')
  })
})

describe('BookReaderPage — a pending reader owns no words', () => {
  it('refuses word writes while a committed child replacement is unresolved, then allows the resolved one', async () => {
    stubSpeech()
    putBook('family-1', 'book-1', siblingOwnedBook())
    const { unmount, rerender } = await openReader()
    goToPage(2)
    tapWordForHelp('The')
    minutes(2)

    expect(m.words).toContain(`${LINCOLN.id}_the:help`)

    // The profile and the selected child have really moved, and the whole child
    // object is already in hand — but the children read says nothing yet.
    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: true, loadFailed: false }
    rerender(<BookReaderPage />)
    tapWordForHelp('The')

    // Nothing is written for either boy: the selector moved, the reader did not.
    expect(m.words.some((w) => w.startsWith(`${LONDON.id}_`))).toBe(false)
    // And Lincoln's own session ended at that boundary, with its real minutes.
    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })

    // Resolved: the replacement reader owns his own words and his own read.
    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    tapWordForHelp('The')
    minutes(2)
    unmount()

    expect(m.words).toContain(`${LONDON.id}_the:help`)
    expect(hoursRows()).toHaveLength(2)
    expect(hoursRows()[1]).toMatchObject({ childId: LONDON.id, minutes: 2 })
  })

  it('refuses the whole record-producing boundary when the child read has FAILED', async () => {
    stubSpeech()
    putBook('family-1', 'book-1', siblingOwnedBook())
    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: true, loadFailed: true }
    const { unmount } = await openReader()
    // A failed read is not an affirmative identity, so no dispatch is admitted:
    // the pagination that would complete a read does not even move, which is why
    // the content page's words never appear and nothing is written for anyone.
    goToPage(2)
    expect(screen.queryByText('The')).not.toBeInTheDocument()
    minutes(2)
    unmount()

    expect(m.words).toHaveLength(0)
    expect(hoursRows()).toHaveLength(0)
    expect(artifactRows()).toHaveLength(0)
  })

  it('keeps a parent’s legacy word lane, which does not wait on the child read', async () => {
    stubSpeech()
    putBook('family-1', 'book-1', siblingOwnedBook())
    m.identity = { isChildProfile: false, activeChild: LONDON, isLoading: true, loadFailed: false }
    const { unmount } = await openReader()
    goToPage(2)
    tapWordForHelp('The')
    minutes(2)
    unmount()

    // Legacy and deferred: the parent's word write is the live selected child's,
    // and a known book owner's session is not gated on the child list.
    expect(m.words).toContain(`${LONDON.id}_the:help`)
    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LONDON.id, minutes: 2 })
  })
})

describe('BookReaderPage — a parent reader keeps the legacy book-owner record', () => {
  it('addresses the records to the book’s own child, and still counts the read once', async () => {
    putBook('family-1', 'book-1', bookDoc({ childId: LINCOLN.id }))
    m.identity = { isChildProfile: false, activeChild: LONDON, isLoading: false, loadFailed: false }
    const { unmount } = await openReader()
    goToBackCover()
    minutes(2)
    unmount()

    // FEAT-95's parent-participant question is deferred: ownership is the
    // book's, exactly as before — NOT the selected child's.
    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
    // The deferred question, pinned as it stands rather than answered: the
    // artifact's words still name the selected profile's child.
    expect(String(artifactRows()[0].content)).toContain('London read "The Brave Dog"')
    expect(countedMinutes(LINCOLN.id)).toBe(2)
    expect(countedMinutes(LONDON.id)).toBe(0)
    expect(m.xp.mock.calls[0][1]).toBe(LINCOLN.id)
  })

  it('does not wait on the child list: a KNOWN book owner is already the answer', async () => {
    // The book is loaded and its owner is a sibling of the selected child; the
    // children read has not come back at all. A parent's own reading was being
    // dropped entirely while this unrelated read was in flight.
    putBook('family-1', 'book-1', siblingOwnedBook())
    m.identity = { isChildProfile: false, activeChild: undefined, isLoading: true, loadFailed: false }
    const { unmount } = await openReader()
    goToBackCover()
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LONDON.id, minutes: 2 })
    expect(artifactRows()[0]).toMatchObject({ childId: LONDON.id })
    expect(m.xp.mock.calls[0][1]).toBe(LONDON.id)
  })

  it('does not end a parent’s session when the selected child changes', async () => {
    putBook('family-1', 'book-1', bookDoc({ childId: LINCOLN.id }))
    m.identity = { isChildProfile: false, activeChild: LONDON, isLoading: false, loadFailed: false }
    const { unmount, rerender } = await openReader()
    minutes(1)
    m.identity = { isChildProfile: false, activeChild: LINCOLN, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    minutes(1)
    unmount()

    // One session, two minutes, the book's owner — the selected child is not
    // part of a book-owner session's scope.
    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
  })
})
