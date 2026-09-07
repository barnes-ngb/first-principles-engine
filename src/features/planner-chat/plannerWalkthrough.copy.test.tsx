import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PlannerCompactSetup from './PlannerCompactSetup'
import PlannerSetupWizard from './PlannerSetupWizard'
import WeekFocusPanel from './WeekFocusPanel'
import ContextDrawer from './ContextDrawer'
import { PLANNER_REQUEST_LABEL, PLANNER_REQUEST_PLACEHOLDER } from './plannerRequest'
import { WEEK_ENERGY_QUESTION, weekEnergyLabel } from './weekEnergyLabels'
import { plannerPhaseLine } from './plannerPhaseLine'
import {
  LOCAL_PLANNER_FALLBACK_NOTICE,
  draftTurnText,
} from './plannerDraftNotice'
import { weekFocusPanelHasContent } from './weekFocusContent'
import type { WeekPlan } from '../../core/types'

/**
 * The Plan-My-Week walkthrough's copy fixes (UX-233 … UX-246), pinned.
 *
 * Every assertion here is about what a parent READS. None of them touches a
 * write, a week resolution, or the budget math — that separation is the whole
 * shape of the run these came from, so a change that has to edit this file
 * alongside a write is a change that has left the lane.
 */

// ── UX-235: one field, one name ──────────────────────────────────────────────

function renderWizard() {
  return render(
    <PlannerSetupWizard
      childName="Lincoln"
      weekStart="2026-09-06"
      weekEnergy="full"
      onWeekEnergyChange={() => {}}
      chapterBooks={[]}
      selectedBook={null}
      onSelectedBookChange={() => {}}
      bookProgress={null}
      weekNotes=""
      onWeekNotesChange={() => {}}
      masterySummary={null}
      formatSkillLabel={(t) => t}
      photoLabels={[]}
      onLabelsChange={() => {}}
      onPhotoCapture={async () => null}
      uploading={false}
      workbookConfigs={[]}
      onScanCapture={async () => {}}
      scanLoading={false}
      scanResult={null}
      scanError={null}
      onScanClear={() => {}}
      onScanAccept={() => {}}
      onSubmitPhotos={() => {}}
      onSetupComplete={() => {}}
      generatingWeek={false}
    />,
  )
}

function renderCompact() {
  return render(
    <PlannerCompactSetup
      childName="Lincoln"
      weekRangeLabel="Planning Week of Sep 7–11"
      weekStart="2026-09-06"
      weekEnergy="full"
      onWeekEnergyChange={() => {}}
      chapterBooks={[]}
      selectedBook={null}
      onSelectedBookChange={() => {}}
      bookProgress={null}
      workbookConfigs={[]}
      excludedWorkbookIds={new Set()}
      onToggleWorkbook={() => {}}
      weekNotes=""
      onWeekNotesChange={() => {}}
      onGenerate={() => {}}
      onRepeatLastWeek={() => {}}
      generatingWeek={false}
      repeatingWeek={false}
      canRepeatLastWeek={false}
    />,
  )
}

describe('the two setup surfaces say the same words (UX-235 / UX-236)', () => {
  it('labels the request field identically on both', () => {
    const wizard = renderWizard()
    expect(wizard.getByLabelText(PLANNER_REQUEST_LABEL)).toBeInTheDocument()
    wizard.unmount()

    const compact = renderCompact()
    expect(compact.getByLabelText(PLANNER_REQUEST_LABEL)).toBeInTheDocument()
  })

  it('gives that field the same placeholder on both', () => {
    const wizard = renderWizard()
    expect(wizard.getByPlaceholderText(PLANNER_REQUEST_PLACEHOLDER)).toBeInTheDocument()
    wizard.unmount()

    const compact = renderCompact()
    expect(compact.getByPlaceholderText(PLANNER_REQUEST_PLACEHOLDER)).toBeInTheDocument()
  })

  it('asks the energy question the same way on both', () => {
    const wizard = renderWizard()
    expect(wizard.getByText(WEEK_ENERGY_QUESTION)).toBeInTheDocument()
    wizard.unmount()

    const compact = renderCompact()
    expect(compact.getByText(WEEK_ENERGY_QUESTION)).toBeInTheDocument()
  })
})

// ── UX-238: three peer options, none of them quoting a derived number ────────

describe('the week-energy options are three words (UX-238)', () => {
  it('no option carries an hours figure', () => {
    for (const value of ['full', 'lighter', 'mvd'] as const) {
      expect(weekEnergyLabel(value)).not.toMatch(/h\/day|\d/)
    }
  })

  it('still names all three, with Minimum Viable Day spelled out', () => {
    expect(weekEnergyLabel('full')).toBe('Normal')
    expect(weekEnergyLabel('lighter')).toBe('Lighter')
    expect(weekEnergyLabel('mvd')).toContain('Minimum Viable Day')
  })
})

// ── UX-243: the subtitle says which step this is ─────────────────────────────

describe('the page subtitle names the step (UX-243)', () => {
  it('gives each phase a distinct line', () => {
    const lines = (['setup', 'review', 'active'] as const).map(plannerPhaseLine)
    expect(new Set(lines).size).toBe(3)
  })

  it('numbers all three of them', () => {
    expect(plannerPhaseLine('setup')).toContain('Step 1 of 3')
    expect(plannerPhaseLine('review')).toContain('Step 2 of 3')
    expect(plannerPhaseLine('active')).toContain('Step 3 of 3')
  })
})

// ── UX-234: no heading over nothing ──────────────────────────────────────────

const BARE_WEEK: WeekPlan = {
  weekStart: '2026-09-06',
  theme: '',
  virtue: '',
  scriptureRef: '',
  heartQuestion: '',
  childGoals: [],
} as unknown as WeekPlan

describe('WeekFocusPanel renders nothing when it has nothing (UX-234)', () => {
  it('is empty for a week with no theme and no conundrum', () => {
    expect(weekFocusPanelHasContent(BARE_WEEK)).toBe(false)
    const { container } = render(
      <WeekFocusPanel weekPlan={BARE_WEEK} onUpdateField={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('This Week in Stonebridge')).not.toBeInTheDocument()
  })

  it('treats a whitespace-only theme as no theme', () => {
    expect(weekFocusPanelHasContent({ ...BARE_WEEK, theme: '   ' })).toBe(false)
  })

  it('still renders the heading once there IS a theme', () => {
    const themed = { ...BARE_WEEK, theme: 'Courage' }
    expect(weekFocusPanelHasContent(themed)).toBe(true)
    render(<WeekFocusPanel weekPlan={themed} onUpdateField={() => {}} />)
    expect(screen.getByText('This Week in Stonebridge')).toBeInTheDocument()
    expect(screen.getByText('Courage')).toBeInTheDocument()
  })
})

// ── UX-242: the context drawer names the week the way the page does ──────────

describe('the context drawer (UX-242)', () => {
  it('names the Mon–Fri week, never the raw Sunday key', () => {
    render(
      <ContextDrawer
        open
        onClose={() => {}}
        child={null}
        weekKey="2026-09-06"
        hoursPerDay={4.8}
        appBlocks={[]}
        snapshot={null}
      />,
    )
    expect(screen.getByText('Week of Sep 7–11')).toBeInTheDocument()
    expect(screen.queryByText('Week of 2026-09-06')).not.toBeInTheDocument()
  })

  it('is titled with what it actually holds', () => {
    render(
      <ContextDrawer
        open
        onClose={() => {}}
        child={null}
        weekKey="2026-09-06"
        hoursPerDay={4.8}
        appBlocks={[]}
        snapshot={null}
      />,
    )
    expect(screen.getByText('What Shelly is planning with')).toBeInTheDocument()
  })
})

// ── UX-233: a plan the AI didn't write says so ───────────────────────────────

describe('the draft turn names its author (UX-233)', () => {
  it('says nothing extra when the model wrote it', () => {
    const text = draftTurnText({ usedAI: true, fellBackToLocal: false })
    expect(text).toBe("Here's your draft plan (AI-powered).")
  })

  it('carries FEAT-198\'s "Shaped by" line only when something was sent', () => {
    expect(
      draftTurnText({ usedAI: true, fellBackToLocal: false, shapedByLine: 'Shaped by: less math' }),
    ).toContain('Shaped by: less math')
    // Nothing reached a model, so nothing shaped one.
    expect(
      draftTurnText({ usedAI: false, fellBackToLocal: true, shapedByLine: 'Shaped by: less math' }),
    ).not.toContain('Shaped by')
  })

  it('says the built-in planner wrote it when the AI did not answer', () => {
    const text = draftTurnText({ usedAI: false, fellBackToLocal: true })
    expect(text).toContain(LOCAL_PLANNER_FALLBACK_NOTICE)
    expect(text).not.toContain('AI-powered')
  })

  it('stays quiet when the AI path was never taken (flag off)', () => {
    const text = draftTurnText({ usedAI: false, fellBackToLocal: false })
    expect(text).toBe("Here's your draft plan.")
  })

  it('warns that a typed request did not reach anything', () => {
    // The point of the notice: FEAT-198 forwards the parent's own words to the
    // model, and the local planner cannot read them.
    expect(LOCAL_PLANNER_FALLBACK_NOTICE).toContain('typed in the setup card')
  })
})
