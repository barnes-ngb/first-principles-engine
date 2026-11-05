import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Fragment, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Book } from '../../../core/types'
import { setActiveChildIdShared } from '../../../core/hooks/activeChildStore'
import {
  LIBRARY_RETURN_LABEL,
  LIBRARY_RETURN_LINE,
} from '../../avatar/stonebridge/libraryReturnCopy'
import {
  LibraryReturnPhase,
  beginLibraryReturnFlow,
  endLibraryReturnFlow,
  getLibraryReturnFlow,
} from '../../avatar/stonebridge/libraryReturnFlow'

/**
 * The way back, on the REAL bookshelf.
 *
 * `libraryReturn.route.test.tsx` proves the journey over a real router with a
 * stand-in shelf; this file proves the other half — that the actual
 * `BookshelfPage` renders the control, in a place a child can reach, in the
 * states the shelf really has (empty, full, and a parent's view of it). Without
 * this the route suite would be asserting a shelf the app does not mount, which
 * is the `UX-269` failure mode.
 */

const LINCOLN = { id: 'lincoln', name: 'Lincoln', birthdate: '2015-09-30' }
const LONDON = { id: 'london', name: 'London', birthdate: '2020-02-20' }
const activeRef = { current: LINCOLN as { id: string; name: string; birthdate?: string } }

const navigateMock = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: activeRef.current,
    activeChildId: activeRef.current.id,
    children: [LINCOLN, LONDON],
    setActiveChildId: () => {},
    isChildProfile: false,
  }),
}))

let currentProfile = 'lincoln'
vi.mock('../../../core/profile/useProfile', () => ({
  useProfile: () => ({ profile: currentProfile }),
}))

let booksFixture: Book[] = []
vi.mock('../useBook', () => ({
  useBookshelf: () => ({
    books: booksFixture,
    loading: false,
    createBook: vi.fn(),
    deleteBook: vi.fn(),
  }),
}))
vi.mock('../useEvaluationBookSuggestions', () => ({
  useEvaluationBookSuggestions: () => ({ suggestions: [] }),
}))
vi.mock('../BookGenerateChat', () => ({ default: () => <div>chat</div> }))
vi.mock('../EvaluationBookBanner', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))
// The timer is the shelf's own write surface and has a suite of its own
// (`libraryReturn.noExtraWrites.test.tsx` runs the real one); here it is only
// in the way.
vi.mock('../../../components/CreativeTimer', () => ({ default: () => null }))
vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <Fragment>{children}</Fragment>,
}))

import BookshelfPage from '../BookshelfPage'
import { MAKE_BOOK_DOOR_LABEL } from '../makeBookDoor'

const JOURNEY = { familyId: 'family-1', childId: LINCOLN.id, missionId: 'library_hut' }

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

beforeEach(() => {
  localStorage.clear()
  navigateMock.mockReset()
  booksFixture = []
  currentProfile = 'lincoln'
  activeRef.current = LINCOLN
  setActiveChildIdShared(LINCOLN.id)
  endLibraryReturnFlow()
})

describe('the shelf offers the way back when the child came from the village', () => {
  it('renders it above the shelf’s own title, where a back control belongs', () => {
    beginLibraryReturnFlow(JOURNEY)
    render(<BookshelfPage />)

    const back = screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })
    expect(back).toBeInTheDocument()
    expect(screen.getByText(`🏰 ${LIBRARY_RETURN_LINE}`)).toBeInTheDocument()
    // Before the heading in document order: a way out that has to be scrolled
    // to is a way out a six-year-old does not find.
    const heading = screen.getByRole('heading', { name: 'My Books' })
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('on an empty shelf, which is exactly when a child needs it most', () => {
    // No books at all: the shelf shows its empty state, and the way back is
    // still there rather than being a sibling of the book grid.
    beginLibraryReturnFlow(JOURNEY)
    render(<BookshelfPage />)
    expect(screen.getByText('No books yet!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()
  })

  it('and on a full shelf, and on a parent’s view of it', () => {
    booksFixture = [makeBook({ id: 'b1' }), makeBook({ id: 'b2', status: 'complete' })]
    beginLibraryReturnFlow(JOURNEY)
    const { unmount } = render(<BookshelfPage />)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()
    unmount()

    currentProfile = 'parents'
    render(<BookshelfPage />)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()
  })

  it('takes the child back with ordinary navigation, and spends the request', async () => {
    const user = userEvent.setup()
    beginLibraryReturnFlow(JOURNEY)
    render(<BookshelfPage />)

    await user.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    // The app's own router call — no second guard, no blocker of its own.
    expect(navigateMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalledWith('/avatar')
    expect(getLibraryReturnFlow()?.phase).toBe(LibraryReturnPhase.Returning)

    // And it cannot be asked for twice from the same shelf.
    await user.click(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL }))
    expect(navigateMock).toHaveBeenCalledTimes(1)
  })
})

describe('and does not offer it otherwise', () => {
  it('on an ordinary visit — no journey, no control', () => {
    render(<BookshelfPage />)
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    // The shelf is untouched: its own one door is still there, exactly once.
    expect(screen.getAllByRole('button', { name: MAKE_BOOK_DOOR_LABEL })).toHaveLength(1)
  })

  it('for another child’s journey, even with the same family', () => {
    beginLibraryReturnFlow({ ...JOURNEY, childId: LONDON.id })
    render(<BookshelfPage />)
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
  })

  it('for another family’s journey, even with the same child', () => {
    beginLibraryReturnFlow({ ...JOURNEY, familyId: 'family-2' })
    render(<BookshelfPage />)
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
  })

  it('and it disappears from an open shelf the moment the child changes', async () => {
    beginLibraryReturnFlow(JOURNEY)
    render(<BookshelfPage />)
    expect(screen.getByRole('button', { name: LIBRARY_RETURN_LABEL })).toBeInTheDocument()

    // The app-bar chip, reaching a page with no selector of its own.
    act(() => {
      activeRef.current = LONDON
      setActiveChildIdShared(LONDON.id)
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
    })
    expect(getLibraryReturnFlow()).toBeNull()
  })

  it('while the children read has not settled or has failed', () => {
    // A failed read is not an affirmative empty family, so an unsettled
    // identity is not a scope the control may be offered for.
    activeRef.current = { id: '', name: '' }
    beginLibraryReturnFlow(JOURNEY)
    render(<BookshelfPage />)
    expect(screen.queryByRole('button', { name: LIBRARY_RETURN_LABEL })).not.toBeInTheDocument()
  })
})
