import { describe, expect, it } from 'vitest'

import { SKILL_LEVEL_OBSERVATION_NOTE } from './skillLevelCopy'

/**
 * UX-393 — the owner's decision, 2026-09-11: *a level is an observation; the
 * gate stays; the UI says so.*
 *
 * This file pins the sentence itself. That both controls RENDER it is pinned in
 * `skillLevelNote.render.test.tsx`, and that the write did not change is pinned
 * in `SkillSnapshotPage.levelWrite.test.tsx` with a positive control.
 */
describe('SKILL_LEVEL_OBSERVATION_NOTE (UX-393)', () => {
  it('is the owner-decided sentence, verbatim', () => {
    expect(SKILL_LEVEL_OBSERVATION_NOTE).toBe(
      'Changes the level the planner sees. Mastery is confirmed by check-off.',
    )
  })

  it('says what the change reaches AND what it does not', () => {
    // One half alone is the defect restated: "changes the level" without the
    // gate leaves the parent expecting the skip advisor to move.
    expect(SKILL_LEVEL_OBSERVATION_NOTE).toMatch(/planner/i)
    expect(SKILL_LEVEL_OBSERVATION_NOTE).toMatch(/mastery/i)
    expect(SKILL_LEVEL_OBSERVATION_NOTE).toMatch(/check-off/i)
  })

  it('points at a control rather than at "evidence"', () => {
    // A parent can find a check-off. "Confirmed by evidence" is true and
    // unactionable.
    expect(SKILL_LEVEL_OBSERVATION_NOTE).not.toMatch(/\bevidence\b/i)
  })
})
