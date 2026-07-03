import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConceptArc } from '../../core/types'

// ── Mocks ──

const useConceptArcsMock = vi.fn()

vi.mock('./useConceptArcs', () => ({
  useConceptArcs: () => useConceptArcsMock(),
}))

import ConceptArcsSection from './ConceptArcsSection'

const NOW = '2026-07-03T00:00:00.000Z'

const ARC: ConceptArc = {
  id: 'arc-1',
  title: 'The Electricity Arc',
  domainLabel: 'Electricity',
  childIds: ['lincoln', 'london'],
  steps: [
    { title: 'Static', conceptBeat: 'Charges attract', status: 'done' },
    { title: 'Circuit', conceptBeat: 'A loop lets current flow', status: 'active' },
    { title: 'Switch', conceptBeat: 'A break stops the flow', status: 'upcoming' },
  ],
  createdFrom: 'owner-authored',
  createdAt: NOW,
  updatedAt: NOW,
}

function mockHook(arcs: ConceptArc[]) {
  useConceptArcsMock.mockReturnValue({
    arcs,
    loading: false,
    createArc: vi.fn(),
    updateArc: vi.fn(),
    archiveArc: vi.fn(),
    completeStep: vi.fn(),
    activateStep: vi.fn(),
  })
}

describe('ConceptArcsSection', () => {
  beforeEach(() => {
    useConceptArcsMock.mockReset()
  })

  it('shows the empty state with the seed placeholder when there are no arcs', () => {
    mockHook([])
    render(<ConceptArcsSection />)

    expect(screen.getByText('No concept arcs yet')).toBeInTheDocument()
    expect(screen.getByText(/static → circuit → switch → motor/)).toBeInTheDocument()
    // "New Arc" authoring affordance is always present
    expect(screen.getByRole('button', { name: /new arc/i })).toBeInTheDocument()
  })

  it('renders an arc with its title, domain label, and collected step row', () => {
    mockHook([ARC])
    render(<ConceptArcsSection />)

    expect(screen.getByText('The Electricity Arc')).toBeInTheDocument()
    expect(screen.getByText('Electricity')).toBeInTheDocument()
    // each step beat appears as a chip in the collected row
    expect(screen.getByText('Static')).toBeInTheDocument()
    expect(screen.getByText('Circuit')).toBeInTheDocument()
    expect(screen.getByText('Switch')).toBeInTheDocument()
    // no empty state
    expect(screen.queryByText('No concept arcs yet')).not.toBeInTheDocument()
  })
})
