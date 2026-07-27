import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TodayChecklist from './TodayChecklist'
import type { ChecklistItem, DayLog, SkillSnapshot, WatchVideo } from '../../core/types'
import { PlanType, SubjectBucket } from '../../core/types/enums'
import { appendWatchItemToDayLog } from '../watch/watchDayItem'

const video: WatchVideo = {
  id: 'vid-1',
  youtubeId: 'abcdefghijk',
  title: 'How volcanoes work',
  plannedMinutes: 12,
  subjectBucket: SubjectBucket.Science,
  childId: 'c1',
  addedBy: 'parent',
  vettedAt: '2026-07-27T10:00:00.000Z',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
}

const plannedItem: ChecklistItem = {
  label: 'GATB Math (30m)',
  completed: false,
  subjectBucket: SubjectBucket.Math,
  source: 'planner',
}

function renderChecklist(opts: { onAddWatchItem?: () => void } = {}) {
  const dayLog = {
    id: '2026-07-27',
    date: '2026-07-27',
    checklist: [plannedItem],
  } as unknown as DayLog
  render(
    <MemoryRouter>
      <TodayChecklist
        dayLog={dayLog}
        selectedChild={{ name: 'Lincoln', id: 'c1' }}
        selectedChildId="c1"
        familyId="f1"
        today="2026-07-27"
        planType={PlanType.Normal}
        todaySnapshot={null as SkillSnapshot | null}
        activeRoutineItems={undefined}
        persistDayLogImmediate={vi.fn()}
        onTeachHelperOpen={vi.fn()}
        onAddWatchItem={opts.onAddWatchItem}
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

/** Enter the parent edit mode that owns the add affordances. */
function enterEditMode() {
  const toggles = screen.getAllByRole('button')
  // The edit toggle is the icon button beside Print in the card header.
  const editToggle = toggles.find((b) => b.querySelector('[data-testid="EditIcon"]'))
  expect(editToggle).toBeDefined()
  fireEvent.click(editToggle!)
}

const addVideoButton = () => screen.queryByRole('button', { name: /add a video/i })

/**
 * FEAT-132: Today's parent edit mode can put a vetted video on the LIVE day.
 * Device testing found there was no way in at all short of re-planning the week.
 */
describe('TodayChecklist — add a video to the live day (FEAT-132)', () => {
  it('offers "Add a video" beside "Add Item" in parent edit mode', () => {
    renderChecklist({ onAddWatchItem: vi.fn() })
    expect(addVideoButton()).toBeNull() // not until edit mode
    enterEditMode()
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
    expect(addVideoButton()).not.toBeNull()
  })

  it('opens the library picker when tapped', () => {
    const onAddWatchItem = vi.fn()
    renderChecklist({ onAddWatchItem })
    enterEditMode()
    fireEvent.click(addVideoButton()!)
    expect(onAddWatchItem).toHaveBeenCalledTimes(1)
  })

  it('renders no video affordance when the capability is not injected', () => {
    // Parent-gated by injection: `TodayPage` (the parent shell) passes the
    // handler. Nothing renders without it — capability, never a name.
    renderChecklist()
    enterEditMode()
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
    expect(addVideoButton()).toBeNull()
  })

  it('produces a REAL watch row — itemType AND watchVideoId, not a free-text label', () => {
    // The write the picker's onSelect performs in `TodayPage`.
    const dayLog: DayLog = {
      childId: 'c1',
      date: '2026-07-27',
      blocks: [],
      checklist: [plannedItem],
    }
    const updated = appendWatchItemToDayLog(dayLog, video)
    const added = updated.checklist![1]
    expect(added.itemType).toBe('watch')
    expect(added.watchVideoId).toBe('vid-1')
    // The planned item is untouched — the add is purely additive.
    expect(updated.checklist![0]).toEqual(plannedItem)
  })
})
