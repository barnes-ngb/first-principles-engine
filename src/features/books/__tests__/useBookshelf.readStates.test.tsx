import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Book } from '../../../core/types'

/**
 * What the shelf's own read says about itself — against the REAL hook.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * Every existing shelf suite (`BookshelfPage.test.tsx`,
 * `libraryReturnShelf.test.tsx`, `draftResume.shelf.test.tsx`,
 * `makeBookDoor.shelf.test.tsx`) mocks `useBookshelf` itself, and all four hand
 * it `loading: false` with a ready array. That is right for what they claim —
 * the door, the way back, whose draft resumes — and it means **nothing in the
 * repo drives this hook's read at all**. So the states a real Firestore boundary
 * produces, which is every state a child meets on a cold phone, are unasserted:
 * a read still in flight, a read that REJECTED, and a read whose scope moved
 * under a mounted shelf.
 *
 * This file mocks only the boundary — the Firestore SDK, the collection helpers,
 * storage and the debounce — and runs the actual hook. Nothing here is live: no
 * SDK, no network, no family record, no media. Every book, child and family is
 * synthetic.
 *
 * ── How the three queries are told apart ─────────────────────────────────────
 *
 * `query` / `where` / `orderBy` are recorded as their own arguments, so each
 * `getDocs` target carries the constraints the hook actually built and
 * `scopeOf` can name which read it is:
 *
 *   • **own** — `where('childId', '==', childId)`
 *   • **together** — `where('contributorIds', 'array-contains', childId)`
 *   • **all** — the parent's family-wide read, which carries NO child
 *     constraint. That is not leakage and is not treated as such here; it is
 *     the parent's own audience, and this file only asserts that it stays
 *     family-wide and is never confused with a child-scoped read.
 *
 * ── What is NOT claimed here ─────────────────────────────────────────────────
 *
 * Nothing about what the page draws (its sibling
 * `libraryShelfColdRead.route.test.tsx` renders the real shelf over a real
 * router), nothing about Firestore rules or real permissions, and nothing about
 * phone / tablet / desktop layout, focus or enlarged text — those are the
 * independent pass.
 */

type Snapshot = { docs: { id: string; data: () => Book }[] }

const fx = vi.hoisted(() => ({
  reads: [] as {
    target: unknown
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
  }[],
}))

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

import { useBookshelf } from '../useBook'

const FAMILY = 'fam-1'
const LINCOLN = 'lincoln'
const LONDON = 'london'

type Scope = 'own' | 'together' | 'all'

/** Which of the hook's three reads this target is, from its constraints. */
function scopeOf(target: unknown): Scope {
  const text = JSON.stringify(target)
  if (text.includes('"array-contains"')) return 'together'
  if (text.includes('"childId"')) return 'own'
  return 'all'
}

/** The reads outstanding right now, named and in the order they were issued. */
function outstanding(): Scope[] {
  return fx.reads.map((r) => scopeOf(r.target))
}

function readFor(scope: Scope) {
  const match = fx.reads.find((r) => scopeOf(r.target) === scope)
  if (!match) throw new Error(`no ${scope} read was issued (saw: ${outstanding().join(', ') || 'none'})`)
  return match
}

function snapshot(books: Book[]): Snapshot {
  return {
    docs: books.map((book) => ({
      // The id is the DOCUMENT's, exactly as the hook reads it (`d.id`), and
      // `data()` is the stored fields — the hook overwrites `id` from the doc.
      id: book.id ?? 'missing-id',
      data: () => book,
    })),
  }
}

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    childId: LINCOLN,
    title: 'A Book',
    pages: [],
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    subjectBuckets: [],
    ...overrides,
  } as Book
}

/**
 * The hook's result as a SHAPE, not as its current type.
 *
 * `UseBookshelfResult` carries `books` / `loading` / `createBook` / `deleteBook`
 * and nothing about a failure, so naming `error` or `retry` against the typed
 * result would make this file fail to COMPILE rather than fail. A test that does
 * not build is not a reproduction of anything, and the point is to run the same
 * assertions against the old source and the repaired one. So the two fields the
 * repair owes are asked for structurally: `tsc` is satisfied either way and what
 * reports is the behaviour.
 *
 * The names are this reproduction's PROPOSAL for the read's result, not a
 * settled contract — the page-level claims in the sibling file are the ones
 * written in the child's own terms.
 */
interface ShelfRead {
  books: Book[]
  loading: boolean
  /** Truthy when the query-owned read failed. Absent on the old source. */
  error?: unknown
  /** Re-issues this scope's read. Absent on the old source. */
  retry?: unknown
}

function read(result: unknown): ShelfRead {
  return result as ShelfRead
}

beforeEach(() => {
  fx.reads.length = 0
})

describe('a cold shelf read that REJECTED', () => {
  it('issues exactly the own + Together pair for a child, and no family-wide read', () => {
    renderHook(() => useBookshelf(FAMILY, LINCOLN, false))

    expect(outstanding().sort()).toEqual(['own', 'together'])
    // Both are this family's books collection and nobody else's.
    for (const entry of fx.reads) {
      expect(JSON.stringify(entry.target)).toContain(`families/${FAMILY}/books`)
    }
    // And both are scoped to the child asking, not to a name or a filter.
    expect(JSON.stringify(readFor('own').target)).toContain(LINCOLN)
    expect(JSON.stringify(readFor('together').target)).toContain(LINCOLN)
  })

  it('stops loading when the read comes back refused', async () => {
    const { result } = renderHook(() => useBookshelf(FAMILY, LINCOLN, false))
    expect(read(result.current).loading).toBe(true)

    // The own read is refused — a rules rejection, an offline phone, a dropped
    // query. `Promise.all` means the pair is refused with it.
    await act(async () => {
      readFor('own').reject(new Error('permission-denied'))
      readFor('together').resolve(snapshot([]))
    })

    // The defect: `loading` is initialised once and only ever cleared on the
    // success path, so a refused read leaves the shelf loading forever. A child
    // sees a spinner with no end, no sentence and nothing to tap.
    await waitFor(() => {
      expect(read(result.current).loading).toBe(false)
    })
  })

  it('says the read failed rather than reporting an empty shelf', async () => {
    const { result } = renderHook(() => useBookshelf(FAMILY, LINCOLN, false))

    await act(async () => {
      readFor('own').reject(new Error('permission-denied'))
      readFor('together').resolve(snapshot([]))
    })

    // A failed read is not an affirmative empty result — the GATE verdict, and
    // the same rule the weekly-review and village surfaces already hold.
    await waitFor(() => {
      expect(read(result.current).error).toBeTruthy()
    })
    expect(read(result.current).books).toEqual([])
  })

  it('offers a retry that re-issues the same two queries and then shows the books', async () => {
    const { result } = renderHook(() => useBookshelf(FAMILY, LINCOLN, false))

    await act(async () => {
      readFor('own').reject(new Error('permission-denied'))
      readFor('together').resolve(snapshot([]))
    })
    await waitFor(() => {
      expect(typeof read(result.current).retry).toBe('function')
    })

    const retry = read(result.current).retry as () => void
    fx.reads.length = 0
    await act(async () => {
      retry()
    })
    // The retry re-asks the SAME scope — not a widened one, and not the
    // parent's family-wide query.
    expect(outstanding().sort()).toEqual(['own', 'together'])

    await act(async () => {
      readFor('own').resolve(snapshot([makeBook({ id: 'b1', title: 'After the retry' })]))
      readFor('together').resolve(snapshot([]))
    })
    await waitFor(() => {
      expect(read(result.current).books.map((b) => b.title)).toEqual(['After the retry'])
    })
    expect(read(result.current).error).toBeFalsy()
    expect(read(result.current).loading).toBe(false)
  })
})

describe('what a settled read already does, and must keep doing', () => {
  it('unions own and Together books once each, newest first', async () => {
    const own = makeBook({ id: 'own-1', title: 'Mine', updatedAt: '2026-02-01T00:00:00Z' })
    const shared = makeBook({
      id: 'shared-1',
      title: 'Ours',
      updatedAt: '2026-03-01T00:00:00Z',
      isTogetherBook: true,
      contributorIds: [LINCOLN, LONDON],
    })
    const { result } = renderHook(() => useBookshelf(FAMILY, LINCOLN, false))

    await act(async () => {
      // `shared` is returned by BOTH reads, which is what the dedup is for.
      readFor('own').resolve(snapshot([shared, own]))
      readFor('together').resolve(snapshot([shared]))
    })

    await waitFor(() => {
      expect(read(result.current).books.map((b) => b.title)).toEqual(['Ours', 'Mine'])
    })
    expect(read(result.current).books.map((b) => b.id)).toEqual(['shared-1', 'own-1'])
    expect(read(result.current).loading).toBe(false)
  })

  it('reads the whole family for a parent, with no child constraint at all', async () => {
    const { result } = renderHook(() => useBookshelf(FAMILY, LINCOLN, true))

    expect(outstanding()).toEqual(['all'])
    const target = JSON.stringify(readFor('all').target)
    expect(target).toContain(`families/${FAMILY}/books`)
    // The parent's audience IS the family, so the query carries no `childId`
    // and no `contributorIds` — this is the line that says the family-wide read
    // is deliberate rather than a child read that lost its filter.
    expect(target).not.toContain('"childId"')
    expect(target).not.toContain('array-contains')

    await act(async () => {
      readFor('all').resolve(
        snapshot([
          makeBook({ id: 'l-1', title: 'Lincoln’s', childId: LINCOLN }),
          makeBook({ id: 'o-1', title: 'London’s', childId: LONDON }),
        ]),
      )
    })
    await waitFor(() => {
      expect(read(result.current).books).toHaveLength(2)
    })
  })

  it('does not call a parent’s family-wide shelf a failure when the selected child changes', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, true),
      { initialProps: { childId: LINCOLN } },
    )
    await act(async () => {
      readFor('all').resolve(snapshot([makeBook({ id: 'l-1', title: 'Lincoln’s' })]))
    })

    fx.reads.length = 0
    rerender({ childId: LONDON })
    // Still the family-wide read, and a parent who is still a parent has lost
    // no permission: nothing here may report an error or an empty family.
    expect(outstanding()).toEqual(['all'])
    expect(read(result.current).error).toBeFalsy()
  })
})

describe('a scope that moved under a mounted shelf', () => {
  it('stops listing the parent’s family-wide books once the shelf is a child’s', async () => {
    /**
     * The reachable transition, and the reason this is not hypothetical: the
     * app bar's `ProfileMenu` calls `selectProfile` and navigates nowhere, and
     * `App.tsx`'s `ProfileGate` renders the same `<AppRouter />` for every
     * non-null profile. So a parent standing on `/books` who switches to a
     * child's profile keeps this very hook mounted while `loadAll` goes false
     * and `childId` becomes the child's.
     *
     * The old source retains the previous answer's array and clears `loading`
     * only on success, so between the switch and the child's own read landing
     * the shelf is still listing every sibling's books — under a child profile
     * that may not query them at all.
     */
    const { result, rerender } = renderHook(
      ({ childId, loadAll }: { childId: string; loadAll: boolean }) =>
        useBookshelf(FAMILY, childId, loadAll),
      { initialProps: { childId: LINCOLN, loadAll: true } },
    )
    await act(async () => {
      readFor('all').resolve(
        snapshot([
          makeBook({ id: 'l-1', title: 'Lincoln’s book', childId: LINCOLN }),
          makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON }),
        ]),
      )
    })
    await waitFor(() => {
      expect(read(result.current).books).toHaveLength(2)
    })

    fx.reads.length = 0
    rerender({ childId: LONDON, loadAll: false })
    // The new scope's own reads, still in flight.
    expect(outstanding().sort()).toEqual(['own', 'together'])

    // Nothing from the previous scope may be presented as this child's shelf
    // while that is true.
    expect(read(result.current).books.map((b) => b.title)).not.toContain('Lincoln’s book')
    expect(read(result.current).books).toEqual([])

    // And when the child's own read lands, it is theirs and only theirs.
    await act(async () => {
      readFor('own').resolve(snapshot([makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON })]))
      readFor('together').resolve(snapshot([]))
    })
    await waitFor(() => {
      expect(read(result.current).books.map((b) => b.title)).toEqual(['London’s book'])
    })
  })
})
