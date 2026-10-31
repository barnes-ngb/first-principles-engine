import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from '../../../core/types'

/**
 * UX-473 — Sol's two Chrome counterexamples, reproduced against the REAL
 * `useBook`, the real guard and a real data router.
 *
 * Both losses the browser found were same-tick or in-flight exits:
 *
 *   1. type → app-nav exit before the debounce fired → late rejection. The
 *      editor was already unmounted, so nothing could report it or re-save.
 *   2. failed save → *Try again* → app-nav exit while the retry was in flight
 *      → late rejection. Same loss.
 *
 * The first one is also why the guard's question is a FUNCTION and not a
 * boolean: a handler that mutates and navigates on the next line asks before
 * React has re-rendered, so a rendered flag answers for the tick BEFORE the
 * edit. A predicate test cannot see that — only a real mutate-then-navigate in
 * one handler can, which is what this file does.
 */

const m = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
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
  getDownloadURL: vi.fn(),
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(),
}))
vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({})),
  booksCollection: vi.fn(() => ({})),
  hoursCollection: vi.fn(() => ({})),
  stripUndefined: (value: unknown) => value,
}))
vi.mock('../../../core/firebase/storage', () => ({ storage: {} }))
// The debounce, driven by hand so "parked, not yet written" is a state this
// test can actually sit in — which is counterexample 1's whole setting.
vi.mock('../../../core/hooks/useDebounce', () => ({
  useDebounce: (fn: (...args: never[]) => void) =>
    (...args: never[]) => {
      m.queue.push({ fn, args })
    },
}))
vi.mock('../../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn() }))
vi.mock('../../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn() }))

import UnsavedBookDialog from '../UnsavedBookDialog'
import { useBook } from '../useBook'
import { useUnsavedBookGuard } from '../useUnsavedBookGuard'

const SHELF = 'My bookshelf'

const source = (): Book =>
  ({
    id: 'book',
    title: 'Synthetic',
    status: 'draft',
    childId: 'child',
    createdAt: '',
    updatedAt: '',
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

function deferred() {
  let settle!: { resolve: () => void; reject: (err: Error) => void }
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve: () => resolve(), reject }
  })
  promise.catch(() => undefined)
  return { promise, ...settle }
}

async function runParkedSaves() {
  const parked = m.queue.splice(0, m.queue.length)
  await act(async () => {
    for (const call of parked) call.fn(...call.args)
  })
}

/**
 * The smallest host that is still the real thing: the real hook, the real
 * guard, the real dialog, and a button whose handler mutates and then
 * navigates — one tick, no render in between, exactly like a toolbar chip.
 */
function Harness() {
  const { book, saveState, saveErrorMessage, hasUnsavedEdits, hasOutstandingEdits, updatePage, retrySave } =
    useBook('family', 'book')
  const navigate = useNavigate()
  const guard = useUnsavedBookGuard({ saveState, hasUnsavedEdits, hasOutstandingEdits })

  return (
    <div>
      {book ? <span>Editor open</span> : <span>Loading</span>}
      <span data-testid="save-state">{saveState}</span>
      <button
        onClick={() => {
          updatePage('page', { text: 'Typed on the way out' })
          navigate('/books')
        }}
      >
        Type and leave
      </button>
      <button onClick={() => navigate('/books')}>Leave</button>
      <UnsavedBookDialog
        open={guard.held}
        saveState={saveState}
        saveErrorMessage={saveErrorMessage}
        onRetry={retrySave}
        onStay={guard.stay}
        onLeaveAnyway={guard.leaveAnyway}
      />
    </div>
  )
}

async function renderHarness() {
  const router = createMemoryRouter(
    [
      { path: '/books/:bookId', element: <Harness /> },
      { path: '/books', element: <div>{SHELF}</div> },
    ],
    { initialEntries: ['/books/book'], initialIndex: 0 },
  )
  render(<RouterProvider router={router} />)
  await screen.findByText('Editor open')
  return router
}

const dialog = () => screen.getByRole('dialog')
const stillInEditor = () => expect(screen.getByText('Editor open')).toBeInTheDocument()

beforeEach(() => {
  m.queue.length = 0
  m.getDoc.mockReset().mockImplementation(async () => ({
    id: 'book',
    exists: () => true,
    data: source,
  }))
  m.setDoc.mockReset().mockImplementation(async () => undefined)
  m.addDoc.mockReset().mockImplementation(async () => ({ id: 'written' }))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UX-473 counterexample 1 — type, then leave before the debounce fires', () => {
  it('holds the exit on the SAME TICK as the edit, before any re-render', async () => {
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: 'Type and leave' }))

    // Nothing has been written yet — the save is still parked — and the exit
    // is held anyway. A rendered boolean would have answered 'clean' here.
    expect(m.setDoc).not.toHaveBeenCalled()
    expect(screen.queryByText(SHELF)).toBeNull()
    expect(await screen.findByText(/Saving your book/)).toBeInTheDocument()
    stillInEditor()
  })

  it('is still on screen to report the late rejection, and can re-save from it', async () => {
    const user = userEvent.setup()
    await renderHarness()
    await user.click(screen.getByRole('button', { name: 'Type and leave' }))
    await screen.findByText(/Saving your book/)

    m.setDoc.mockImplementation(async () => { throw new Error('permission-denied') })
    await runParkedSaves()

    // The editor is alive BECAUSE the exit was held, so the rejection has
    // somewhere to land and the words are still here.
    expect(await screen.findByText("Your book didn't save")).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('Save failed: permission-denied')
    expect(screen.queryByText(SHELF)).toBeNull()

    m.setDoc.mockImplementation(async () => undefined)
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))

    // Acknowledged — and the destination the kid asked for is honoured.
    expect(await screen.findByText(SHELF)).toBeInTheDocument()
    const stored = m.setDoc.mock.calls[m.setDoc.mock.calls.length - 1][1] as Book
    expect(stored.pages[0].text).toBe('Typed on the way out')
  })

  it('releases the held exit by itself when the parked write simply succeeds', async () => {
    const user = userEvent.setup()
    await renderHarness()
    await user.click(screen.getByRole('button', { name: 'Type and leave' }))
    await screen.findByText(/Saving your book/)

    await runParkedSaves()

    expect(await screen.findByText(SHELF)).toBeInTheDocument()
  })

  it('cancels the departure on Stay, keeping the words and the editor', async () => {
    const user = userEvent.setup()
    await renderHarness()
    await user.click(screen.getByRole('button', { name: 'Type and leave' }))
    await screen.findByText(/Saving your book/)

    await user.click(within(dialog()).getByRole('button', { name: 'Stay here' }))

    await waitFor(() => expect(screen.queryByText(/Saving your book/)).toBeNull())
    expect(screen.queryByText(SHELF)).toBeNull()
    stillInEditor()

    // Still outstanding, and still saveable from where she is.
    await runParkedSaves()
    await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('saved'))
  })
})

describe('UX-473 counterexample 2 — leave while a retry is in flight', () => {
  it('holds the exit and keeps the draft recoverable when that retry is rejected', async () => {
    const user = userEvent.setup()
    await renderHarness()

    // A failed save first.
    m.setDoc.mockImplementation(async () => { throw new Error('offline') })
    await user.click(screen.getByRole('button', { name: 'Type and leave' }))
    await screen.findByText(/Saving your book/)
    await runParkedSaves()
    await screen.findByText("Your book didn't save")

    // *Try again*, and then leave while it is still in the air.
    const retry = deferred()
    m.setDoc.mockImplementation(async () => retry.promise)
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('saving'))

    await user.click(within(dialog()).getByRole('button', { name: 'Stay here' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(screen.queryByText(SHELF)).toBeNull()
    expect(await screen.findByText(/Saving your book/)).toBeInTheDocument()

    // The rejection arrives late — and, because the exit was held, to a page
    // that can still say so and still re-save.
    await act(async () => { retry.reject(new Error('still offline')) })
    expect(await screen.findByText("Your book didn't save")).toBeInTheDocument()
    expect(dialog()).toHaveTextContent('Save failed: still offline')
    stillInEditor()

    m.setDoc.mockImplementation(async () => undefined)
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(SHELF)).toBeInTheDocument()
  })

  it('withholds the discard while that retry is in the air, and keeps Stay reachable', async () => {
    const user = userEvent.setup()
    await renderHarness()
    const slow = deferred()
    m.setDoc.mockImplementation(async () => slow.promise)

    await user.click(screen.getByRole('button', { name: 'Type and leave' }))
    await screen.findByText(/Saving your book/)
    await runParkedSaves()

    expect(within(dialog()).getByRole('button', { name: 'Leave anyway' })).toBeDisabled()
    expect(within(dialog()).getByRole('button', { name: 'Stay here' })).toBeEnabled()

    await act(async () => { slow.resolve() })
    expect(await screen.findByText(SHELF)).toBeInTheDocument()
  })
})

describe('UX-473 — an acknowledged book leaves without a word', () => {
  it('lets a clean exit through, with no dialog at all', async () => {
    const user = userEvent.setup()
    await renderHarness()
    await user.click(screen.getByRole('button', { name: 'Type and leave' }))
    await screen.findByText(/Saving your book/)
    await runParkedSaves()
    await screen.findByText(SHELF)
  })

  it('lets an untouched book leave immediately', async () => {
    const user = userEvent.setup()
    await renderHarness()

    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(await screen.findByText(SHELF)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
