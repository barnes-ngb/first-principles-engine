import { Suspense, startTransition, use, useLayoutEffect, useRef, useState } from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
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
 * produces, which is every state a child meets on a cold phone, were
 * unasserted: a read in flight, a read that REJECTED, a read whose owner moved
 * under a mounted shelf, and a completion that lands after it stopped being
 * anybody's answer.
 *
 * This file mocks only the boundary — the Firestore SDK, the collection
 * helpers, storage and the debounce — and runs the actual hook. Nothing here is
 * live: no SDK, no network, no family record, no media. Every book, child and
 * family is synthetic.
 *
 * Two of its claims are about WHEN the hook decides whose a read is rather than
 * about what the read says: a render React commits owns it (*a render React
 * threw away*), and the owner that has just committed owns it in that commit's
 * own layout window, before any passive effect has run (*the REPLACEMENT's own
 * retry*). Both are driven with React's own tools — a transition, a Suspense
 * boundary, an urgent update that supersedes that transition, a layout effect —
 * and no second test framework. The first of them is deliberately about an
 * ABANDONED render and not about a suspended one: a transition that is left
 * pending for ever would only ask whether React can repaint a subtree whose
 * newest render has not finished, which is a question about React. So the
 * attempt is cancelled by a render that commits, and what is then asserted is
 * that the committed owner still has its read, its state and its retry.
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
 *     constraint. That is the parent's own audience, not leakage: the selected
 *     child is not part of that question, so changing it may not re-ask it.
 *
 * ── What is NOT claimed here ─────────────────────────────────────────────────
 *
 * Nothing about what the page draws (its sibling
 * `libraryShelfColdRead.route.test.tsx` renders the real shelf over a real
 * router), nothing about Firestore rules or real permissions, nothing about the
 * whole App's own error boundary, and nothing about phone / tablet / desktop
 * layout, focus or enlarged text — those are the independent pass.
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

// The phase vocabulary comes from the pure contract module, not from the hook's
// own file — the same import the page makes, and the reason it is separate.
import { ShelfReadPhase } from '../shelfRead'
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

/** Take the outstanding reads away, to be answered later than their successor. */
function detachReads() {
  const held = [...fx.reads]
  fx.reads.length = 0
  return held
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

/** Answer a detached pair, whatever order they were taken in. */
async function answer(held: ReturnType<typeof detachReads>, books: Book[]) {
  await act(async () => {
    for (const entry of held) entry.resolve(snapshot(books))
  })
}

async function refuse(held: ReturnType<typeof detachReads>) {
  await act(async () => {
    for (const entry of held) entry.reject(new Error('permission-denied'))
  })
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

function titles(books: Book[]): string[] {
  return books.map((b) => b.title)
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
    expect(result.current.loading).toBe(true)
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)

    // The own read is refused — a rules rejection, an offline phone, a dropped
    // query. `Promise.all` means the pair is refused with it, which is the
    // point: half a union is not a shelf.
    await refuse(detachReads())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.phase).toBe(ShelfReadPhase.Error)
  })

  it('says the read failed rather than reporting an empty shelf', async () => {
    const { result } = renderHook(() => useBookshelf(FAMILY, LINCOLN, false))

    const held = detachReads()
    await act(async () => {
      held[0].reject(new Error('permission-denied'))
      held[1].resolve(snapshot([makeBook({ id: 'shared', title: 'Half an answer' })]))
    })

    // A failed read is not an affirmative empty result — the GATE verdict, and
    // the same rule the weekly-review and village surfaces already hold. The
    // half that DID answer is not kept either: a partial union drawn as a shelf
    // reads as books that have been deleted.
    await waitFor(() => {
      expect(result.current.error).toBe(true)
    })
    expect(result.current.phase).toBe(ShelfReadPhase.Error)
    expect(result.current.books).toEqual([])
  })

  it('offers a retry that re-issues the same two queries and then shows the books', async () => {
    const { result } = renderHook(() => useBookshelf(FAMILY, LINCOLN, false))

    await refuse(detachReads())
    await waitFor(() => {
      expect(result.current.error).toBe(true)
    })

    const retry = result.current.retry
    await act(async () => {
      retry()
    })
    // The retry re-asks the SAME scope — not a widened one, and not the
    // parent's family-wide query — and says so while it is in flight.
    expect(outstanding().sort()).toEqual(['own', 'together'])
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)
    expect(result.current.error).toBe(false)

    await answer(detachReads(), [makeBook({ id: 'b1', title: 'After the retry' })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['After the retry'])
    })
    expect(result.current.phase).toBe(ShelfReadPhase.Ready)
    expect(result.current.error).toBe(false)
    expect(result.current.loading).toBe(false)
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
      expect(titles(result.current.books)).toEqual(['Ours', 'Mine'])
    })
    expect(result.current.books.map((b) => b.id)).toEqual(['shared-1', 'own-1'])
    expect(result.current.phase).toBe(ShelfReadPhase.Ready)
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

    await answer(detachReads(), [
      makeBook({ id: 'l-1', title: 'Lincoln’s', childId: LINCOLN }),
      makeBook({ id: 'o-1', title: 'London’s', childId: LONDON }),
    ])
    await waitFor(() => {
      expect(result.current.books).toHaveLength(2)
    })
  })

  it('treats a parent’s selected child as no new question at all', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, true),
      { initialProps: { childId: LINCOLN } },
    )
    await answer(detachReads(), [
      makeBook({ id: 'l-1', title: 'Lincoln’s', childId: LINCOLN }),
      makeBook({ id: 'o-1', title: 'London’s', childId: LONDON }),
    ])
    await waitFor(() => {
      expect(result.current.phase).toBe(ShelfReadPhase.Ready)
    })

    rerender({ childId: LONDON })

    /**
     * The chip moved; the question did not. The selected child is not part of
     * the family query's permission scope, so this must not re-ask it, must not
     * blank the shelf, must not go pending and must not fail — the page keeps a
     * mounted chat, an open dialog and its rows. A requery is not forbidden
     * outright, but anything asked here has to still be the FAMILY's question.
     */
    for (const scope of outstanding()) expect(scope).toBe('all')
    expect(titles(result.current.books)).toEqual(['Lincoln’s', 'London’s'])
    expect(result.current.phase).toBe(ShelfReadPhase.Ready)
    expect(result.current.error).toBe(false)
    expect(result.current.loading).toBe(false)
  })
})

describe('a scope that moved under a mounted shelf', () => {
  it('stops listing the parent’s family-wide books once the shelf is a child’s', async () => {
    /**
     * The reachable transition, and the reason this is not hypothetical: the
     * app bar's `ProfileMenu` calls `selectProfile` and navigates nowhere, and
     * `App.tsx`'s `ProfileGate` renders the same `<AppRouter />` for every
     * non-null profile. So a parent standing on `/books` who switches to a
     * child's profile keeps this very hook mounted while the audience goes from
     * the family to that child.
     *
     * The rows of the audience it has left are gone in the first render of the
     * new one — not after an effect, and not when the new read lands — so a
     * forbidden row is never drawn, counted or tapped.
     */
    const { result, rerender } = renderHook(
      ({ childId, loadAll }: { childId: string; loadAll: boolean }) =>
        useBookshelf(FAMILY, childId, loadAll),
      { initialProps: { childId: LINCOLN, loadAll: true } },
    )
    await answer(detachReads(), [
      makeBook({ id: 'l-1', title: 'Lincoln’s book', childId: LINCOLN }),
      makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON }),
    ])
    await waitFor(() => {
      expect(result.current.books).toHaveLength(2)
    })

    rerender({ childId: LONDON, loadAll: false })

    // The new audience's own reads, still in flight …
    expect(outstanding().sort()).toEqual(['own', 'together'])
    // … and nothing from the previous one is presented as this child's shelf,
    // nor as an empty one: an unanswered read is pending, never ready.
    expect(titles(result.current.books)).not.toContain('Lincoln’s book')
    expect(result.current.books).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)
    expect(result.current.error).toBe(false)

    await answer(detachReads(), [makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['London’s book'])
    })
  })

  it('refuses a success that lands after the audience changed', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, false),
      { initialProps: { childId: LINCOLN } },
    )
    const lincolnReads = detachReads()

    rerender({ childId: LONDON })
    expect(outstanding().sort()).toEqual(['own', 'together'])
    const londonReads = detachReads()

    // Lincoln's read answers now. It is nobody's answer any more.
    await answer(lincolnReads, [makeBook({ id: 'l-1', title: 'Lincoln’s book' })])
    expect(result.current.books).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)

    await answer(londonReads, [makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['London’s book'])
    })
  })

  it('and a FAILURE that lands after it, which must not fail the new one', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, false),
      { initialProps: { childId: LINCOLN } },
    )
    const lincolnReads = detachReads()

    rerender({ childId: LONDON })
    const londonReads = detachReads()

    await refuse(lincolnReads)
    // London's shelf is still waiting for London's answer. The refusal belonged
    // to a question nobody is asking any more, so it reports nothing here.
    expect(result.current.error).toBe(false)
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)

    await answer(londonReads, [])
    await waitFor(() => {
      expect(result.current.phase).toBe(ShelfReadPhase.Ready)
    })
    // A genuinely empty shelf, which is the one state that may say so.
    expect(result.current.books).toEqual([])
    expect(result.current.error).toBe(false)
  })

  it('asks again on A → B → A, and takes only the newest answer', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, false),
      { initialProps: { childId: LINCOLN } },
    )
    const firstVisit = detachReads()

    rerender({ childId: LONDON })
    const away = detachReads()

    rerender({ childId: LINCOLN })
    // The same scope STRING as the first visit, and still a different read:
    // coming back is a question asked again, not an answer already given.
    expect(outstanding().sort()).toEqual(['own', 'together'])
    const secondVisit = detachReads()

    await answer(firstVisit, [makeBook({ id: 'stale', title: 'From the first visit' })])
    expect(result.current.books).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)

    await answer(secondVisit, [makeBook({ id: 'fresh', title: 'From this visit' })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['From this visit'])
    })
    // London's reads were never answered at all, and nothing waited for them.
    expect(away).toHaveLength(2)
  })

  it('ignores a retry callback a replaced render still holds', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, false),
      { initialProps: { childId: LINCOLN } },
    )
    await refuse(detachReads())
    await waitFor(() => {
      expect(result.current.error).toBe(true)
    })

    // The control a child can actually see belongs to Lincoln's failed read.
    const staleRetry = result.current.retry

    rerender({ childId: LONDON })
    detachReads()

    await act(async () => {
      staleRetry()
    })
    // It asked nothing: a retry must never re-read for whoever is on screen
    // now, and it must not touch their state either.
    expect(outstanding()).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)
    expect(result.current.error).toBe(false)
  })

  it('asks again after the child id goes missing and comes back', async () => {
    /**
     * The owner can be withdrawn and restored without anything else changing —
     * a children re-read, a profile settling, a chip clearing — and the scope
     * STRING is identical on both sides of it. The question was still
     * withdrawn, so coming back is a new question: it is asked, and only its
     * own answer is taken.
     */
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, false),
      { initialProps: { childId: LINCOLN } },
    )
    const firstVisit = detachReads()

    rerender({ childId: '' })
    // Nothing to ask for, and nothing claimed: not empty, not failed.
    expect(outstanding()).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Unsettled)
    expect(result.current.books).toEqual([])
    expect(result.current.error).toBe(false)

    rerender({ childId: LINCOLN })
    // Asked afresh — the bug this pins left the shelf pending forever, because
    // the owner it had already asked for carried the same key.
    expect(outstanding().sort()).toEqual(['own', 'together'])
    const secondVisit = detachReads()

    // The read from before the gap lands. It answers a question nobody asked.
    await answer(firstVisit, [makeBook({ id: 'stale', title: 'From before the gap' })])
    expect(result.current.books).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)

    await answer(secondVisit, [makeBook({ id: 'fresh', title: 'From after it' })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['From after it'])
    })
  })

  it('and a FAILURE from before that gap does not fail the shelf after it', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, false),
      { initialProps: { childId: LINCOLN } },
    )
    const firstVisit = detachReads()

    rerender({ childId: '' })
    rerender({ childId: LINCOLN })
    const secondVisit = detachReads()

    await refuse(firstVisit)
    expect(result.current.error).toBe(false)
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)

    await answer(secondVisit, [])
    await waitFor(() => {
      expect(result.current.phase).toBe(ShelfReadPhase.Ready)
    })
    expect(result.current.error).toBe(false)
  })

  it('ignores a retry retained across a departure and a RETURN to the same shelf', async () => {
    /**
     * The sharper half of the retry rule: comparing the scope string is not
     * enough, because `A → B → A` brings the string back. The callback belongs
     * to the incarnation that produced it, which is over.
     */
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, false),
      { initialProps: { childId: LINCOLN } },
    )
    await refuse(detachReads())
    await waitFor(() => {
      expect(result.current.error).toBe(true)
    })
    const firstVisitRetry = result.current.retry

    rerender({ childId: LONDON })
    detachReads()
    rerender({ childId: LINCOLN })
    // Lincoln's shelf is being asked again, by this visit's own read.
    expect(outstanding().sort()).toEqual(['own', 'together'])
    const thisVisit = detachReads()

    await act(async () => {
      firstVisitRetry()
    })
    // The retained callback asked nothing, even though its shelf is on screen.
    expect(outstanding()).toEqual([])

    await answer(thisVisit, [makeBook({ id: 'b1', title: 'This visit’s answer' })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['This visit’s answer'])
    })
  })

  it('and one fired in the replacement’s LAYOUT window asks for nobody', async () => {
    /**
     * The window a passive effect cannot cover: the replacement has committed,
     * its layout effects are running, and no passive effect has caught up yet.
     * A callback retained from the previous owner, fired in there, used to ask
     * the previous owner's query — two reads nobody is waiting for, landing
     * ahead of the reads that matter.
     */
    const { result, rerender } = renderHook(
      ({ childId, onLayout }: { childId: string; onLayout?: () => void }) => {
        const shelf = useBookshelf(FAMILY, childId, false)
        useLayoutEffect(() => {
          onLayout?.()
        })
        return shelf
      },
      { initialProps: { childId: LINCOLN, onLayout: undefined as (() => void) | undefined } },
    )
    const staleRetry = result.current.retry
    detachReads()

    rerender({ childId: LONDON, onLayout: staleRetry })

    // Exactly the replacement's own pair, and nothing asked about Lincoln.
    expect(outstanding().sort()).toEqual(['own', 'together'])
    const asked = JSON.stringify(fx.reads.map((r) => r.target))
    expect(asked).toContain(LONDON)
    expect(asked).not.toContain(LINCOLN)

    await answer(detachReads(), [makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['London’s book'])
    })
  })

  it('while the REPLACEMENT’s own retry is admitted in that same window', async () => {
    /**
     * The other half of the same window, and the reason admission is aligned
     * with the commit rather than with the flush after it: the owner that has
     * just committed owns the read NOW. A hook that only learns whose it is in a
     * passive effect would refuse the control the screen is already showing —
     * so this asks in the layout window and counts what was issued THERE,
     * before any passive effect could have asked for it.
     */
    const askedInLayout: number[] = []
    const { result, rerender } = renderHook(
      ({ childId, askOnLayout }: { childId: string; askOnLayout: boolean }) => {
        const shelf = useBookshelf(FAMILY, childId, false)
        const fired = useRef(false)
        useLayoutEffect(() => {
          if (!askOnLayout || fired.current) return
          fired.current = true
          shelf.retry()
          // Both halves of the union are issued synchronously by the call, so
          // what is outstanding at this line is what the retry itself asked.
          askedInLayout.push(fx.reads.length)
        })
        return shelf
      },
      { initialProps: { childId: LINCOLN, askOnLayout: false } },
    )
    detachReads()

    rerender({ childId: LONDON, askOnLayout: true })

    expect(askedInLayout).toEqual([2])
    const asked = JSON.stringify(fx.reads.map((r) => r.target))
    expect(asked).toContain(LONDON)
    expect(asked).not.toContain(LINCOLN)
    // And exactly ONE pair: the owner's automatic read is the read the retry
    // already spent, not a second one behind it.
    expect(outstanding().sort()).toEqual(['own', 'together'])

    await answer(detachReads(), [makeBook({ id: 'o-1', title: 'London’s book', childId: LONDON })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['London’s book'])
    })
  })

  it('and a retry held after the shelf is gone asks nothing at all', async () => {
    const { result, unmount } = renderHook(() => useBookshelf(FAMILY, LINCOLN, false))
    await refuse(detachReads())
    await waitFor(() => {
      expect(result.current.error).toBe(true)
    })

    const retry = result.current.retry
    unmount()
    act(() => {
      retry()
    })
    // An unmounted page's read has nowhere to land and would be paid for anyway.
    expect(outstanding()).toEqual([])
  })
})

/**
 * A thenable that never settles, instrumented so an ATTEMPT is visible.
 *
 * Module-scoped on purpose — a thenable made during render is a new one every
 * attempt, which React warns about — and counting instead of resolving is what
 * makes the claim checkable: React subscribes to it every time it suspends on
 * it, so `attempts` is how many times the render it belongs to was really
 * tried. It resolves never, so none of those attempts can commit.
 */
const stalled = {
  attempts: 0,
  then() {
    stalled.attempts += 1
  },
}

/** Suspends, so the render it is part of cannot commit. */
function NeverSettles() {
  use(stalled as unknown as Promise<void>)
  return null
}

/**
 * Everything these cases assert, in the DOM — and NOTHING else.
 *
 * A pure view over a shelf read it is handed. The hook itself lives in
 * `SwitchableShelf`, beside the state cell that moves the question, because
 * that is the lifecycle this file is about: a render that React throws away is
 * an attempt at ONE function, and a hook sitting in a child of the suspended
 * subtree is a different arrangement from the surface's — where the thing
 * holding the scope and the thing reading for it are the same component. With
 * the hook down here the attempt that cannot commit never belonged to the same
 * function as the switch, and the supersession the cases measure would be
 * measuring React's subtree bookkeeping rather than this hook's owner.
 */
function ShelfProbe({
  shelf,
  childId,
  epoch,
}: {
  shelf: ReturnType<typeof useBookshelf>
  childId: string
  epoch: number
}) {
  return (
    <div
      data-testid="probe"
      data-child={childId}
      data-epoch={epoch}
      data-phase={shelf.phase}
      data-error={String(shelf.error)}
      data-titles={titles(shelf.books).join('|')}
    >
      <button type="button" onClick={shelf.retry}>
        try again
      </button>
    </div>
  )
}

interface ShelfView {
  childId: string
  stall: boolean
  epoch: number
}

/**
 * The switch, and the thing that takes it back — both INSIDE the boundary, in
 * one state cell, which is what makes the second one a cancellation.
 *
 * *switch child* is a transition that moves to London and mounts a sibling that
 * suspends for good, so the attempt renders the hook for London and is thrown
 * away; the boundary keeps what it had, because a transition does not reveal a
 * fallback over content a child is already looking at.
 *
 * *keep this shelf* is an URGENT update, and it is the half the first driver of
 * these cases was missing: without it London stays pending for ever and the
 * only thing the assertions could have measured is whether React can repaint a
 * subtree whose newest render is suspended — a question about React, not about
 * this hook. Three things make it a real supersession. It is **last in the same
 * queue** as the transition's update and its updater **ignores what it is
 * handed**, so when React later re-renders that transition lane it recomputes
 * to Lincoln and London is gone rather than parked. It carries an **epoch**, so
 * the state value really changes and React cannot bail the render out — the
 * committed `data-epoch` is the proof the render happened. And it drops
 * `stall`, so nothing suspends and the render it forces is one that COMMITS.
 */
function SwitchableShelf() {
  const [view, setView] = useState<ShelfView>({ childId: LINCOLN, stall: false, epoch: 0 })
  /**
   * The read is asked HERE, in the same function as the cell that moves it —
   * the surface's own arrangement, and the one whose render attempt is the
   * attempt these cases throw away.
   */
  const shelf = useBookshelf(FAMILY, view.childId, false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          startTransition(() => {
            setView((prev) => ({ childId: LONDON, stall: true, epoch: prev.epoch }))
          })
        }}
      >
        switch child
      </button>
      <button
        type="button"
        onClick={() => {
          setView((prev) => ({ childId: LINCOLN, stall: false, epoch: prev.epoch + 1 }))
        }}
      >
        keep this shelf
      </button>
      <ShelfProbe shelf={shelf} childId={view.childId} epoch={view.epoch} />
      {view.stall ? <NeverSettles /> : null}
    </>
  )
}

function AbandonedSwitchHarness() {
  return (
    <Suspense fallback={<div data-testid="fallback" />}>
      <SwitchableShelf />
    </Suspense>
  )
}

function probe(): HTMLElement {
  return screen.getByTestId('probe')
}

/**
 * The owner has to belong to the COMMITTED render, not to the last one
 * attempted.
 *
 * While it lived in a ref that render replaced in place, an attempt that was
 * never committed retired the owner the screen still belonged to: the next
 * render that DID commit found a key the ref disagreed with, opened a third
 * incarnation, reset the shelf to pending and asked a second time (the pair
 * this file holds is two reads; the old model made it four), while the read
 * already in flight came back to an owner the hook no longer recognised and the
 * retry a child could see was bound to an incarnation superseded by a render
 * nobody ever saw. Nothing on screen had changed, so there was nothing for them
 * to do about it.
 *
 * SENSITIVITY: against the old render-ref module both cases fail on their own
 * assertions — `outstanding()` after *keep this shelf* is the extra own +
 * Together pair instead of empty, the phase is reset, and the held answer and
 * the retained retry are then both refused.
 */
describe('a render React threw away', () => {
  beforeEach(() => {
    stalled.attempts = 0
  })

  it('leaves the committed shelf’s own read able to answer it', async () => {
    render(<AbandonedSwitchHarness />)
    const lincolnReads = detachReads()
    expect(lincolnReads.map((entry) => scopeOf(entry.target)).sort()).toEqual(['own', 'together'])

    // ── London is attempted … ──────────────────────────────────────────────
    await act(async () => {
      fireEvent.click(screen.getByText('switch child'))
    })
    expect(stalled.attempts).toBeGreaterThan(0)
    // … and cannot land: no fallback over the content, the child on screen is
    // unchanged, and London's query was never asked.
    expect(screen.queryByTestId('fallback')).toBeNull()
    expect(probe().dataset.child).toBe(LINCOLN)
    expect(outstanding()).toEqual([])

    // ── and then it is SUPERSEDED by a render that commits ─────────────────
    await act(async () => {
      fireEvent.click(screen.getByText('keep this shelf'))
    })
    // The render really happened — the epoch moved, so this is not a bail-out —
    // and it kept Lincoln's own incarnation: same question, same pending state,
    // no reset, and not one extra read.
    expect(probe().dataset.epoch).toBe('1')
    expect(probe().dataset.child).toBe(LINCOLN)
    expect(probe().dataset.phase).toBe(ShelfReadPhase.Pending)
    expect(outstanding()).toEqual([])

    // ── so the read the committed owner asked for is still its answer ──────
    await answer(lincolnReads, [makeBook({ id: 'l-1', title: 'Lincoln’s book' })])
    await waitFor(() => {
      expect(probe().dataset.phase).toBe(ShelfReadPhase.Ready)
    })
    expect(probe().dataset.titles).toBe('Lincoln’s book')
    expect(probe().dataset.child).toBe(LINCOLN)
    expect(outstanding()).toEqual([])
  })

  it('and the retry that shelf is showing still asks its own question', async () => {
    render(<AbandonedSwitchHarness />)
    await refuse(detachReads())
    await waitFor(() => {
      expect(probe().dataset.error).toBe('true')
    })

    await act(async () => {
      fireEvent.click(screen.getByText('switch child'))
    })
    expect(stalled.attempts).toBeGreaterThan(0)
    expect(probe().dataset.child).toBe(LINCOLN)
    expect(outstanding()).toEqual([])

    await act(async () => {
      fireEvent.click(screen.getByText('keep this shelf'))
    })
    // The failure a child is looking at is still theirs to act on: the thrown
    // away attempt did not reset it to pending, and nothing was re-asked for
    // them behind it.
    expect(probe().dataset.epoch).toBe('1')
    expect(probe().dataset.error).toBe('true')
    expect(probe().dataset.phase).toBe(ShelfReadPhase.Error)
    expect(outstanding()).toEqual([])

    await act(async () => {
      fireEvent.click(screen.getByText('try again'))
    })
    // The control they can see belongs to the shelf that is on screen, and it
    // re-asks THAT shelf's question — not the one the discarded attempt was
    // about, and not nothing at all.
    expect(outstanding().sort()).toEqual(['own', 'together'])
    expect(JSON.stringify(fx.reads.map((entry) => entry.target))).not.toContain(LONDON)
    expect(probe().dataset.phase).toBe(ShelfReadPhase.Pending)

    await answer(detachReads(), [makeBook({ id: 'l-1', title: 'After the retry' })])
    await waitFor(() => {
      expect(probe().dataset.titles).toBe('After the retry')
    })
    expect(outstanding()).toEqual([])
  })
})

describe('the identity a child’s shelf would be read FOR', () => {
  /**
   * `useChildren` keeps the previous answer's child object beside an unsettled
   * or FAILED re-read, so the id a shelf would read for survives a read that
   * cannot vouch for it. The surface passes those two flags in — this hook
   * never reads identity itself — and a child's query is only asked for a child
   * who is actually known.
   */
  it('is required for a child’s query: an unsettled read asks nothing and claims nothing', async () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useBookshelf(FAMILY, LINCOLN, false, { loading }),
      { initialProps: { loading: false } },
    )
    await answer(detachReads(), [makeBook({ id: 'b1', title: 'Theirs' })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['Theirs'])
    })

    rerender({ loading: true })
    // The rows go with the identity that vouched for them, in the same render.
    expect(result.current.books).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Unsettled)
    expect(result.current.error).toBe(false)
    expect(outstanding()).toEqual([])

    rerender({ loading: false })
    // Known again, so the question can be asked again — and it is asked, not
    // assumed from the answer the old identity gave.
    expect(outstanding().sort()).toEqual(['own', 'together'])
    await answer(detachReads(), [makeBook({ id: 'b1', title: 'Theirs' })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['Theirs'])
    })
  })

  it('and a FAILED identity read is its own answer, with its own recovery', async () => {
    const { result, rerender } = renderHook(
      ({ failed }: { failed: boolean }) =>
        // The real pair: a failure comes WITH `loading` still true.
        useBookshelf(FAMILY, LINCOLN, false, { loading: failed, failed }),
      { initialProps: { failed: false } },
    )
    await answer(detachReads(), [makeBook({ id: 'b1', title: 'Theirs' })])
    await waitFor(() => {
      expect(result.current.phase).toBe(ShelfReadPhase.Ready)
    })

    rerender({ failed: true })
    // Unknown, said as unknown: not an empty shelf, not this read's failure,
    // and not a spinner that cannot end.
    expect(result.current.phase).toBe(ShelfReadPhase.Unknown)
    expect(result.current.books).toEqual([])
    expect(result.current.error).toBe(false)
    expect(result.current.loading).toBe(false)
    expect(outstanding()).toEqual([])

    // This read's own retry has nothing to ask: the recovery belongs to the
    // children read, and the surface offers that one instead.
    await act(async () => {
      result.current.retry()
    })
    expect(outstanding()).toEqual([])
  })

  it('but a parent’s family query does not depend on it at all', async () => {
    const { result, rerender } = renderHook(
      ({ loading, failed }: { loading: boolean; failed: boolean }) =>
        useBookshelf(FAMILY, LINCOLN, true, { loading, failed }),
      { initialProps: { loading: false, failed: false } },
    )
    expect(outstanding()).toEqual(['all'])
    await answer(detachReads(), [makeBook({ id: 'l-1', title: 'Somebody’s' })])
    await waitFor(() => {
      expect(result.current.phase).toBe(ShelfReadPhase.Ready)
    })

    rerender({ loading: true, failed: true })
    // The family's permission scope is the family. Which child is selected, and
    // whether that selection is confirmed, is not part of the question — so the
    // parent's shelf is not blanked, re-read or failed by it.
    expect(outstanding()).toEqual([])
    expect(titles(result.current.books)).toEqual(['Somebody’s'])
    expect(result.current.phase).toBe(ShelfReadPhase.Ready)
    expect(result.current.error).toBe(false)
  })
})

describe('a scope there is nothing to read for', () => {
  it('is unsettled, which is neither an empty shelf nor a failure', () => {
    const { result } = renderHook(() => useBookshelf('', '', false))

    expect(outstanding()).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Unsettled)
    expect(result.current.books).toEqual([])
    expect(result.current.error).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('and a family with no child resolved yet asks nothing until there is one', async () => {
    const { result, rerender } = renderHook(
      ({ childId }: { childId: string }) => useBookshelf(FAMILY, childId, false),
      { initialProps: { childId: '' } },
    )
    // The shape a cold `useChildren` really produces: a family, and no child
    // resolved from the list yet. There is no honest query to ask.
    expect(outstanding()).toEqual([])
    expect(result.current.phase).toBe(ShelfReadPhase.Unsettled)

    rerender({ childId: LINCOLN })
    expect(outstanding().sort()).toEqual(['own', 'together'])
    expect(result.current.phase).toBe(ShelfReadPhase.Pending)

    await answer(detachReads(), [makeBook({ id: 'b1', title: 'At last' })])
    await waitFor(() => {
      expect(titles(result.current.books)).toEqual(['At last'])
    })
  })
})
