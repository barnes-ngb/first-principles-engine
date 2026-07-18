import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { addDoc } from 'firebase/firestore'

import BookReaderPage from '../BookReaderPage'

/** All `content` strings written via addDoc (the completion artifact). */
function writtenContents(): string[] {
  return vi
    .mocked(addDoc)
    .mock.calls.map(([, data]) => (data as { content?: string }).content ?? '')
}

/** Jump to the last page (back cover) via the accessible dot indicators. */
function goToBackCover() {
  const dots = screen.getAllByRole('button', { name: /go to page/i })
  fireEvent.click(dots[dots.length - 1])
}

/**
 * No score/evaluation signals may appear on the broadcast (call-mode) surface.
 * (The "N/M" page counter in the header is navigation chrome, not a score, so the
 * correct/total regex is intentionally omitted here — see AskMePanel.test for it.)
 */
function expectNoScoreSignals() {
  const body = document.body.textContent ?? ''
  expect(body).not.toMatch(/\d+\s*%/) // percentage
  expect(body).not.toContain('❌')
  expect(body).not.toContain('✅')
  expect(body).not.toMatch(/show answer/i)
  expect(body).not.toMatch(/comprehension check/i)
  expect(body).not.toMatch(/answered/i)
}

// ── Hoisted, mutable mock state ───────────────────────────────────

const state = vi.hoisted(() => ({
  search: '' as string, // '' = default mode, 'call=1' = Story Call mode
}))

const navigateMock = vi.fn()

function baseBook(overrides?: Record<string, unknown>) {
  return {
    id: 'book-1',
    childId: 'child-1',
    title: 'The Brave Dog',
    status: 'complete',
    theme: 'adventure',
    coverImageUrl: 'https://img/cover.png',
    sightWords: ['the', 'dog'],
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        text: 'The dog ran.',
        images: [{ id: 'i1', url: 'https://img/p1.png', type: 'ai-generated' }],
        sightWordsOnPage: ['the', 'dog'],
        layout: 'image-top',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    subjectBuckets: [],
    ...overrides,
  }
}

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ bookId: 'book-1' }),
  useSearchParams: () => [new URLSearchParams(state.search), vi.fn()],
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'London' },
    children: [{ id: 'child-1', name: 'London' }],
  }),
}))

vi.mock('../useBook', () => ({
  useBook: () => ({ book: baseBook(), loading: false }),
}))

vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({ progressMap: new Map(), recordInteraction: vi.fn() }),
}))

vi.mock('../useComprehensionQuestions', () => ({
  useComprehensionQuestions: () => ({
    questions: [],
    loading: false,
    error: null,
    generateQuestions: vi.fn(),
    reset: vi.fn(),
  }),
}))

// Firestore + XP writers — stubbed so nothing touches Firebase.
vi.mock('firebase/firestore', () => ({ addDoc: vi.fn() }))
vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({})),
  hoursCollection: vi.fn(() => ({})),
}))
vi.mock('../../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../core/xp/addDiamondEvent', () => ({ addDiamondEvent: vi.fn().mockResolvedValue(undefined) }))

vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))

describe('BookReaderPage — Story Call mode', () => {
  beforeEach(() => {
    state.search = ''
    navigateMock.mockReset()
    vi.mocked(addDoc).mockClear()
  })

  it('default mode shows the Edit + Download parent/utility chrome', () => {
    state.search = ''
    render(<BookReaderPage />)

    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument()
  })

  it('call mode hides the Edit + Download chrome', () => {
    state.search = 'call=1'
    render(<BookReaderPage />)

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download pdf/i })).not.toBeInTheDocument()
  })

  it('renders the book title in both modes (nav retained)', () => {
    state.search = 'call=1'
    render(<BookReaderPage />)
    expect(screen.getAllByText('The Brave Dog').length).toBeGreaterThan(0)
  })

  it('call-mode back cover shows Ask-Me + audience chips, no comprehension check or scores', () => {
    state.search = 'call=1'
    render(<BookReaderPage />)
    goToBackCover()

    expect(screen.getByText(/Your turn! Ask London/)).toBeInTheDocument()
    expect(screen.getByText('Who did you read to?')).toBeInTheDocument()
    expect(screen.getByText('Grandma')).toBeInTheDocument()
    expect(screen.getByText('Grandpa')).toBeInTheDocument()
    expect(screen.getByText('Someone else')).toBeInTheDocument()
    expectNoScoreSignals()
  })

  it('tapping an audience chip records who they read to', () => {
    state.search = 'call=1'
    render(<BookReaderPage />)
    goToBackCover()

    fireEvent.click(screen.getByText('Grandma'))
    expect(screen.getByText(/Read to Grandma/)).toBeInTheDocument()
  })

  it('call-mode completion write is deferred and uses the FINAL (corrected) audience', () => {
    state.search = 'call=1'
    const { unmount } = render(<BookReaderPage />)
    goToBackCover()

    // No completion artifact yet — the write is deferred in call mode.
    expect(writtenContents().some((c) => c.includes('read'))).toBe(false)

    fireEvent.click(screen.getByText('Grandma'))
    fireEvent.click(screen.getByText('Grandpa')) // correction
    expect(screen.getByText(/Read to Grandpa/)).toBeInTheDocument()

    unmount() // exit writes the deferred artifact with the final selection

    const contents = writtenContents()
    expect(contents.some((c) => c.includes('Read aloud to Grandpa on a video call'))).toBe(true)
    expect(contents.some((c) => c.includes('Grandma'))).toBe(false)
  })

  it('default-mode back cover shows the comprehension check, not audience chips', () => {
    state.search = ''
    render(<BookReaderPage />)
    goToBackCover()

    expect(screen.getByText(/comprehension check/i)).toBeInTheDocument()
    expect(screen.queryByText('Who did you read to?')).not.toBeInTheDocument()
    expect(screen.queryByText(/Your turn! Ask/)).not.toBeInTheDocument()
  })
})
