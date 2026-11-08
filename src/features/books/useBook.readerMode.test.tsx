import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Book } from '../../core/types'

/**
 * `useBook`'s session clock belongs to an EDITOR. A reader borrows the hook.
 *
 * The hook's unmount cleanup does two separate things with the session's
 * elapsed minutes: it merges them into `books/{id}.totalMinutes` (the book's own
 * cumulative context, which the reader legitimately adds to — time was spent on
 * this book), and it writes a *"(page editing)"* `hours` entry plus, when AI art
 * was used, a *"Book illustrations"* Art entry. The second part is a claim about
 * WORK DONE, and a reader does none: `BookReaderPage` mounts the hook to read a
 * document, so a two-minute read emitted two minutes of page-editing hours that
 * nobody spent editing, on top of the reading hours the reader itself writes.
 *
 * So the hook takes an opt-OUT, defaulting to the behaviour it has always had,
 * and it suppresses exactly one thing: the `logBookHours` emission. The merge,
 * its arithmetic, and the flush-before-merge ORDER (`useBook.unmountOrder`) are
 * identical in both modes, and the cleanup is not disabled.
 *
 * Driven against the REAL hook with the REAL `useDebounce`, so the write ORDER
 * asserted here is the order Firestore would see.
 *
 * POSITIVE CONTROL: delete the `suppressEditingHours` check in the cleanup and
 * the reader cases fail on the entry they must not write; delete the merge, the
 * `logBookHours` call or the option's default and the editor cases fail.
 */

const m = vi.hoisted(() => {
  const ops: Array<{ kind: string; collection: string; data: Record<string, unknown> }> = []
  return {
    ops,
    getDoc: vi.fn(),
    setDocResult: () => Promise.resolve(),
  }
})

vi.mock('firebase/firestore', () => ({
  addDoc: (collection: { name: string }, data: Record<string, unknown>) => {
    m.ops.push({ kind: 'addDoc', collection: collection?.name ?? '?', data })
    return Promise.resolve({ id: 'written' })
  },
  setDoc: (
    ref: { collection?: string },
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ) => {
    m.ops.push({
      kind: options?.merge ? 'setDoc:merge' : 'setDoc:full',
      collection: ref?.collection ?? '?',
      data,
    })
    return m.setDocResult()
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
vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn().mockResolvedValue(0) }))
vi.mock('../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn().mockResolvedValue(undefined) }))

import { useBook } from './useBook'

const source = (): Book =>
  ({
    id: 'book',
    title: 'Synthetic',
    status: 'draft',
    childId: 'child-owner',
    totalMinutes: 7,
    createdAt: '',
    updatedAt: '',
    subjectBuckets: [],
    pages: [
      {
        id: 'page',
        pageNumber: 1,
        text: 'Before',
        layout: 'image-top',
        createdAt: '',
        updatedAt: '',
        images: [],
      },
    ],
  }) as Book

let clock = 0
const minutes = (n: number) => { clock += n * 60_000 }

const hoursRows = () =>
  m.ops.filter((op) => op.kind === 'addDoc' && op.collection === 'hours').map((op) => op.data)
const kinds = () => m.ops.map((op) => `${op.kind}:${op.collection}`)
const merges = () =>
  m.ops.filter((op) => op.kind === 'setDoc:merge').map((op) => op.data)

beforeEach(() => {
  clock = Date.parse('2026-11-08T15:00:00.000Z')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  m.ops.length = 0
  m.setDocResult = () => Promise.resolve()
  m.getDoc.mockImplementation(async () => ({
    id: 'book',
    exists: () => true,
    data: source,
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Let the awaited second half of `logBookHours` (the Art entry) land. */
const settleWrites = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

async function mountBook(options?: { suppressEditingHours?: boolean }) {
  const view = renderHook(() => useBook('family', 'book', options))
  await waitFor(() => expect(view.result.current.book).not.toBeNull())
  return view
}

describe('useBook — default (editor) hours behaviour is unchanged', () => {
  it('writes the page-editing entry and the cumulative total, in that order, after the flush', async () => {
    const { result, unmount } = await mountBook()
    act(() => result.current.updatePage('page', { text: 'Typed words' }))
    minutes(2)
    unmount()

    expect(hoursRows()).toHaveLength(1)
    expect(hoursRows()[0]).toMatchObject({
      childId: 'child-owner',
      minutes: 2,
      subjectBucket: 'LanguageArts',
      notes: 'Book: "Synthetic" (page editing)',
    })
    // The flushed full-document write lands BEFORE the merge that carries the
    // new total, so the stored total cannot be put back (UX-353 / round 1 P2).
    expect(kinds().filter((k) => k.startsWith('setDoc'))).toEqual([
      'setDoc:full:books',
      'setDoc:merge:books',
    ])
    expect(merges()[0]).toMatchObject({ totalMinutes: 9 })
  })

  it('still writes the illustration Art entry when AI art was used', async () => {
    const { result, unmount } = await mountBook()
    act(() => result.current.addAiImageToPage('page', 'art.png', 'path', 'a dog'))
    minutes(2)
    unmount()
    await settleWrites()

    expect(hoursRows()).toHaveLength(2)
    expect(hoursRows()[1]).toMatchObject({
      childId: 'child-owner',
      minutes: 2,
      subjectBucket: 'Art',
      notes: 'Book illustrations: "Synthetic"',
    })
  })

  it('writes neither the entry nor the total below the rounded-minute floor', async () => {
    const { unmount } = await mountBook()
    // The rule is `Math.round(ms / 60000)` and THEN `>= 1`, so the floor sits at
    // 30s, not at 60s. 29s is the sub-boundary value.
    clock += 29_000
    unmount()

    expect(hoursRows()).toHaveLength(0)
    expect(merges()).toHaveLength(0)
  })

  it('keeps the rounding rule exactly: 30s and 45s are one minute, 90s is two', async () => {
    const half = await mountBook()
    clock += 30_000
    half.unmount()
    expect(hoursRows()[0]).toMatchObject({ minutes: 1 })
    expect(merges()[0]).toMatchObject({ totalMinutes: 8 })

    m.ops.length = 0
    const threeQuarters = await mountBook()
    clock += 45_000
    threeQuarters.unmount()
    expect(hoursRows()[0]).toMatchObject({ minutes: 1 })
    expect(merges()[0]).toMatchObject({ totalMinutes: 8 })

    m.ops.length = 0
    const long = await mountBook()
    clock += 90_000
    long.unmount()
    expect(hoursRows()[0]).toMatchObject({ minutes: 2 })
    expect(merges()[0]).toMatchObject({ totalMinutes: 9 })
  })
})

describe('useBook — reader mode suppresses ONLY the editing-hours emission', () => {
  it('writes no hours entry for a two-minute read, and still merges the book total', async () => {
    const { unmount } = await mountBook({ suppressEditingHours: true })
    minutes(2)
    unmount()

    // The approved numeric effect, and the whole of it.
    expect(hoursRows()).toHaveLength(0)
    // Retained legacy book-owned cumulative context: same field, same
    // arithmetic, same merge, same `updatedAt`.
    expect(merges()).toHaveLength(1)
    expect(merges()[0]).toMatchObject({ totalMinutes: 9 })
    expect(typeof merges()[0].updatedAt).toBe('string')
  })

  it('keeps the flush-before-total order, and the cleanup, in reader mode too', async () => {
    const { result, unmount } = await mountBook({ suppressEditingHours: true })
    act(() => result.current.updatePage('page', { text: 'An edit through the same hook' }))
    minutes(2)
    unmount()

    expect(kinds().filter((k) => k.startsWith('setDoc'))).toEqual([
      'setDoc:full:books',
      'setDoc:merge:books',
    ])
    expect(merges()[0]).toMatchObject({ totalMinutes: 9 })
    expect(hoursRows()).toHaveLength(0)
  })

  it('suppresses the Art entry with it — a reader generates no illustrations', async () => {
    const { result, unmount } = await mountBook({ suppressEditingHours: true })
    act(() => result.current.addAiImageToPage('page', 'art.png', 'path', 'a dog'))
    minutes(2)
    unmount()
    await settleWrites()

    expect(hoursRows()).toHaveLength(0)
    expect(merges()[0]).toMatchObject({ totalMinutes: 9 })
  })

  it('leaves the floor and the rounding where they are, in reader mode too', async () => {
    const below = await mountBook({ suppressEditingHours: true })
    clock += 29_000
    below.unmount()
    expect(hoursRows()).toHaveLength(0)
    expect(merges()).toHaveLength(0)

    // Above the rounded floor the book total still moves by the SAME rounded
    // minutes the editor would have used — only the hours entry is suppressed.
    m.ops.length = 0
    const half = await mountBook({ suppressEditingHours: true })
    clock += 30_000
    half.unmount()
    expect(hoursRows()).toHaveLength(0)
    expect(merges()[0]).toMatchObject({ totalMinutes: 8 })

    m.ops.length = 0
    const long = await mountBook({ suppressEditingHours: true })
    clock += 90_000
    long.unmount()
    expect(hoursRows()).toHaveLength(0)
    expect(merges()[0]).toMatchObject({ totalMinutes: 9 })
  })

  it('is bound to the session: a host that flips the flag mid-session does not re-arm it', async () => {
    const view = renderHook(
      ({ suppress }: { suppress: boolean }) =>
        useBook('family', 'book', { suppressEditingHours: suppress }),
      { initialProps: { suppress: true } },
    )
    await waitFor(() => expect(view.result.current.book).not.toBeNull())
    minutes(2)
    view.rerender({ suppress: false })
    view.unmount()

    expect(hoursRows()).toHaveLength(0)
  })

  it('changes nothing about the document write, its state or its retry', async () => {
    m.setDocResult = () => Promise.reject(new Error('offline'))
    const { result, unmount } = await mountBook({ suppressEditingHours: true })
    await act(async () => {
      result.current.updatePage('page', { text: 'An edit that fails' })
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.saveState).toBe('error'), { timeout: 4000 })
    expect(result.current.hasOutstandingEdits()).toBe(true)

    m.setDocResult = () => Promise.resolve()
    await act(async () => {
      result.current.retrySave()
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.saveState).toBe('saved'), { timeout: 4000 })
    expect(result.current.hasUnsavedEdits).toBe(false)
    unmount()
  })
})
