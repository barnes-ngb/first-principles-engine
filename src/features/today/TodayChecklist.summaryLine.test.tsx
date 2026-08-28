// ── FEAT-161 (UX-07 / UX-25 / UX-28): the summary line stops lying ──────────
//
// The audit's named indictment lives on this one line of text. `TodayChecklist`
// had no `isToday` prop at all, so it computed `now + remainingMinutes` from the
// raw wall clock and rendered a clock time on past days, upcoming days, and any
// evening glance — 21:05 on a 350-minute unstarted day promising 2:55 AM.
//
// TZ is pinned before anything constructs a Date: "8 PM" has to mean the
// family's 8 PM, not the CI runner's.
process.env.TZ = 'America/Chicago'

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TodayChecklist from './TodayChecklist'
import type { ChecklistItem, DayLog, SkillSnapshot } from '../../core/types'
import { PlanType, SubjectBucket } from '../../core/types/enums'

const row = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  label: 'GATB Math (30m)',
  completed: false,
  subjectBucket: SubjectBucket.Math,
  estimatedMinutes: 30,
  source: 'planner',
  ...over,
})

function renderChecklist(opts: {
  checklist?: ChecklistItem[]
  isToday?: boolean
  today?: string
} = {}) {
  const date = opts.today ?? '2026-08-26'
  const dayLog = {
    id: date,
    date,
    childId: 'c1',
    checklist: opts.checklist ?? [row()],
    blocks: [],
  } as unknown as DayLog
  render(
    <MemoryRouter>
      <TodayChecklist
        dayLog={dayLog}
        selectedChild={{ name: 'Lincoln', id: 'c1' }}
        selectedChildId="c1"
        familyId="f1"
        today={date}
        isToday={opts.isToday ?? true}
        planType={PlanType.Normal}
        todaySnapshot={null as SkillSnapshot | null}
        activeRoutineItems={undefined}
        persistDayLogImmediate={vi.fn()}
        onTeachHelperOpen={vi.fn()}
        onUnifiedCapture={vi.fn()}
        onPreCompletionScan={vi.fn()}
        captureLoading={false}
        captureItemIndex={null}
        scanResult={null}
        scanError={null}
        onScanAddToPlan={vi.fn()}
        onScanSkip={vi.fn()}
        onClearScan={vi.fn()}
        onPrintMaterials={vi.fn()}
        printingMaterials={false}
      />
    </MemoryRouter>,
  )
}

/** Freeze the wall clock at a local-time instant on 2026-08-26 (a Wednesday). */
function freezeAt(hour: number, minute = 0) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 26, hour, minute))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('TodayChecklist summary line — UX-07', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('does not promise a middle-of-the-night finish on an evening glance', () => {
    freezeAt(21, 5)
    // 350 minutes of unstarted work: the audit's own example.
    renderChecklist({
      checklist: [
        row({ label: 'Reading (200m)', estimatedMinutes: 200 }),
        row({ label: 'Math (150m)', estimatedMinutes: 150 }),
      ],
    })

    expect(screen.queryByText(/Est\. finish/)).toBeNull()
    expect(screen.getByText(/~5h 50m left/)).toBeTruthy()
  })

  it('still gives a clock time in the morning, when it is actually useful', () => {
    freezeAt(9, 0)
    renderChecklist({
      checklist: [row({ label: 'Reading (130m)', estimatedMinutes: 130 })],
    })
    expect(screen.getByText(/Est\. finish: 11:10 AM/)).toBeTruthy()
  })

  it('renders NO clock time on a past day, whatever the hour', () => {
    freezeAt(9, 0)
    renderChecklist({
      isToday: false,
      today: '2026-08-12',
      checklist: [row({ label: 'Reading (130m)', estimatedMinutes: 130 })],
    })

    expect(screen.queryByText(/Est\. finish/)).toBeNull()
    expect(screen.getByText(/2h 10m left/)).toBeTruthy()
  })

  it('resolves on the last checkbox rather than vanishing', () => {
    freezeAt(10, 0)
    renderChecklist({
      checklist: [row({ label: 'Reading (30m)', completed: true, estimatedMinutes: 30 })],
    })
    expect(screen.getByText(/All done/)).toBeTruthy()
  })

  it('does not move when the deferred row is expanded', () => {
    freezeAt(9, 0)
    renderChecklist({
      checklist: [
        row({ label: 'Reading (130m)', estimatedMinutes: 130 }),
        row({ label: 'Extra science (60m)', estimatedMinutes: 60, deferredByBudget: true }),
      ],
    })

    expect(screen.getByText(/Est\. finish: 11:10 AM/)).toBeTruthy()
    // Expanding the deferred row is a way of LOOKING, not a change to the day.
    fireEvent.click(screen.getByText(/1 item deferred to fit today/i))
    // Sanity: the row really did expand (the toggle now offers to hide it).
    expect(screen.getByText(/Hide 1 deferred item/i)).toBeTruthy()
    expect(screen.getByText(/Est\. finish: 11:10 AM/)).toBeTruthy()
  })
})

describe('TodayChecklist summary line — UX-25 / UX-28', () => {
  it('omits the planned clause when the day has no planned minutes', () => {
    freezeAt(9, 0)
    renderChecklist({
      checklist: [row({ label: 'Read a bit', estimatedMinutes: undefined })],
    })

    expect(screen.queryByText(/0m planned/)).toBeNull()
    expect(screen.getByText(/0 of 1 done/)).toBeTruthy()
  })

  it('keeps the planned clause when there ARE planned minutes', () => {
    freezeAt(9, 0)
    renderChecklist()
    expect(screen.getByText(/30m planned/)).toBeTruthy()
  })

  it('titles a past day by its own name, not "Today\'s Plan"', () => {
    freezeAt(9, 0)
    renderChecklist({ isToday: false, today: '2026-08-12' })

    expect(screen.getByText("Wednesday's Plan")).toBeTruthy()
    expect(screen.queryByText("Today's Plan")).toBeNull()
  })

  it('still says "Today\'s Plan" on today', () => {
    freezeAt(9, 0)
    renderChecklist()
    expect(screen.getByText("Today's Plan")).toBeTruthy()
  })
})
