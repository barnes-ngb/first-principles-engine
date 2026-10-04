import { describe, expect, it } from 'vitest'

import type { PlannerPhase } from './plannerPhaseLine'
import { plannerPhaseLine } from './plannerPhaseLine'

describe('plannerPhaseLine', () => {
  it('returns a line for setup', () => {
    expect(plannerPhaseLine('setup')).toContain('Step 1 of 3')
  })

  it('returns a line for review', () => {
    expect(plannerPhaseLine('review')).toContain('Step 2 of 3')
  })

  it('returns a line for active', () => {
    expect(plannerPhaseLine('active')).toContain('Step 3 of 3')
  })

  it('setup mentions generating a plan', () => {
    expect(plannerPhaseLine('setup').toLowerCase()).toContain('generate')
  })

  it('review mentions Apply', () => {
    expect(plannerPhaseLine('review')).toContain('Apply')
  })

  it('active mentions Today', () => {
    expect(plannerPhaseLine('active')).toContain('Today')
  })

  it('returns a different line for each phase', () => {
    const phases: PlannerPhase[] = ['setup', 'review', 'active']
    const lines = phases.map(plannerPhaseLine)
    expect(new Set(lines).size).toBe(3)
  })
})
