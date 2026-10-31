import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../core/types'

/**
 * UX-473 — a failed book save keeps the latest edits, and says so truthfully.
 *
 * The prior synthetic record (`useBook.mutations` + `useDebounce`) established
 * that a rejected `setDoc` left `saveState: 'error'` with the words still in
 * React state, and that leaving and reopening then showed the OLD words: the
 * hook had no way to write that draft again and nothing held the exit. It also
 * established that an acknowledged save reopens the latest words — so what was
 * missing was never the write. It was the retry, and knowing WHICH edit a write
 * acknowledged.
 *
 * These are synthetic Firestore mocks, not a live Firebase proof: they pin this
 * hook's bookkeeping and the calls it makes, and say nothing about what the real
 * backend does with them. Device and workflow acceptance is independent (Sol).
 */

const m = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  uploadBytes: vi.fn(),
  /** Calls parked by the debounce, flushed by hand. */
  queue: [] as { fn: (...args: never[]) => void; args: never[] }[],
}))

vi.mock('firebase/firestore', () => ({
  addDoc: m.addDoc,
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getDoc: m.getDoc,
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: m.setDoc,
  where: vi.fn(),
}))
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(async () => 'https://stored/file'),
  ref: vi.fn(() => ({})),
  uploadBytes: m.uploadBytes,
}))
vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({})),
  booksCollection: vi.fn(() => ({})),
  hoursCollection: vi.fn(() => ({})),
  stripUndefined: (value: unknown) => value,
}))
vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))
// A debounce driven by hand, keeping the real one's load-bearing property
// (UX-345): a parked call carries the function it was MADE with. The timer
// itself is pinned by `src/core/hooks/useDebounce.test.tsx`; what matters here
// is that an edit which has NOT yet reached the writer still counts as unsaved.
vi.mock('../../../core/hooks/useDebounce', () => ({
  useDebounce: (fn: (...args: never[]) => void) =>
    (...args: never[]) => {
      m.queue.push({ fn, args })
    },
}))
vi.mock('../../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn() }))
vi.mock('../../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn() }))

import { useBook } from '../useBook'

const source = (): Book =>
  ({
    id: 'book',
    title: 'Synthetic',
    status: 'draft',
    childId: 'child',
    totalMinutes: 4,
    createdAt: '',
    updatedAt: '',
    // Required on `Book`; `tsc` flagged its absence here. Supplied as the real
    // field rather than cast away, so the fixture stays a real document.
    subjectBuckets: ['LanguageArts'],
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

const other = (): Book => ({ ...source(), id: 'other', title: 'Other book' })

const snapshotOf = (book: Book) => ({ id: book.id, exists: () => true, data: () => book })

/** A promise this test settles when it chooses to. */
function deferred() {
  let settle!: { resolve: () => void; reject: (err: Error) => void }
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve: () => resolve(), reject }
  })
  // Nothing awaits the rejection until the hook does; keep Node quiet until then.
  promise.catch(() => undefined)
  return { promise, ...settle }
}

/** Run everything the debounce has parked, as the timer or a flush would. */
async function runParkedSaves() {
  const parked = m.queue.splice(0, m.queue.length)
  await act(async () => {
    for (const call of parked) call.fn(...call.args)
  })
}

const storedCalls = () => m.setDoc.mock.calls
const lastStored = () => storedCalls()[storedCalls().length - 1][1] as Book

beforeEach(() => {
  m.queue.length = 0
  m.getDoc.mockReset().mockImplementation(async () => snapshotOf(source()))
  m.setDoc.mockReset().mockImplementation(async () => undefined)
  m.addDoc.mockReset().mockImplementation(async () => ({ id: 'written' }))
  m.uploadBytes.mockReset().mockImplementation(async () => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useBook — a failed save keeps the latest draft retryable (UX-473)', () => {
  it('counts a parked edit as unsaved before any write is attempted', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    expect(result.current.hasUnsavedEdits).toBe(false)

    act(() => result.current.updatePage('page', { text: 'Queued words' }))

    expect(result.current.hasUnsavedEdits).toBe(true)
    expect(m.queue).toHaveLength(1)
    expect(storedCalls()).toHaveLength(0)
    expect(result.current.saveState).toBe('idle')
  })

  it('reports a rejected save, keeps the words on the page, and keeps them outstanding', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    m.setDoc.mockImplementation(async () => { throw new Error('permission-denied') })

    act(() => result.current.updatePage('page', { text: 'Queued words' }))
    await runParkedSaves()

    expect(result.current.saveState).toBe('error')
    expect(result.current.saveErrorMessage).toBe('Save failed: permission-denied')
    expect(result.current.hasUnsavedEdits).toBe(true)
    expect(result.current.book?.pages[0].text).toBe('Queued words')
  })

  it('retries the LATEST draft — including words typed while the error was on screen', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    m.setDoc.mockImplementation(async () => { throw new Error('offline') })

    act(() => result.current.updatePage('page', { text: 'First words' }))
    await runParkedSaves()
    expect(result.current.saveState).toBe('error')

    // Typed while the failure was visible — the edit a retry has to carry.
    act(() => result.current.updatePage('page', { text: 'Newer words' }))
    expect(result.current.hasUnsavedEdits).toBe(true)

    m.setDoc.mockImplementation(async () => undefined)
    await act(async () => { result.current.retrySave() })

    expect(lastStored().pages[0].text).toBe('Newer words')
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    expect(result.current.hasUnsavedEdits).toBe(false)

    // The still-parked debounce carries that same edit. Running it must not
    // un-say "saved", and a failure of it must not re-raise a stored edit.
    m.setDoc.mockImplementation(async () => { throw new Error('late duplicate') })
    await runParkedSaves()
    expect(result.current.saveState).toBe('saved')
    expect(result.current.hasUnsavedEdits).toBe(false)
  })

  it('stays honest when a retry fails, and a second retry still lands', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    m.setDoc.mockImplementation(async () => { throw new Error('first failure') })

    act(() => result.current.updatePage('page', { text: 'Keep me' }))
    await runParkedSaves()
    expect(result.current.saveErrorMessage).toBe('Save failed: first failure')

    m.setDoc.mockImplementation(async () => { throw new Error('second failure') })
    await act(async () => { result.current.retrySave() })
    expect(result.current.saveState).toBe('error')
    expect(result.current.saveErrorMessage).toBe('Save failed: second failure')
    expect(result.current.hasUnsavedEdits).toBe(true)
    expect(result.current.book?.pages[0].text).toBe('Keep me')

    m.setDoc.mockImplementation(async () => undefined)
    await act(async () => { result.current.retrySave() })
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    expect(result.current.hasUnsavedEdits).toBe(false)
    expect(lastStored().pages[0].text).toBe('Keep me')
  })

  it('does not call a book saved because an OLDER write landed', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    const first = deferred()
    m.setDoc.mockImplementation(async () => first.promise)

    act(() => result.current.updatePage('page', { text: 'Edit one' }))
    await runParkedSaves()
    expect(result.current.saveState).toBe('saving')

    // Typed while that write is still in flight.
    act(() => result.current.updatePage('page', { text: 'Edit two' }))

    await act(async () => { first.resolve() })
    expect(result.current.saveState).toBe('saving')
    expect(result.current.hasUnsavedEdits).toBe(true)

    m.setDoc.mockImplementation(async () => undefined)
    await runParkedSaves()
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    expect(result.current.hasUnsavedEdits).toBe(false)
    expect(lastStored().pages[0].text).toBe('Edit two')
  })

  it('ignores a failure for an edit a later write already acknowledged', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    const slow = deferred()
    m.setDoc.mockImplementation(async () => slow.promise)

    act(() => result.current.updatePage('page', { text: 'Edit one' }))
    await runParkedSaves()

    act(() => result.current.updatePage('page', { text: 'Edit two' }))
    m.setDoc.mockImplementation(async () => undefined)
    await runParkedSaves()
    await waitFor(() => expect(result.current.saveState).toBe('saved'))

    // The first write now comes back failed. Its words are inside the document
    // the second write stored, so an error here would be a lie — and would
    // re-arm the guard that holds the way out of the editor.
    await act(async () => { slow.reject(new Error('stale rejection')) })
    expect(result.current.saveState).toBe('saved')
    expect(result.current.saveErrorMessage).toBeNull()
    expect(result.current.hasUnsavedEdits).toBe(false)
  })

  it("does not carry one book's failure, or its retry, onto another book", async () => {
    const { result, rerender } = renderHook(({ id }) => useBook('family', id), {
      initialProps: { id: 'book' },
    })
    await waitFor(() => expect(result.current.book).not.toBeNull())
    const stuck = deferred()
    m.setDoc.mockImplementation(async () => stuck.promise)

    act(() => result.current.updatePage('page', { text: 'Book one words' }))
    await runParkedSaves()

    m.getDoc.mockImplementation(async () => snapshotOf(other()))
    rerender({ id: 'other' })
    await waitFor(() => expect(result.current.book?.id).toBe('other'))

    // The other book's status starts clean — never inherited.
    expect(result.current.saveState).toBe('idle')
    expect(result.current.saveErrorMessage).toBeNull()
    expect(result.current.hasUnsavedEdits).toBe(false)

    // A retry here owns nothing outstanding, so it writes nothing at all.
    const before = storedCalls().length
    await act(async () => { result.current.retrySave() })
    expect(storedCalls()).toHaveLength(before)

    // And the first book's failure, arriving late, does not repaint this one.
    await act(async () => { stuck.reject(new Error('late failure for book one')) })
    expect(result.current.saveState).toBe('idle')
    expect(result.current.saveErrorMessage).toBeNull()
    expect(result.current.hasUnsavedEdits).toBe(false)
  })

  it('retries the book it is scoped to, with the edits that book owns', async () => {
    const { result, rerender } = renderHook(({ id }) => useBook('family', id), {
      initialProps: { id: 'book' },
    })
    await waitFor(() => expect(result.current.book).not.toBeNull())

    m.getDoc.mockImplementation(async () => snapshotOf(other()))
    rerender({ id: 'other' })
    await waitFor(() => expect(result.current.book?.id).toBe('other'))

    m.setDoc.mockImplementation(async () => { throw new Error('nope') })
    act(() => result.current.updatePage('page', { text: 'Other book words' }))
    await runParkedSaves()
    expect(result.current.saveState).toBe('error')

    m.setDoc.mockImplementation(async () => undefined)
    await act(async () => { result.current.retrySave() })
    expect(lastStored().title).toBe('Other book')
    expect(lastStored().pages[0].text).toBe('Other book words')
  })

  it('reports an upload failure as its OWN thing, with no document Retry', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    m.uploadBytes.mockImplementation(async () => { throw new Error('storage is down') })

    await act(async () => { await result.current.uploadAudio('page', new Blob()) })

    expect(result.current.uploadErrorMessage).toBe(
      "This recording wasn't added. Try adding it again. (storage is down)",
    )
    // The DOCUMENT is unchanged and matches what is stored, so it must not be
    // reported as failed — and there is nothing outstanding to re-save, which
    // is what keeps the editor's Retry door (gated on the flag) shut.
    expect(result.current.saveState).toBe('idle')
    expect(result.current.saveErrorMessage).toBeNull()
    expect(result.current.uploadBusy).toBe(false)
    expect(result.current.hasUnsavedEdits).toBe(false)
    expect(result.current.hasOutstandingEdits()).toBe(false)
    const before = storedCalls().length
    await act(async () => { result.current.retrySave() })
    expect(storedCalls()).toHaveLength(before)
  })

  it('does not let a document save that lands claim the missing picture arrived', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())

    // The coincidence that used to produce two lies at once: words typed, and
    // a picture that never got added.
    act(() => result.current.updatePage('page', { text: 'Words and a picture' }))
    m.uploadBytes.mockImplementation(async () => { throw new Error('storage is down') })
    await act(async () => { await result.current.addImageToPage('page', new File([''], 'p.jpg')) })

    const notice = "This picture wasn't added. Try adding it again. (storage is down)"
    expect(result.current.uploadErrorMessage).toBe(notice)
    // The pending text edit still owns the document's status — the upload did
    // not seize it, and did not clear the edit either.
    expect(result.current.hasUnsavedEdits).toBe(true)
    expect(result.current.saveState).toBe('idle')

    m.setDoc.mockImplementation(async () => undefined)
    await runParkedSaves()
    await waitFor(() => expect(result.current.saveState).toBe('saved'))

    // The words are saved. The picture is still missing, and the notice that
    // says so SURVIVES the save that had nothing to do with it.
    expect(lastStored().pages[0].text).toBe('Words and a picture')
    expect(result.current.uploadErrorMessage).toBe(notice)

    act(() => result.current.clearUploadError())
    expect(result.current.uploadErrorMessage).toBeNull()
  })
})

describe('useBook — uploads never speak for the document (UX-473)', () => {
  /**
   * The root's reproduction against the real hook: a consumed debounce write
   * failed, then an upload started and ALSO failed, and because the draft was
   * dirty the upload's borrowed 'saving' was kept — so the indicator span with
   * no document request in flight, the *Try again* banner (gated on 'error')
   * disappeared, and the departure dialog believed a write was in the air.
   */
  it('leaves a FAILED document save failed, and its Retry reachable, across an upload', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    m.setDoc.mockImplementation(async () => { throw new Error('permission-denied') })

    act(() => result.current.updatePage('page', { text: 'Words worth keeping' }))
    await runParkedSaves()
    expect(result.current.saveState).toBe('error')

    const upload = deferred()
    m.uploadBytes.mockImplementation(async () => upload.promise)
    let pending!: Promise<void>
    await act(async () => { pending = result.current.uploadAudio('page', new Blob()) })

    // DURING the upload: the document's verdict is untouched, so the banner and
    // the dialog both still read 'error' rather than a write that is not there.
    expect(result.current.saveState).toBe('error')
    expect(result.current.saveErrorMessage).toBe('Save failed: permission-denied')
    expect(result.current.uploadBusy).toBe(true)

    await act(async () => { upload.reject(new Error('storage is down')); await pending })

    // AFTER it fails: still 'error', still dirty, Retry still the way out.
    expect(result.current.saveState).toBe('error')
    expect(result.current.hasUnsavedEdits).toBe(true)
    expect(result.current.uploadBusy).toBe(false)
    expect(result.current.uploadErrorMessage).toBe(
      "This recording wasn't added. Try adding it again. (storage is down)",
    )

    m.setDoc.mockImplementation(async () => undefined)
    await act(async () => { result.current.retrySave() })
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    expect(lastStored().pages[0].text).toBe('Words worth keeping')
  })

  const entryPoints = [
    {
      kind: 'picture',
      run: (api: ReturnType<typeof useBook>) => api.addImageToPage('page', new File([''], 'p.jpg')),
    },
    {
      kind: 'drawing',
      run: (api: ReturnType<typeof useBook>) => api.addSketchToPage('page', new File([''], 's.jpg')),
    },
    {
      kind: 'sticker',
      run: (api: ReturnType<typeof useBook>) => api.addStickerFileToPage('page', new File([''], 'k.png'), 'Star'),
    },
    {
      kind: 'recording',
      run: (api: ReturnType<typeof useBook>) => api.uploadAudio('page', new Blob()),
    },
  ] as const

  // The audio case was only the counterexample that happened to be reported.
  for (const { kind, run } of entryPoints) {
    it(`never moves saveState for a ${kind}, failing or succeeding`, async () => {
      // Every RENDERED value, which is what the editor would actually draw —
      // so a 'saving' flicker inside the upload cannot hide between samples.
      const seen: string[] = []
      const { result } = renderHook(() => {
        const api = useBook('family', 'book')
        if (seen[seen.length - 1] !== api.saveState) seen.push(api.saveState)
        return api
      })
      await waitFor(() => expect(result.current.book).not.toBeNull())

      m.uploadBytes.mockImplementation(async () => { throw new Error('nope') })
      await act(async () => { await run(result.current) })

      expect(result.current.uploadErrorMessage).toBe(
        `This ${kind} wasn't added. Try adding it again. (nope)`,
      )
      // No document write was attempted and none is pretended: 'idle' start to
      // finish, with no 'saving' flicker and no borrowed 'error'.
      expect(seen).toEqual(['idle'])
      expect(result.current.uploadBusy).toBe(false)

      // A SUCCESS still goes through applyUpdate, which schedules a real write.
      m.uploadBytes.mockImplementation(async () => undefined)
      await act(async () => { await run(result.current) })
      expect(result.current.uploadErrorMessage).toBeNull()
      expect(result.current.hasUnsavedEdits).toBe(true)
      expect(m.queue).not.toHaveLength(0)
      await runParkedSaves()
      await waitFor(() => expect(result.current.saveState).toBe('saved'))
    })
  }

  it("does not post one family's upload failure onto the book that replaced it", async () => {
    const { result, rerender } = renderHook(({ family, id }) => useBook(family, id), {
      initialProps: { family: 'family', id: 'book' },
    })
    await waitFor(() => expect(result.current.book).not.toBeNull())

    const upload = deferred()
    m.uploadBytes.mockImplementation(async () => upload.promise)
    let pending!: Promise<void>
    await act(async () => { pending = result.current.uploadAudio('page', new Blob()) })
    expect(result.current.uploadBusy).toBe(true)

    m.getDoc.mockImplementation(async () => snapshotOf(other()))
    rerender({ family: 'second-family', id: 'other' })
    await waitFor(() => expect(result.current.book?.id).toBe('other'))
    expect(result.current.uploadBusy).toBe(false)

    await act(async () => { upload.reject(new Error('old family failure')); await pending })

    // The rejection belongs to a book nobody is looking at. It must not appear
    // on this one — the leak the root reproduced.
    expect(result.current.uploadErrorMessage).toBeNull()
    expect(result.current.uploadBusy).toBe(false)
    expect(result.current.saveState).toBe('idle')
  })

  it('does not let a late upload SUCCESS write into the book that replaced it', async () => {
    const { result, rerender } = renderHook(({ family, id }) => useBook(family, id), {
      initialProps: { family: 'family', id: 'book' },
    })
    await waitFor(() => expect(result.current.book).not.toBeNull())

    const upload = deferred()
    m.uploadBytes.mockImplementation(async () => upload.promise)
    let pending!: Promise<void>
    await act(async () => { pending = result.current.uploadAudio('page', new Blob()) })

    m.getDoc.mockImplementation(async () => snapshotOf(other()))
    rerender({ family: 'second-family', id: 'other' })
    await waitFor(() => expect(result.current.book?.id).toBe('other'))

    m.queue.length = 0
    await act(async () => { upload.resolve(); await pending })

    // `applyUpdate`'s existing scope check is what refuses it; nothing is
    // scheduled and the new book stays clean.
    expect(m.queue).toHaveLength(0)
    expect(result.current.hasUnsavedEdits).toBe(false)
    expect(result.current.hasOutstandingEdits()).toBe(false)
    expect(result.current.uploadErrorMessage).toBeNull()
  })
})

describe('useBook — the dirty answer a same-tick navigation reads (UX-473)', () => {
  it('is true the instant an edit is accepted, before any re-render', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    expect(result.current.hasOutstandingEdits()).toBe(false)

    // Exactly what a chip handler does: mutate, then ask — inside one tick,
    // with no render in between. The rendered flag is still stale here, and
    // this is the gap Chrome found the first edit of a session escaping.
    const api = result.current
    let answeredInSameTick: boolean | null = null
    act(() => {
      api.updatePage('page', { text: 'Typed and leaving' })
      answeredInSameTick = api.hasOutstandingEdits()
    })

    expect(answeredInSameTick).toBe(true)
    expect(result.current.hasOutstandingEdits()).toBe(true)
  })

  it('answers false for a book it no longer holds, so a late callback cannot release it', async () => {
    const { result, rerender } = renderHook(({ id }) => useBook('family', id), {
      initialProps: { id: 'book' },
    })
    await waitFor(() => expect(result.current.book).not.toBeNull())
    const stuck = deferred()
    m.setDoc.mockImplementation(async () => stuck.promise)

    act(() => result.current.updatePage('page', { text: 'Book one words' }))
    await runParkedSaves()
    const firstBook = result.current

    m.getDoc.mockImplementation(async () => snapshotOf(other()))
    rerender({ id: 'other' })
    await waitFor(() => expect(result.current.book?.id).toBe('other'))

    // The abandoned book's own accessor now answers for nobody, and the book
    // on screen is clean — so neither can arm or release the other's guard.
    expect(firstBook.hasOutstandingEdits()).toBe(false)
    expect(result.current.hasOutstandingEdits()).toBe(false)

    await act(async () => { stuck.reject(new Error('late failure for book one')) })
    expect(result.current.hasOutstandingEdits()).toBe(false)
    expect(result.current.saveState).toBe('idle')
  })

  it('stays true through a failure and clears only on acknowledgment', async () => {
    const { result } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())
    m.setDoc.mockImplementation(async () => { throw new Error('offline') })

    act(() => result.current.updatePage('page', { text: 'Held' }))
    expect(result.current.hasOutstandingEdits()).toBe(true)
    await runParkedSaves()
    expect(result.current.hasOutstandingEdits()).toBe(true)

    m.setDoc.mockImplementation(async () => undefined)
    await act(async () => { result.current.retrySave() })
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    expect(result.current.hasOutstandingEdits()).toBe(false)
  })
})

describe('useBook — the hours bookkeeping this change must not move (UX-473)', () => {
  it('still writes the same session arithmetic on unmount', async () => {
    const mountedAt = 1_700_000_000_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(mountedAt)
    const { result, unmount } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())

    now.mockReturnValue(mountedAt + 10 * 60_000)
    unmount()

    // `totalMinutes` 4 + 10 elapsed = 14, written as a MERGE so a flushed
    // full-document write cannot be what carries it (the UX-353 ordering,
    // pinned as an order by `useBook.unmountOrder.test.ts`).
    const merge = storedCalls().find((call) => call[2]?.merge === true)
    expect(merge).toBeDefined()
    expect(merge![1].totalMinutes).toBe(14)
    const hoursRow = m.addDoc.mock.calls[0][1]
    expect(hoursRow.minutes).toBe(10)
    expect(hoursRow.childId).toBe('child')
    expect(hoursRow.subjectBucket).toBe('LanguageArts')
  })

  it('still writes nothing for a session under a minute', async () => {
    const mountedAt = 1_700_000_000_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(mountedAt)
    const { result, unmount } = renderHook(() => useBook('family', 'book'))
    await waitFor(() => expect(result.current.book).not.toBeNull())

    now.mockReturnValue(mountedAt + 20_000)
    unmount()

    expect(storedCalls().some((call) => call[2]?.merge === true)).toBe(false)
    expect(m.addDoc.mock.calls).toHaveLength(0)
  })
})
