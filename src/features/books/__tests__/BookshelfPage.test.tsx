import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import BookshelfPage from '../BookshelfPage'
import type { Book } from '../../../core/types'

// ── Mocks ─────────────────────────────────────────────────────────

const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../../../core/auth/useAuth', () => ({
  useFamilyId: () => 'family-1',
}))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-london', name: 'London', birthdate: '2020-01-01' },
    children: [{ id: 'child-london', name: 'London' }],
  }),
}))

let currentProfile = 'parents'

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

// Heavy children — stub out
vi.mock('../BookGenerateChat', () => ({
  default: ({
    resumeBookId,
    onCommit,
  }: {
    resumeBookId?: string
    onCommit: (bookId: string) => void
  }) => (
    <div data-testid="book-generate-chat" data-resume-id={resumeBookId ?? 'none'}>
      mocked chat
      <button type="button" onClick={() => onCommit('committed-book')}>
        commit-trigger
      </button>
    </div>
  ),
}))
vi.mock('../EvaluationBookBanner', () => ({ default: () => null }))
vi.mock('../CreateThemeDialog', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))
vi.mock('../../../components/CreativeTimer', () => ({ default: () => null }))
vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => {
  navigateMock.mockReset()
  booksFixture = []
  currentProfile = 'parents'
})

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    childId: 'child-london',
    title: 'A Book',
    pages: [],
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    subjectBuckets: [],
    ...overrides,
  } as Book
}

// ── Tests ─────────────────────────────────────────────────────────

describe('BookshelfPage — Story Gen V2 PR-A wiring', () => {
  it('does not render the "Tell a Story" Bookshelf CTA', () => {
    booksFixture = [makeBook({ id: 'b1', title: 'Existing' })]
    render(<BookshelfPage />)
    expect(screen.queryByRole('button', { name: /tell a story/i })).toBeNull()
  })

  it('renders the "+ New book" tile as the first grid item', () => {
    booksFixture = [
      makeBook({ id: 'b1', title: 'First Book' }),
      makeBook({ id: 'b2', title: 'Second Book' }),
    ]
    render(<BookshelfPage />)
    const newTile = screen.getByTestId('new-book-tile')
    // The new-book tile's parent (the grid) should have new-book-tile as its first child.
    const grid = newTile.parentElement
    expect(grid).toBeTruthy()
    if (grid) {
      const children = Array.from(grid.children)
      expect(children[0]).toBe(newTile)
    }
  })

  it('opens the New Book dialog to the "Generate a Book" tab by default', async () => {
    const user = userEvent.setup()
    booksFixture = [makeBook({ id: 'b1', title: 'Existing' })]
    render(<BookshelfPage />)
    await user.click(screen.getByTestId('new-book-tile'))
    // The Generate Chat surface (mocked) should be visible, not the Blank Book form.
    expect(screen.getByTestId('book-generate-chat')).toBeTruthy()
  })

  it('"Use Story Guide" button is present in the Generate tab and navigates to /books/story-guide', async () => {
    const user = userEvent.setup()
    booksFixture = [makeBook({ id: 'b1', title: 'Existing' })]
    render(<BookshelfPage />)
    await user.click(screen.getByTestId('new-book-tile'))
    const storyGuideBtn = screen.getByRole('button', { name: /use story guide/i })
    await user.click(storyGuideBtn)
    expect(navigateMock).toHaveBeenCalledWith('/books/story-guide')
  })

  it('renders books with reviewState.generateChatState === "in-progress" with a Continue badge', () => {
    booksFixture = [
      makeBook({
        id: 'b-draft',
        title: 'WIP',
        reviewState: { generateChatState: 'in-progress' },
      }),
    ]
    render(<BookshelfPage />)
    expect(screen.getByText(/continue making this story/i)).toBeTruthy()
  })

  it('clicking an in-progress draft opens the dialog with resumeBookId set', async () => {
    const user = userEvent.setup()
    booksFixture = [
      makeBook({
        id: 'b-draft',
        title: 'WIP',
        reviewState: { generateChatState: 'in-progress' },
      }),
    ]
    render(<BookshelfPage />)
    // Find the book tile by its title.
    const tile = screen.getByText('WIP').closest('div')
    expect(tile).toBeTruthy()
    if (tile) {
      // The "Continue making" chip is inside; the outer click target is its container.
      // Click the visible title to trigger the tile's onClick.
      await user.click(tile)
    }
    // After resuming, the chat surface should be rendered with the resume id.
    const chat = await screen.findByTestId('book-generate-chat')
    expect(chat.getAttribute('data-resume-id')).toBe('b-draft')
    // It should NOT have navigated to the editor.
    expect(navigateMock).not.toHaveBeenCalledWith('/books/b-draft')
  })
})

// ── Story Gen V2 PR-B: Per-Page Review wiring ─────────────────────

describe('BookshelfPage — Per-Page Review wiring (PR-B)', () => {
  it('shows a "Continue reading →" badge for a book with an in-progress review', () => {
    booksFixture = [
      makeBook({
        id: 'b-review',
        title: 'Half Reviewed',
        reviewState: { reviewedPages: [1, 2] },
      }),
    ]
    render(<BookshelfPage />)
    expect(screen.getByText(/continue reading/i)).toBeTruthy()
  })

  it('clicking an in-progress-review book navigates to the review surface', async () => {
    const user = userEvent.setup()
    booksFixture = [
      makeBook({
        id: 'b-review',
        title: 'Half Reviewed',
        reviewState: { reviewedPages: [1] },
      }),
    ]
    render(<BookshelfPage />)
    const tile = screen.getByText('Half Reviewed').closest('div')
    expect(tile).toBeTruthy()
    if (tile) await user.click(tile)
    expect(navigateMock).toHaveBeenCalledWith('/books/b-review/review')
  })

  it('does NOT show the review badge once the review is completed', () => {
    booksFixture = [
      makeBook({
        id: 'b-done',
        title: 'Done Reviewing',
        reviewState: { reviewedPages: [1, 2], completedAt: '2026-05-01T00:00:00Z' },
      }),
    ]
    render(<BookshelfPage />)
    expect(screen.queryByText(/continue reading/i)).toBeNull()
  })

  it('kid commit from Generate Chat auto-opens the Per-Page Review', async () => {
    const user = userEvent.setup()
    currentProfile = 'london'
    booksFixture = [makeBook({ id: 'b1', title: 'Existing' })]
    render(<BookshelfPage />)
    await user.click(screen.getByTestId('new-book-tile'))
    await user.click(screen.getByRole('button', { name: /commit-trigger/i }))
    expect(navigateMock).toHaveBeenCalledWith('/books/committed-book/review')
  })

  it('parent commit from Generate Chat lands in the editor (no auto-open review)', async () => {
    const user = userEvent.setup()
    currentProfile = 'parents'
    booksFixture = [makeBook({ id: 'b1', title: 'Existing' })]
    render(<BookshelfPage />)
    await user.click(screen.getByTestId('new-book-tile'))
    await user.click(screen.getByRole('button', { name: /commit-trigger/i }))
    expect(navigateMock).toHaveBeenCalledWith('/books/committed-book')
  })
})
