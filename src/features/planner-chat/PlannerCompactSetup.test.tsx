import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PlannerCompactSetup from './PlannerCompactSetup'
import type { ChapterBook, WorkbookConfig } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'new-book' }),
}))

vi.mock('../../core/firebase/firestore', () => ({
  chapterBooksCollection: vi.fn(),
}))

const NARNIA: ChapterBook = {
  id: 'narnia',
  title: 'The Lion, the Witch and the Wardrobe',
  author: 'C.S. Lewis',
  totalChapters: 17,
  chapters: [],
  createdAt: '2026-01-01',
}

const WORKBOOKS: WorkbookConfig[] = [
  {
    id: 'wb-math',
    childId: 'lincoln',
    name: 'GATB Math',
    subjectBucket: SubjectBucket.Math,
    totalUnits: 120,
    currentPosition: 46,
    unitLabel: 'Lesson',
    targetFinishDate: '2026-08-01',
    schoolDaysPerWeek: 5,
  },
  {
    id: 'wb-phonics',
    childId: 'lincoln',
    name: 'Explode the Code',
    subjectBucket: SubjectBucket.Reading,
    totalUnits: 80,
    currentPosition: 12,
    unitLabel: 'Lesson',
    targetFinishDate: '2026-12-01',
    schoolDaysPerWeek: 5,
  },
]

function defaultProps(overrides: Partial<React.ComponentProps<typeof PlannerCompactSetup>> = {}) {
  return {
    childName: 'Lincoln',
    weekRangeLabel: '2026-05-18 → 2026-05-22',
    weekEnergy: 'full' as const,
    onWeekEnergyChange: vi.fn(),
    hoursPerDay: 2.5,
    chapterBooks: [NARNIA],
    selectedBook: NARNIA,
    onSelectedBookChange: vi.fn(),
    onBookAdded: vi.fn(),
    bookProgress: null,
    chapterBooksLoading: false,
    chapterBooksLoadError: false,
    workbookConfigs: WORKBOOKS,
    excludedWorkbookIds: new Set<string>(),
    onToggleWorkbook: vi.fn(),
    onAddWorkbook: vi.fn(),
    weekNotes: '',
    onWeekNotesChange: vi.fn(),
    onGenerate: vi.fn(),
    onRepeatLastWeek: vi.fn(),
    generatingWeek: false,
    repeatingWeek: false,
    canRepeatLastWeek: true,
    ...overrides,
  }
}

describe('PlannerCompactSetup — sections', () => {
  it('renders header with child name and week range', () => {
    render(<PlannerCompactSetup {...defaultProps()} />)
    expect(screen.getByText("Plan Lincoln's Week")).toBeInTheDocument()
    expect(screen.getByText('2026-05-18 → 2026-05-22')).toBeInTheDocument()
  })

  it('renders energy selector with normal/lighter/MVD options', () => {
    render(<PlannerCompactSetup {...defaultProps()} />)
    expect(screen.getByRole('button', { name: /normal/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lighter/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tough/i })).toBeInTheDocument()
  })

  it('renders workbook chips', () => {
    render(<PlannerCompactSetup {...defaultProps()} />)
    expect(screen.getByText(/GATB Math/)).toBeInTheDocument()
    expect(screen.getByText(/Explode the Code/)).toBeInTheDocument()
  })

  it('renders both Generate Plan and Repeat Last Week buttons', () => {
    render(<PlannerCompactSetup {...defaultProps()} />)
    expect(screen.getByRole('button', { name: /generate plan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /repeat last week/i })).toBeInTheDocument()
  })

  it('shows "+ Add" chip when onAddWorkbook is provided', () => {
    render(<PlannerCompactSetup {...defaultProps()} />)
    expect(screen.getByText('+ Add')).toBeInTheDocument()
  })
})

describe('PlannerCompactSetup — interactions', () => {
  it('calls onGenerate when Generate Plan is clicked', () => {
    const onGenerate = vi.fn()
    render(<PlannerCompactSetup {...defaultProps({ onGenerate })} />)
    fireEvent.click(screen.getByRole('button', { name: /generate plan/i }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('calls onRepeatLastWeek when Repeat Last Week is clicked', () => {
    const onRepeatLastWeek = vi.fn()
    render(<PlannerCompactSetup {...defaultProps({ onRepeatLastWeek })} />)
    fireEvent.click(screen.getByRole('button', { name: /repeat last week/i }))
    expect(onRepeatLastWeek).toHaveBeenCalledTimes(1)
  })

  it('disables Repeat Last Week when canRepeatLastWeek is false', () => {
    render(<PlannerCompactSetup {...defaultProps({ canRepeatLastWeek: false })} />)
    expect(screen.getByRole('button', { name: /repeat last week/i })).toBeDisabled()
  })

  it('disables both CTAs while generating', () => {
    render(<PlannerCompactSetup {...defaultProps({ generatingWeek: true })} />)
    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /repeat last week/i })).toBeDisabled()
  })

  it('calls onToggleWorkbook when a workbook chip is clicked', () => {
    const onToggleWorkbook = vi.fn()
    render(<PlannerCompactSetup {...defaultProps({ onToggleWorkbook })} />)
    fireEvent.click(screen.getByText(/GATB Math/))
    expect(onToggleWorkbook).toHaveBeenCalledWith('wb-math')
  })

  it('calls onWeekNotesChange when notes field is edited', () => {
    const onWeekNotesChange = vi.fn()
    render(<PlannerCompactSetup {...defaultProps({ onWeekNotesChange })} />)
    const input = screen.getByLabelText(/anything special/i)
    fireEvent.change(input, { target: { value: 'Field trip Tuesday' } })
    expect(onWeekNotesChange).toHaveBeenCalledWith('Field trip Tuesday')
  })

  it('shows empty-state message and add-one link when no workbooks configured', () => {
    const onAddWorkbook = vi.fn()
    render(<PlannerCompactSetup {...defaultProps({ workbookConfigs: [], onAddWorkbook })} />)
    expect(screen.getByText(/no workbooks configured/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add one/i }))
    expect(onAddWorkbook).toHaveBeenCalledTimes(1)
  })
})
