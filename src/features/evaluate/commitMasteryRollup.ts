import { ConceptualBlockSource } from '../../core/types/evaluation'
import { writeSnapshotUpdate } from './skillSnapshotWrites'
import type { MasterySkillRollup } from './masteryRollup'

/**
 * FEAT-09 commit half — reflect mastered rollups in the Skill Snapshot.
 *
 * The **only** snapshot-write path this module touches is the central,
 * additive `writeSnapshotUpdate` (skillSnapshotWrites.ts). No inline write is
 * added: each mastered skill is folded in as a `masteredSkills` + `fullyMastered`
 * update, which advances a matching priority skill to Secure /
 * IndependentConsistent and a matching block to RESOLVED — **never** removing
 * an unresolved block, downgrading a level, or inventing a new mastered entry.
 *
 * Marking is *advancement*, not removal: unresolved blocks / priorities the
 * rollup doesn't clear are left untouched. Below-threshold rollups never reach
 * here (callers pass only confirmed pending check-offs).
 *
 * Each skill is written with its own evidence stamp so the snapshot records
 * *why* it was checked off ("mastered via repeated got-it / quest — <date>").
 */
export interface MasteryCheckoffResult {
  /** Skills whose write actually advanced the snapshot. */
  checkedOff: Array<{ skillKey: string; label: string; evidence: string }>
  changed: boolean
}

export async function commitMasteryRollup(
  familyId: string,
  childId: string,
  rollups: MasterySkillRollup[],
  opts?: { at?: string },
): Promise<MasteryCheckoffResult> {
  const at = opts?.at ?? new Date().toISOString()
  const checkedOff: MasteryCheckoffResult['checkedOff'] = []

  for (const rollup of rollups) {
    if (!rollup.mastered) continue
    // Pass both the human label and the stable slug so the central writer's
    // slug matcher can hit a priority skill (by label/tag) or a block (by
    // name/affectedSkills), whichever the skill lives as on the map.
    const { changed } = await writeSnapshotUpdate(familyId, childId, {
      masteredSkills: [rollup.label, rollup.skillKey],
      fullyMastered: true,
      source: ConceptualBlockSource.Parent,
      evidence: rollup.evidence,
      at,
    })
    if (changed) {
      checkedOff.push({
        skillKey: rollup.skillKey,
        label: rollup.label,
        evidence: rollup.evidence,
      })
    }
  }

  return { checkedOff, changed: checkedOff.length > 0 }
}
