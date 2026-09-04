import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Child, DayLog } from '../../core/types'

// FEAT-183 / ARCH-43 (B13) — parent Today's teach-back renders for a child who
// has a younger sibling to teach, the same relationship key the kid side
// already uses (`KidTodayView` → `findYoungerSibling`).
//
// Before: `if (!isLincolnChild ...) return null` — the whole section was
// hidden unless the selected child was literally named Lincoln, so a renamed
// or third older child never saw it, and the copy hardcoded "London".

vi.mock('firebase/firestore', () => ({ addDoc: vi.fn(async () => ({ id: 'a1' })) }))
vi.mock('../../core/firebase/firestore', () => ({ artifactsCollection: () => ({}) }))

import TeachBackSection from './TeachBackSection'

const LINCOLN = { id: 'c-lincoln', name: 'Lincoln', birthdate: '2015-09-30' } as Child
const LONDON = { id: 'c-london', name: 'London', birthdate: '2020-02-20' } as Child
const ROWAN = { id: 'c-rowan', name: 'Rowan', birthdate: '2015-04-04' } as Child
const MAEVE = { id: 'c-maeve', name: 'Maeve', birthdate: '2020-04-04' } as Child

/**
 * Two families, kept separate so "the closest younger sibling" is unambiguous
 * — the point here is which key selects the child, not how ties break.
 */
const BARNES = [LINCOLN, LONDON]
const OTHER = [ROWAN, MAEVE]

/** Enough completed work that the section's own readiness rule is satisfied. */
const DAY_LOG = {
  id: '2026-09-03',
  date: '2026-09-03',
  checklist: [
    { label: 'Phonics', completed: true, category: 'must-do' },
    { label: 'Math', completed: true, category: 'must-do' },
    { label: 'Reading', completed: true, category: 'must-do' },
  ],
} as unknown as DayLog

function renderFor(child: Child, family: Child[]) {
  render(
    <TeachBackSection
      dayLog={DAY_LOG}
      selectedChild={child}
      children={family}
      familyId="f1"
      selectedChildId={child.id}
      today="2026-09-03"
      persistDayLogImmediate={vi.fn()}
      onSnackMessage={vi.fn()}
    />,
  )
}

describe('TeachBackSection — the gate is the sibling relationship (B13)', () => {
  it('renders for a third, differently-named older child, naming his own sibling', () => {
    renderFor(ROWAN, OTHER)
    expect(screen.getByText('Teach Maeve')).toBeInTheDocument()
    expect(screen.getByText('Tell Maeve one thing you learned today!')).toBeInTheDocument()
  })

  it('stays hidden for the youngest child, who has no one to teach', () => {
    renderFor(MAEVE, OTHER)
    expect(screen.queryByText(/^Teach /)).toBeNull()
  })

  it('still renders for Lincoln, still naming London', () => {
    renderFor(LINCOLN, BARNES)
    expect(screen.getByText('Teach London')).toBeInTheDocument()
    expect(screen.getByText('Tell London one thing you learned today!')).toBeInTheDocument()
  })

  it('still stays hidden for London', () => {
    renderFor(LONDON, BARNES)
    expect(screen.queryByText(/^Teach /)).toBeNull()
  })
})
