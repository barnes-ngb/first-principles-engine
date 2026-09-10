/**
 * Bootstrap seeder (FEAT-48, slice 1) — the deterministic layer of the Learner
 * Model. Pure and read-only: it turns a child's existing derived signals into a
 * stored `LearnerModel` with `conceptStates` + evidence trails, implementing the
 * two curated graphs' own "Seeding this graph on day one" sections.
 *
 * Reuses, never re-derives:
 * - `SIGHT_WORD_MASTERED_THRESHOLD` (0.8) is imported verbatim (D7).
 * - Gate-3 priority skills and completed programs route through the same
 *   `mapFindingToNode` / `getNodesForProgram` bridges the Learning Map uses, so the
 *   two can never silently disagree (the FUNC-02 principle). A priority skill's
 *   curriculumMap answer is then resolved to foundations concept(s) by the one
 *   shared `curriculumNodeBridge` the guided eval uses (FIX-224 / UX-288).
 *
 * Seeding rules (per the graphs):
 * - **Band below working level → `solid`; at level → `frontier`; above → `not-yet`.**
 *   The working level maps to a frontier band per domain; nodes compare their band.
 * - **L7/L8 map by node id, not band:** `math.operations.regrouping` (L7) and
 *   `math.operations.multiTables` (L8) seed by comparing the math working level to
 *   7/8 directly (they sit in ordinary band-flow but are scope markers, not
 *   sequence claims).
 * - **Sight words:** mastered share ≥ threshold → `solid`; else `forming` (share
 *   carried in the evidence ref); empty list → `not-yet`.
 * - **Gate-3 priority skills / completed programs → `solid`** (strongest signal).
 * - **Evidence-only nodes** (reading fluency + comprehension strands, math Data &
 *   Patterns/Algebra/Problem-Solving strands, vocabulary/independent-reading with
 *   no working-level field) → `not-yet` with empty evidence; they await future
 *   evidence types (eval / quest / scan / attestation).
 *
 * **Invariant:** every non-`not-yet` state carries ≥1 EvidenceRef.
 * **Degrades gracefully:** a missing snapshot or map seeds from what exists and
 * never throws on sparse data.
 */

import type { ConceptGraph, ConceptNode } from './types'
import { foundationGraphVersion } from './index'
import { SIGHT_WORD_MASTERED_THRESHOLD } from '../curriculum/deriveWorkingLevelMastery'
import { getNodesForProgram, mapFindingToNode } from '../curriculum/mapFindingToNode'
import { resolveFoundationConcepts } from './curriculumNodeBridge'
import { MasteryGate } from '../types/enums'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  EvidenceRef,
  LearnerModel,
  ModalityCalibration,
  ProjectedWorkingLevels,
} from '../types/learnerModel'
import type { SkillSnapshot } from '../types/evaluation'
import type { SightWordProgress } from '../types/books'
import type { ChildSkillMap } from '../curriculum/skillStatus'
import { promotedModelStatus } from './modelStatus'

/** Single-band → ordinal. Range bands (`K-1`, `1-2`) never reach band seeding. */
const BAND_ORDER: Record<string, number> = { K: 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 }

/**
 * The working-level fields that drive band seeding — **one definition**, read by
 * {@link driverFor}, by {@link workingLevel} and by the re-projection's
 * "are the levels newer than the projection" decision (UX-291). A new driver key
 * added here fails to compile until every one of them accounts for it.
 */
export const WORKING_LEVEL_DRIVER_KEYS = ['phonics', 'writing', 'math'] as const
export type WorkingLevelDriverKey = (typeof WORKING_LEVEL_DRIVER_KEYS)[number]

/** Which working-level field drives a node, if any. */
type Driver =
  | { key: WorkingLevelDriverKey }
  | { key: 'math'; overrideLevel: 7 | 8 }
  | { key: 'sightWord' }
  | null

/**
 * Classify a node's seeding driver by strand prefix — no per-node list to drift
 * from the graph. Nodes with a `null` driver seed `not-yet` (evidence-only or
 * no working-level field).
 */
function driverFor(node: ConceptNode): Driver {
  const id = node.id
  if (node.domain === 'reading') {
    if (id === 'reading.phonics.sightWords') return { key: 'sightWord' }
    if (
      id.startsWith('reading.phonics.') ||
      id.startsWith('reading.print.') ||
      id.startsWith('reading.phonemic.') ||
      id.startsWith('reading.decoding.')
    ) {
      return { key: 'phonics' }
    }
    if (id.startsWith('reading.encoding.')) return { key: 'writing' }
    // fluency / vocabulary / comprehension / independent / critical → evidence-only
    return null
  }
  // math
  if (id === 'math.operations.regrouping') return { key: 'math', overrideLevel: 7 }
  if (id === 'math.operations.multiTables') return { key: 'math', overrideLevel: 8 }
  if (
    id.startsWith('math.data.') ||
    id.startsWith('math.algebra.') ||
    id === 'math.problemSolving' ||
    id === 'math.problemSolving.oneStep'
  ) {
    return null // Strands 8 & 9 — evidence-only
  }
  if (id.startsWith('math.')) return { key: 'math' }
  return null
}

/** Working level → frontier band (ordinal). `undefined` when no level exists. */
function levelToBand(key: WorkingLevelDriverKey, level: number | undefined): number | undefined {
  if (level == null) return undefined
  if (key === 'math') {
    // Monotonic; L7/L8 nudge up but those nodes are handled by node-id override.
    if (level <= 1) return 0
    if (level <= 3) return 1
    if (level === 4) return 2
    if (level === 5) return 3
    if (level <= 7) return 4
    return 5
  }
  // phonics / writing (spelling mirrors the phonics tile progression)
  if (level <= 1) return 0
  if (level <= 4) return 1
  if (level <= 6) return 2
  return 3
}

/**
 * A new band-seeding driver key must be given a slot on
 * {@link ProjectedWorkingLevels}, or this fails to compile. The UX-291 watermark
 * is per-field by construction (Codex round 2), so a key with nowhere to be
 * recorded would be a key whose changes are silently swallowed.
 */
export type DriverKeysHaveProjectionSlots = [
  Exclude<WorkingLevelDriverKey, keyof ProjectedWorkingLevels>,
  Exclude<keyof ProjectedWorkingLevels, WorkingLevelDriverKey>,
] extends [never, never]
  ? true
  : never

/**
 * The child's current levels for the keys that actually drive band seeding — the
 * UX-291 projection watermark's whole content. A `comprehension` or `sentence`
 * level changes no band-derived state, so it is not read: including it would cost
 * a write every time an unrelated level moved.
 *
 * A non-finite or absent level becomes an absent slot, so "no level" and "level
 * NaN" compare equal and neither is mistaken for a change.
 */
export function currentDrivingLevels(
  snapshot: SkillSnapshot | null,
): ProjectedWorkingLevels {
  const out: ProjectedWorkingLevels = {}
  for (const key of WORKING_LEVEL_DRIVER_KEYS) {
    const level = snapshot?.workingLevels?.[key]?.level
    if (typeof level === 'number' && Number.isFinite(level)) out[key] = level
  }
  return out
}

/** Read a working level for a domain key from the snapshot. */
function workingLevel(
  snapshot: SkillSnapshot | null,
  key: WorkingLevelDriverKey,
): number | undefined {
  return snapshot?.workingLevels?.[key]?.level
}

/**
 * Seed a single sight-word node from the child's active list. Returns `null` when
 * the list is empty (caller falls through to `not-yet`).
 */
function seedSightWords(
  sightWordData: SightWordProgress[] | null | undefined,
  now: string,
): ConceptStateEntry | null {
  const list = sightWordData ?? []
  if (list.length === 0) return null
  const mastered = list.filter((w) => w.masteryLevel === 'mastered').length
  const share = mastered / list.length
  const pct = Math.round(share * 100)
  const evidence: EvidenceRef = {
    kind: 'sightWordShare',
    sourceId: 'sightWordProgress',
    note: `${mastered}/${list.length} sight words mastered (${pct}%)`,
    observedAt: now,
    domain: 'reading',
    masteredShare: share,
  }
  const state: ConceptStateKind = share >= SIGHT_WORD_MASTERED_THRESHOLD ? 'solid' : 'forming'
  return { state, evidence: [evidence], seededAt: now }
}

/** Deterministic modality calibration from the same fields the Dad Lab paragraph reads. */
function buildModalityCalibration(snapshot: SkillSnapshot | null): ModalityCalibration {
  const reading = workingLevel(snapshot, 'phonics') ?? snapshot?.workingLevels?.comprehension?.level
  const writing = workingLevel(snapshot, 'writing') ?? snapshot?.workingLevels?.sentence?.level
  const math = workingLevel(snapshot, 'math')
  return {
    reading: {
      level: reading,
      note:
        reading != null
          ? `Reads around working level ${reading} — put short reading in activities at this level.`
          : 'Read aloud together and let understanding lead — reading grows in activities, at level.',
    },
    writing: {
      level: writing,
      note:
        writing != null
          ? `Spells around working level ${writing} — scribe by default; tiles and dictation count fully.`
          : 'Scribe by default; dictation and tiles count fully — writing is a modality, not a mastery gate.',
    },
    math: {
      level: math,
      note:
        math != null
          ? `Works math around level ${math} — heard-aloud word problems count fully.`
          : 'Math grows through hands-on work — heard-aloud word problems count fully.',
    },
  }
}

/**
 * The `workingLevel` EvidenceRef the band pass stamps. One definition, so the
 * seeder and the re-projection cannot word the same fact differently.
 */
function workingLevelEvidenceRef(
  childId: string,
  domain: string,
  level: number,
  below: boolean,
  now: string,
): EvidenceRef {
  return {
    kind: 'workingLevel',
    sourceId: `skillSnapshot:${childId}`,
    note: below ? `Below ${domain} working level ${level}` : `At ${domain} working level ${level}`,
    observedAt: now,
    domain,
    level,
  }
}

/**
 * **The band pass, on its own** — the one definition of *what a working level says
 * about a concept*, extracted so it can be run twice: once by
 * {@link seedLearnerModel} at creation, and once by the re-projection that keeps
 * the terrain moving after a level does (UX-291).
 *
 * Returns an entry for **exactly** the nodes a working level drives — the
 * band-flow nodes plus the two L7/L8 scope markers — and nothing else. A
 * sight-word node, an evidence-only node and a node the seeder resolves from a
 * priority skill or a completed program are all absent from the result, because
 * none of them is a band-derived state and a projection has no business touching
 * them. (Sight-word mastery has the same frozen-at-seed-time defect and its own
 * ledger row, UX-293; it is deliberately not folded in here.)
 *
 * With no level for a domain, every node that domain drives comes back
 * `not-yet` with empty evidence — the seeder's own behaviour, and what makes
 * "never demote on absence" fall out of the projection's upgrade-only rule
 * rather than needing a second guard.
 */
export function projectWorkingLevelStates(
  graphs: ConceptGraph[],
  childId: string,
  snapshot: SkillSnapshot | null,
  now: string,
): Record<string, ConceptStateEntry> {
  const out: Record<string, ConceptStateEntry> = {}
  const notYet = (): ConceptStateEntry => ({ state: 'not-yet', evidence: [], seededAt: now })

  for (const node of graphs.flatMap((g) => g.nodes)) {
    const driver = driverFor(node)
    if (driver == null || driver.key === 'sightWord') continue

    // L7/L8 node-id override (regrouping / multiTables).
    if ('overrideLevel' in driver) {
      const level = workingLevel(snapshot, 'math')
      const T = driver.overrideLevel
      if (level == null || level < T) {
        out[node.id] = notYet()
      } else if (level === T) {
        out[node.id] = {
          state: 'frontier',
          evidence: [workingLevelEvidenceRef(childId, 'math', level, false, now)],
          seededAt: now,
        }
      } else {
        out[node.id] = {
          state: 'solid',
          evidence: [workingLevelEvidenceRef(childId, 'math', level, true, now)],
          seededAt: now,
        }
      }
      continue
    }

    // Ordinary band seeding.
    const level = workingLevel(snapshot, driver.key)
    const frontierBand = levelToBand(driver.key, level)
    const nodeBand = BAND_ORDER[node.band]
    if (frontierBand == null || nodeBand == null) {
      out[node.id] = notYet()
    } else if (nodeBand < frontierBand) {
      out[node.id] = {
        state: 'solid',
        evidence: [workingLevelEvidenceRef(childId, driver.key, level as number, true, now)],
        seededAt: now,
      }
    } else if (nodeBand === frontierBand) {
      out[node.id] = {
        state: 'frontier',
        evidence: [workingLevelEvidenceRef(childId, driver.key, level as number, false, now)],
        seededAt: now,
      }
    } else {
      out[node.id] = notYet()
    }
  }
  return out
}

/** Options that keep the seeder pure and testable. */
export interface SeedOptions {
  /** ISO timestamp stamped on every seeded entry (injectable for tests). */
  now?: string
}

/**
 * Build a fresh (unmerged) LearnerModel from the child's derived signals.
 *
 * @param graphs the foundation graphs to project onto (both domains).
 * @param childId the child this model is keyed to.
 * @param snapshot the child's `skillSnapshots/{childId}` doc (or null).
 * @param _skillMap the child's `childSkillMaps/{childId}` doc (or null). Accepted
 *        for the read-contract and future finding-derived evidence; slice 1 seeds
 *        from the snapshot + sight words, whose signals already fold into the map.
 * @param sightWordData the child's active `sightWordProgress` list (or null).
 */
export function seedLearnerModel(
  graphs: ConceptGraph[],
  childId: string,
  snapshot: SkillSnapshot | null,
  _skillMap: ChildSkillMap | null,
  sightWordData: SightWordProgress[] | null,
  opts: SeedOptions = {},
): LearnerModel {
  const now = opts.now ?? new Date().toISOString()

  // Gate-3 priority skills → concept id → skill label (strongest signal).
  //
  // FIX-224 / UX-288: this Map is keyed by `mapFindingToNode`'s answer and looked
  // up below by **foundations graph node id**, so a tag answering with a
  // curriculumMap-only id (`math.operations.addSub` / `multDiv`) set a key no
  // node ever has and seeded nothing — silently. Lincoln's own default priority
  // skill, `math.subtraction.regroup`, is one of them. The shared
  // `resolveFoundationConcepts` turns that answer into the concept(s) the tag
  // actually names, or none where its detail cannot say which.
  const prioritySkillNodes = new Map<string, string>()
  for (const skill of snapshot?.prioritySkills ?? []) {
    if (skill.masteryGate !== MasteryGate.IndependentConsistent) continue
    const { conceptIds } = resolveFoundationConcepts(mapFindingToNode(skill.tag), skill.tag)
    for (const conceptId of conceptIds) prioritySkillNodes.set(conceptId, skill.label)
  }

  // Completed programs → node id → program id.
  const programNodes = new Map<string, string>()
  for (const programId of snapshot?.completedPrograms ?? []) {
    for (const nodeId of getNodesForProgram(programId)) {
      if (!programNodes.has(nodeId)) programNodes.set(nodeId, programId)
    }
  }

  const conceptStates: Record<string, ConceptStateEntry> = {}
  const notYet = (): ConceptStateEntry => ({ state: 'not-yet', evidence: [], seededAt: now })

  // Steps 5 & 6 below are the band pass, and it has ONE definition (UX-291) —
  // this call — because the re-projection runs the same rule on newer levels.
  const banded = projectWorkingLevelStates(graphs, childId, snapshot, now)

  for (const node of graphs.flatMap((g) => g.nodes)) {
    // 1) Gate-3 priority skill wins outright.
    const prioLabel = prioritySkillNodes.get(node.id)
    if (prioLabel) {
      conceptStates[node.id] = {
        state: 'solid',
        evidence: [
          {
            kind: 'prioritySkill',
            sourceId: `skillSnapshot:${childId}`,
            note: `Priority skill at mastery gate: ${prioLabel}`,
            observedAt: now,
          },
        ],
        seededAt: now,
      }
      continue
    }

    // 2) Completed program.
    const programId = programNodes.get(node.id)
    if (programId) {
      conceptStates[node.id] = {
        state: 'solid',
        evidence: [
          {
            kind: 'completedProgram',
            sourceId: programId,
            note: `Completed program: ${programId}`,
            observedAt: now,
          },
        ],
        seededAt: now,
      }
      continue
    }

    const driver = driverFor(node)

    // 3) Sight-word node.
    if (driver?.key === 'sightWord') {
      conceptStates[node.id] = seedSightWords(sightWordData, now) ?? notYet()
      continue
    }

    // 4) Evidence-only / no-driver nodes.
    if (driver == null) {
      conceptStates[node.id] = notYet()
      continue
    }

    // 5 & 6) Band seeding (L7/L8 node-id override included) — the shared pass.
    conceptStates[node.id] = banded[node.id] ?? notYet()
  }

  const hasSignal =
    (snapshot?.workingLevels && Object.keys(snapshot.workingLevels).length > 0) ||
    (snapshot?.prioritySkills?.length ?? 0) > 0 ||
    (snapshot?.completedPrograms?.length ?? 0) > 0 ||
    (sightWordData?.length ?? 0) > 0

  return {
    childId,
    graphVersion: foundationGraphVersion(),
    status: hasSignal ? 'seeded' : 'no-data',
    conceptStates,
    modalityCalibration: buildModalityCalibration(snapshot),
    whatMattersNext: [],
    changeFeed: [],
    openQuestions: [],
    // The seed IS a projection, so it records the levels it projected from
    // (UX-291, Codex round 2). Without this a freshly created model would carry
    // no watermark, and falling back to its `seededAt` wall clock could mark a
    // level that landed during the seed's own read window as already processed.
    projectedThrough: currentDrivingLevels(snapshot),
    seededAt: now,
    updatedAt: now,
  }
}

/**
 * The four evidence kinds this seeder **derives**, and therefore the only ones a
 * re-seed may safely recompute. Written as the *derivable* list rather than as an
 * allow-list of things to keep, so a new {@link EvidenceKind} is **preserved by
 * default** (UX-290): the failure mode of forgetting to add a kind here is a
 * redundant preserve, never a destroyed record of something that happened.
 *
 * Pinned from the seeder's own side by `seedLearnerModel.test.ts` — a rich seed's
 * emitted kinds must all appear here.
 */
const SEEDER_DERIVED_EVIDENCE: ReadonlySet<string> = new Set([
  'workingLevel',
  'sightWordShare',
  'prioritySkill',
  'completedProgram',
])

/**
 * True when the entry carries at least one ref the seeder cannot re-derive — a
 * parent `attestation`, a `curriculumPosition`, a guided eval's read, a Knowledge
 * Mine result, a scan.
 *
 * Exported because the UX-290 preserve rule has **two** consumers now: the
 * re-seed's {@link mergeSeededModel}, and the UX-291 re-projection, which refuses
 * to move such a concept at any level change. Two copies of this predicate would
 * be two answers to "may a derived writer overwrite what someone witnessed".
 */
export function carriesNonDerivableEvidence(entry: ConceptStateEntry): boolean {
  return Boolean(entry.evidence?.some((e) => !SEEDER_DERIVED_EVIDENCE.has(e.kind)))
}

/**
 * The `status` a re-seed leaves behind. **A re-seed never demotes** (Codex round
 * 1): spreading the fresh seed's status straight through meant that re-seeding a
 * `seeded` or `synthesized` model on a day its snapshot and sight-word inputs
 * happened to carry no signal stamped it `no-data` — while the merge above was
 * busy *preserving* that model's attestation / eval / quest evidence. The five
 * status-keyed consumers would then read an evidence-bearing model as absent,
 * which is UX-322's defect arriving through a second door. (It also quietly
 * demoted `synthesized` → `seeded` on every re-seed, since `synthesis` itself is
 * preserved below.)
 *
 * So an established status stands, and a `no-data` one is promoted by the SAME
 * shared rule every incremental writer uses — read against the **merged** states,
 * because those are what the document will hold.
 */
function mergedStatus(
  existing: LearnerModel,
  seeded: LearnerModel,
  mergedStates: Record<string, ConceptStateEntry>,
): LearnerModel['status'] {
  if (existing.status && existing.status !== 'no-data') return existing.status
  return (
    promotedModelStatus({ ...seeded, conceptStates: mergedStates }) ?? seeded.status
  )
}

/**
 * Merge a freshly seeded model over an existing stored one, **preserving any
 * concept carrying evidence the seeder cannot re-derive** — a parent
 * `attestation` ("I've seen it"), a `curriculumPosition` ("covered in Fast
 * Phonics"), a guided eval's read, a Knowledge Mine result, a scan.
 *
 * **UX-290 widened this rule.** It used to name `attestation` and
 * `curriculumPosition` only, so a concept whose evidence was an `eval` or a
 * `quest` ref was replaced wholesale by the fresh seed — and for the nodes the
 * seeder has no driver for, the fresh seed is `{state:'not-yet', evidence:[]}`.
 * A guided evaluation's read and a Mine session's result were both erasable by a
 * button press. The rule is now stated as *"not re-derivable"* against
 * {@link SEEDER_DERIVED_EVIDENCE}: the seeder recomputes what it derives from the
 * snapshot and the sight-word list, and everything else is a record of something
 * that happened and survives.
 *
 * Likewise the judgment arrays — `openQuestions` (queued kid-facing checks) and
 * `changeFeed` (the "what moved" log) — are appended by the incremental writers
 * and emptied by the seeder; carry the existing ones forward so a re-seed does not
 * erase a queued test or the change history. Concept *states* (the recomputable
 * part) still come from the fresh seed except where a preserved entry above pins
 * them.
 *
 * **UX-290's other half is now closed on the automatic path and open only on this
 * one (UX-291).** The re-*projection* — the thing that actually moves a band-derived
 * state after a working level moves, and therefore the source of the biggest
 * movements in the model — appends a `changeFeed` line for every transition it
 * performs (`workingLevelProjection.ts`). This wholesale re-seed still does not:
 * it recomputes every band-derived state at once, so the feed it would emit is a
 * diff of the whole deterministic layer rather than a record of something that
 * happened. It is reachable only from the `?diag=1` button, which is a deliberate
 * operator act on a panel whose own docstring says it exists to prove the model.
 */
export function mergeSeededModel(
  existing: LearnerModel | null | undefined,
  seeded: LearnerModel,
): LearnerModel {
  if (!existing) return seeded
  const merged: Record<string, ConceptStateEntry> = { ...seeded.conceptStates }
  for (const [nodeId, entry] of Object.entries(existing.conceptStates ?? {})) {
    if (carriesNonDerivableEvidence(entry)) merged[nodeId] = entry
  }
  return {
    ...seeded,
    conceptStates: merged,
    status: mergedStatus(existing, seeded, merged),
    // Carry forward chat-appended judgment arrays the seeder empties.
    openQuestions:
      existing.openQuestions?.length ? existing.openQuestions : seeded.openQuestions,
    changeFeed: existing.changeFeed?.length ? existing.changeFeed : seeded.changeFeed,
    // Preserve the LLM synthesis (the seeder never produces one) but mark it stale:
    // a re-seed recomputed concept states, so whatMattersNext/narrative are behind
    // and the next beat should regenerate them (FEAT-57, D4).
    synthesis: existing.synthesis,
    synthesisStaleAt: seeded.updatedAt,
    // Keep the original seededAt; this write is an update.
    seededAt: existing.seededAt ?? seeded.seededAt,
  }
}
