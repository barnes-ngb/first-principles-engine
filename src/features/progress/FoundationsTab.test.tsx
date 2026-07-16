import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { LearnerModel } from '../../core/types/learnerModel'

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

const mockUseActiveChild = vi.fn()
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => mockUseActiveChild(),
}))

const mockUseLearnerModel = vi.fn()
vi.mock('../../core/hooks/useLearnerModel', () => ({
  useLearnerModel: () => mockUseLearnerModel(),
}))

// Stub the heavy, self-contained disposition section (makes AI calls) so the tab
// render test stays focused; we only assert it is embedded.
vi.mock('./DispositionProfile', () => ({
  default: () => <div>DISPOSITION_SECTION</div>,
}))

// ChildSelector pulls its own data deps — stub to a marker.
vi.mock('../../components/ChildSelector', () => ({
  default: () => <div>CHILD_SELECTOR</div>,
}))

import FoundationsTab from './FoundationsTab'

const CVC = 'reading.phonics.cvc'
const BLENDS = 'reading.phonics.blends'
const LONG = 'reading.phonics.longVowels'

function fullModel(): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'synthesized',
    conceptStates: {
      [CVC]: {
        state: 'solid',
        evidence: [
          {
            kind: 'workingLevel',
            sourceId: 's',
            note: 'Below phonics working level 4 (band 1 < frontier)',
            observedAt: '2026-06-01',
          },
        ],
      },
      [BLENDS]: { state: 'frontier', evidence: [] },
      [LONG]: { state: 'not-yet', evidence: [] },
    },
    modalityCalibration: {
      // Deliberately jargon-laden to prove the §14 scrub bites.
      reading: { level: 4, note: 'Reads around working level 4 — put short reading in activities at this level.' },
      writing: { level: 4, note: 'Spells around working level 4 — scribe by default; tiles and dictation count fully.' },
      math: { level: 3, note: 'Works math around level 3 — heard-aloud word problems count fully.' },
    },
    whatMattersNext: [],
    changeFeed: [
      { conceptId: CVC, from: 'frontier', to: 'solid', cause: 'quest', at: '2026-07-10' },
      { conceptId: BLENDS, from: 'not-yet', to: 'frontier', cause: 'review', at: '2026-07-12' },
    ],
    openQuestions: [
      {
        conceptId: LONG,
        question: 'Can they read silent-e words?',
        routedTo: 'quest',
        reason: 'frontier',
      },
    ],
    synthesis: {
      whatMattersNext: [
        {
          conceptId: LONG,
          kidName: 'Long vowel words',
          why: 'Blends are solid; long vowels are the next unlock in reading.',
          suggestedVehicle: 'quest',
        },
      ],
      narrative: 'Reading is coming together nicely this month.',
      openQuestionsSummary: ['Checking whether long-vowel words are clicking yet.'],
      generatedAt: '2026-07-12',
    },
    seededAt: '2026-07-01',
    updatedAt: '2026-07-12',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseActiveChild.mockReturnValue({
    activeChild: { id: 'c1', name: 'Lincoln' },
    activeChildId: 'c1',
    children: [{ id: 'c1', name: 'Lincoln' }],
    setActiveChildId: vi.fn(),
    isChildProfile: false,
    isLoading: false,
    addChild: vi.fn(),
  })
})

describe('FoundationsTab', () => {
  it('renders the focus, terrain, what-moved, and dispositions sections', () => {
    mockUseLearnerModel.mockReturnValue({ loading: false, model: fullModel() })
    render(<FoundationsTab />)

    // 1 — This week's foundation focus (whatMattersNext[0]).
    expect(screen.getByText("This week's foundation focus")).toBeInTheDocument()
    expect(screen.getAllByText(/Long vowel words/).length).toBeGreaterThan(0)
    // The `why` appears in both the focus card and the full what-matters-next list.
    expect(screen.getAllByText(/next unlock in reading/).length).toBeGreaterThan(0)

    // 2 — Terrain (state summary chips + at least one concept chip by kid-name).
    expect(screen.getByText('The terrain')).toBeInTheDocument()
    expect(screen.getByText(/Solid: 1/)).toBeInTheDocument()

    // 5 — What moved + loop-confirmation (→ solid).
    expect(screen.getByText('What moved')).toBeInTheDocument()
    expect(screen.getByText(/moved to solid ✓/)).toBeInTheDocument()

    // 7 — Dispositions embedded.
    expect(screen.getByText('DISPOSITION_SECTION')).toBeInTheDocument()
  })

  it('obeys §14 — no band number, no percentage, no working-level number leaks', () => {
    mockUseLearnerModel.mockReturnValue({ loading: false, model: fullModel() })
    render(<FoundationsTab />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\bband\s*\d/i)
    expect(text).not.toContain('%')
    expect(text).not.toMatch(/\bworking level\s*\d/i)
    expect(text).not.toMatch(/\blevel\s*\d/i)
    // The node id must never leak — only the plain kid-name.
    expect(text).not.toContain(CVC)
  })

  it('shows a warm empty state when the model is no-data', () => {
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: { ...fullModel(), status: 'no-data' },
    })
    render(<FoundationsTab />)
    expect(screen.getByText(/Getting to know how Lincoln learns/)).toBeInTheDocument()
  })
})
