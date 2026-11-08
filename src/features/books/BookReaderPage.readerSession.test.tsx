import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeHoursSummary } from '../records/records.logic'
import type { HoursEntry } from '../../core/types'

/**
 * WHOSE reading a reading session is (reader-session integrity).
 *
 * The reproduced defect, in one sentence: a locked child profile can open a
 * **sibling-owned** contributor / Together book off his own shelf, and every
 * record the session writes — the `hours` entry, the `BOOK_READ` XP, the
 * diamonds and the Share artifact's `childId` — was addressed to
 * `book.childId`, the OTHER boy, while the Share artifact's own words named the
 * child who actually read. Two true halves of one record disagreeing.
 *
 * And the minutes were counted twice. `BookReaderPage` mounts `useBook`, whose
 * unmount cleanup writes a *"(page editing)"* `hours` entry for the session's
 * elapsed minutes — correct for the editor it was written for, wrong for a
 * reader that edited nothing. So a two-minute read folded to FOUR counted
 * minutes through the canonical path (`computeHoursSummary`). The owner
 * approved suppressing exactly that second emission (2026-11-08).
 *
 * These tests drive the REAL `useBook` through the REAL page — Firestore and
 * the two central award writers are the only things stubbed — so the numbers
 * asserted here are the payloads the writers would actually receive, folded by
 * the same counting path the Records page uses (DATA-11).
 *
 * POSITIVE CONTROLS, both directions:
 *  - revert the ACTOR choice (address the writes to `book.childId` again) and
 *    every attribution assertion below fails;
 *  - revert the reader HOURS mode (drop `suppressEditingHours` at the `useBook`
 *    call) and the counted-time assertions fail independently of the first,
 *    because the fold goes back to four minutes for a two-minute read.
 */

// ── Hoisted, mutable mock state ──────────────────────────────────────────────

const m = vi.hoisted(() => {
  const ops: Array<{ kind: string; collection: string; data: Record<string, unknown> }> = []
  return {
    ops,
    search: '',
    /** The `books/{bookId}` document the reader opens, and how it answers. */
    book: null as Record<string, unknown> | null,
    /** When set, `getDoc` waits for this to be released before answering. */
    pendingBook: null as null | { release: () => void },
    identity: {
      isChildProfile: true,
      activeChild: undefined as undefined | { id: string; name: string; birthdate?: string },
      isLoading: false,
      loadFailed: false,
    },
    addDoc: vi.fn(),
    setDoc: vi.fn(),
    getDoc: vi.fn(),
    xp: vi.fn(),
    diamond: vi.fn(),
    sightWordProgress: vi.fn(),
    recordInteraction: vi.fn(),
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ bookId: 'book-1' }),
  useSearchParams: () => [new URLSearchParams(m.search), vi.fn()],
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

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

vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: (...args: unknown[]) => {
    m.sightWordProgress(...args)
    return { progressMap: new Map(), recordInteraction: m.recordInteraction }
  },
}))

vi.mock('../useComprehensionQuestions', () => ({
  useComprehensionQuestions: () => ({
    questions: [],
    loading: false,
    error: null,
    generateQuestions: vi.fn(),
    reset: vi.fn(),
  }),
}))

// Firestore: every write is recorded with the collection it was addressed to, so
// a reading-hours row, an editing-hours row and a Share artifact are told apart.
vi.mock('firebase/firestore', () => ({
  addDoc: (collection: { name: string }, data: Record<string, unknown>) => {
    m.ops.push({ kind: 'addDoc', collection: collection?.name ?? '?', data })
    m.addDoc(collection, data)
    return Promise.resolve({ id: 'written' })
  },
  setDoc: (ref: { collection?: string }, data: Record<string, unknown>) => {
    m.ops.push({ kind: 'setDoc', collection: ref?.collection ?? '?', data })
    m.setDoc(ref, data)
    return Promise.resolve()
  },
  doc: (collection: { name: string }, id: string) => ({ collection: collection?.name, id }),
  getDoc: (...args: unknown[]) => m.getDoc(...args),
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
  artifactsCollection: () => ({ name: 'artifacts' }),
  booksCollection: () => ({ name: 'books' }),
  hoursCollection: () => ({ name: 'hours' }),
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
function siblingOwnedBook() {
  return bookDoc({
    childId: LONDON.id,
    isTogetherBook: true,
    contributorIds: [LINCOLN.id, LONDON.id],
  })
}

// ── Clock control (the elapsed-minutes floor and rounding are unchanged) ─────

let clock = 0
const minutes = (n: number) => { clock += n * 60_000 }

// ── Readers over what the writers were actually handed ───────────────────────

const hoursRows = () =>
  m.ops.filter((op) => op.kind === 'addDoc' && op.collection === 'hours').map((op) => op.data)
const artifactRows = () =>
  m.ops.filter((op) => op.kind === 'addDoc' && op.collection === 'artifacts').map((op) => op.data)
const bookMerges = () =>
  m.ops.filter((op) => op.kind === 'setDoc' && op.collection === 'books').map((op) => op.data)

/** The canonical counted minutes for one child (DATA-11, the Records fold). */
const countedMinutes = (childId: string) =>
  computeHoursSummary([], hoursRows() as unknown as HoursEntry[], [], childId).totalMinutes

/** Jump to the last page (back cover) via the accessible dot indicators. */
function goToBackCover() {
  const dots = screen.getAllByRole('button', { name: /go to page/i })
  fireEvent.click(dots[dots.length - 1])
}

async function openReader() {
  const view = render(<BookReaderPage />)
  if (m.book) await waitFor(() => expect(screen.getAllByText(/Brave Dog/).length).toBeGreaterThan(0))
  return view
}

beforeEach(() => {
  clock = Date.parse('2026-11-08T15:00:00.000Z')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  m.ops.length = 0
  m.search = ''
  m.book = bookDoc()
  m.pendingBook = null
  m.identity = { isChildProfile: true, activeChild: LINCOLN, isLoading: false, loadFailed: false }
  m.addDoc.mockClear()
  m.setDoc.mockClear()
  m.xp.mockReset()
  m.xp.mockResolvedValue(0)
  m.diamond.mockReset()
  m.diamond.mockResolvedValue(undefined)
  m.sightWordProgress.mockClear()
  m.recordInteraction.mockClear()
  m.getDoc.mockImplementation(async () => {
    if (m.pendingBook) await new Promise<void>((done) => { m.pendingBook = { release: done } })
    return { id: 'book-1', exists: () => m.book !== null, data: () => m.book }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BookReaderPage — the reader of record (child profile)', () => {
  it('credits a sibling-owned contributor book to the child who actually read it, once', async () => {
    m.book = siblingOwnedBook()
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
      `book_book-1_${new Date().toISOString().slice(0, 10)}`,
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

  it('writes nothing below the one-minute floor for a PARTIAL read, and the Share artifact only for a completed one', async () => {
    // Partial, below floor: no hours, no awards, no Share artifact.
    m.book = siblingOwnedBook()
    const partial = await openReader()
    clock += 30_000
    partial.unmount()

    expect(hoursRows()).toHaveLength(0)
    expect(artifactRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
    expect(m.diamond).not.toHaveBeenCalled()
    expect(bookMerges()).toHaveLength(0)

    // Completed but still below floor: the Share artifact IS written, for the
    // reader, and the hours/XP floor is untouched.
    m.ops.length = 0
    const completed = await openReader()
    goToBackCover()
    clock += 30_000
    completed.unmount()

    expect(artifactRows()).toHaveLength(1)
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
    expect(hoursRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
    expect(m.diamond).not.toHaveBeenCalled()
  })

  it('stamps the Story Call audience on the reader’s own records', async () => {
    m.search = 'call=1'
    m.book = siblingOwnedBook()
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

  it('gives a second real session its own minutes under the same daily dedup key', async () => {
    m.book = siblingOwnedBook()
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
    const key = `book_book-1_${new Date().toISOString().slice(0, 10)}`
    expect(m.xp.mock.calls.map((call) => call[4])).toEqual([key, key])
    expect(m.xp.mock.calls.every((call) => call[1] === LINCOLN.id)).toBe(true)
  })
})

describe('BookReaderPage — an actor that is not resolved is not guessed', () => {
  it('writes nothing while the child read has not settled', async () => {
    m.book = siblingOwnedBook()
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
    m.book = siblingOwnedBook()
    m.identity = { isChildProfile: true, activeChild: undefined, isLoading: true, loadFailed: true }
    const { unmount } = await openReader()
    goToBackCover()
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
  })

  it('credits the whole session once a DELAYED actor resolves mid-read', async () => {
    m.book = siblingOwnedBook()
    m.identity = { isChildProfile: true, activeChild: undefined, isLoading: true, loadFailed: false }
    const { unmount, rerender } = await openReader()
    minutes(1)
    m.identity = { isChildProfile: true, activeChild: LINCOLN, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    goToBackCover()
    minutes(1)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    // The elapsed rounding and the session's own start are untouched: the
    // session is two minutes long, not the one minute since the actor landed.
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(artifactRows()[0]).toMatchObject({ childId: LINCOLN.id })
  })

  it('credits the whole session once a DELAYED book resolves mid-read', async () => {
    m.book = siblingOwnedBook()
    m.pendingBook = { release: () => {} }
    const { unmount } = render(<BookReaderPage />)
    minutes(1)
    m.pendingBook?.release()
    m.pendingBook = null
    await waitFor(() => expect(screen.getAllByText(/Brave Dog/).length).toBeGreaterThan(0))
    goToBackCover()
    minutes(1)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
  })

  it('writes nothing at all when the book never resolves', async () => {
    m.book = null
    const { unmount } = render(<BookReaderPage />)
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(0)
    expect(artifactRows()).toHaveLength(0)
    expect(m.xp).not.toHaveBeenCalled()
  })
})

describe('BookReaderPage — the committed session is not redirected', () => {
  it('keeps the original reader when the active child changes mid-session', async () => {
    m.book = siblingOwnedBook()
    const { unmount, rerender } = await openReader()
    goToBackCover()
    minutes(2)
    // A global identity change lands while the reader is still open. The
    // reading already happened, and it was Lincoln's.
    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id })
    expect(countedMinutes(LONDON.id)).toBe(0)
    expect(m.xp.mock.calls[0][1]).toBe(LINCOLN.id)
  })

  it('is one session across A → B → A, not a new one on the way back', async () => {
    m.book = siblingOwnedBook()
    const { unmount, rerender } = await openReader()
    goToBackCover()
    minutes(1)
    m.identity = { isChildProfile: true, activeChild: LONDON, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    minutes(1)
    m.identity = { isChildProfile: true, activeChild: LINCOLN, isLoading: false, loadFailed: false }
    rerender(<BookReaderPage />)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({ childId: LINCOLN.id, minutes: 2 })
    expect(artifactRows()).toHaveLength(1)
    expect(m.xp).toHaveBeenCalledTimes(1)
  })
})

describe('BookReaderPage — a parent reader keeps the legacy book-owner record', () => {
  it('addresses the records to the book’s own child, and still counts the read once', async () => {
    m.book = bookDoc({ childId: LINCOLN.id })
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
})
