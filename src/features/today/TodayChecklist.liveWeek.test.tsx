import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TodayChecklist from './TodayChecklist'
import type { ChecklistItem, DayBlock, DayLog, SkillSnapshot } from '../../core/types'
import { DayBlockType, PlanType, SubjectBucket } from '../../core/types/enums'

/**
 * FEAT-138 — Today's parent edit mode gains move and swap, and its existing
 * delete learns to refuse finished work.
 *
 * The write these affordances reach is `liveDayEdit`, pinned separately. This
 * file is about what the parent can and cannot TAP, and about the one write
 * `TodayChecklist` still owns itself: removing a row from today.
 */

const plannerRow: ChecklistItem = {
  label: 'GATB Math (30m)',
  completed: false,
  subjectBucket: SubjectBucket.Math,
  estimatedMinutes: 30,
  source: 'planner',
}

const watchRow: ChecklistItem = {
  label: 'Watch: How volcanoes work (12m)',
  completed: false,
  subjectBucket: SubjectBucket.Science,
  estimatedMinutes: 12,
  source: 'manual',
  itemType: 'watch',
  watchVideoId: 'vid-1',
}

/** The block `handleApplyPlan` pairs with a planner row — title only, no own checklist. */
const plannerAppliedBlock: DayBlock = {
  type: DayBlockType.Math,
  title: 'GATB Math',
  subjectBucket: SubjectBucket.Math,
  plannedMinutes: 30,
  source: 'planner',
}

function renderChecklist(opts: {
  checklist?: ChecklistItem[]
  blocks?: DayBlock[]
  onMoveItemToDay?: (index: number) => void
  onSwapWatchItem?: (index: number) => void
  persistDayLogImmediate?: ReturnType<typeof vi.fn>
} = {}) {
  const dayLog = {
    id: '2026-08-11',
    date: '2026-08-11',
    childId: 'c1',
    checklist: opts.checklist ?? [plannerRow],
    blocks: opts.blocks ?? [],
  } as unknown as DayLog
  const persist = opts.persistDayLogImmediate ?? vi.fn<(day: DayLog) => void>()
  render(
    <MemoryRouter>
      <TodayChecklist
        dayLog={dayLog}
        selectedChild={{ name: 'Lincoln', id: 'c1' }}
        selectedChildId="c1"
        familyId="f1"
        today="2026-08-11"
        isToday
        planType={PlanType.Normal}
        todaySnapshot={null as SkillSnapshot | null}
        activeRoutineItems={undefined}
        persistDayLogImmediate={persist}
        onTeachHelperOpen={vi.fn()}
        onMoveItemToDay={opts.onMoveItemToDay}
        onSwapWatchItem={opts.onSwapWatchItem}
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
  return persist
}

function enterEditMode() {
  const editToggle = screen
    .getAllByRole('button')
    .find((b) => b.querySelector('[data-testid="EditIcon"]'))
  fireEvent.click(editToggle!)
}

const moveButtons = () => screen.queryAllByRole('button', { name: /move to another day/i })
const swapButtons = () => screen.queryAllByRole('button', { name: /change video/i })
const removeButtons = () => screen.queryAllByRole('button', { name: /remove from today/i })

describe('TodayChecklist — move and swap on a live day (FEAT-138)', () => {
  it('offers "move to another day" in parent edit mode', () => {
    renderChecklist({ onMoveItemToDay: vi.fn() })
    expect(moveButtons()).toHaveLength(0) // not until edit mode
    enterEditMode()
    expect(moveButtons()).toHaveLength(1)
  })

  it('offers "change video" on a watch row only', () => {
    renderChecklist({ checklist: [plannerRow, watchRow], onSwapWatchItem: vi.fn() })
    enterEditMode()
    expect(swapButtons()).toHaveLength(1)
  })

  it('reports the row index so the caller knows what to write', () => {
    const onMoveItemToDay = vi.fn()
    renderChecklist({ checklist: [plannerRow, watchRow], onMoveItemToDay })
    enterEditMode()
    fireEvent.click(moveButtons()[1])
    expect(onMoveItemToDay).toHaveBeenCalledWith(1)
  })

  it('renders nothing when the capability is not injected — capability, never a name', () => {
    renderChecklist({ checklist: [watchRow] })
    enterEditMode()
    expect(moveButtons()).toHaveLength(0)
    expect(swapButtons()).toHaveLength(0)
  })
})

describe('TodayChecklist — finished work stays on its day (FEAT-138)', () => {
  const done: ChecklistItem = { ...plannerRow, completed: true, actualMinutes: 30 }

  it('disables move, remove and swap on a completed row', () => {
    renderChecklist({
      checklist: [{ ...watchRow, completed: true }],
      onMoveItemToDay: vi.fn(),
      onSwapWatchItem: vi.fn(),
    })
    enterEditMode()
    expect(moveButtons()[0]).toBeDisabled()
    expect(swapButtons()[0]).toBeDisabled()
    expect(removeButtons()[0]).toBeDisabled()
  })

  it('says why, in the row — not only in a tooltip a phone never opens', () => {
    renderChecklist({ checklist: [done] })
    enterEditMode()
    expect(screen.getByText(/Lincoln already did this one/)).toBeInTheDocument()
  })

  it('writes no day doc when a completed row’s delete is invoked', () => {
    const persist = renderChecklist({ checklist: [done] })
    enterEditMode()
    fireEvent.click(removeButtons()[0])
    expect(persist).not.toHaveBeenCalled()
  })

  it('still removes an incomplete row (characterization)', () => {
    const persist = renderChecklist({ checklist: [plannerRow, watchRow] })
    enterEditMode()
    fireEvent.click(removeButtons()[0])
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0].checklist).toEqual([watchRow])
  })
})

describe('TodayChecklist — removal now takes the planner-applied block with it (FEAT-138)', () => {
  it('drops the paired block a planner APPLY created', () => {
    // Pre-FEAT-138 this matched only on `block.checklist`, which `handleApplyPlan`
    // never populates — so the block was left orphaned on the day. The shared
    // `itemMatchesBlock` rule matches it by title.
    const persist = renderChecklist({
      checklist: [plannerRow],
      blocks: [plannerAppliedBlock],
    })
    enterEditMode()
    fireEvent.click(removeButtons()[0])
    expect(persist.mock.calls[0][0].blocks).toEqual([])
  })

  it('keeps a block that carries logged minutes — those are compliance hours', () => {
    const logged = { ...plannerAppliedBlock, actualMinutes: 30 }
    const persist = renderChecklist({ checklist: [plannerRow], blocks: [logged] })
    enterEditMode()
    fireEvent.click(removeButtons()[0])
    expect(persist.mock.calls[0][0].blocks).toEqual([logged])
  })

  it('never edits a surviving block’s plannedMinutes', () => {
    const other: DayBlock = { ...plannerAppliedBlock, title: 'Reading', type: DayBlockType.Reading }
    const persist = renderChecklist({
      checklist: [plannerRow],
      blocks: [plannerAppliedBlock, other],
    })
    enterEditMode()
    fireEvent.click(removeButtons()[0])
    expect(persist.mock.calls[0][0].blocks).toEqual([other])
    expect(persist.mock.calls[0][0].blocks![0].plannedMinutes).toBe(30)
  })
})
