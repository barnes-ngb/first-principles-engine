import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import WeekRibbon from '../WeekRibbon'
import type { ChecklistItem, DayLog } from '../../../core/types'

type SnapshotHandler = (snap: { docs: Array<{ data: () => DayLog }> }) => void
type ErrorHandler = (err: Error) => void

const snapshotState: {
  next: { docs: Array<{ data: () => DayLog }> } | null
  error: Error | null
} = { next: null, error: null }

vi.mock('firebase/firestore', () => ({
  onSnapshot: (
    _q: unknown,
    onNext: SnapshotHandler,
    onError?: ErrorHandler,
  ): (() => void) => {
    if (snapshotState.error && onError) {
      onError(snapshotState.error)
    } else {
      onNext(snapshotState.next ?? { docs: [] })
    }
    return () => {}
  },
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  daysCollection: vi.fn(() => ({})),
}))

afterEach(() => {
  snapshotState.next = null
  snapshotState.error = null
})

function dayLog(date: string, items: Array<Partial<ChecklistItem>>): DayLog {
  return {
    childId: 'kid-1',
    date,
    blocks: [],
    checklist: items.map((i, idx) => ({
      id: i.id ?? `item-${idx}`,
      label: i.label ?? 'Item',
      completed: i.completed ?? false,
      ...i,
    })),
  }
}

function setSnapshot(logs: DayLog[]): void {
  snapshotState.next = {
    docs: logs.map((log) => ({ data: () => log })),
  }
}

function renderRibbon(props: {
  weekStart?: string
  today?: string
  childId?: string
  selectedDate?: string
  onSelectDate?: (dateKey: string) => void
} = {}) {
  return render(
    <MemoryRouter>
      <WeekRibbon
        childId={props.childId ?? 'kid-1'}
        familyId="fam-1"
        weekStart={props.weekStart ?? '2026-05-11'}
        today={props.today ?? '2026-05-14'}
        selectedDate={props.selectedDate}
        onSelectDate={props.onSelectDate}
      />
    </MemoryRouter>,
  )
}

describe('WeekRibbon', () => {
  it('renders all five day labels with stats from a logs fixture', () => {
    setSnapshot([
      dayLog('2026-05-11', [
        { label: 'a', completed: true, plannedMinutes: 30, subjectBucket: 'Math' },
        { label: 'b', completed: true, plannedMinutes: 30 },
        { label: 'c', completed: true, plannedMinutes: 30 },
      ]),
      dayLog('2026-05-12', [
        { label: 'd', completed: true, plannedMinutes: 20 },
        { label: 'e', completed: false, plannedMinutes: 80 },
      ]),
      dayLog('2026-05-14', [
        { label: 'f', completed: false, plannedMinutes: 60 },
      ]),
    ])

    renderRibbon()

    expect(screen.getByText('This Week')).toBeInTheDocument()
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Tue')).toBeInTheDocument()
    expect(screen.getByText('Wed')).toBeInTheDocument()
    expect(screen.getByText('Thu')).toBeInTheDocument()
    expect(screen.getByText('Fri')).toBeInTheDocument()
  })

  it('highlights today regardless of completion (aria label includes in-progress)', () => {
    setSnapshot([
      dayLog('2026-05-14', [{ label: 'x', completed: false, plannedMinutes: 30 }]),
    ])

    renderRibbon({ today: '2026-05-14' })

    expect(screen.getByLabelText(/Thu in-progress/i)).toBeInTheDocument()
  })

  it('renders the "Plan My Week" link when no day has a plan', () => {
    setSnapshot([])
    renderRibbon()
    const link = screen.getByRole('link', { name: /plan my week/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/planner/chat')
  })

  it('totals the hours chip across mixed-source items (plannedMinutes vs estimatedMinutes vs label-parsed)', () => {
    setSnapshot([
      dayLog('2026-05-11', [
        { label: 'a (10m)', completed: true },
        { label: 'b', completed: true, estimatedMinutes: 20 },
        { label: 'c', completed: false, plannedMinutes: 30 },
      ]),
      dayLog('2026-05-12', [
        { label: 'd', completed: true, plannedMinutes: 60 },
      ]),
    ])

    renderRibbon()

    // Logged: 10 + 20 + 60 = 90. Planned: 10 + 20 + 30 + 60 = 120. Both >= 60 → hrs.
    expect(screen.getByText('1.5/2 hrs')).toBeInTheDocument()
  })

  it('marks past dates with no logged minutes as skipped', () => {
    setSnapshot([
      dayLog('2026-05-12', [{ label: 'x', completed: false, plannedMinutes: 30 }]),
    ])
    renderRibbon({ today: '2026-05-14' })
    expect(screen.getByLabelText(/Tue skipped/i)).toBeInTheDocument()
  })

  it('marks past dates with partial completion as partial', () => {
    setSnapshot([
      dayLog('2026-05-12', [
        { label: 'a', completed: true, plannedMinutes: 20 },
        { label: 'b', completed: false, plannedMinutes: 80 },
      ]),
    ])
    renderRibbon({ today: '2026-05-14' })
    expect(screen.getByLabelText(/Tue partial/i)).toBeInTheDocument()
  })

  it('returns null when childId is empty', () => {
    const { container } = renderRibbon({ childId: '' })
    expect(container.textContent).toBe('')
  })

  it('calls onSelectDate with the tapped dateKey when a day dot is clicked', () => {
    setSnapshot([
      dayLog('2026-05-11', [{ label: 'a', completed: false, plannedMinutes: 30 }]),
    ])
    const onSelectDate = vi.fn()
    renderRibbon({ onSelectDate })

    fireEvent.click(screen.getByLabelText('View Monday, May 11'))

    expect(onSelectDate).toHaveBeenCalledWith('2026-05-11')
  })

  it('marks only the selected day dot with aria-current="date"', () => {
    setSnapshot([
      dayLog('2026-05-11', [{ label: 'a', completed: false, plannedMinutes: 30 }]),
      dayLog('2026-05-12', [{ label: 'b', completed: false, plannedMinutes: 30 }]),
    ])
    renderRibbon({ onSelectDate: vi.fn(), selectedDate: '2026-05-12' })

    expect(screen.getByLabelText('View Tuesday, May 12')).toHaveAttribute('aria-current', 'date')
    expect(screen.getByLabelText('View Monday, May 11')).not.toHaveAttribute('aria-current')
  })

  it('makes interactive day dots keyboard-operable (focusable + Enter/Space)', () => {
    setSnapshot([
      dayLog('2026-05-11', [{ label: 'a', completed: false, plannedMinutes: 30 }]),
    ])
    const onSelectDate = vi.fn()
    renderRibbon({ onSelectDate })

    const dot = screen.getByLabelText('View Monday, May 11')
    expect(dot).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(dot, { key: 'Enter' })
    fireEvent.keyDown(dot, { key: ' ' })

    expect(onSelectDate).toHaveBeenCalledTimes(2)
    expect(onSelectDate).toHaveBeenNthCalledWith(1, '2026-05-11')
    expect(onSelectDate).toHaveBeenNthCalledWith(2, '2026-05-11')
  })

  it('renders no interactive day dots when onSelectDate is absent (back-compat)', () => {
    setSnapshot([
      dayLog('2026-05-11', [{ label: 'a', completed: false, plannedMinutes: 30 }]),
    ])
    renderRibbon()

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
