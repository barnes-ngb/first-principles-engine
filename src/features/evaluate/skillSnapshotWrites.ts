import { doc, getDoc, setDoc } from 'firebase/firestore'

import { skillSnapshotsCollection } from '../../core/firebase/firestore'
import type {
  ConceptualBlock,
  ConceptualBlockSource,
  ConceptualBlockStatus,
  SkillSnapshot,
} from '../../core/types/evaluation'
import { MasteryGate, SkillLevel } from '../../core/types/enums'
import { effectiveStatus, generateBlockId } from '../../core/utils/blockerLifecycle'

/**
 * Centralized, additive write-through into `skillSnapshots` (the FUNC-01
 * authority for "what to teach next").
 *
 * Per the FUNC-01 ruling (`docs/review/DECISION_FUNC-01_source_of_truth.md`),
 * a curriculum scan advances `childSkillMaps` / `activityConfigs` but must also
 * fold its mastered skills into the Skill Snapshot so the two stores cannot
 * silently disagree. This module is that write-through seam (FUNC-02).
 *
 * `applyToSnapshot` is a pure reducer; `writeSnapshotUpdate` is the thin
 * Firestore writer that reads-merges-writes around it.
 */

/** Describes the mastered-skill signal a scan (or other source) contributes. */
export interface SnapshotApplyUpdate {
  /** Skills the source reports as mastered/covered (free text). */
  masteredSkills: string[]
  /**
   * When true, advance matched blocks straight to `RESOLVED` (the milestone
   * marks the skill mastered). Otherwise advance them to `RESOLVING`.
   */
  fullyMastered?: boolean
  /** What produced this write (recorded as the block's `lastSource`). */
  source?: ConceptualBlockSource
  /** Short evidence string appended to any block this update touches. */
  evidence?: string
  /** ISO timestamp; defaults to now. Pass a fixed value in tests. */
  at?: string
}

export interface ApplyResult {
  snapshot: SkillSnapshot
  /** True when the update actually mutated a block or priority skill. */
  changed: boolean
}

/** Ordered lifecycle ranks. Higher = more resolved. Used to never downgrade. */
const STATUS_RANK: Record<ConceptualBlockStatus, number> = {
  ADDRESS_NOW: 0,
  RESOLVING: 1,
  RESOLVED: 2,
  // DEFER is a parent decision to set a block aside — not part of the
  // address→resolve path. Scans never advance a deferred block.
  DEFER: 0,
}

/** Append an evidence snippet, de-duplicating against the existing string. */
function appendEvidence(existing: string | undefined, addition: string | undefined): string | undefined {
  if (!addition) return existing
  if (!existing) return addition
  if (existing.includes(addition)) return existing
  return `${existing} | ${addition}`
}

/** True if any mastered-skill slug matches this block's id/name/affectedSkills. */
function matchesMastered(block: ConceptualBlock, masteredIds: Set<string>): boolean {
  if (block.id && masteredIds.has(block.id)) return true
  if (block.name && masteredIds.has(generateBlockId(block.name))) return true
  return (block.affectedSkills ?? []).some((s) => masteredIds.has(generateBlockId(s)))
}

/**
 * Pure reducer: fold a mastered-skill update into a snapshot.
 *
 * Guarantees (the FUNC-02 contract):
 * - **Additive / never downgrades** — a block only moves to a *higher*
 *   lifecycle rank; `RESOLVED` and `DEFER` blocks are left untouched.
 * - **Block-merging by stable id** — matched only by slugified skill name.
 * - **No-op when nothing matches** — returns `changed: false` and the snapshot
 *   unchanged.
 * - **Tolerates a missing snapshot** — accepts `null`/`undefined`/partial and
 *   normalizes it.
 * - **Idempotent** — re-applying the same update advances nothing further, so
 *   repeated scans don't oscillate or keep bumping counters.
 */
export function applyToSnapshot(
  existing: Partial<SkillSnapshot> | null | undefined,
  update: SnapshotApplyUpdate,
): ApplyResult {
  const now = update.at ?? new Date().toISOString()
  const base: SkillSnapshot = {
    childId: existing?.childId ?? '',
    prioritySkills: existing?.prioritySkills ?? [],
    supports: existing?.supports ?? [],
    stopRules: existing?.stopRules ?? [],
    evidenceDefinitions: existing?.evidenceDefinitions ?? [],
    conceptualBlocks: existing?.conceptualBlocks ?? [],
    workingLevels: existing?.workingLevels,
    completedPrograms: existing?.completedPrograms,
    blocksUpdatedAt: existing?.blocksUpdatedAt,
    createdAt: existing?.createdAt,
    updatedAt: existing?.updatedAt,
  }

  const mastered = (update.masteredSkills ?? []).map((s) => s.trim()).filter(Boolean)
  if (mastered.length === 0) {
    return { snapshot: base, changed: false }
  }
  const masteredIds = new Set(mastered.map(generateBlockId))

  const targetStatus: ConceptualBlockStatus = update.fullyMastered ? 'RESOLVED' : 'RESOLVING'

  // ── Advance matched conceptual blocks ──────────────────────────────
  let blocksChanged = false
  const nextBlocks = (base.conceptualBlocks ?? []).map((block) => {
    if (!matchesMastered(block, masteredIds)) return block
    const current = effectiveStatus(block)
    // Only advance active blocks; never reopen RESOLVED or override DEFER.
    if (current !== 'ADDRESS_NOW' && current !== 'RESOLVING') return block
    if (STATUS_RANK[targetStatus] <= STATUS_RANK[current]) return block
    blocksChanged = true
    return {
      ...block,
      status: targetStatus,
      resolvedAt: targetStatus === 'RESOLVED' ? (block.resolvedAt ?? now) : block.resolvedAt,
      evidence: appendEvidence(block.evidence, update.evidence),
      lastReinforcedAt: now,
      sessionCount: (block.sessionCount ?? 1) + 1,
      lastSource: update.source ?? block.lastSource ?? block.source,
    }
  })

  // ── Fold into priority-skill status (additive, never downgrading) ──
  let skillsChanged = false
  const nextSkills = base.prioritySkills.map((skill) => {
    const skillId = generateBlockId(skill.label || String(skill.tag))
    if (!skillId || !masteredIds.has(skillId)) return skill
    const gate = skill.masteryGate ?? MasteryGate.NotYet
    if (gate >= MasteryGate.IndependentConsistent && skill.level === SkillLevel.Secure) return skill
    skillsChanged = true
    return {
      ...skill,
      level: SkillLevel.Secure,
      masteryGate: MasteryGate.IndependentConsistent,
    }
  })

  const changed = blocksChanged || skillsChanged
  const snapshot: SkillSnapshot = {
    ...base,
    prioritySkills: nextSkills,
    conceptualBlocks: nextBlocks,
    ...(blocksChanged ? { blocksUpdatedAt: now } : {}),
    ...(changed ? { updatedAt: now } : {}),
  }
  return { snapshot, changed }
}

/**
 * Thin Firestore writer around {@link applyToSnapshot}. Reads the current
 * snapshot, applies the update, and writes back only when something changed.
 * Tolerates a missing snapshot doc (treats it as empty and merges).
 */
export async function writeSnapshotUpdate(
  familyId: string,
  childId: string,
  update: SnapshotApplyUpdate,
): Promise<{ changed: boolean }> {
  const ref = doc(skillSnapshotsCollection(familyId), childId)
  const snap = await getDoc(ref)
  const existing: Partial<SkillSnapshot> = snap.exists() ? snap.data() : {}
  const { snapshot, changed } = applyToSnapshot({ ...existing, childId }, update)
  if (!changed) return { changed: false }

  await setDoc(
    ref,
    // Strip undefined (Firestore rejects it) — matches the codebase pattern.
    JSON.parse(
      JSON.stringify({
        childId,
        prioritySkills: snapshot.prioritySkills,
        conceptualBlocks: snapshot.conceptualBlocks,
        blocksUpdatedAt: snapshot.blocksUpdatedAt,
        updatedAt: snapshot.updatedAt,
      }),
    ),
    { merge: true },
  )
  return { changed: true }
}
