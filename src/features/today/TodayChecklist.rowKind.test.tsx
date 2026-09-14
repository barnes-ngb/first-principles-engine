import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TodayChecklist from './TodayChecklist'
import {
  CONFIG_READ_FAILED_NOTE,
  CONFIG_READ_FAILED_TELL,
  TODAY_ROW_KIND_WORD,
  TODAY_ROW_UNKNOWN_NOTE,
  TodayRowKind,
  TodayRowUnknownReason,
} from './todayRowKind'
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
  { id: 'ev-1', name: 'Knowledge Mine', type: ActivityType.Evaluation },
]

function renderRow(
  item: ChecklistItem,
  opts: {
    onStrandSessionOpen?: ReturnType<typeof vi.fn>
    configsLoading?: boolean
    configsFailed?: boolean
    /** A failed read really does leave the list empty — say so faithfully. */
    configs?: TodayRowConfigLike[]
  } = {},
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
        configs={opts.configs ?? configs}
        configsLoading={opts.configsLoading ?? false}
        configsFailed={opts.configsFailed ?? false}
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

// ── Codex round 1 ────────────────────────────────────────────────────────────

describe('TodayChecklist — an unread curriculum list claims nothing (P2)', () => {
  it('does not say "No curriculum row" while the configs read is in flight', () => {
    renderRow(item({ label: 'Handwriting (15m)' }), { configsLoading: true })
    expect(screen.queryByText('No curriculum row')).toBeNull()
    expect(screen.getByText(TODAY_ROW_KIND_WORD[TodayRowKind.Unresolved])).toBeTruthy()
  })

  it('a FAILED configs read says so and still offers the photo', () => {
    renderRow(item({ label: 'Handwriting (15m)' }), { configsFailed: true })
    expect(screen.getByText(CONFIG_READ_FAILED_TELL)).toBeTruthy()
    expect(screen.getByText(CONFIG_READ_FAILED_NOTE)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^add a photo$/i })).not.toBeNull()
  })

  it('a stamped workbook still reads as one, and still offers Add page', () => {
    // A failed read leaves the list empty, so there is no document to take a
    // position from — but the stamp is on the ROW, and the capture path uses it.
    renderRow(
      item({ label: 'GATB Math (30m)', workbookConfigId: 'wb-1' }),
      { configsFailed: true, configs: [] },
    )
    expect(screen.getByText('Workbook')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^add page$/i })).not.toBeNull()
    expect(screen.queryByText(CONFIG_READ_FAILED_TELL)).toBeNull()
  })
})

describe('TodayChecklist — a saved photo is visible before the box is ticked (P2)', () => {
  it('an INCOMPLETE row carrying evidence shows the Captured chip', () => {
    // The pre-completion capture sets `evidenceArtifactId` without ticking the
    // box, so gating the chip on `completed` left the row silent about a photo
    // that had just saved — and the door, reading the same field, was gone.
    renderRow(item({ completed: false, evidenceArtifactId: 'a1', evidenceCollection: 'artifacts' }))
    expect(screen.getByText(/captured/i)).toBeTruthy()
  })

  it('and a completed one still does', () => {
    renderRow(item({ completed: true, evidenceArtifactId: 'a1', evidenceCollection: 'artifacts' }))
    expect(screen.getByText(/captured/i)).toBeTruthy()
  })
})

describe('TodayChecklist — the evaluation row has a door again (UX-405)', () => {
  it('a row resolved as an evaluation from its CONFIG offers Start Mining', () => {
    // The finding: `DOOR_FOR_KIND` gave this row the Start Mining door, which
    // suppressed the photo door, while the button required `itemType` and `link`
    // — neither of which survives the routine-text round trip (`UX-402`). So the
    // row read *Quest* and had nothing to tap at all.
    renderRow(item({ label: 'Knowledge Mine (15m)', activityConfigId: 'ev-1' }))
    expect(screen.getByText(TODAY_ROW_KIND_WORD[TodayRowKind.Evaluation])).toBeTruthy()
    expect(screen.getByRole('button', { name: /start mining/i })).toBeTruthy()
  })

  it('a planner-written evaluation row still uses its own link', () => {
    renderRow(item({ label: 'Fluency Practice (10m)', itemType: 'evaluation', link: '/quest' }))
    expect(screen.getByRole('button', { name: /start mining/i })).toBeTruthy()
  })

  it('a completed evaluation row offers no quest — the finished-row rule is unchanged', () => {
    renderRow(item({ label: 'Knowledge Mine (15m)', activityConfigId: 'ev-1', completed: true }))
    expect(screen.queryByRole('button', { name: /start mining/i })).toBeNull()
  })
})

describe('TodayChecklist — an unbound workbook assertion promises nothing (round 4)', () => {
  it('offers Add a photo, not Add page, when nothing answers to the row', () => {
    renderRow(item({ label: 'Nothing answers to this (20m)', itemType: 'workbook' }))
    expect(screen.queryByRole('button', { name: /^add page$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /add a photo/i })).not.toBeNull()
  })

  it('and offers no curriculum door either — there is nothing to advance', () => {
    renderRow(item({
      label: 'Nothing answers to this (20m)',
      itemType: 'workbook',
      skipGuidance: 'Check lesson 12 before you start',
    }))
    expect(screen.queryByRole('button', { name: /scan lesson to check/i })).toBeNull()
  })

  it('POSITIVE CONTROL — the same assertion over a real config still says Add page', () => {
    renderRow(item({ label: 'GATB Math (30m)', itemType: 'workbook', subjectBucket: SubjectBucket.Math }))
    expect(screen.queryByRole('button', { name: /^add page$/i })).not.toBeNull()
  })
})

describe('TodayChecklist — the curriculum doors belong to a workbook row (UX-403)', () => {
  const guided = (over: Partial<ChecklistItem> = {}) =>
    item({ skipGuidance: 'Check lesson 12 before you start', ...over })

  it('the scan-to-skip door renders on a workbook row', () => {
    renderRow(guided({ label: 'GATB Math (30m)', subjectBucket: SubjectBucket.Math }))
    expect(screen.getByRole('button', { name: /scan lesson to check/i })).toBeTruthy()
  })

  it('and NOT on a routine row, whose photo may not write the curriculum', () => {
    // The gate used to be the guidance sentence alone — a string an AI wrote,
    // which is no evidence that the row is a workbook. Behind it sits an
    // untargeted `syncScanToConfig` plus `childSkillMaps`, unconfirmed.
    renderRow(guided())
    expect(screen.queryByRole('button', { name: /scan lesson to check/i })).toBeNull()
  })

  it('nor on a row the app cannot place', () => {
    renderRow(guided({ label: 'Trip to the museum (90m)' }))
    expect(screen.queryByRole('button', { name: /scan lesson to check/i })).toBeNull()
  })
})
