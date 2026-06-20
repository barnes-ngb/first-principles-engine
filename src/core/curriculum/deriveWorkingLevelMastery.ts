/**
 * Learning Map re-derivation engine (FEAT chunk 1).
 *
 * The primary "missing-but-learned" cause: a child's per-domain **working levels**
 * (Knowledge Mine progression) never reach the Learning Map. A child working at
 * phonics level 4 has, by definition, mastered the level-1–3 phonics skills — but
 * unless an evaluation finding happened to land on each node, those nodes stay
 * "not started" on the map.
 *
 * This module closes that gap by **inverting** the same skill-tag → level maps the
 * quest uses ({@link skillLevelMaps}): for a working level N in a domain, every tag
 * below N implies a mastered node, and the tag(s) at N imply an in-progress node.
 *
 * It is a pure, read-only consumer of `workingLevels` / `completedPrograms`. It
 * never writes them, never changes quest finding emission or working-level
 * computation. The merge into the stored map (see {@link applyReDerivedMastery}) is
 * **upgrade-only**, **never overrides a manual node** (manual FREEZE), and **never
 * downgrades**.
 */

import type { WorkingLevels } from '../types/evaluation'
import { CURRICULUM_NODE_MAP } from './curriculumMap'
import type { CurriculumDomain } from './curriculumMap'
import { getNodesForProgram, mapFindingToNode } from './mapFindingToNode'
import type { SkillNodeStatus } from './skillStatus'
import { SkillStatus } from './skillStatus'
import {
  COMPREHENSION_SKILL_LEVEL_MAP,
  MATH_SKILL_LEVEL_MAP,
  PHONICS_SKILL_LEVEL_MAP,
  SENTENCE_SKILL_LEVEL_MAP,
  WRITING_SKILL_LEVEL_MAP,
} from './skillLevelMaps'

/** A status a working level can imply for a node (never `not-started`). */
type DerivedStatus = typeof SkillStatus.Mastered | typeof SkillStatus.InProgress

/** The five working-level keys that carry a level (speech has none). */
const WORKING_LEVEL_KEYS = ['phonics', 'comprehension', 'math', 'writing', 'sentence'] as const
type WorkingLevelKey = (typeof WORKING_LEVEL_KEYS)[number]

/** Which skill-tag → level map backs each working-level key. */
const KEY_TO_LEVEL_MAP: Record<WorkingLevelKey, Record<string, number>> = {
  phonics: PHONICS_SKILL_LEVEL_MAP,
  comprehension: COMPREHENSION_SKILL_LEVEL_MAP,
  math: MATH_SKILL_LEVEL_MAP,
  writing: WRITING_SKILL_LEVEL_MAP,
  sentence: SENTENCE_SKILL_LEVEL_MAP,
}

/**
 * Curriculum domains a key's nodes are allowed to land in. `mapFindingToNode` is
 * substring-based, so a stray tag can resolve cross-domain (e.g. the math tag
 * `multiplication.fluency` matches `…fluency` → `reading.fluency.accuracy`). This
 * guard drops those wrong-domain leaks while still allowing the intended lanes:
 * the spelling map (`writing`) routes its phonics-shaped tags to `reading.phonics.*`
 * nodes (spelling a CVC word implies you can decode it), so it permits both.
 */
const KEY_TO_DOMAINS: Record<WorkingLevelKey, CurriculumDomain[]> = {
  phonics: ['reading'],
  comprehension: ['reading'],
  math: ['math'],
  writing: ['reading', 'writing'],
  sentence: ['writing'],
}

/**
 * Invert the working-level maps into implied node statuses.
 *
 * For each key with `N = workingLevels[key]?.level`:
 * - tags with `level < N`  → node **Mastered**
 * - tags with `level === N` → node **InProgress**
 * - tags with `level > N`  → ignored
 *
 * Tags are routed to curriculum nodes via `mapFindingToNode` and filtered by the
 * key's allowed domains. When several tags resolve to the same node, **Mastered
 * wins** over InProgress. Keys with no level contribute nothing — so speech (which
 * has no working level) is left to the findings-only path.
 *
 * @returns nodeId → derived status (mastered / in-progress).
 */
export function deriveWorkingLevelMastery(
  workingLevels: WorkingLevels | null | undefined,
): Record<string, DerivedStatus> {
  const result: Record<string, DerivedStatus> = {}
  if (!workingLevels) return result

  for (const key of WORKING_LEVEL_KEYS) {
    const N = workingLevels[key]?.level
    if (N == null) continue

    const levelMap = KEY_TO_LEVEL_MAP[key]
    const allowedDomains = KEY_TO_DOMAINS[key]

    for (const [tag, level] of Object.entries(levelMap)) {
      let status: DerivedStatus
      if (level < N) status = SkillStatus.Mastered
      else if (level === N) status = SkillStatus.InProgress
      else continue // level > N — not yet reached

      const nodeId = mapFindingToNode(tag)
      if (!nodeId) continue
      const node = CURRICULUM_NODE_MAP[nodeId]
      if (!node || !allowedDomains.includes(node.domain)) continue

      // Mastered is sticky; only an absent node or an upgrade-to-mastered writes.
      if (result[nodeId] === SkillStatus.Mastered) continue
      result[nodeId] = status
    }
  }

  return result
}

/** Outcome of a re-derivation merge. */
export interface ReDerivationResult {
  /** The merged skills record (a new object; input is not mutated). */
  skills: Record<string, SkillNodeStatus>
  /** Node IDs whose status changed (empty ⇒ nothing to persist). */
  changedNodeIds: string[]
}

/** Status rank for upgrade-only comparison. */
const STATUS_RANK: Record<SkillStatus, number> = {
  [SkillStatus.NotStarted]: 0,
  [SkillStatus.InProgress]: 1,
  [SkillStatus.Mastered]: 2,
}

/**
 * Merge working-level-derived mastery + completed programs into a stored skill map.
 *
 * Self-healing and idempotent — safe to run on **every** load:
 * - **Upgrade-only.** A node is written only when the incoming status is strictly
 *   higher than what's stored. Equal or lower is skipped (so a steady map produces
 *   `changedNodeIds: []` and the caller writes nothing).
 * - **Manual FREEZE.** A stored node with `source === 'manual'` is never touched —
 *   a deliberate manual downgrade is never re-upgraded.
 * - **Never downgrades.** Follows directly from upgrade-only.
 *
 * Working-level-derived nodes are stamped `source: 'evaluation'`; program nodes
 * `source: 'program'`. When both reach a node, the program's Mastered wins (it
 * outranks an in-progress derivation).
 *
 * @param existingSkills stored `ChildSkillMap.skills` (not mutated).
 * @param workingLevels  the child's `skillSnapshot.workingLevels`.
 * @param completedPrograms the child's `skillSnapshot.completedPrograms`.
 * @param now ISO timestamp stamped on changed nodes (injectable for tests).
 */
export function applyReDerivedMastery(
  existingSkills: Record<string, SkillNodeStatus>,
  workingLevels: WorkingLevels | null | undefined,
  completedPrograms: string[] | null | undefined,
  now: string = new Date().toISOString(),
): ReDerivationResult {
  // 1) Build the combined "incoming" status per node (Mastered wins).
  const incoming: Record<string, { status: DerivedStatus; source: SkillNodeStatus['source']; notes: string }> = {}

  const derived = deriveWorkingLevelMastery(workingLevels)
  for (const [nodeId, status] of Object.entries(derived)) {
    incoming[nodeId] = {
      status,
      source: 'evaluation',
      notes:
        status === SkillStatus.Mastered
          ? 'Implied mastered — below working level'
          : 'Working on — at current working level',
    }
  }

  for (const programId of completedPrograms ?? []) {
    for (const nodeId of getNodesForProgram(programId)) {
      const existingIncoming = incoming[nodeId]
      // Program completion implies Mastered; it outranks an in-progress derivation.
      if (existingIncoming && existingIncoming.status === SkillStatus.Mastered) continue
      incoming[nodeId] = {
        status: SkillStatus.Mastered,
        source: 'program',
        notes: `Completed program: ${programId}`,
      }
    }
  }

  // 2) Merge upgrade-only, honoring the manual freeze.
  const skills = { ...existingSkills }
  const changedNodeIds: string[] = []

  for (const [nodeId, inc] of Object.entries(incoming)) {
    const existing = skills[nodeId]

    // Manual FREEZE — never re-upgrade a deliberately manual node.
    if (existing?.source === 'manual') continue

    // Upgrade-only — skip when stored status is equal or higher.
    if (existing && STATUS_RANK[existing.status] >= STATUS_RANK[inc.status]) continue

    skills[nodeId] = {
      nodeId,
      status: inc.status,
      source: inc.source,
      updatedAt: now,
      notes: inc.notes,
    }
    changedNodeIds.push(nodeId)
  }

  return { skills, changedNodeIds }
}
