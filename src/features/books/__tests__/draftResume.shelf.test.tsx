import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BookshelfPage from '../BookshelfPage'
import { OTHER_CHILD_DRAFT_KID_LINE, UNKNOWN_DRAFT_OWNER_LINE } from '../draftOwnership'
import type { Book } from '../../../core/types'

// FEAT-188 / UX-108 — a draft resumes for the child it belongs to.
//
// What this asserts that `main` could not: tapping London's half-made draft
// while Lincoln is active switched nothing and said nothing — the chat opened
// under Lincoln (Lincoln's practice words, Lincoln's reading level, every line
// naming Lincoln) and wrote the result into London's book, because
// `persistStory` keeps the stored doc's `childId`. On `main` the three
// behavioural assertions below fail: no owner label renders, no switch is
// called, and a draft for a deleted child opens the chat anyway.
//
// The ORDER of the switch is the load-bearing part: `useBookGenerateChat` reads
// the active child on mount, so a switch that lands after the chat mounts is
// the same bug with extra steps. The mocked chat records the child it saw at
// mount time into the same event log the switch writes to.

const { events, activeState } = vi.hoisted(() => ({
  events: [] as string[],
  activeState: { id: 'child-lincoln', isChildProfile: false },
}))

const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }))
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

const CHILDREN = [
  { id: 'child-lincoln', name: 'Lincoln' },
  { id: 'child-london', name: 'London' },
]

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: CHILDREN.find((c) => c.id === activeState.id),
    children: CHILDREN,
    isChildProfile: activeState.isChildProfile,
    setActiveChildId: (id: string) => {
      // The real setter writes a shared external store synchronously
      // (`activeChildStore`), so the next render already sees the new child.
      events.push(`switch:${id}`)
      activeState.id = id
    },
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
vi.mock('../BookGenerateChat', () => ({
  default: () => {
    // Read at MOUNT, exactly as `useBookGenerateChat` does.
    events.push(`chat-mounted-for:${activeState.id}`)
    return <div data-testid="book-generate-chat">mocked chat</div>
  },
}))
vi.mock('../EvaluationBookBanner', () => ({ default: () => null }))
vi.mock('../CreateThemeDialog', () => ({ default: () => null }))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))
vi.mock('../../../components/CreativeTimer', () => ({ default: () => null }))
vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

/** An in-progress Generate-chat draft belonging to `childId`. */
function draft(id: string, childId: string, title: string): Book {
  return {
    id,
    childId,
    title,
    pages: [],
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    subjectBuckets: [],
    reviewState: { generateChatState: 'in-progress' },
  } as unknown as Book
}

beforeEach(() => {
  navigateMock.mockReset()
  events.length = 0
  activeState.id = 'child-lincoln'
  activeState.isChildProfile = false
  currentProfile = 'parents'
  booksFixture = []
})

describe('the draft card says whose it is', () => {
  it('names the owning child on every in-progress draft', () => {
    booksFixture = [
      draft('b-london', 'child-london', "London's half story"),
      draft('b-lincoln', 'child-lincoln', "Lincoln's half story"),
    ]
    render(<BookshelfPage />)

    expect(screen.getByTestId('draft-owner-b-london')).toHaveTextContent("London's draft")
    expect(screen.getByTestId('draft-owner-b-lincoln')).toHaveTextContent("Lincoln's draft")
  })

  it('does not label a finished book — only a draft has a resume door', () => {
    booksFixture = [
      {
        id: 'b-done',
        childId: 'child-london',
        title: 'Finished',
        pages: [],
        status: 'complete',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        subjectBuckets: [],
      } as unknown as Book,
    ]
    render(<BookshelfPage />)

    expect(screen.queryByTestId('draft-owner-b-done')).toBeNull()
  })
})

describe('resuming a draft for another child', () => {
  it('switches the active child BEFORE the chat mounts, then resumes', async () => {
    const user = userEvent.setup()
    booksFixture = [draft('b-london', 'child-london', "London's half story")]
    render(<BookshelfPage />)

    await user.click(screen.getByText("London's half story"))

    expect(screen.getByTestId('book-generate-chat')).toBeTruthy()
    // The switch happened, and it happened FIRST — the chat never read Lincoln.
    const mounts = events.filter((e) => e.startsWith('chat-mounted-for:'))
    expect(events.filter((e) => e.startsWith('switch:'))).toEqual(['switch:child-london'])
    expect(mounts.length).toBeGreaterThan(0)
    expect(events.indexOf('switch:child-london')).toBeLessThan(events.indexOf(mounts[0]))
    expect(mounts).not.toContain('chat-mounted-for:child-lincoln')
  })

  it('does not touch the switch when the draft is already the active child\'s', async () => {
    const user = userEvent.setup()
    booksFixture = [draft('b-lincoln', 'child-lincoln', "Lincoln's half story")]
    render(<BookshelfPage />)

    await user.click(screen.getByText("Lincoln's half story"))

    expect(screen.getByTestId('book-generate-chat')).toBeTruthy()
    expect(events.filter((e) => e.startsWith('switch:'))).toEqual([])
    expect(events).toContain('chat-mounted-for:child-lincoln')
  })
})

describe('a draft whose child is gone', () => {
  it('says so and opens nothing', async () => {
    const user = userEvent.setup()
    booksFixture = [draft('b-orphan', 'child-deleted', 'Orphaned story')]
    render(<BookshelfPage />)

    expect(screen.getByTestId('draft-blocked-b-orphan')).toHaveTextContent(
      UNKNOWN_DRAFT_OWNER_LINE,
    )
    // …and the resume affordance is not offered at all.
    expect(screen.queryByText('Continue making this story →')).toBeNull()

    await user.click(screen.getByText('Orphaned story'))

    expect(screen.queryByTestId('book-generate-chat')).toBeNull()
    expect(events).toEqual([])
  })
})

describe('a kid profile never reaches the switch path', () => {
  it('refuses another child\'s draft in kid words instead of switching', async () => {
    const user = userEvent.setup()
    currentProfile = 'london'
    activeState.id = 'child-london'
    activeState.isChildProfile = true
    // A kid shelf lists only their own books, so this should not arise — the
    // guard exists so it cannot become a silent write if it ever does.
    booksFixture = [draft('b-lincoln', 'child-lincoln', "Lincoln's half story")]
    render(<BookshelfPage />)

    expect(screen.getByTestId('draft-blocked-b-lincoln')).toHaveTextContent(
      OTHER_CHILD_DRAFT_KID_LINE,
    )

    await user.click(screen.getByText("Lincoln's half story"))

    expect(screen.queryByTestId('book-generate-chat')).toBeNull()
    expect(events).toEqual([])
  })

  it('still opens the kid\'s own draft', async () => {
    const user = userEvent.setup()
    currentProfile = 'london'
    activeState.id = 'child-london'
    activeState.isChildProfile = true
    booksFixture = [draft('b-london', 'child-london', 'My half story')]
    render(<BookshelfPage />)

    await user.click(screen.getByText('My half story'))

    expect(screen.getByTestId('book-generate-chat')).toBeTruthy()
    expect(events.filter((e) => e.startsWith('switch:'))).toEqual([])
    expect(events).toContain('chat-mounted-for:child-london')
  })
})
