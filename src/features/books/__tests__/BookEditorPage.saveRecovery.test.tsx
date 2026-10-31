import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Link, Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-473 — every way out of the book editor, with a save that failed.
 *
 * Rendered against a REAL `createMemoryRouter`, which is what the app has
 * (`src/app/router.tsx`), because the point of putting the guard on the route
 * rather than on this page's four `navigate` calls is the two exits the page
 * never sees: the shell's own nav and the device's Back button. A test that
 * mocked the router would assert the half that was never the gap.
 */

const control = vi.hoisted(() => ({
  saveState: 'error' as 'idle' | 'saving' | 'saved' | 'error',
  saveErrorMessage: 'Save failed: permission-denied' as string | null,
  hasUnsavedEdits: true,
  uploadErrorMessage: null as string | null,
  uploadBusy: false,
  retrySave: vi.fn(),
  clearUploadError: vi.fn(),
  /** Re-render the editor after this test changes the save status. */
  bump: null as null | (() => void),
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'Test Child' },
    children: [{ id: 'child-1', name: 'Test Child' }],
    isChildProfile: true,
  }),
}))
vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: 'child', themeMode: 'family', canEdit: true }),
}))
vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({
    imageFailureRef: { current: null },
    generateImage: vi.fn(),
    enhanceSketch: vi.fn(),
    loading: false,
    error: null,
  }),
}))
vi.mock('../useBackgroundReimagine', () => ({ useBackgroundReimagine: () => ({ job: null }) }))
vi.mock('../useBookArtQuota', () => ({
  useBookArtQuota: () => ({ atLimit: false, limit: 100, remaining: 100, recordGeneration: vi.fn() }),
  recordBookArtGeneration: vi.fn(),
}))

vi.mock('../useBook', async () => {
  const React = await import('react')
  const book = {
    id: 'book-1',
    childId: 'child-1',
    title: 'My Book',
    status: 'draft',
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        text: 'Hello world',
        images: [],
        layout: 'image-top',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    subjectBuckets: [],
  }
  const noop = vi.fn()
  return {
    useBook: () => {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        control.bump = () => setTick((n) => n + 1)
        return () => {
          control.bump = null
        }
      }, [])
      return {
        book,
        loading: false,
        saveState: control.saveState,
        saveErrorMessage: control.saveErrorMessage,
        uploadErrorMessage: control.uploadErrorMessage,
        uploadBusy: control.uploadBusy,
        clearUploadError: control.clearUploadError,
        hasUnsavedEdits: control.hasUnsavedEdits,
        // The real hook answers from a synchronously-written ref; here the
        // control object IS that authority, and the guard reads it the same way.
        hasOutstandingEdits: () => control.hasUnsavedEdits,
        retrySave: control.retrySave,
        updatePage: noop,
        changePage: noop,
        addPage: noop,
        deletePage: noop,
        reorderPages: noop,
        updateBookMeta: noop,
        addImageToPage: noop,
        prepareBackgroundPhoto: noop,
        prepareAiPageImage: noop,
        removeImageFromPage: noop,
        uploadAudio: noop,
        addAiImageToPage: noop,
        addStickerToPage: noop,
        addStickerFileToPage: noop,
        updateImagePosition: noop,
        reorderImage: noop,
        addSketchToPage: noop,
        applySketchEnhancement: noop,
        pickSketchVersion: noop,
        restoreImageVersion: noop,
        usedAiGeneration: false,
      }
    },
  }
})

vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../../components/CreativeTimer', () => ({ default: () => null }))
vi.mock('../../../components/AudioRecorder', () => ({ default: () => null }))
vi.mock('../../../components/PhotoCapture', () => ({ default: () => null }))
vi.mock('../../../components/SaveIndicator', () => ({ default: () => null }))
vi.mock('../PageEditor', () => ({ default: () => null }))
vi.mock('../StickerPicker', () => ({ default: () => null }))
vi.mock('../DrawingChoiceDialog', () => ({ default: () => null }))
vi.mock('../ReimagineResultDialog', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))

import BookEditorPage from '../BookEditorPage'

const SHELF = 'My bookshelf'
const READER = 'Reading view'
const ELSEWHERE = 'Today page'
/** Exactly what `uploadNotAddedMessage` produces, copied so the UI pins it. */
const UPLOAD_NOTICE = "This picture wasn't added. Try adding it again. (storage is down)"

function renderEditor() {
  const router = createMemoryRouter(
    [
      {
        // Stands in for `AppShell`: nav that lives OUTSIDE the editor and so
        // never passes through any `navigate` call the editor could intercept.
        element: (
          <>
            <Link to="/today">Go to Today</Link>
            <Outlet />
          </>
        ),
        children: [
          { path: '/books', element: <div>{SHELF}</div> },
          { path: '/books/:bookId', element: <BookEditorPage /> },
          { path: '/books/:bookId/read', element: <div>{READER}</div> },
          { path: '/today', element: <div>{ELSEWHERE}</div> },
        ],
      },
    ],
    { initialEntries: ['/books', '/books/book-1'], initialIndex: 1 },
  )
  render(<RouterProvider router={router} />)
  return router
}

/** Change the save status the way a real save outcome would, and re-render. */
async function setSaveStatus(next: {
  saveState: typeof control.saveState
  hasUnsavedEdits: boolean
  saveErrorMessage?: string | null
}) {
  await act(async () => {
    control.saveState = next.saveState
    control.hasUnsavedEdits = next.hasUnsavedEdits
    if ('saveErrorMessage' in next) control.saveErrorMessage = next.saveErrorMessage ?? null
    control.bump?.()
  })
}

const dialog = () => screen.getByRole('dialog')
/**
 * Still in the editor. Asserted on the book's TITLE rather than on a role,
 * because an open MUI dialog marks the page behind it `aria-hidden` and
 * role queries deliberately skip hidden subtrees.
 */
const stillOnEditor = () => expect(screen.getByText('My Book')).toBeInTheDocument()
/** The in-page error banner, found by its own words rather than by `role=alert`,
 *  which this page can legitimately have more than one of. */
const retryBanner = () => screen.getByText(/your latest edits are still here/)

beforeEach(() => {
  control.saveState = 'error'
  control.saveErrorMessage = 'Save failed: permission-denied'
  control.uploadErrorMessage = null
  control.uploadBusy = false
  control.hasUnsavedEdits = true
  control.retrySave.mockReset()
  control.clearUploadError.mockReset()
})

describe('BookEditorPage — recovering a failed save in place (UX-473)', () => {
  it('shows the actual error with a Retry beside it, and says the words are still here', async () => {
    const user = userEvent.setup()
    renderEditor()

    expect(retryBanner()).toHaveTextContent('Save failed: permission-denied')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(control.retrySave).toHaveBeenCalledTimes(1)
  })

  it('offers no Retry when a save never failed', async () => {
    control.saveState = 'saved'
    control.hasUnsavedEdits = false
    renderEditor()

    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('reports a failed upload on its own, with no Retry that could not repair it', async () => {
    control.saveState = 'idle'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = false
    control.uploadErrorMessage = UPLOAD_NOTICE
    renderEditor()

    expect(screen.getByText(UPLOAD_NOTICE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('says nothing about the document in the upload notice — not even reassurance', async () => {
    // It used to append "your words are safe", which was a claim about a
    // different subsystem and was false whenever the document was itself dirty
    // or failed. The upload notice now speaks only for the file.
    control.saveState = 'error'
    control.saveErrorMessage = 'Save failed: permission-denied'
    control.hasUnsavedEdits = true
    control.uploadErrorMessage = UPLOAD_NOTICE
    renderEditor()

    const notice = screen.getByText(UPLOAD_NOTICE)
    expect(notice).toHaveTextContent(UPLOAD_NOTICE)
    expect(notice).not.toHaveTextContent(/words are safe|words are saved|file is gone/)

    // And the document's own failure is still reported, separately, with its
    // Retry — the state the root found unreachable.
    expect(retryBanner()).toHaveTextContent('Save failed: permission-denied')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('keeps the upload notice up while the document reports itself saved', async () => {
    // The two statements the editor used to conflate into one indicator: the
    // words landed, the file did not, and both are true at once.
    control.saveState = 'saved'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = false
    control.uploadErrorMessage = UPLOAD_NOTICE
    renderEditor()

    expect(screen.getByText(UPLOAD_NOTICE)).toBeInTheDocument()
  })

  it('draws upload progress apart from the save indicator', async () => {
    control.saveState = 'idle'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = false
    control.uploadBusy = true
    renderEditor()

    expect(screen.getByText(/Adding your file/)).toBeInTheDocument()
  })
})

describe('BookEditorPage — departures while a save has failed (UX-473)', () => {
  it('holds the Back arrow and keeps the editor on screen', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: 'My Books' }))

    expect(await screen.findByText("Your book didn't save")).toBeInTheDocument()
    expect(screen.queryByText(SHELF)).toBeNull()
    stillOnEditor()
  })

  it('holds the Read chip', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: 'Read' }))

    expect(await screen.findByText("Your book didn't save")).toBeInTheDocument()
    expect(screen.queryByText(READER)).toBeNull()
  })

  it("holds the shell's own nav, which the editor never sees", async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByRole('link', { name: 'Go to Today' }))

    expect(await screen.findByText("Your book didn't save")).toBeInTheDocument()
    expect(screen.queryByText(ELSEWHERE)).toBeNull()
  })

  it('holds the browser Back button', async () => {
    const router = renderEditor()

    await act(async () => {
      await router.navigate(-1)
    })

    expect(await screen.findByText("Your book didn't save")).toBeInTheDocument()
    expect(screen.queryByText(SHELF)).toBeNull()
    stillOnEditor()
  })

  it('cancels the departure on "Stay here" and leaves the draft exactly where it was', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText("Your book didn't save")

    await user.click(within(dialog()).getByRole('button', { name: 'Stay here' }))

    await waitFor(() => expect(screen.queryByText("Your book didn't save")).toBeNull())
    expect(screen.queryByText(SHELF)).toBeNull()
    stillOnEditor()
    expect(retryBanner()).toHaveTextContent('Save failed: permission-denied')
  })

  it('retries from the dialog, waits for the write, then completes the departure', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText("Your book didn't save")

    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))
    expect(control.retrySave).toHaveBeenCalledTimes(1)

    // In flight: the departure is still held, and nothing claims success.
    await setSaveStatus({ saveState: 'saving', hasUnsavedEdits: true })
    expect(await screen.findByText(/Saving your book/)).toBeInTheDocument()
    expect(screen.queryByText(SHELF)).toBeNull()

    // Acknowledged — the tap the kid already made is honoured.
    await setSaveStatus({ saveState: 'saved', hasUnsavedEdits: false, saveErrorMessage: null })
    expect(await screen.findByText(SHELF)).toBeInTheDocument()
  })

  it('holds the departure again when the retry fails again', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText("Your book didn't save")
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))

    await setSaveStatus({ saveState: 'saving', hasUnsavedEdits: true })
    await setSaveStatus({
      saveState: 'error',
      hasUnsavedEdits: true,
      saveErrorMessage: 'Save failed: still offline',
    })

    expect(within(dialog()).getByText('Save failed: still offline')).toBeInTheDocument()
    expect(screen.queryByText(SHELF)).toBeNull()
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))
    expect(control.retrySave).toHaveBeenCalledTimes(2)
  })

  it('discards only on the labelled, deliberate tap', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText("Your book didn't save")

    await user.click(within(dialog()).getByRole('button', { name: 'Leave anyway' }))

    expect(await screen.findByText(SHELF)).toBeInTheDocument()
  })

  it('still offers the discard while a write is in flight, alongside Stay', async () => {
    // It used to be disabled here. Offline, an in-flight `setDoc` can stay
    // pending indefinitely, so that left every guarded exit shut: Stay only
    // dismisses the dialog and the next tap is held again. The door is open —
    // but only as its own labelled tap (PR #1921).
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText("Your book didn't save")

    await setSaveStatus({ saveState: 'saving', hasUnsavedEdits: true })

    expect(within(dialog()).getByRole('button', { name: 'Leave anyway' })).toBeEnabled()
    expect(within(dialog()).getByRole('button', { name: 'Stay here' })).toBeEnabled()
  })

  it('warns, mid-write, what leaving does and does not promise', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText("Your book didn't save")

    await setSaveStatus({ saveState: 'saving', hasUnsavedEdits: true })

    expect(dialog()).toHaveTextContent(/these edits may not be saved/)
    expect(dialog()).toHaveTextContent(/may still finish/)
    expect(dialog()).not.toHaveTextContent(/are gone/)
  })

  it('warns that leaving may not save, and never that it erases the write', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText("Your book didn't save")

    expect(dialog()).toHaveTextContent(/these edits may not be saved/)
    expect(dialog()).not.toHaveTextContent(/are gone/)
  })
})

describe('BookEditorPage — a pending write is held too, and quietly (UX-473)', () => {
  it('leaves straight away when the latest edit is acknowledged', async () => {
    const user = userEvent.setup()
    control.saveState = 'saved'
    control.hasUnsavedEdits = false
    renderEditor()

    await user.click(screen.getByRole('button', { name: 'My Books' }))

    expect(await screen.findByText(SHELF)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('holds an exit taken before the debounce has even fired', async () => {
    const user = userEvent.setup()
    // Chrome's first counterexample: typed, left, then the write was rejected
    // with no editor left to say so. The flush DISPATCHES and cannot promise
    // more, so this exit is held — the whole draft hangs on it.
    control.saveState = 'idle'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = true
    renderEditor()

    await user.click(screen.getByRole('button', { name: 'Read' }))

    expect(await screen.findByText(/Saving your book/)).toBeInTheDocument()
    expect(screen.queryByText(READER)).toBeNull()
    stillOnEditor()
  })

  it('says it quietly — no failure wording, no Retry, over a write that has not failed', async () => {
    const user = userEvent.setup()
    control.saveState = 'saving'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = true
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText(/Saving your book/)

    expect(dialog()).not.toHaveTextContent(/didn't save|Save failed/)
    expect(within(dialog()).queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(within(dialog()).getByRole('button', { name: 'Stay here' })).toBeEnabled()
  })

  it('releases the held exit by itself the moment the pending write is acknowledged', async () => {
    const user = userEvent.setup()
    control.saveState = 'saving'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = true
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText(/Saving your book/)

    await setSaveStatus({ saveState: 'saved', hasUnsavedEdits: false })

    // Nobody had to confirm a save that was simply about to finish.
    expect(await screen.findByText(SHELF)).toBeInTheDocument()
  })

  it('turns the quiet wait into the recovery door if that pending write fails', async () => {
    const user = userEvent.setup()
    control.saveState = 'saving'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = true
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText(/Saving your book/)

    await setSaveStatus({
      saveState: 'error',
      hasUnsavedEdits: true,
      saveErrorMessage: 'Save failed: permission-denied',
    })

    expect(await screen.findByText("Your book didn't save")).toBeInTheDocument()
    expect(screen.queryByText(SHELF)).toBeNull()
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }))
    expect(control.retrySave).toHaveBeenCalledTimes(1)
  })

  it('Stay cancels a held pending exit and leaves the kid where she was', async () => {
    const user = userEvent.setup()
    control.saveState = 'saving'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = true
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'My Books' }))
    await screen.findByText(/Saving your book/)

    await user.click(within(dialog()).getByRole('button', { name: 'Stay here' }))

    await waitFor(() => expect(screen.queryByText(/Saving your book/)).toBeNull())
    expect(screen.queryByText(SHELF)).toBeNull()
    stillOnEditor()
  })

  it('still warns the browser while anything is outstanding, failed or not', async () => {
    control.saveState = 'saving'
    control.saveErrorMessage = null
    control.hasUnsavedEdits = true
    renderEditor()

    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)

    // Acknowledged: the tab closes without a word.
    await setSaveStatus({ saveState: 'saved', hasUnsavedEdits: false })
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
  })
})
