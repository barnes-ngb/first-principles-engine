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
import { formatSubjectMinutes } from './formatSubjectMinutes'
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

  it('renders moreFromMonth headline in kid mode when overflow photos exist', () => {
    const page = makePage({
      id: 'more',
      sectionType: SectionType.MoreFromMonth,
      kidMode: {
        headline: 'More from this month',
        body: 'Look at everything you made.',
      },
      parentMode: {},
      photoRefs: {
        kid: [
          {
            id: 'photo-1',
            storagePath: 'gs://x/photo1.jpg',
            source: 'artifact',
            sourceDocId: 'doc-1',
            capturedAt: '2026-04-10T12:00:00Z',
          },
        ],
        parent: [],
      },
    })
    const review = makeReview()
    render(<MonthlyReviewPage page={page} review={review} mode="kid" />)
    expect(screen.getByText(/More from this month/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Look at everything you made\./i),
    ).toBeInTheDocument()
  })

  it('renders nothing for moreFromMonth in parent mode (no parent photos)', () => {
    const page = makePage({
      id: 'more',
      sectionType: SectionType.MoreFromMonth,
      kidMode: {
        headline: 'More from this month',
        body: 'Look at everything you made.',
      },
      parentMode: {},
      photoRefs: {
        kid: [
          {
            id: 'photo-1',
            storagePath: 'gs://x/photo1.jpg',
            source: 'artifact',
            sourceDocId: 'doc-1',
            capturedAt: '2026-04-10T12:00:00Z',
          },
        ],
        parent: [],
      },
    })
    const review = makeReview()
    render(<MonthlyReviewPage page={page} review={review} mode="parent" />)
    expect(
      screen.queryByText(/More from this month/i),
    ).not.toBeInTheDocument()
  })

  it('renders hours-by-subject correctly when values are in minutes (parent mode)', () => {
    const page = makePage({
      id: 'stats',
      sectionType: SectionType.ByTheNumbers,
      kidMode: { headline: 'By the Numbers' },
      parentMode: { headline: 'By the Numbers' },
    })
    const review = makeReview({
      stats: {
        daysWithActivity: 12,
        totalHours: 5.2,
        hoursBySubject: {
          'Language Arts': 154,
          Science: 90,
          Art: 61,
          Reading: 5,
        },
        booksCompleted: 0,
        booksRead: 0,
        quests: 0,
        blockersResolved: 0,
        blockersActive: 0,
        teachBackCount: 0,
        dadLabCount: 0,
        totalDiamonds: 0,
      },
    })
    render(<MonthlyReviewPage page={page} review={review} mode="parent" />)
    expect(screen.getByText('2.6h')).toBeInTheDocument()
    expect(screen.getByText('1.5h')).toBeInTheDocument()
    expect(screen.getByText('1.0h')).toBeInTheDocument()
    expect(screen.getByText('5m')).toBeInTheDocument()
    expect(screen.queryByText('154.0h')).not.toBeInTheDocument()
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

describe('formatSubjectMinutes', () => {
  it('shows minutes when under 60', () => {
    expect(formatSubjectMinutes(5)).toBe('5m')
    expect(formatSubjectMinutes(59)).toBe('59m')
  })

  it('shows whole hours when clean', () => {
    expect(formatSubjectMinutes(60)).toBe('1h')
    expect(formatSubjectMinutes(180)).toBe('3h')
  })

  it('shows decimal hours when not clean', () => {
    expect(formatSubjectMinutes(154)).toBe('2.6h')
    expect(formatSubjectMinutes(90)).toBe('1.5h')
    expect(formatSubjectMinutes(61)).toBe('1.0h')
  })
})
