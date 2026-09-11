import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MonthlyReviewReaderPage from './MonthlyReviewReaderPage'

const readReview = vi.fn()
const selectChild = vi.fn()
vi.mock('../../core/hooks/useMonthlyReviews', () => ({
  useMonthlyReview: (...args: unknown[]) => readReview(...args),
}))
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({
    children: [{ id: 'c1', name: 'Lincoln' }, { id: 'c2', name: 'London' }],
    activeChildId: 'c1', setActiveChildId: selectChild,
  }),
}))
vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'family' }))
vi.mock('../../core/firebase/firebase', () => ({ app: {} }))
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => vi.fn() }))
vi.mock('./MonthlyReviewPage', () => ({ MonthlyReviewPage: () => <div>Book page</div> }))
vi.mock('./PublishConfirmDialog', () => ({ PublishConfirmDialog: () => null }))
vi.mock('./DiagnosticPanel', () => ({ DiagnosticPanel: () => null }))

const book = {
  id: 'c2_august', childId: 'c2', month: '2026-08', status: 'published',
  pages: [{ id: 'cover', sectionType: 'cover', order: 0 }],
}
const ready = { review: book, loading: false, error: null }
function Location() {
  const location = useLocation()
  return <output>{location.pathname}{location.search}</output>
}
function Page() {
  return <MemoryRouter initialEntries={['/review/monthly-books/c2_august?diag=1']}>
    <Location />
    <Routes>
      <Route path="/review/monthly-books/:reviewId" element={<MonthlyReviewReaderPage />} />
      <Route path="/review" element={<div>Month archive</div>} />
    </Routes>
  </MemoryRouter>
}

beforeEach(() => {
  vi.clearAllMocks()
  readReview.mockReturnValue(ready)
})

describe('Monthly reader — the displayed book and exit share one loaded review', () => {
  it('cannot show a readable book from a second listener while its exit context is loading', () => {
    // The old nested listener could resolve before the wrapper's first one.
    readReview.mockReturnValueOnce({ review: null, loading: true, error: null })
    const view = render(<Page />)
    expect(readReview).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Exit reader' })).not.toBeInTheDocument()
    expect(screen.queryByText('Book page')).not.toBeInTheDocument()

    view.rerender(<Page />)
    expect(screen.getByText('Book page')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Exit reader' }))
    expect(selectChild).toHaveBeenCalledWith('c2')
    expect(screen.getByRole('status')).toHaveTextContent('/review?diag=1&period=month')
  })

  it('can exit an unavailable book without inventing a child ID', () => {
    readReview.mockReturnValue({ review: null, loading: false, error: null })
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(selectChild).not.toHaveBeenCalled()
    expect(screen.getByText('Month archive')).toBeInTheDocument()
  })
})
