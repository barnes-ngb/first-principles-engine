import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import type {
  MonthlyReview,
  MonthlyReviewPage as MonthlyReviewPageType,
} from '../../core/types'
import {
  MonthlyReviewStatus,
  SectionType,
} from '../../core/types/enums'
import { MonthlyReviewPage } from './MonthlyReviewPage'

function makePage(
  over: Partial<MonthlyReviewPageType> = {},
): MonthlyReviewPageType {
  return {
    id: 'p1',
    sectionType: SectionType.MonthInSentence,
    order: 1,
    kidMode: { body: 'A short kid sentence.' },
    parentMode: { body: 'A short parent sentence.' },
    photoRefs: { kid: [], parent: [] },
    ...over,
  }
}

function makeReview(
  over: Partial<MonthlyReview> = {},
): MonthlyReview {
  return {
    id: 'c1_2026-04',
    familyId: 'fam',
    childId: 'c1',
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

describe('MonthlyReviewPage — empty-section UX', () => {
  it('shows the no-photos notice in parent mode for a photo-less standard section', () => {
    const page = makePage()
    const review = makeReview()
    render(<MonthlyReviewPage page={page} review={review} mode="parent" />)
    expect(
      screen.getByText(/No photos for this section/i),
    ).toBeInTheDocument()
  })

  it('does not show the no-photos notice in kid mode', () => {
    const page = makePage()
    const review = makeReview()
    render(<MonthlyReviewPage page={page} review={review} mode="kid" />)
    expect(
      screen.queryByText(/No photos for this section/i),
    ).not.toBeInTheDocument()
  })

  it('does not show the notice when a section has photos (parent mode)', () => {
    const page = makePage({
      photoRefs: {
        kid: [],
        parent: [
          {
            id: 'photo-1',
            storagePath: 'gs://x/photo1.jpg',
            source: 'artifact',
            sourceDocId: 'doc-1',
            capturedAt: '2026-04-10T12:00:00Z',
          },
        ],
      },
    })
    const review = makeReview()
    render(<MonthlyReviewPage page={page} review={review} mode="parent" />)
    expect(
      screen.queryByText(/No photos for this section/i),
    ).not.toBeInTheDocument()
  })
})
