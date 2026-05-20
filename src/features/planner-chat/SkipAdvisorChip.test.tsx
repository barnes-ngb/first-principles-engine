import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SkipAdvisorChip from './SkipAdvisorChip'
import { evaluatePrioritySkillStatus } from './skipAdvisor.logic'
import { MasteryGate, SkillLevel } from '../../core/types/enums'

describe('SkipAdvisorChip — snapshot status variant', () => {
  it('renders "Can move to background" for mastered priority skill', () => {
    const status = evaluatePrioritySkillStatus({
      tag: 'math.addition.facts',
      label: 'Addition Facts',
      level: SkillLevel.Secure,
      masteryGate: MasteryGate.IndependentConsistent,
    })
    render(<SkipAdvisorChip result={status} label="Can move to background" />)
    expect(screen.getByText(/can move to background/i)).toBeInTheDocument()
  })

  it('renders "Active focus" for emerging priority skill', () => {
    const status = evaluatePrioritySkillStatus({
      tag: 'reading.cvc',
      label: 'CVC',
      level: SkillLevel.Emerging,
      masteryGate: MasteryGate.NotYet,
    })
    render(<SkipAdvisorChip result={status} label="Active focus" />)
    expect(screen.getByText(/active focus/i)).toBeInTheDocument()
  })

  it('expands rationale on click', () => {
    const status = evaluatePrioritySkillStatus({
      tag: 'math.addition.facts',
      label: 'Addition Facts',
      level: SkillLevel.Secure,
      masteryGate: MasteryGate.IndependentConsistent,
    })
    render(<SkipAdvisorChip result={status} label="Can move to background" />)
    fireEvent.click(screen.getByText(/can move to background/i))
    expect(screen.getByText(/background practice/i)).toBeInTheDocument()
  })
})
