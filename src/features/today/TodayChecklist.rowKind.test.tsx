import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TodayChecklist from './TodayChecklist'
import { TODAY_ROW_UNKNOWN_NOTE, TodayRowUnknownReason } from './todayRowKind'
import type { TodayRowConfigLike } from './todayRowKind'
import type { ChecklistItem, DayLog, SkillSnapshot } from '../../core/types'
import { ActivityType, PlanType, SubjectBucket } from '../../core/types/enums'

/**
 * UX-363 — a workbook row, a routine row, a strand row and an app row rendered
 * as the same title with `(20m)` and a checkbox, so *"where do I add to this
 * lesson?"* had four answers and the screen named none of them. These tests are
 * about what the row now SAYS and what it now OFFERS; `todayRowKind.test.ts`
 * owns the resolution rule itself.
 */

const configs: TodayRowConfigLike[] = [
  { id: 'wb-1', name: 'GATB Math', type: ActivityType.Workbook, scannable: true, currentPosition: 35 },
  { id: 'rt-1', name: 'Handwriting', type: ActivityType.Routine },
  { id: 'st-1', name: 'History', type: ActivityType.Strand, currentPosition: 14 },
  { id: 'ap-1', name: 'Reading Eggs', type: ActivityType.App },
]

function renderRow(
  item: ChecklistItem,
  opts: { onStrandSessionOpen?: ReturnType<typeof vi.fn> } = {},
) {
  const dayLog = { id: '2026-09-12', date: '2026-09-12', checklist: [item] } as unknown as DayLog
  render(
    <MemoryRouter>
      <TodayChecklist
        dayLog={dayLog}
        selectedChild={{ name: 'Lincoln', id: 'c1' }}
        selectedChildId="c1"
        familyId="f1"
        today="2026-09-12"
        isToday
        planType={PlanType.Normal}
        todaySnapshot={null as SkillSnapshot | null}
        activeRoutineItems={undefined}
        persistDayLogImmediate={vi.fn()}
        onTeachHelperOpen={vi.fn()}
        onUnifiedCapture={vi.fn()}
        onStrandSessionOpen={opts.onStrandSessionOpen ?? vi.fn()}
        configs={configs}
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

function item(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return { label: 'Handwriting (15m)', completed: false, ...overrides }
}

describe('TodayChecklist — every row says what kind of thing it is (UX-363)', () => {
  it('a workbook row names the workbook AND the lesson it is on', () => {
    renderRow(item({ label: 'GATB Math (30m)', subjectBucket: SubjectBucket.Math }))
    expect(screen.getByText('Workbook · lesson 35')).toBeTruthy()
  })

  it('a routine row says Routine — it used to say nothing at all', () => {
    renderRow(item())
    expect(screen.getByText('Routine')).toBeTruthy()
  })

  it('a strand row names its session count', () => {
    renderRow(item({ label: 'History (30m)' }))
    expect(screen.getByText('Strand · session 14')).toBeTruthy()
  })

  it('an app row says App', () => {
    renderRow(item({ label: 'Reading Eggs (20m)' }))
    expect(screen.getByText('App')).toBeTruthy()
  })

  it('a row with no curriculum row behind it says so, and says what the photo does', () => {
    renderRow(item({ label: 'Trip to the museum (90m)' }))
    expect(screen.getByText('No curriculum row')).toBeTruthy()
    expect(
      screen.getByText(TODAY_ROW_UNKNOWN_NOTE[TodayRowUnknownReason.NoMatch]),
    ).toBeTruthy()
  })

  it('a row that DOES resolve carries no note — the sentence is for the absence', () => {
    renderRow(item())
    expect(
      screen.queryByText(TODAY_ROW_UNKNOWN_NOTE[TodayRowUnknownReason.NoMatch]),
    ).toBeNull()
  })
})

describe('TodayChecklist — the row carries its own add-door (UX-363)', () => {
  const addPage = () => screen.queryByRole('button', { name: /^add page$/i })
  const addPhoto = () => screen.queryByRole('button', { name: /^add a photo$/i })

  it("a workbook's door is Add page — a photo there moves a lesson number", () => {
    renderRow(item({ label: 'GATB Math (30m)', subjectBucket: SubjectBucket.Math }))
    expect(addPage()).not.toBeNull()
    expect(addPhoto()).toBeNull()
  })

  it("a routine's door is Add a photo — and it is there BEFORE the box is checked", () => {
    renderRow(item())
    expect(addPhoto()).not.toBeNull()
    expect(addPage()).toBeNull()
  })

  it('an app row has a door too — that was one of the two "nowhere" cases', () => {
    renderRow(item({ label: 'Reading Eggs (20m)' }))
    expect(addPhoto()).not.toBeNull()
  })

  it('an unmatched row still gets a capture door; the note explains what it does not do', () => {
    renderRow(item({ label: 'Trip to the museum (90m)' }))
    expect(addPhoto()).not.toBeNull()
  })

  it("a strand's one door is Record a session, not a second photo door", () => {
    renderRow(item({ label: 'History (30m)' }))
    expect(screen.getByRole('button', { name: /record a session/i })).toBeTruthy()
    expect(addPhoto()).toBeNull()
    expect(addPage()).toBeNull()
  })

  it('a row that already carries a photo keeps its Captured chip, and offers no second', () => {
    renderRow(item({ completed: true, evidenceArtifactId: 'a1', evidenceCollection: 'artifacts' }))
    expect(screen.getByText(/captured/i)).toBeTruthy()
    expect(addPhoto()).toBeNull()
    expect(addPage()).toBeNull()
  })

  it('the door opens the SAME staging dialog, in the row\'s own vocabulary', async () => {
    renderRow(item({ label: 'GATB Math (30m)', subjectBucket: SubjectBucket.Math }))
    fireEvent.click(addPage()!)
    expect(await screen.findByText('Add pages — GATB Math')).toBeTruthy()
    // FEAT-109's batch copy is untouched: one lane, not a second one.
    expect(screen.getByText(/Snap several pages, then Save once/i)).toBeTruthy()
  })

  it('a routine row opens the same dialog, saying photos rather than pages', async () => {
    renderRow(item())
    fireEvent.click(addPhoto()!)
    expect(await screen.findByText('Add photos — Handwriting')).toBeTruthy()
  })

  it('a completed strand row keeps the capture it had before this change', () => {
    // Its own door is a session, so the photo door is not offered up-front — but
    // nothing was taken away: after completion the generic capture is still there.
    renderRow(item({ label: 'History (30m)', completed: true }))
    expect(addPhoto()).not.toBeNull()
  })
})
