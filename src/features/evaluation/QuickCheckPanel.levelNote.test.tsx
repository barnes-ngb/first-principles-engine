import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SkillSnapshot } from '../../core/types'
import QuickCheckPanel from './QuickCheckPanel'
import { SKILL_LEVEL_OBSERVATION_NOTE } from './skillLevelCopy'

/**
 * UX-393 — the **second** control that writes a priority skill's level.
 *
 * The owner's decision is that a level is an observation and the UI says so;
 * two controls write this field, and a sentence on only one of them is the same
 * defect with a smaller blast radius. The quick check is the one a parent
 * reaches after actually watching the child read, so it is arguably the more
 * important of the two.
 *
 * The write is untouched here as well: `handleLevelSelect` still resolves the
 * skill by tag and calls `onUpdateSkillLevel(index, level)` with nothing else,
 * which the last case pins.
 */

const SNAPSHOT = {
  childId: 'c1',
  prioritySkills: [
    { label: 'Reading focus', tag: 'reading.cvcBlend', level: 'developing', masteryGate: 0 },
  ],
  workingLevels: {},
  supports: [],
  stopRules: [],
  evidenceDefinitions: [],
} as unknown as SkillSnapshot

function openTheCheck(onUpdateSkillLevel = vi.fn(), onAddObservation = vi.fn()) {
  render(
    <QuickCheckPanel
      snapshot={SNAPSHOT}
      onUpdateSkillLevel={onUpdateSkillLevel}
      onAddObservation={onAddObservation}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /record result/i }))
  return { onUpdateSkillLevel, onAddObservation }
}

describe('QuickCheckPanel — the level buttons say what they reach (UX-393)', () => {
  it('does not show the note before the levels are on screen', () => {
    render(
      <QuickCheckPanel
        snapshot={SNAPSHOT}
        onUpdateSkillLevel={vi.fn()}
        onAddObservation={vi.fn()}
      />,
    )
    // The note belongs to the control, not to the card — a sentence about what
    // a tap does, shown where there is nothing to tap, is noise.
    expect(screen.queryByText(SKILL_LEVEL_OBSERVATION_NOTE)).not.toBeInTheDocument()
  })

  it('shows the note beside the level buttons', () => {
    openTheCheck()
    expect(screen.getByText(SKILL_LEVEL_OBSERVATION_NOTE)).toBeInTheDocument()
  })

  it('says the same thing the Skill Snapshot dropdown says', () => {
    openTheCheck()
    expect(screen.getByText(
      'Changes the level the planner sees. Mastery is confirmed by check-off.',
    )).toBeInTheDocument()
  })

  it('POSITIVE CONTROL — a level tap still sends index and level, and nothing else', () => {
    const { onUpdateSkillLevel } = openTheCheck()

    fireEvent.click(screen.getByRole('button', { name: /secure/i }))

    expect(onUpdateSkillLevel).toHaveBeenCalledTimes(1)
    expect(onUpdateSkillLevel).toHaveBeenCalledWith(0, 'secure')
  })
})
