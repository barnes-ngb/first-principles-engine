import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { QuestActivity, WorkingLevels } from '../../core/types/evaluation'

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

vi.mock('../../core/firebase/firestore', () => ({
  skillSnapshotsCollection: () => ({}),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
}))

import WorkingLevelsSection from './WorkingLevelsSection'

const NOW = new Date().toISOString()

const workingLevels: WorkingLevels = {
  phonics: { level: 4, updatedAt: NOW, source: 'quest', evidence: 'prior' },
}

function renderSection(questActivity?: QuestActivity) {
  return render(
    <WorkingLevelsSection childId="c1" workingLevels={workingLevels} questActivity={questActivity} />,
  )
}

describe('WorkingLevelsSection — "Last mined" activity line', () => {
  it('renders a no-shame "held" line with the session high-water mark', () => {
    renderSection({ phonics: { lastQuestAt: NOW, outcome: 'held', levelReached: 5 } })
    const line = screen.getByText(/Last mined:/i)
    expect(line.textContent).toMatch(/held at Level 4/i)
    expect(line.textContent).toMatch(/reached Level 5/i)
    // No-shame: never frames a hold as "no progress".
    expect(line.textContent).not.toMatch(/no progress/i)
  })

  it('renders a "climbed to" line when the quest raised the level', () => {
    renderSection({ phonics: { lastQuestAt: NOW, outcome: 'rose', levelReached: 5 } })
    expect(screen.getByText(/Last mined:.*climbed to Level 4/i)).toBeInTheDocument()
  })

  it('omits the "reached" clause when the high-water mark is not above the held level', () => {
    renderSection({ phonics: { lastQuestAt: NOW, outcome: 'held', levelReached: 4 } })
    const line = screen.getByText(/Last mined:/i)
    expect(line.textContent).toMatch(/held at Level 4/i)
    expect(line.textContent).not.toMatch(/reached Level/i)
  })

  it('shows no "Last mined" line when there is no marker for the domain', () => {
    renderSection(undefined)
    expect(screen.queryByText(/Last mined:/i)).toBeNull()
  })
})
