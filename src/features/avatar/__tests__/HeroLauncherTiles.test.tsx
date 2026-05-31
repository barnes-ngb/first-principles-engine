import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import HeroLauncherTiles from '../HeroLauncherTiles'
import { canAccessKnowledgeMine } from '../../quest/knowledgeMineAccess'
import type { SkillSnapshot } from '../../../core/types'
import { SkillLevel } from '../../../core/types/enums'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

function renderTiles(props: { isLincoln?: boolean; hideMine?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <HeroLauncherTiles
        isLincoln={props.isLincoln ?? true}
        hideMine={props.hideMine ?? false}
      />
    </MemoryRouter>,
  )
}

describe('HeroLauncherTiles', () => {
  it('shows all three tiles for Lincoln (Mine, Workshop, Books)', () => {
    renderTiles({ isLincoln: true, hideMine: false })

    expect(screen.getByTestId('hero-launcher-mine')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-workshop')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-books')).toBeInTheDocument()

    expect(screen.getByText('Knowledge Mine')).toBeInTheDocument()
    expect(screen.getByText('Workshop')).toBeInTheDocument()
    expect(screen.getByText('My Books')).toBeInTheDocument()
  })

  it('shows all three tiles for London (parity with Lincoln)', () => {
    renderTiles({ isLincoln: false, hideMine: false })

    expect(screen.getByTestId('hero-launcher-mine')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-workshop')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-books')).toBeInTheDocument()
  })

  it('can still hide Knowledge Mine via hideMine prop', () => {
    renderTiles({ isLincoln: false, hideMine: true })

    expect(screen.queryByTestId('hero-launcher-mine')).toBeNull()
    expect(screen.getByTestId('hero-launcher-workshop')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-books')).toBeInTheDocument()
  })

  it('routes to /quest when Knowledge Mine tile is tapped', () => {
    navigateMock.mockClear()
    renderTiles({ isLincoln: true })

    fireEvent.click(screen.getByTestId('hero-launcher-mine'))
    expect(navigateMock).toHaveBeenCalledWith('/quest')
  })

  it('routes to /workshop when Workshop tile is tapped', () => {
    navigateMock.mockClear()
    renderTiles({ isLincoln: true })

    fireEvent.click(screen.getByTestId('hero-launcher-workshop'))
    expect(navigateMock).toHaveBeenCalledWith('/workshop')
  })

  it('routes to /books when My Books tile is tapped', () => {
    navigateMock.mockClear()
    renderTiles({ isLincoln: true })

    fireEvent.click(screen.getByTestId('hero-launcher-books'))
    expect(navigateMock).toHaveBeenCalledWith('/books')
  })
})

// Capability gate: the tile is driven by canAccessKnowledgeMine(snapshot),
// exactly as MyAvatarPage wires it. No name / isLincoln in the decision.
describe('HeroLauncherTiles — Knowledge Mine capability gate', () => {
  const evaluated: SkillSnapshot = {
    childId: 'c1',
    prioritySkills: [
      { tag: 'reading.cvcBlend', label: 'CVC blending', level: SkillLevel.Emerging },
    ],
    supports: [],
    stopRules: [],
    evidenceDefinitions: [],
  }

  it('shows the Mine tile for an evaluated child (reading snapshot present)', () => {
    renderTiles({ isLincoln: true, hideMine: !canAccessKnowledgeMine(evaluated) })
    expect(screen.getByTestId('hero-launcher-mine')).toBeInTheDocument()
  })

  it('hides the Mine tile for an unevaluated child (no snapshot) — gracefully absent', () => {
    renderTiles({ isLincoln: false, hideMine: !canAccessKnowledgeMine(null) })
    expect(screen.queryByTestId('hero-launcher-mine')).toBeNull()
    // Other tiles remain — held state is absence, not a lockout.
    expect(screen.getByTestId('hero-launcher-workshop')).toBeInTheDocument()
    expect(screen.getByTestId('hero-launcher-books')).toBeInTheDocument()
  })
})
