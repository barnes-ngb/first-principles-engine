import type { SkillSnapshot } from '../../core/types'

/**
 * Capability gate for the Knowledge Mine (reading/quest).
 *
 * The quest calibrates from a child's skill snapshot — the data a reading
 * evaluation writes. A child is eligible only once that calibration data
 * exists, i.e. once they've actually been evaluated. Held otherwise; the gate
 * opens automatically the moment an evaluation produces a snapshot, with no
 * further code change.
 *
 * This keys on snapshot DATA presence — never on the child's name or
 * `isLincoln`. Children are auto-created with only `id` + `name`, so a
 * name-gate is the trap: it would hard-code "Lincoln gets in" instead of
 * asking "has this child been evaluated?". The signature deliberately accepts
 * only a snapshot so identity *cannot* leak into the decision.
 *
 * Note on the "reading data" signal: we deliberately do NOT narrow to
 * reading-prefixed tags. Snapshot priority-skill tags are AI-authored during
 * the reading evaluation and are not guaranteed to carry a `reading.` prefix
 * (free-form skill strings are common). Narrowing on a prefix would risk the
 * dangerous failure direction — HOLDING an already-evaluated child. Instead we
 * admit on any non-empty calibration data the quest can use:
 *   - at least one recorded priority skill (the evaluation's output), or
 *   - a completed program (e.g. Reading Eggs — reading evidence), or
 *   - any quest working level (phonics / comprehension / math progression).
 * Correct-by-construction: data present → eligible; absent/empty → held —
 * true regardless of who the child is.
 */
export function canAccessKnowledgeMine(
  snapshot: SkillSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false
  if (snapshot.prioritySkills?.length) return true
  if (snapshot.completedPrograms?.length) return true
  if (Object.values(snapshot.workingLevels ?? {}).some(Boolean)) return true
  return false
}
