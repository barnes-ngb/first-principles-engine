import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Child, MonthlyReview } from '../../core/types'
import { MonthlyReviewStatus } from '../../core/types/enums'

const reviewsRef: { current: MonthlyReview[] } = { current: [] }
const childrenRef: { current: Child[] } = { current: [] }

vi.mock('../../core/hooks/useMonthlyReviews', () => ({
  useMonthlyReviews: () => ({
    reviews: reviewsRef.current,
    loading: false,
    error: null,
  }),
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    children: childrenRef.current,
    activeChildId: childrenRef.current[0]?.id ?? null,
    activeChild: childrenRef.current[0] ?? null,
    setActiveChildId: vi.fn(),
    isLoading: false,
    addChild: vi.fn(),
  }),
}))

import DraftReadyCard from './DraftReadyCard'

function makeReview(over: Partial<MonthlyReview> = {}): MonthlyReview {
  return {
    id: 'lincoln_2026-04',
    familyId: 'fam',
    childId: 'lincoln',
    month: '2026-04',
    status: MonthlyReviewStatus.Draft,
    generatedAt: '2026-05-01T00:00:00Z',
    theme: 'Stories You Built',
    pages: [],
    curatedPhotos: [],
    unplacedPhotos: [],
    stats: {
      daysWithActivity: 0,
      totalHours: 0,
      hoursBySubject: {},
      booksCompleted: 0,
      booksRead: 0,
      quests: 0,
      blockersResolved: 0,
      blockersActive: 0,
      teachBackCount: 0,
      dadLabCount: 0,
      totalDiamonds: 0,
    },
    sourceRefs: { weeklyReviewIds: [] },
    ...over,
  }
}

function renderCard() {
  return render(
    <MemoryRouter>
      <DraftReadyCard familyId="fam" />
    </MemoryRouter>,
  )
}

describe('DraftReadyCard', () => {
  it('renders when at least one review has status=draft', () => {
    reviewsRef.current = [makeReview({ status: MonthlyReviewStatus.Draft })]
    childrenRef.current = [{ id: 'lincoln', name: 'Lincoln' } as Child]
    renderCard()
    expect(
      screen.getByText(/April 2026 book ready for Lincoln/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument()
  })

  it('does not render when all reviews are published', () => {
    reviewsRef.current = [
      makeReview({ status: MonthlyReviewStatus.Published }),
    ]
    childrenRef.current = [{ id: 'lincoln', name: 'Lincoln' } as Child]
    renderCard()
    expect(screen.queryByText(/book ready for/i)).not.toBeInTheDocument()
  })

  it('shows the most recent draft when multiple drafts exist', () => {
    reviewsRef.current = [
      makeReview({
        id: 'london_2026-03',
        childId: 'london',
        month: '2026-03',
        generatedAt: '2026-04-01T00:00:00Z',
      }),
      makeReview({
        id: 'lincoln_2026-04',
        childId: 'lincoln',
        month: '2026-04',
        generatedAt: '2026-05-01T00:00:00Z',
      }),
    ]
    childrenRef.current = [
      { id: 'lincoln', name: 'Lincoln' } as Child,
      { id: 'london', name: 'London' } as Child,
    ]
    renderCard()
    expect(
      screen.getByText(/April 2026 book ready for Lincoln/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/March 2026 book ready for London/i),
    ).not.toBeInTheDocument()
  })
})
