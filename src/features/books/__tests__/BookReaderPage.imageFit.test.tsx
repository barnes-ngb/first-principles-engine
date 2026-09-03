import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'

import BookReaderPage from '../BookReaderPage'
import { FIT_BACKDROP_TESTID } from '../imageFit'
import type { PageImage } from '../../../core/types'

/**
 * FEAT-177 — the reader honours a background the parent chose to show whole,
 * and renders legacy books (no `fit` field) exactly as before.
 */

// ── Hoisted, mutable mock state ───────────────────────────────────

const state = vi.hoisted(() => ({
  image: { id: 'i1', url: 'https://img/p1.png', type: 'ai-generated' } as PageImage,
}))

function book() {
  return {
    id: 'book-1',
    childId: 'child-1',
    title: 'The Brave Dog',
    status: 'complete',
    theme: 'adventure',
    coverImageUrl: 'https://img/cover.png',
    // No sight words → cover / content / back cover, so content is page 1.
    sightWords: [],
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        text: 'The dog ran.',
        images: [state.image],
        layout: 'image-top',
        createdAt: '2026-09-03',
        updatedAt: '2026-09-03',
      },
    ],
    createdAt: '2026-09-03',
    updatedAt: '2026-09-03',
    subjectBuckets: [],
  }
}

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ bookId: 'book-1' }),
  useSearchParams: () => [new URLSearchParams(''), vi.fn()],
}))

vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-1' }))

vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    activeChild: { id: 'child-1', name: 'London' },
    children: [{ id: 'child-1', name: 'London' }],
  }),
}))

vi.mock('../useBook', () => ({
  useBook: () => ({ book: book(), loading: false }),
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

/** Jump to the single content page (cover is 0, back cover is last). */
function goToContentPage() {
  const dots = screen.getAllByRole('button', { name: /go to page/i })
  fireEvent.click(dots[1])
}

/** The page image the reader actually shows — the backdrop copy is aria-hidden. */
function sharpPageImage(): HTMLElement {
  return screen.getAllByRole('img').find((el) => el.getAttribute('src') === state.image.url)!
}

describe('BookReaderPage background fit (FEAT-177)', () => {
  beforeEach(() => {
    state.image = { id: 'i1', url: 'https://img/p1.png', type: 'ai-generated' }
  })

  it('shows a fitted background whole, over a blurred copy of itself', () => {
    state.image = { ...state.image, fit: 'fit' }
    render(<BookReaderPage />)
    goToContentPage()

    expect(getComputedStyle(sharpPageImage()).objectFit).toBe('contain')
    const backdrop = screen.getByTestId(FIT_BACKDROP_TESTID)
    expect(backdrop.querySelector('img')?.getAttribute('src')).toBe(state.image.url)
  })

  it('renders a legacy image (no fit field) cover-fit with no blurred copy', () => {
    render(<BookReaderPage />)
    goToContentPage()

    expect(getComputedStyle(sharpPageImage()).objectFit).toBe('cover')
    expect(screen.queryByTestId(FIT_BACKDROP_TESTID)).toBeNull()
  })

  it("renders an explicit 'fill' cover-fit, same as legacy", () => {
    state.image = { ...state.image, fit: 'fill' }
    render(<BookReaderPage />)
    goToContentPage()

    expect(getComputedStyle(sharpPageImage()).objectFit).toBe('cover')
    expect(screen.queryByTestId(FIT_BACKDROP_TESTID)).toBeNull()
  })

  it('ignores fit on a sticker — contain as always, and no backdrop', () => {
    state.image = { ...state.image, type: 'sticker', fit: 'fit' }
    render(<BookReaderPage />)
    goToContentPage()

    expect(getComputedStyle(sharpPageImage()).objectFit).toBe('contain')
    expect(screen.queryByTestId(FIT_BACKDROP_TESTID)).toBeNull()
  })
})
