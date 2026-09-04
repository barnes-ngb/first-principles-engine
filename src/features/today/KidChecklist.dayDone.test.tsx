import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { ChecklistItem, Child, DayLog } from '../../core/types'

vi.mock('../../core/xp/addXpEvent', () => ({ addXpEvent: () => Promise.resolve(0) }))

import KidChecklist from './KidChecklist'
import { computeQuestProgress } from './kidQuestGate'

function quest(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return { label: 'Quest', completed: false, category: 'must-do', ...overrides }
}

/**
 * Render the kid checklist the way `KidTodayView` does — props derived from the
 * real `computeQuestProgress` — so the UX-72 gate math and the UX-75 footer are
 * exercised together.
 */
function renderKid(
  checklist: ChecklistItem[],
  opts: { isLincoln?: boolean; ritualsRemaining?: number } = {},
) {
  const p = computeQuestProgress(checklist)
  const dayLog = { id: '2026-08-17', date: '2026-08-17', checklist } as unknown as DayLog
  const child = {
    id: 'c1',
    name: (opts.isLincoln ?? true) ? 'Lincoln' : 'London',
  } as unknown as Child
  render(
    <MemoryRouter>
      <KidChecklist
        mustDo={p.mustDo}
        choose={p.choose}
        watch={p.watch}
        checklist={checklist}
        maxChoices={2}
        isLincoln={opts.isLincoln ?? true}
        isChildProfile
        isMvd={false}
        gateUnlocked={p.gateUnlocked}
        gateThreshold={p.gateThreshold}
        mustDoCompleted={p.mustDoCompleted}
        mustDoDone={p.mustDoDone}
        mustDoRemaining={p.mustDoRemaining}
        ritualsRemaining={opts.ritualsRemaining ?? 0}
        dailyXp={0}
        selectedChoices={new Set()}
        onToggleChoice={vi.fn()}
        dayLog={dayLog}
        child={child}
        familyId="f1"
        today="2026-08-17"
        persistDayLogImmediate={vi.fn()}
        onCaptureOpen={vi.fn()}
        onXpToast={vi.fn()}
      />
    </MemoryRouter>,
  )
  return p
}

describe('KidChecklist — the footer is one count with one noun (UX-75)', () => {
  it('renders the single falling number and the "X of N done" line is gone', () => {
    // The audit scenario: 1 of 3 must-dos done + 3 rituals → the old footer
    // said "1 of 3 quests done" four lines above "5 quests to go!" (1+5>3).
    renderKid(
      [quest({ completed: true }), quest(), quest()],
      { ritualsRemaining: 3 },
    )
    expect(screen.getByText('5 quests to go!')).toBeTruthy()
    // No second count, so no denominator can disagree.
    expect(screen.queryByText(/of \d+ quests done/)).toBeNull()
    expect(screen.queryByText(/skipped$/)).toBeNull()
  })

  it('the non-Lincoln branch carries the noun too — no bare "1 to go!"', () => {
    renderKid([quest({ completed: true }), quest({ completed: true }), quest()], {
      isLincoln: false,
    })
    expect(screen.getByText('1 quest to go!')).toBeTruthy()
    expect(screen.queryByText('1 to go!')).toBeNull()
    expect(screen.queryByText(/of \d+ quests done/)).toBeNull()
  })
})

describe('KidChecklist — a skip cannot strand the day (UX-72)', () => {
  it('one skip + the rest completed unlocks Craft and fires the celebration copy', () => {
    renderKid([
      quest({ label: 'Prayer', completed: true }),
      quest({ label: 'Math', completed: true }),
      quest({ label: 'Phonics', skipped: true }),
      quest({ label: 'Lego build', category: 'choose' }),
      quest({ label: 'Draw a map', category: 'choose' }),
    ])
    // Craft is open — no lock copy over a day with zero completable quests left…
    expect(screen.queryByText(/unlock crafting/i)).toBeNull()
    // …and the kid who did the work is celebrated.
    expect(screen.getByText('Quests complete! Craft your adventure!')).toBeTruthy()
  })

  it('ALL must-dos skipped: Craft is open, but nothing is celebrated', () => {
    // Decided edge: a parent who cleared the whole day chose an empty day —
    // the Workshop is not a second punishment. Open, not celebrated.
    renderKid([
      quest({ label: 'Prayer', skipped: true }),
      quest({ label: 'Math', skipped: true }),
      quest({ label: 'Phonics', skipped: true }),
      quest({ label: 'Lego build', category: 'choose' }),
    ])
    expect(screen.queryByText(/unlock crafting/i)).toBeNull()
    // No "you did it!" over zero completions (UX-11's cousin).
    expect(screen.queryByText(/Quests complete/i)).toBeNull()
    // And nothing left to count — the footer stays quiet.
    expect(screen.queryByText(/quests? to go/i)).toBeNull()
  })
})

// ── FEAT-161 (UX-81): the count resolves instead of vanishing ───────────────

describe('KidChecklist — the last checkbox is answered, not ignored', () => {
  it('says "All done!" when the falling number reaches zero on real work', () => {
    renderKid([quest({ completed: true }), quest({ completed: true })])

    expect(screen.getByText('All done! 🎉')).toBeTruthy()
    expect(screen.queryByText(/quests? to go/i)).toBeNull()
  })

  it('stays quiet on a day where nothing was actually done', () => {
    // Same zero, different meaning — the UX-72 rule, held: a cleared day is a
    // parent's choice, not an achievement to celebrate.
    renderKid([quest({ skipped: true }), quest({ skipped: true })])

    expect(screen.queryByText(/All done/i)).toBeNull()
    expect(screen.queryByText(/quests? to go/i)).toBeNull()
  })
})
