import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PlannerSetupWizard from './PlannerSetupWizard'
import type { ActivityConfig } from '../../core/types'

/**
 * ── The first-screen property (FEAT-208 / UX-247 · UX-255 · UX-258 · UX-260) ──
 *
 * FEAT-205 walked this page as a parent at 390px and counted 150–190 words and
 * ~2.5 screens of scroll before the one control she came for. The property this
 * batch is built to hold:
 *
 *   **On a 390×844 phone, the planning-week selector and the setup card's first
 *   control are both within the first viewport height.**
 *
 * jsdom cannot measure layout, so it cannot assert that sentence. What it CAN
 * assert is everything the pixels follow from — where things sit in the DOM, that
 * the banner moved, that the wall is gone — and that is what is below.
 *
 * The pixel claim itself was checked by hand, in headless Chromium at 390×844 and
 * 320×844, rendering this component stack (`PlannerSetupWizard`,
 * `PlanningWeekSelector`, `PlanSummaryPanel`, the focus banner) inside the app's
 * own MUI theme, `Page`'s `Container`/`Stack` and `AppShell`'s sticky mobile
 * header, with 24 activity configs and a full mastery summary:
 *
 *   390×844   week selector top   445 → 273 px
 *             energy toggle top   790 → 618 px   (the setup card's first control)
 *             Generate bottom    1548 → 1214 px
 *   320×844   energy toggle top   852 → 660 px   (was off-screen entirely)
 *
 * and no horizontal scroll at either width, before or after.
 */

function config(name: string, completed = false): ActivityConfig {
  return {
    id: name,
    childId: 'lincoln',
    name,
    type: 'workbook',
    subjectBucket: 'Other',
    frequency: 'daily',
    defaultMinutes: 15,
    completed,
  } as unknown as ActivityConfig
}

const NAMES = [
  'Prayer and Scripture',
  'The Good and the Beautiful Math',
  'Explode the Code',
  'Sight word games',
  'Read aloud',
  'Handwriting',
  'Copywork',
  'Nature study',
  'Piano practice',
]
const CONFIGS = [...NAMES.map((n) => config(n)), config('Finished program', true)]

function renderWizard(activityConfigs: ActivityConfig[] | undefined = CONFIGS) {
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
      activityConfigs={activityConfigs}
      onViewActivities={() => {}}
      onSubmitPhotos={() => {}}
      onSetupComplete={() => {}}
      generatingWeek={false}
    />,
  )
}

describe('the activities wall is gone from the setup card (UX-258)', () => {
  it('names no activity', () => {
    renderWizard()
    for (const name of NAMES) {
      expect(screen.queryByText(new RegExp(name, 'i'))).toBeNull()
    }
  })

  it('counts them and offers the way out instead', () => {
    renderWizard()
    expect(screen.getByText('9 activities · 1 completed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View / edit' })).toBeInTheDocument()
  })

  it('renders nothing at all when there are no configs', () => {
    renderWizard([])
    expect(screen.queryByRole('button', { name: 'View / edit' })).toBeNull()
    expect(screen.queryByText(/activit/i)).toBeNull()
  })

  it('still leads with the energy question — the card is unchanged above it', () => {
    // The setup card's FIRST control is what the property is about, so it must
    // not have acquired anything ahead of it.
    const { container } = renderWizard()
    const controls = container.querySelectorAll('.MuiToggleButtonGroup-root, input, select')
    expect(controls[0]).toHaveClass('MuiToggleButtonGroup-root')
  })
})

// ── DOM order in the page (UX-247 / UX-255) ──────────────────────────────────
//
// `PlannerChatPage` mounts Firestore subscriptions, auth and the profile context
// in its body and has no test harness (`PlanDayCards.test.tsx` says so where it
// asserts the other half of the FEAT-133 gate). Its render order is still a real
// property of the source, so it is read as source — the same shape as UX-213's
// scan that no kid-facing directory imports `WeekPaceSection`.

const PAGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PlannerChatPage.tsx'),
  'utf8',
)

/** Where a JSX tag first appears in the page source. Fails loudly if absent. */
function at(tag: string): number {
  const i = PAGE.indexOf(`<${tag}`)
  expect(i, `${tag} is not rendered by PlannerChatPage`).toBeGreaterThan(-1)
  return i
}

describe('the page renders the controls before the commentary (UX-247)', () => {
  it('puts the week selector and both setup cards above the foundations banner', () => {
    expect(at('PlanningWeekSelector')).toBeLessThan(at('FoundationsFocusLine'))
    expect(at('PlannerSetupWizard')).toBeLessThan(at('FoundationsFocusLine'))
    expect(at('PlannerCompactSetup')).toBeLessThan(at('FoundationsFocusLine'))
  })

  it('keeps the banner above the day cards, where it reads as context for a plan', () => {
    expect(at('FoundationsFocusLine')).toBeLessThan(at('PlanDayCards'))
  })

  it('still renders it — this was a move, not a removal', () => {
    expect(PAGE).toContain('<FoundationsFocusLine childId={activeChildId} />')
  })
})

describe('the advanced escape hatch is last (UX-255)', () => {
  it('renders the quick-adjust chips and Print above the free-form chat drawer', () => {
    expect(at('QuickSuggestionButtons')).toBeLessThan(at('PlannerChatDrawer'))
    expect(PAGE.indexOf('Print Week Materials')).toBeLessThan(at('PlannerChatDrawer'))
  })

  it('puts the day cards above both of them', () => {
    expect(at('PlanDayCards')).toBeLessThan(at('QuickSuggestionButtons'))
  })

  it('leaves the drawer after the applied phase too, not only review', () => {
    // "Last on every phase" is the rule; below Redo Plan is what that means on
    // the applied week.
    expect(PAGE.indexOf('Redo Plan?')).toBeLessThan(at('PlannerChatDrawer'))
  })
})
