import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { LearnerModel } from '../../core/types/learnerModel'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../core/auth/useAuth', () => ({
  useFamilyId: () => 'fam-1',
}))

const mockUseLearnerModel = vi.fn()
vi.mock('../../core/hooks/useLearnerModel', () => ({
  useLearnerModel: () => mockUseLearnerModel(),
}))

import FoundationsFocusLine from './FoundationsFocusLine'

function model(overrides: Partial<LearnerModel>): LearnerModel {
  return {
    childId: 'c1',
    graphVersion: 'reading@1+math@1',
    status: 'synthesized',
    conceptStates: {},
    modalityCalibration: {
      reading: { note: '' },
      writing: { note: '' },
      math: { note: '' },
    },
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    seededAt: '2026-07-01',
    updatedAt: '2026-07-01',
    ...overrides,
  }
}

describe('FoundationsFocusLine', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the focus line from synthesis.whatMattersNext[0]', () => {
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: model({
        synthesis: {
          whatMattersNext: [
            {
              conceptId: 'reading.phonics.longVowels',
              kidName: 'Long vowel words',
              why: 'blends are solid, this is the next unlock',
              suggestedVehicle: 'quest',
            },
          ],
          narrative: '',
          openQuestionsSummary: [],
          generatedAt: '2026-07-10',
        },
      }),
    })
    render(<FoundationsFocusLine childId="c1" />)
    expect(screen.getByText(/This week's foundation focus/i)).toBeInTheDocument()
    expect(screen.getByText(/Long vowel words/)).toBeInTheDocument()
    expect(screen.getByText(/next unlock/)).toBeInTheDocument()
  })

  it('renders nothing while the model is loading', () => {
    mockUseLearnerModel.mockReturnValue({ loading: true, model: null })
    const { container } = render(<FoundationsFocusLine childId="c1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the model is absent', () => {
    mockUseLearnerModel.mockReturnValue({ loading: false, model: null })
    const { container } = render(<FoundationsFocusLine childId="c1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the model is no-data', () => {
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: model({ status: 'no-data' }),
    })
    const { container } = render(<FoundationsFocusLine childId="c1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no synthesis focus', () => {
    mockUseLearnerModel.mockReturnValue({
      loading: false,
      model: model({ status: 'seeded' }),
    })
    const { container } = render(<FoundationsFocusLine childId="c1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
