import { createContext, useContext, useState, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseActiveChildResult } from '../../core/hooks/useActiveChild'
import type { Child } from '../../core/types'
import ReviewPage from './ReviewPage'
import ReviewRedirect from './ReviewRedirect'
import MonthlyReviewReaderPage from '../monthly-review/MonthlyReviewReaderPage'

const initialChildren = [{ id: 'c1', name: 'Lincoln' }, { id: 'c2', name: 'London' }] as Child[]
let savedChildren = initialChildren
const ChildContext = createContext<{
  activeChildId: string; setActiveChildId: (id: string) => void; kid: boolean
}>(null!)
// Match production: the selected ID is shared, but each hook loads its OWN child
// array once. A context that shared the whole array would mask the Add Child bug.
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: function useActiveChild(): UseActiveChildResult {
    const { activeChildId, setActiveChildId, kid } = useContext(ChildContext)
    const [children, setChildren] = useState(() => [...savedChildren])
    return {
      children, activeChildId, setActiveChildId,
      activeChild: children.find(c => c.id === activeChildId),
      isChildProfile: kid, isLoading: false,
      addChild: child => {
        savedChildren = [...savedChildren, child]
        setChildren(previous => [...previous, child])
        setActiveChildId(child.id)
      },
    }
  },
}))
vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'family' }))
vi.mock('../../components/ChildSelector', () => ({
  default: ({ children, selectedChildId, onSelect, onChildAdded }: {
    children: Child[]; selectedChildId: string; onSelect: (id: string) => void; onChildAdded: (child: Child) => void
  }) => <><select aria-label="Review child" value={selectedChildId} onChange={e => onSelect(e.target.value)}>
    {children.map(child => <option key={child.id} value={child.id}>{child.name}</option>)}
  </select><button onClick={() => onChildAdded({ id: 'c3', name: 'New child' } as Child)}>Add child</button></>,
}))
vi.mock('../weekly-review/WeeklyReviewPage', () => ({
  WeeklyReviewContent: ({ embedded, childContext }: { embedded: boolean; childContext: UseActiveChildResult }) => (
    <div>Week for {childContext.activeChildId}{embedded ? '' : ' duplicate shell'}
      <span>Weekly child: {childContext.activeChild?.name}</span>
    </div>
  ),
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
  GenerateNowDialog: ({ open, defaultChildId, childOptions, onGenerated }: {
    open: boolean; defaultChildId: string; childOptions: Child[]; onGenerated: (id: string) => void
  }) => open ? <div role="dialog" aria-label="Generate book">
    <p>Default child: {defaultChildId}</p>
    {childOptions.map(child => <button key={child.id} onClick={() => onGenerated(`${child.id}_new`)}>
      Generate for {child.id}
    </button>)}
  </div> : null,
}))
vi.mock('../monthly-review/MonthlyReviewReader', () => ({
  MonthlyReviewReaderContent: ({ childName, defaultMode, onExit }: {
    childName: string; defaultMode: string; onExit: () => void
  }) => <div>{childName} {defaultMode} book<button onClick={onExit}>Exit book</button></div>,
}))

function Family({ children: content, kid }: { children: ReactNode; kid: boolean }) {
  const [activeChildId, setActiveChildId] = useState('c1')
  return <ChildContext.Provider value={{ activeChildId, setActiveChildId, kid }}>{content}</ChildContext.Provider>
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
  savedChildren = initialChildren
  monthlyReads.mockReset().mockReturnValue({ loading: false, reviews: [
    { id: 'c1_august', childId: 'c1', month: '2026-08', pages: [], status: 'published' },
    { id: 'c2_august', childId: 'c2', month: '2026-08', pages: [], status: 'published' },
  ] })
})

describe('Review — one child context across Week and Month', () => {
  it('retains the selected child through tabs and browser history, filtering actual monthly cards', () => {
    renderReview()
    expect(screen.getByText('Week for c1', { exact: false })).toBeInTheDocument()
    expect(monthlyReads).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Month' }))
    expect(screen.getByText('Lincoln — August 2026')).toBeInTheDocument()
    expect(screen.queryByText('London — August 2026')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c2' } })
    expect(screen.getByText('London — August 2026')).toBeInTheDocument()
    expect(screen.queryByText('Lincoln — August 2026')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Week for c2', { exact: false })).toBeInTheDocument()
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
    expect(screen.getByText('Default child: c2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate for c1' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Generate for c2' }))
    expect(screen.getByRole('status')).toHaveTextContent('/review/monthly-books/c2_new?diag=1')
    fireEvent.click(screen.getByRole('button', { name: 'Exit book' }))
    expect(screen.getByRole('combobox')).toHaveValue('c2')
    expect(screen.getByText('London — August 2026')).toBeInTheDocument()
  })

  it.each(['week', 'month'])('propagates an added child into the mounted %s without reloading', period => {
    renderReview(`/review?period=${period}`)
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }))
    expect(screen.getByRole('combobox')).toHaveValue('c3')
    if (period === 'week') {
      expect(screen.getByText('Weekly child: New child')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('tab', { name: 'Month' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Generate Now' }))
    expect(screen.getByText('Default child: c3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate for c3' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate for c1' })).not.toBeInTheDocument()
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
    expect(screen.getByText('Week for c1', { exact: false })).toBeInTheDocument()
  })

  it('returns a saved monthly reader link to that book’s child archive', () => {
    renderReview('/progress/monthly-books/c2_august?diag=1')
    expect(screen.getByRole('status')).toHaveTextContent('/review/monthly-books/c2_august?diag=1')
    expect(screen.getByText('London parent book')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Exit book' }))
    expect(screen.getByRole('combobox')).toHaveValue('c2')
    expect(screen.getByText('London — August 2026')).toBeInTheDocument()
  })
})
