import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import KidChecklist from './KidChecklist'
import type { ChecklistItem, Child, DayLog } from '../../core/types'

function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return { label: 'Phonics', completed: false, category: 'must-do', ...overrides }
}

function renderKidChecklist(mustDo: ChecklistItem[]) {
  const dayLog = { id: '2026-06-03', date: '2026-06-03', checklist: mustDo } as unknown as DayLog
  const child = { id: 'c1', name: 'Lincoln' } as unknown as Child
  render(
    <MemoryRouter>
      <KidChecklist
        mustDo={mustDo}
        choose={[]}
        checklist={mustDo}
        maxChoices={2}
        isLincoln
        isMvd={false}
        gateUnlocked={false}
        gateThreshold={3}
        mustDoCompleted={mustDo.filter((i) => i.completed).length}
        mustDoSkipped={mustDo.filter((i) => i.skipped).length}
        mustDoDone={false}
        mustDoRemaining={mustDo.filter((i) => !i.completed && !i.skipped).length}
        dailyXp={0}
        selectedChoices={new Set()}
        onToggleChoice={vi.fn()}
        dayLog={dayLog}
        child={child}
        familyId="f1"
        today="2026-06-03"
        persistDayLogImmediate={vi.fn()}
        onCaptureOpen={vi.fn()}
        onXpToast={vi.fn()}
      />
    </MemoryRouter>,
  )
}

describe('KidChecklist — skip is parent-only (FUNC-08)', () => {
  it('exposes NO kid-facing skip control on quest items', () => {
    renderKidChecklist([
      makeItem({ label: 'Prayer' }),
      makeItem({ label: 'Math' }),
      makeItem({ label: 'Handwriting' }),
    ])
    // There must be no "Skip" button in the kid quest view.
    expect(screen.queryByRole('button', { name: /^skip$/i })).toBeNull()
    expect(screen.queryByText(/^skip$/i)).toBeNull()
  })

  it('renders a parent-skipped item as skipped (struck-through), not as an actionable quest', () => {
    renderKidChecklist([
      makeItem({ label: 'Prayer', completed: true }),
      makeItem({ label: 'Phonics', skipped: true }),
      makeItem({ label: 'Math' }),
    ])
    // Parent-skipped item shows "— skipped" and is not an interactive checkbox row.
    expect(screen.getByText(/Phonics — skipped/i)).toBeTruthy()
    // Still no kid skip control anywhere.
    expect(screen.queryByRole('button', { name: /^skip$/i })).toBeNull()
  })
})
