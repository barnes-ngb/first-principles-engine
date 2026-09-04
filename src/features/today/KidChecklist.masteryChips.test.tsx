import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import KidChecklist from './KidChecklist'
import type { ChecklistItem, Child, DayLog } from '../../core/types'

// FEAT-183 / UX-152 (B2) — the self-report mastery chips are a capability
// question, not a name one.
//
// Before: `item.completed && !item.mastery && isLincoln`. London (and any
// third child) could never mark an item `stuck`, so the FEAT-68 daily-struggle
// signal could only ever come from a parent for him. The chips are three taps.

const DONE: ChecklistItem = {
  label: 'Phonics',
  completed: true,
  category: 'must-do',
}

function renderFor(opts: { child: Child; isLincoln: boolean; isChildProfile: boolean }) {
  const mustDo = [DONE]
  const dayLog = {
    id: '2026-09-03',
    date: '2026-09-03',
    checklist: mustDo,
  } as unknown as DayLog
  render(
    <MemoryRouter>
      <KidChecklist
        mustDo={mustDo}
        choose={[]}
        checklist={mustDo}
        maxChoices={2}
        isLincoln={opts.isLincoln}
        isChildProfile={opts.isChildProfile}
        isMvd={false}
        gateUnlocked={false}
        gateThreshold={3}
        mustDoCompleted={1}
        mustDoDone
        mustDoRemaining={0}
        dailyXp={0}
        selectedChoices={new Set()}
        onToggleChoice={vi.fn()}
        dayLog={dayLog}
        child={opts.child}
        familyId="f1"
        today="2026-09-03"
        persistDayLogImmediate={vi.fn()}
        onCaptureOpen={vi.fn()}
        onXpToast={vi.fn()}
      />
    </MemoryRouter>,
  )
}

/** The "I got stuck" chip — the one that seeds the FEAT-68 re-test queue. */
const HARD_CHIP = '🧱 Hard'

describe('KidChecklist — mastery chips render for any kid (B2)', () => {
  it('shows them to a third, differently-named child', () => {
    renderFor({
      child: { id: 'c-rowan', name: 'Rowan' } as Child,
      // A third child is not Lincoln, so the old key hid the chips from him.
      isLincoln: false,
      isChildProfile: true,
    })
    expect(screen.getByText(HARD_CHIP)).toBeInTheDocument()
  })

  it('shows them to London, who could never reach them before', () => {
    renderFor({
      child: { id: 'c-london', name: 'London' } as Child,
      isLincoln: false,
      isChildProfile: true,
    })
    expect(screen.getByText(HARD_CHIP)).toBeInTheDocument()
  })

  it('still shows them to Lincoln, unchanged', () => {
    renderFor({
      child: { id: 'c-lincoln', name: 'Lincoln' } as Child,
      isLincoln: true,
      isChildProfile: true,
    })
    expect(screen.getByText(HARD_CHIP)).toBeInTheDocument()
  })

  it('keeps them off the parent view — the chips are the kid’s own report', () => {
    renderFor({
      child: { id: 'c-lincoln', name: 'Lincoln' } as Child,
      isLincoln: true,
      isChildProfile: false,
    })
    expect(screen.queryByText(HARD_CHIP)).toBeNull()
  })
})
