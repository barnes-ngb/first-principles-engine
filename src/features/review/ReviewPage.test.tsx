import { createContext, useContext, useState, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseActiveChildResult } from '../../core/hooks/useActiveChild'
import type { Child } from '../../core/types'
import ReviewPage from './ReviewPage'
import ReviewRedirect from './ReviewRedirect'
import MonthlyReviewReaderPage from '../monthly-review/MonthlyReviewReaderPage'

const children = [{ id: 'c1', name: 'Lincoln' }, { id: 'c2', name: 'London' }] as Child[]
const ChildContext = createContext<UseActiveChildResult>(null!)
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => useContext(ChildContext),
}))
vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'family' }))
vi.mock('../../components/ChildSelector', () => ({
  default: ({ selectedChildId, onSelect }: { selectedChildId: string; onSelect: (id: string) => void }) => (
    <select aria-label="Review child" value={selectedChildId} onChange={e => onSelect(e.target.value)}>
      <option value="c1">Lincoln</option><option value="c2">London</option>
    </select>
  ),
}))
vi.mock('../weekly-review/WeeklyReviewPage', () => ({
  default: function WeeklyReview({ embedded }: { embedded: boolean }) {
    const { activeChildId } = useContext(ChildContext)
    return <div>Week for {activeChildId}{embedded ? '' : ' duplicate shell'}</div>
  },
}))
const monthlyReads = vi.fn()
vi.mock('../../core/hooks/useMonthlyReviews', () => ({
  useMonthlyReviews: () => monthlyReads(),
  useMonthlyReview: (_family: string, id: string) => ({
    review: { id, childId: id.startsWith('c2') ? 'c2' : 'c1' },
  }),
}))
vi.mock('../monthly-review/MonthlyPhoto', () => ({ MonthlyPhoto: () => null }))
vi.mock('../monthly-review/GenerateNowDialog', () => ({
  GenerateNowDialog: ({ open, defaultChildId, onGenerated }: {
    open: boolean; defaultChildId: string; onGenerated: (id: string) => void
  }) => open ? <button onClick={() => onGenerated(`${defaultChildId}_new`)}>Generate for {defaultChildId}</button> : null,
}))
vi.mock('../monthly-review/MonthlyReviewReader', () => ({
  MonthlyReviewReader: ({ childName, defaultMode, onExit }: {
    childName: string; defaultMode: string; onExit: () => void
  }) => <div>{childName} {defaultMode} book<button onClick={onExit}>Exit book</button></div>,
}))

function Family({ children: content, kid }: { children: ReactNode; kid: boolean }) {
  const [activeChildId, setActiveChildId] = useState('c1')
  return <ChildContext.Provider value={{
    children, activeChildId, setActiveChildId, activeChild: children.find(c => c.id === activeChildId),
    isChildProfile: kid, isLoading: false, addChild: () => {},
  }}>{content}</ChildContext.Provider>
}

function Location() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output>{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate(1)}>Forward</button></>
}

function renderReview(url = '/review', kid = false) {
  return render(<Family kid={kid}><MemoryRouter initialEntries={[url]}>
    <Location />
    <Routes>
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/review/monthly-books/:reviewId" element={<MonthlyReviewReaderPage />} />
      <Route path="/weekly-review" element={<ReviewRedirect />} />
      <Route path="/progress/monthly-books/:reviewId" element={<ReviewRedirect />} />
    </Routes>
  </MemoryRouter></Family>)
}

beforeEach(() => {
  monthlyReads.mockReset().mockReturnValue({ loading: false, reviews: [
    { id: 'c1_august', childId: 'c1', month: '2026-08', pages: [], status: 'published' },
    { id: 'c2_august', childId: 'c2', month: '2026-08', pages: [], status: 'published' },
  ] })
})

describe('Review — one child context across Week and Month', () => {
  it('retains the selected child through tabs and browser history, filtering actual monthly cards', () => {
    renderReview()
    expect(screen.getByText('Week for c1')).toBeInTheDocument()
    expect(monthlyReads).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Month' }))
    expect(screen.getByText('Lincoln — August 2026')).toBeInTheDocument()
    expect(screen.queryByText('London — August 2026')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c2' } })
    expect(screen.getByText('London — August 2026')).toBeInTheDocument()
    expect(screen.queryByText('Lincoln — August 2026')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Week for c2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('London — August 2026')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Review')
  })

  it('opens a selected child’s book and exits back to Month with child and diagnostic context intact', () => {
    renderReview('/review?period=month&diag=1')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c2' } })
    fireEvent.click(screen.getByRole('button', { name: /London — August 2026/ }))
    expect(screen.getByRole('status')).toHaveTextContent('/review/monthly-books/c2_august?diag=1')
    expect(screen.getByText('London parent book')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Exit book' }))
    expect(screen.getByRole('status')).toHaveTextContent('/review?diag=1&period=month')
    expect(screen.getByRole('combobox')).toHaveValue('c2')
    expect(screen.getByText('London — August 2026')).toBeInTheDocument()
  })

  it('defaults generation to the selected child and opens the resulting book', () => {
    renderReview('/review?period=month&diag=1')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate for c2' }))
    expect(screen.getByRole('status')).toHaveTextContent('/review/monthly-books/c2_new?diag=1')
  })

  it.each(['/review', '/review?period=month'])('does not mount parent content or monthly reads for a child at %s', url => {
    renderReview(url, true)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText(/Week for/)).not.toBeInTheDocument()
    expect(monthlyReads).not.toHaveBeenCalled()
  })

  it('keeps old weekly links working with diagnostics', () => {
    renderReview('/weekly-review?diag=1')
    expect(screen.getByRole('status')).toHaveTextContent('/review?diag=1')
    expect(screen.getByText('Week for c1')).toBeInTheDocument()
  })

  it('keeps old monthly reader links working', () => {
    renderReview('/progress/monthly-books/c2_august?diag=1')
    expect(screen.getByRole('status')).toHaveTextContent('/review/monthly-books/c2_august?diag=1')
    expect(screen.getByText('London parent book')).toBeInTheDocument()
  })
})
