/**
 * What a priority skill's **level** means, said once — UX-393.
 *
 * PR #1838 found that `SkillSnapshotPage.handleUpdateSkill` and
 * `handleQuickLevelUpdate` change `prioritySkills[].level` and do **not** touch
 * an existing `masteryGate`, while `skipAdvisor.logic.getEffectiveMasteryGate`
 * explicitly prefers that gate when one is set — and both children's starter
 * defaults set one. So a parent could move a skill to *secure* and the planner's
 * skip advisor would keep saying *active practice*, with nothing on screen
 * explaining the disagreement.
 *
 * Owner decision, 2026-09-11: **a level is an observation; the gate stays; the
 * UI says so.** That is not a compromise between two behaviours — it is the
 * distinction the two fields already encode, finally written down. A level is
 * what a parent saw on one day. A gate is a mastery claim, and this app's
 * settled rule is that a mastery claim comes from evidence: the scan
 * mastered-skill write-through and a guided eval are the two writers that move
 * a gate to `IndependentConsistent`, and both do it from a check-off rather
 * than from a dropdown.
 *
 * So **no invariant changes here.** The write is exactly the write it was:
 * `handleUpdateSkill` still sets one field on one skill, `handleQuickLevelUpdate`
 * still sets `level` alone, and neither touches `masteryGate` — pinned by test
 * with a positive control, because a "copy-only" change that quietly altered a
 * `skillSnapshots` payload would be the exact thing `CLAUDE.md`'s
 * propose-and-confirm rail exists to stop. What this module adds is one
 * sentence, in one place, rendered by both controls, so the two cannot come to
 * say different things about the same field.
 *
 * Parent-facing: both controls live on the Skill Snapshot page, which is a
 * parent surface. It is deliberately **not** on the kid readability bar — it is
 * about a planner behaviour a child never sees.
 *
 * Pure: no React, no Firestore, never throws.
 */

/**
 * The one line shown under every control that writes a priority skill's level.
 *
 * Two sentences and no hedging, because the parent's real question at the
 * moment of the tap is *"did that do what I meant?"*: the first says what the
 * change DOES reach, the second says what it does not and where that other
 * thing comes from instead. Naming check-off rather than "evidence" is
 * deliberate — it points at a control she can find.
 */
export const SKILL_LEVEL_OBSERVATION_NOTE =
  'Changes the level the planner sees. Mastery is confirmed by check-off.'
