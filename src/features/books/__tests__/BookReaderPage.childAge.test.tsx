import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// FEAT-183 / UX-152 (B4) — the comprehension-questions AI gets the child's REAL
// age, read off the identity profile the app already stores.
//
// Before: `const childAge = isLincoln ? 10 : 6`. Every child not named Lincoln
// was described to the model as six years old, and Lincoln's own birthdate —
// sitting on his child doc — was never read. The name-keyed pair survives only
// as the fallback for a doc that has no birthdate.

const state = vi.hoisted(() => ({
  child: { id: 'child-1', name: 'London', birthdate: '2020-02-20' } as {
    id: string
    name: string
    birthdate?: string
  },
}))

const generateQuestionsMock = vi.fn()

function book() {
  return {
    id: 'book-1',
    childId: 'child-1',
    title: 'The Brave Dog',
    status: 'complete',
    theme: 'adventure',
    coverImageUrl: 'https://img/cover.png',
    sightWords: [],
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        text: 'The dog ran.',
        images: [],
        sightWordsOnPage: [],
        layout: 'image-top',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    subjectBuckets: [],
  }
}

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ bookId: 'book-1' }),
  // Call mode: reaching the back cover auto-asks for the questions, so the
  // age the page hands the AI is observable without a tap-to-generate.
  useSearchParams: () => [new URLSearchParams('call=1'), vi.fn()],
}))
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChild: state.child, children: [state.child] }),
}))
vi.mock('../useBook', () => ({ useBook: () => ({ book: book(), loading: false }) }))
vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({ progressMap: new Map(), recordInteraction: vi.fn() }),
}))
vi.mock('../useComprehensionQuestions', () => ({
  useComprehensionQuestions: () => ({
    questions: [],
    loading: false,
    error: null,
    generateQuestions: generateQuestionsMock,
    reset: vi.fn(),
  }),
}))
vi.mock('firebase/firestore', () => ({ addDoc: vi.fn() }))
vi.mock('../../../core/firebase/firestore', () => ({
  artifactsCollection: vi.fn(() => ({})),
  hoursCollection: vi.fn(() => ({})),
}))
vi.mock('../../../core/xp/addXpEvent', () => ({ addXpEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../core/xp/addDiamondEvent', () => ({
  addDiamondEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../components/Page', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../PrintSettingsDialog', () => ({ default: () => null }))

import BookReaderPage from '../BookReaderPage'

/** Reaching the back cover is what asks the AI for questions. */
function goToBackCover() {
  const dots = screen.getAllByRole('button', { name: /go to page/i })
  fireEvent.click(dots[dots.length - 1]!)
}

/** The age the page handed the comprehension-questions call. */
function ageSentToAI(): number {
  expect(generateQuestionsMock).toHaveBeenCalled()
  return generateQuestionsMock.mock.calls[0]![2] as number
}

function renderWith(child: typeof state.child) {
  state.child = child
  render(<BookReaderPage />)
  goToBackCover()
}

describe('BookReaderPage — the AI gets the child’s real age (B4)', () => {
  beforeEach(() => {
    generateQuestionsMock.mockClear()
  })

  it('sends a third, differently-named older child his real age, not 6', () => {
    renderWith({ id: 'c-rowan', name: 'Rowan', birthdate: '2015-04-04' })
    expect(ageSentToAI()).toBeGreaterThanOrEqual(11)
  })

  it('sends London the age his birthdate says — the same 6 he gets today', () => {
    renderWith({ id: 'c-london', name: 'London', birthdate: '2020-02-20' })
    expect(ageSentToAI()).toBe(6)
  })

  it('sends Lincoln the age his birthdate says, not a frozen 10', () => {
    renderWith({ id: 'c-lincoln', name: 'Lincoln', birthdate: '2015-09-30' })
    expect(ageSentToAI()).toBeGreaterThanOrEqual(10)
  })

  it('falls back to the old name-keyed pair only when there is no birthdate', () => {
    renderWith({ id: 'c-lincoln', name: 'Lincoln' })
    expect(ageSentToAI()).toBe(10)
  })

  it('falls back to 6 for a birthdate-less child who is not Lincoln', () => {
    renderWith({ id: 'c-rowan', name: 'Rowan' })
    expect(ageSentToAI()).toBe(6)
  })
})
