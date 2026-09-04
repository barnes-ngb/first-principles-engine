import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BookshelfPage from '../BookshelfPage'
import { makeBookChoices } from '../makeBookDoor'
import type { Book } from '../../../core/types'

// FEAT-187 / UX-102 · UX-116 · UX-118 — the one "Make a book" door.
//
// What this asserts that `main` could not: the shelf's make-a-book entry opens
// a CHOICE (two labelled ways, each with a line saying what happens next), and
// each choice lands where its label says. Before this run the same tap opened
// a two-tab dialog defaulted to the AI chat, with a `text.secondary` "Use
// Story Guide (guided questions)" link buried inside that tab — three
// generators, five verbs, no map.

const navigateMock = vi.fn()
const createBookMock = vi.fn(async () => 'new-book-id')

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }))
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))
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
    createBook: createBookMock,
    deleteBook: vi.fn(),
  }),
}))
vi.mock('../useEvaluationBookSuggestions', () => ({
  useEvaluationBookSuggestions: () => ({ suggestions: [] }),
}))
vi.mock('../BookGenerateChat', () => ({
  default: () => <div data-testid="book-generate-chat">mocked chat</div>,
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
  createBookMock.mockClear()
  booksFixture = [
    {
      id: 'b1',
      childId: 'child-london',
      title: 'Existing',
      pages: [],
      status: 'draft',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      subjectBuckets: [],
    } as Book,
  ]
  currentProfile = 'parents'
})

async function openDoor() {
  const user = userEvent.setup()
  render(<BookshelfPage />)
  await user.click(screen.getByTestId('new-book-tile'))
  return user
}

describe('the one "Make a book" door — both audiences see two choices', () => {
  it('shows the parent wording to a parent', async () => {
    currentProfile = 'parents'
    await openDoor()
    for (const choice of makeBookChoices('parent')) {
      expect(screen.getByText(choice.label), choice.id).toBeTruthy()
      expect(screen.getByText(choice.next), choice.id).toBeTruthy()
    }
  })

  it('shows the kid wording to a kid — on capability, never a name', async () => {
    currentProfile = 'london'
    await openDoor()
    for (const choice of makeBookChoices('kid')) {
      expect(screen.getByText(choice.label), choice.id).toBeTruthy()
      expect(screen.getByText(choice.next), choice.id).toBeTruthy()
    }
    // The parent's longer lines are NOT what a six-year-old is handed.
    for (const choice of makeBookChoices('parent')) {
      expect(screen.queryByText(choice.next), choice.id).toBeNull()
    }
  })

  it('names the door the same on the tile and in the sheet', async () => {
    await openDoor()
    // The tile says "Make a book"; so does the sheet's title. Two names for one
    // act is the thing UX-102 filed.
    expect(screen.getAllByText('Make a book').length).toBeGreaterThanOrEqual(2)
  })
})

describe('each choice lands where it says', () => {
  it('"Write it myself" opens the blank-book form, not a generator', async () => {
    const user = await openDoor()
    await user.click(screen.getByTestId('make-book-choice-myself'))

    expect(screen.getByLabelText(/book title/i)).toBeTruthy()
    expect(screen.queryByTestId('book-generate-chat')).toBeNull()
  })

  it('"Write it myself" creates the book and opens the editor', async () => {
    const user = await openDoor()
    await user.click(screen.getByTestId('make-book-choice-myself'))
    await user.type(screen.getByLabelText(/book title/i), 'My Book')
    await user.click(screen.getByRole('button', { name: /make it/i }))

    expect(createBookMock).toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith('/books/new-book-id')
  })

  it('"Make one with Shelly" opens the Generate chat, not the blank form', async () => {
    const user = await openDoor()
    await user.click(screen.getByTestId('make-book-choice-with-shelly'))

    expect(screen.getByTestId('book-generate-chat')).toBeTruthy()
    expect(screen.queryByLabelText(/book title/i)).toBeNull()
  })

  it('lets the person back out of a choice to the other one', async () => {
    const user = await openDoor()
    await user.click(screen.getByTestId('make-book-choice-myself'))
    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(screen.getByTestId('make-book-choice-with-shelly')).toBeTruthy()
    expect(screen.queryByLabelText(/book title/i)).toBeNull()
  })
})
