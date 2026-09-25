import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import WeekRibbon from '../WeekRibbon'
import type {
  ChecklistItem,
  DayLog,
  HoursAdjustment,
  HoursEntry,
} from '../../../core/types'

type Doc = { id: string; data: () => unknown }
type SnapshotHandler = (snap: { docs: Doc[] }) => void
type ErrorHandler = (err: Error) => void
type Source = 'days' | 'hours' | 'adjustments'

// UX-443: the ribbon reads the Review's three sources, live. The mock routes
// each `onSnapshot` by the collection its query was built on.
const snapshotState: {
  days: DayLog[]
  hours: HoursEntry[]
  adjustments: HoursAdjustment[]
  error: Error | null
} = { days: [], hours: [], adjustments: [], error: null }

vi.mock('firebase/firestore', () => ({
  onSnapshot: (
    q: unknown,
    onNext: SnapshotHandler,
    onError?: ErrorHandler,
  ): (() => void) => {
    const source = (q as [{ source: Source }])[0].source
    if (snapshotState.error && onError) {
      onError(snapshotState.error)
    } else {
      const rows = snapshotState[source] as Array<{ id?: string }>
      onNext({
        docs: rows.map((row, i) => ({ id: row.id ?? `${source}-${i}`, data: () => row })),
      })
    }
    return () => {}
  },
  getDocs: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
}))

vi.mock('../../../core/firebase/firestore', () => ({
  daysCollection: vi.fn(() => ({ source: 'days' })),
  hoursCollection: vi.fn(() => ({ source: 'hours' })),
  hoursAdjustmentsCollection: vi.fn(() => ({ source: 'adjustments' })),
}))

afterEach(() => {
  snapshotState.days = []
  snapshotState.hours = []
  snapshotState.adjustments = []
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

function setSnapshot(
  logs: DayLog[],
  hours: HoursEntry[] = [],
  adjustments: HoursAdjustment[] = [],
): void {
  snapshotState.days = logs
  snapshotState.hours = hours
  snapshotState.adjustments = adjustments
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

  it('the chip states the counted week with no denominator (UX-443)', () => {
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

    // Counted by the shared fold: 10 + 20 + 60 = 90 → "1.5 hrs". The old chip
    // read "1.5/2 hrs"; the planned 120 is nowhere on the page now.
    expect(screen.getByText('1.5 hrs')).toBeInTheDocument()
    expect(screen.queryByText(/\//)).not.toBeInTheDocument()
  })

  it('a kid’s manual row, a Capture `hours` doc and a correction all move the chip', () => {
    setSnapshot(
      [
        dayLog('2026-05-11', [
          { label: 'Plan (30m)', completed: true, estimatedMinutes: 30 },
          { label: 'Lego (25m)', completed: true, estimatedMinutes: 25, source: 'manual' },
        ]),
      ],
      [
        { id: 'h', childId: 'kid-1', date: '2026-05-12', minutes: 45, source: 'unified-capture' } as HoursEntry,
      ],
      [
        { id: 'a', childId: 'kid-1', date: '2026-05-13', minutes: -10, reason: 'Fix' } as HoursAdjustment,
      ],
    )
    renderRibbon()
    // 30 + 25 + 45 − 10 = 90.
    expect(screen.getByText('1.5 hrs')).toBeInTheDocument()
  })

  it('a failed read says so and never renders 0 (UX-211’s rule)', () => {
    snapshotState.error = new Error('permission-denied')
    renderRibbon()
    expect(screen.getByText(/Couldn’t read this week’s hours/)).toBeInTheDocument()
    expect(screen.queryByText(/^0 (min|hrs?)$/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Mon /)).not.toBeInTheDocument()
  })

  it('a past day with counted time and no plan is filled, not empty (UX-444)', () => {
    setSnapshot(
      [dayLog('2026-05-12', [{ label: 'x', completed: false, plannedMinutes: 30 }])],
      [{ id: 'h', childId: 'kid-1', date: '2026-05-11', minutes: 45 } as HoursEntry],
    )
    renderRibbon({ today: '2026-05-14' })
    expect(screen.getByLabelText(/Mon logged/i)).toBeInTheDocument()
  })

  it('a week with counted time and no plan is not "Nothing planned"', () => {
    setSnapshot([], [{ id: 'h', childId: 'kid-1', date: '2026-05-11', minutes: 45 } as HoursEntry])
    renderRibbon({ today: '2026-05-14' })
    expect(screen.queryByText(/Nothing planned/)).not.toBeInTheDocument()
    expect(screen.getByText('45 min')).toBeInTheDocument()
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
