/**
 * UX-183 — the Generate button must name the week the selector holds.
 *
 * `planningWeekSelection.test.ts` proves the LABEL is right. This proves the
 * BUTTON says it — which is the half that was broken: FEAT-196 added the This
 * week / Next week selector and left this button's string hardcoded, so the
 * label and the selector were two paths to one answer and one of them was always
 * behind. A pure test of the label alone would have passed on the broken build.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PlannerSetupWizard from './PlannerSetupWizard'
import { SubjectBucket } from '../../core/types/enums'
import { planningWeekRangeFor, resolvePlanningWeek } from './planningWeekSelection'

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'new-book' }),
}))
vi.mock('../../core/firebase/firestore', () => ({
  chapterBooksCollection: vi.fn(),
}))

/** Wednesday of the anchor week the pure suite uses: Mon Jul 13 – Fri Jul 17. */
const WED = new Date(2026, 6, 15)

function renderWizard(over: Partial<React.ComponentProps<typeof PlannerSetupWizard>> = {}) {
  return render(
    <PlannerSetupWizard
      childName="Lincoln"
      weekStart={planningWeekRangeFor('this', WED).start}
      weekEnergy="full"
      onWeekEnergyChange={vi.fn()}
      hoursPerDay={4}
      chapterBooks={[]}
      selectedBook={null}
      onSelectedBookChange={vi.fn()}
      bookProgress={null}
      weekNotes=""
      onWeekNotesChange={vi.fn()}
      masterySummary={null}
      formatSkillLabel={(t) => t}
      photoLabels={[]}
      onLabelsChange={vi.fn()}
      onPhotoCapture={vi.fn()}
      uploading={false}
      workbookConfigs={[]}
      onScanCapture={vi.fn()}
      scanLoading={false}
      scanResult={null}
      scanError={null}
      onScanClear={vi.fn()}
      onScanAccept={vi.fn()}
      onSubmitPhotos={vi.fn()}
      onSetupComplete={vi.fn()}
      generatingWeek={false}
      {...over}
    />,
  )
}

describe('PlannerSetupWizard — the Generate button names the resolved week', () => {
  it('names next week, with real dates, when next week is what is selected', () => {
    renderWizard({ weekStart: planningWeekRangeFor('next', WED).start })
    expect(screen.getByRole('button', { name: /Generate Plan for Jul 20–24/ })).toBeInTheDocument()
    // The string it used to say, no matter which week the parent picked.
    expect(screen.queryByRole('button', { name: /This Week’s Plan/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /This Week's Plan/ })).toBeNull()
  })

  it('names this week, with real dates, when this week is what is selected', () => {
    renderWizard({ weekStart: planningWeekRangeFor('this', WED).start })
    expect(screen.getByRole('button', { name: /Generate Plan for Jul 13–17/ })).toBeInTheDocument()
  })

  it('names the week on the photo variant, which named neither week before', () => {
    renderWizard({
      weekStart: planningWeekRangeFor('next', WED).start,
      photoLabels: [
        {
          artifactId: 'art-1',
          subjectBucket: SubjectBucket.Math,
          lessonOrPages: 'Lesson 12',
          estimatedMinutes: 20,
        },
      ],
    })
    expect(
      screen.getByRole('button', { name: /Generate Plan for Jul 20–24 \(1 photo\)/ }),
    ).toBeInTheDocument()
  })

  it('reproduces the owner’s screenshot with the contradiction gone', () => {
    // Sat Sep 5 2026: the selector greys "This week — Aug 31–Sep 4" out as
    // already passed and resolves to next week. The button said "Generate This
    // Week's Plan" underneath it.
    const resolved = resolvePlanningWeek(null, new Date(2026, 8, 5))
    renderWizard({ weekStart: resolved.range.start })
    expect(screen.getByRole('button', { name: /Generate Plan for Sep 7–11/ })).toBeInTheDocument()
  })

  it('still shows the in-flight wording while a week is generating', () => {
    renderWizard({ generatingWeek: true })
    expect(screen.getByRole('button', { name: /Generating your week/ })).toBeInTheDocument()
  })
})
