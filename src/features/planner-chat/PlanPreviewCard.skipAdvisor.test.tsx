import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PlanPreviewCard from './PlanPreviewCard'
import type { DraftWeeklyPlan, SkillSnapshot } from '../../core/types'
import { MasteryGate, SkillLevel, SubjectBucket } from '../../core/types/enums'

const SNAPSHOT_MASTERED: SkillSnapshot = {
  childId: 'c1',
  prioritySkills: [
    {
      tag: 'math.addition.facts',
      label: 'Addition Facts',
      level: SkillLevel.Secure,
      masteryGate: MasteryGate.IndependentConsistent,
    },
  ],
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
}

const SNAPSHOT_EMERGING: SkillSnapshot = {
  childId: 'c1',
  prioritySkills: [
    {
      tag: 'reading.cvc',
      label: 'CVC',
      level: SkillLevel.Emerging,
      masteryGate: MasteryGate.NotYet,
    },
  ],
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
}

function makePlan(skillTags: string[]): DraftWeeklyPlan {
  return {
    days: [
      {
        day: 'Monday',
        timeBudgetMinutes: 120,
        items: [
          {
            id: 'item-1',
            title: 'Addition facts drill',
            subjectBucket: SubjectBucket.Math,
            estimatedMinutes: 10,
            skillTags,
            accepted: true,
          },
        ],
      },
    ],
    skipSuggestions: [],
    minimumWin: '',
  }
}

describe('PlanPreviewCard — skip-advisor chip', () => {
  it('renders inline skip-eligible chip when advisor flags item as skip', () => {
    render(
      <PlanPreviewCard
        plan={makePlan(['math.addition.facts'])}
        hoursPerDay={2}
        snapshot={SNAPSHOT_MASTERED}
      />,
    )
    expect(screen.getByText(/skip eligible/i)).toBeInTheDocument()
  })

  it('does not render chip when advisor returns keep', () => {
    render(
      <PlanPreviewCard
        plan={makePlan(['reading.cvc'])}
        hoursPerDay={2}
        snapshot={SNAPSHOT_EMERGING}
      />,
    )
    expect(screen.queryByText(/skip eligible/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/lighter/i)).not.toBeInTheDocument()
  })

  it('does not render chip when no snapshot is provided', () => {
    render(
      <PlanPreviewCard
        plan={makePlan(['math.addition.facts'])}
        hoursPerDay={2}
        snapshot={null}
      />,
    )
    expect(screen.queryByText(/skip eligible/i)).not.toBeInTheDocument()
  })

  it('expands rationale on click', () => {
    render(
      <PlanPreviewCard
        plan={makePlan(['math.addition.facts'])}
        hoursPerDay={2}
        snapshot={SNAPSHOT_MASTERED}
      />,
    )
    fireEvent.click(screen.getByText(/skip eligible/i))
    // Rationale text is the full advisor sentence — match the unique portion.
    expect(screen.getByText(/Mastery evidence this week/i)).toBeInTheDocument()
  })
})
