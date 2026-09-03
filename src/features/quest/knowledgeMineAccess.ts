import type { PrioritySkill, SkillSnapshot } from '../../core/types'
import { MasteryGate, SkillLevel } from '../../core/types/enums'
import { STARTER_PRIORITY_SKILLS } from '../evaluation/childDefaults'

/**
 * Capability gates for the Knowledge Mine — a MULTI-DOMAIN hub.
 *
 * The Mine hosts more than one quest family (Reading: phonics / comprehension /
 * fluency; Math). Each quest calibrates from a child's skill snapshot — the
 * data an evaluation writes for that domain. So eligibility is per-domain:
 *   - ENTRY (`canAccessKnowledgeMine`) is generic: a child gets into the hub
 *     once they have calibration data for ANY Mine domain.
 *   - PRECISION lives on the quest tiles: each quest is gated on ITS OWN
 *     domain's calibration (`hasReadingCalibration` / `hasMathCalibration`).
 *     A child sees only the quests they're calibrated for; an uncalibrated
 *     quest is simply absent — no "not ready" message (shame-free).
 *
 * This was previously a single domain-BLIND gate that admitted on any working
 * level / priority skill / completed program. That was fine when only reading
 * data existed, but with math eval now live a math-only child would pass the
 * gate and reach the *Reading* quest at an uncalibrated default level (and a
 * future math-evaluated London would leak past the reading hold). Per-quest
 * domain gating closes that leak. See ARCH-16.
 *
 * Every gate keys on snapshot DATA presence — never on the child's name or
 * `isLincoln`. Children are auto-created with only `id` + `name`, so a
 * name-gate is the trap: it would hard-code "Lincoln gets in" instead of
 * asking "has this child been evaluated in this domain?". The signatures
 * deliberately accept only a snapshot so identity *cannot* leak into the
 * decision.
 *
 * Domain signals (pinned against how evaluations actually write the snapshot):
 *   - MATH is unambiguous: the math eval emits `math.`-prefixed skill tags
 *     (`functions/src/ai/chat.ts` math diagnostic) and writes
 *     `workingLevels.math`. So a math signal is `workingLevels.math` OR any
 *     `math.`-prefixed priority skill.
 *   - READING is the default domain for everything else. The reading eval
 *     emits `phonics.`-prefixed tags and writes `workingLevels.phonics` /
 *     `workingLevels.comprehension`; `completedPrograms` (e.g. Reading Eggs)
 *     are reading programs. Crucially we do NOT narrow reading to a prefix
 *     allow-list — AI-authored / manual tags are often free-form, and the
 *     dangerous failure direction is HOLDING an already-evaluated reader.
 *     So a reading signal is a reading working level, a completed program, or
 *     any priority skill that is NOT a math skill. Math-prefixed skills are
 *     the one thing excluded from reading — which is exactly what closes the
 *     math-only → reading leak.
 *
 * A STARTER SKILL IS NOT CALIBRATION (FEAT-184 / UX-150). "Load Starter
 * Defaults" writes a template's `prioritySkills` into the same field an
 * evaluation writes, and London's K frame carries both a reading and a
 * `math.` row — so one parent tap used to satisfy BOTH gates and open the
 * whole Mine for a child nothing had been tuned for. Both gates now ignore any
 * priority skill that still has the exact starter shape (`isStarterSkill`:
 * same tag as a template row, `Emerging`, `NotYet`). Only the shape is
 * matched, never the tag alone: a quest, eval or scan that moves one of those
 * rows to `Developing`, or clears its gate, makes it real evidence again.
 * `PrioritySkill` has no `source` field, so matching the shape is what also
 * covers a snapshot the defaults were applied to before this rule existed.
 */

/**
 * True when a priority skill is still a template row, untouched: the same tag
 * as one of the starter defaults (any template), at `Emerging` with the
 * `NotYet` mastery gate. Pure; exported for the tests and for any surface that
 * needs to tell a starting frame from evidence.
 */
export function isStarterSkill(
  skill: Pick<PrioritySkill, 'tag' | 'level' | 'masteryGate'>,
  starters: readonly PrioritySkill[] = STARTER_PRIORITY_SKILLS,
): boolean {
  if (skill.level !== SkillLevel.Emerging) return false
  if (skill.masteryGate !== MasteryGate.NotYet) return false
  return starters.some((s) => s.tag === skill.tag)
}

/** The snapshot's priority skills that count as evidence — starter rows removed. */
function calibratedSkills(snapshot: SkillSnapshot): PrioritySkill[] {
  return (snapshot.prioritySkills ?? []).filter((s) => !isStarterSkill(s))
}

/** A priority-skill tag belongs to math iff it carries the `math.` prefix the math eval emits. */
function isMathSkillTag(tag: string): boolean {
  return tag.toLowerCase().startsWith('math.')
}

/**
 * True once the child has reading calibration the Reading quests can use:
 * a phonics/comprehension working level, a completed (reading) program, or any
 * non-math priority skill that is not an untouched starter row. Reading is the
 * default domain — only math-prefixed skills are excluded, so a math-only
 * child does NOT pass this gate.
 */
export function hasReadingCalibration(
  snapshot: SkillSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false
  if (snapshot.workingLevels?.phonics) return true
  if (snapshot.workingLevels?.comprehension) return true
  if (snapshot.completedPrograms?.length) return true
  if (calibratedSkills(snapshot).some((s) => !isMathSkillTag(s.tag))) return true
  return false
}

/**
 * True once the child has math calibration the Math quest can use:
 * a `workingLevels.math` entry or any `math.`-prefixed priority skill that is
 * not an untouched starter row.
 */
export function hasMathCalibration(
  snapshot: SkillSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false
  if (snapshot.workingLevels?.math) return true
  if (calibratedSkills(snapshot).some((s) => isMathSkillTag(s.tag))) return true
  return false
}

/**
 * Generic ENTRY gate for the hub: admit a child who has calibration data for
 * ANY Mine domain. Correct for a multi-domain hub — per-quest precision is the
 * tiles' job. Held only when the child has no calibration anywhere.
 */
export function canAccessKnowledgeMine(
  snapshot: SkillSnapshot | null | undefined,
): boolean {
  return hasReadingCalibration(snapshot) || hasMathCalibration(snapshot)
}
