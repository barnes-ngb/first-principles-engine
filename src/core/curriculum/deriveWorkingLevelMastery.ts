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

import type { PrioritySkill, WorkingLevels } from '../types/evaluation'
import { MasteryGate } from '../types/enums'
import type { SightWordProgress } from '../types/books'
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

// ── Sight-word mastery → reading.phonics.sightWords ─────────────
//
// Chunk 2: the child's per-word `sightWordProgress` carries direct evidence of
// sight-word recognition that the working-level/spelling signal only approximates.
// Fold the *share of the active list* that is mastered into the one sight-word
// curriculum node — read-only over `sightWordProgress`, never writes it.

/** The single curriculum node sight-word progress informs. */
const SIGHT_WORDS_NODE_ID = 'reading.phonics.sightWords'

/**
 * Share of the child's active sight-word list that must be at `mastered` for the
 * node to read **Mastered**. **TUNABLE — flagged for Nathan.** Proposed 0.8 (80%).
 */
export const SIGHT_WORD_MASTERED_THRESHOLD = 0.8

/**
 * Minimum number of words showing *any* progress (anything past `new`) for the
 * node to read **InProgress** when the mastered share is below the threshold.
 * **TUNABLE — flagged for Nathan.** Proposed 1.
 */
export const SIGHT_WORD_INPROGRESS_MIN = 1

/**
 * Derive the sight-word node status from the child's active sight-word list.
 *
 * The list is the per-child `sightWordProgress` docs (each word's
 * `masteryLevel` ∈ `new | practicing | familiar | mastered`):
 * - mastered share `>= SIGHT_WORD_MASTERED_THRESHOLD` → node **Mastered**
 * - else `>= SIGHT_WORD_INPROGRESS_MIN` words past `new` → node **InProgress**
 * - an empty list (or an all-`new` list) contributes nothing.
 *
 * @returns `{ [SIGHT_WORDS_NODE_ID]: status }` or `{}` when nothing applies.
 */
export function deriveSightWordMastery(
  progress: SightWordProgress[] | null | undefined,
): Record<string, DerivedStatus> {
  const list = progress ?? []
  if (list.length === 0) return {}

  const mastered = list.filter((p) => p.masteryLevel === 'mastered').length
  const progressing = list.filter((p) => p.masteryLevel !== 'new').length

  if (mastered / list.length >= SIGHT_WORD_MASTERED_THRESHOLD) {
    return { [SIGHT_WORDS_NODE_ID]: SkillStatus.Mastered }
  }
  if (progressing >= SIGHT_WORD_INPROGRESS_MIN) {
    return { [SIGHT_WORDS_NODE_ID]: SkillStatus.InProgress }
  }
  return {}
}

// ── Snapshot priority-skill mastery → nodes ─────────────────────
//
// Chunk 2: a priority skill whose `masteryGate` has reached the top level
// (Independent + consistent) is, by definition, mastered. Route its tag to a
// curriculum node and imply **Mastered**. Read-only over `skillSnapshot`.

/** The mastery-gate level that counts as mastered (top of the 0–3 scale). */
const MASTERY_GATE_MASTERED = MasteryGate.IndependentConsistent

/**
 * Derive node mastery from a snapshot's priority skills.
 *
 * A skill contributes only when `masteryGate === MASTERY_GATE_MASTERED`; its tag
 * is routed to a curriculum node via {@link mapFindingToNode} and marked
 * **Mastered**. Skills below the gate, or whose tag resolves to no node, are
 * ignored.
 *
 * @returns nodeId → Mastered (only mastered-gate skills appear).
 */
export function deriveSnapshotPrioritySkillMastery(
  prioritySkills: PrioritySkill[] | null | undefined,
): Record<string, DerivedStatus> {
  const result: Record<string, DerivedStatus> = {}
  for (const skill of prioritySkills ?? []) {
    if (skill.masteryGate !== MASTERY_GATE_MASTERED) continue
    const nodeId = mapFindingToNode(skill.tag)
    if (!nodeId || !CURRICULUM_NODE_MAP[nodeId]) continue
    result[nodeId] = SkillStatus.Mastered
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
 * Chunk 2 adds two more `source: 'evaluation'` inputs on the same terms
 * (Mastered-wins when several inputs reach one node, upgrade-only into the stored
 * map, manual-frozen): **sight-word** list mastery (→ the one sight-word node) and
 * **snapshot priority-skill** mastery (gate-3 skills → their nodes). Both are
 * read-only over their sources.
 *
 * @param existingSkills stored `ChildSkillMap.skills` (not mutated).
 * @param workingLevels  the child's `skillSnapshot.workingLevels`.
 * @param completedPrograms the child's `skillSnapshot.completedPrograms`.
 * @param now ISO timestamp stamped on changed nodes (injectable for tests).
 * @param sightWordProgress the child's active `sightWordProgress` list (read-only).
 * @param prioritySkills the child's `skillSnapshot.prioritySkills` (read-only).
 */
export function applyReDerivedMastery(
  existingSkills: Record<string, SkillNodeStatus>,
  workingLevels: WorkingLevels | null | undefined,
  completedPrograms: string[] | null | undefined,
  now: string = new Date().toISOString(),
  sightWordProgress?: SightWordProgress[] | null,
  prioritySkills?: PrioritySkill[] | null,
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

  // Sight-word list mastery → the one sight-word node (Mastered-wins upgrade).
  for (const [nodeId, status] of Object.entries(deriveSightWordMastery(sightWordProgress))) {
    const existingIncoming = incoming[nodeId]
    if (existingIncoming && STATUS_RANK[existingIncoming.status] >= STATUS_RANK[status]) continue
    incoming[nodeId] = {
      status,
      source: 'evaluation',
      notes:
        status === SkillStatus.Mastered
          ? 'Implied mastered — sight-word list mostly mastered'
          : 'Working on — practicing the sight-word list',
    }
  }

  // Snapshot priority-skill mastery (gate-3) → their nodes (always Mastered).
  for (const [nodeId, status] of Object.entries(deriveSnapshotPrioritySkillMastery(prioritySkills))) {
    const existingIncoming = incoming[nodeId]
    if (existingIncoming && STATUS_RANK[existingIncoming.status] >= STATUS_RANK[status]) continue
    incoming[nodeId] = {
      status,
      source: 'evaluation',
      notes: 'Implied mastered — priority skill at mastery gate',
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
