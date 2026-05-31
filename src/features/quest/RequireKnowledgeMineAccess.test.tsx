import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { SkillSnapshot } from '../../core/types'
import { SkillLevel } from '../../core/types/enums'

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChildId: 'c1' }),
}))

const mockSnapshot = vi.fn<() => { snapshot: SkillSnapshot | null; loaded: boolean }>()
vi.mock('../../core/hooks/useChildSkillSnapshot', () => ({
  useChildSkillSnapshot: () => mockSnapshot(),
}))

import RequireKnowledgeMineAccess from './RequireKnowledgeMineAccess'

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/quest']}>
      <Routes>
        <Route
          path="/quest"
          element={
            <RequireKnowledgeMineAccess>
              <div>QUEST CONTENT</div>
            </RequireKnowledgeMineAccess>
          }
        />
        <Route path="/today" element={<div>KID HOME</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const evaluated: SkillSnapshot = {
  childId: 'c1',
  prioritySkills: [
    { tag: 'reading.cvcBlend', label: 'CVC blending', level: SkillLevel.Emerging },
  ],
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
}

describe('RequireKnowledgeMineAccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the quest for an evaluated child (reading snapshot present)', () => {
    mockSnapshot.mockReturnValue({ snapshot: evaluated, loaded: true })
    renderGuard()
    expect(screen.getByText('QUEST CONTENT')).toBeInTheDocument()
    expect(screen.queryByText('KID HOME')).toBeNull()
  })

  it('redirects an unevaluated child to the kid home (no snapshot)', () => {
    mockSnapshot.mockReturnValue({ snapshot: null, loaded: true })
    renderGuard()
    expect(screen.getByText('KID HOME')).toBeInTheDocument()
    expect(screen.queryByText('QUEST CONTENT')).toBeNull()
  })

  it('waits during load — neither content nor redirect before the snapshot resolves', () => {
    mockSnapshot.mockReturnValue({ snapshot: null, loaded: false })
    renderGuard()
    expect(screen.queryByText('QUEST CONTENT')).toBeNull()
    expect(screen.queryByText('KID HOME')).toBeNull()
  })
})
