// ── The map moves when the child moves (UX-291) ───────────────────────────
//
// `skillSnapshots.workingLevels` is written **live** — by a Knowledge Mine
// session (`quest/workingLevels.ts`), by a guided evaluation, by a scan
// (`updateWorkingLevelFromScan`) and by the manual Skill Snapshot stepper. The
// only thing that ever turned a working level into a concept *state* was
// `seedLearnerModel`'s band pass, and that runs once, at creation. So a child's
// phonics level could climb three rungs and every band-seeded concept kept the
// state it was given the day the document was made.
//
// The owner's own screen is the statement of the defect: `/progress?diag=1`,
// London, 2026-09-09 — `seededAt 2026-07-06`, and every solid and frontier row
// still reading "Below phonics working level 5" two months later. That is what
// "the engine is moving very slowly" was: not a thin graph and not a missing
// document, but a stale projection.
//
// **This is a projection, not a re-seed.** It recomputes the band-derived states
// and nothing else. It does not touch sight words (UX-293, its own row), priority
// skills, completed programs, the modality calibration, or any concept a person
// or a higher-confidence writer has put a mark on. Four rules, all asserted:
//
//   1. **A witnessed concept is never moved.** An entry carrying an
//      `attestation` / `curriculumPosition` / `eval` / `quest` / `scan` ref is
//      skipped outright — no state, no evidence, no feed line. That is UX-290's
//      guarantee, and a projection is the writer most likely to break it, because
//      it sweeps the whole deterministic layer rather than one concept.
//   2. **Upgrade-only**, on the same `STATE_RANK` every other derived writer uses
//      (`questTargeting`, `workbookPositionSync`). Only the guided eval may move a
//      concept down, because only it assessed the child. "Never demote on absence"
//      — a level that has not been re-measured is not a level that dropped —
//      falls out of this rather than needing a guard of its own: with no level,
//      the band pass returns `not-yet` (rank 0), which can never win.
//   3. **Every move leaves a `changeFeed` line.** This is UX-290's open half, and
//      it is closed here rather than left: a projection that moved states silently
//      would make the change log lie about the largest movements in the model.
//   4. **A no-op is a no-op.** Levels no newer than the projection's watermark do
//      no work and write nothing — no feed line, no `updatedAt`, no
//      `synthesisStaleAt`. Without that, the trigger below (a page view) would
//      mark the synthesis stale on every visit and the weekly beat would
//      regenerate forever. The watermark is the newest level stamp actually
//      projected, never a wall clock — see `lastProjectionStamp`.
//
// Pure. The write is `bootstrapLearnerModel`'s `'reproject'` mode.

import { projectWorkingLevelStates, carriesNonDerivableEvidence, WORKING_LEVEL_DRIVER_KEYS } from './seedLearnerModel'
import { FOUNDATION_NODE_MAP } from './index'
import type { ConceptGraph } from './types'
import type {
  ConceptStateEntry,
  ConceptStateKind,
  LearnerModel,
} from '../types/learnerModel'
import type { SkillSnapshot } from '../types/evaluation'

/** solid > forming > frontier > not-yet — the repo's one ordering. */
const STATE_RANK: Record<ConceptStateKind, number> = {
  'not-yet': 0,
  frontier: 1,
  forming: 2,
  solid: 3,
}

/**
 * The **newest** `WorkingLevel.updatedAt` among the levels that actually drive
 * band seeding ({@link WORKING_LEVEL_DRIVER_KEYS}), or `undefined` when none of
 * them carries a usable stamp.
 *
 * Only the driving levels are read: a `comprehension` or `sentence` level moving
 * changes no band-derived state, so it must not cost a write.
 *
 * A level with no usable `updatedAt` is skipped rather than counted. An absent
 * stamp is not evidence that something moved, and treating it as one would
 * re-run the projection on every page view for the life of the document.
 */
export function newestDrivingLevelStamp(
  snapshot: SkillSnapshot | null,
): string | undefined {
  let newest: string | undefined
  for (const key of WORKING_LEVEL_DRIVER_KEYS) {
    const updatedAt = snapshot?.workingLevels?.[key]?.updatedAt
    if (typeof updatedAt !== 'string' || updatedAt === '') continue
    if (newest === undefined || updatedAt > newest) newest = updatedAt
  }
  return newest
}

/**
 * The watermark a projection is measured against: **the newest working level it
 * has already been computed from**.
 *
 * `projectedThrough` is its own field rather than a re-use of `seededAt` **on
 * purpose** (UX-322's lesson): `seededAt` means *when this document was created*,
 * several places read it that way, and a field whose meaning drifts because a
 * second writer needed somewhere to put something is exactly how that defect was
 * made. A model written before this feature existed has no `projectedThrough`,
 * and its `seededAt` is the honest baseline for it.
 *
 * **It stores a level's stamp, not a wall clock** (Codex round 1), and it is
 * named for that. Stamping `new Date().toISOString()` would have watermarked past
 * levels this projection never read — a quest finishing on another device between
 * the read and the commit, or simply a writing device whose clock runs behind
 * this one. Either way the next visit would compare the unseen level's stamp to a
 * *later* watermark, conclude it was already processed, and leave the map stale
 * until some other level moved: UX-291's own defect, arriving through a narrower
 * door.
 */
export function lastProjectionStamp(model: LearnerModel): string {
  return model.projectedThrough ?? model.seededAt ?? ''
}

/** Are the child's working levels newer than the last projection's watermark? */
export function shouldReprojectWorkingLevels(
  model: LearnerModel,
  snapshot: SkillSnapshot | null,
): boolean {
  const newest = newestDrivingLevelStamp(snapshot)
  return newest !== undefined && newest > lastProjectionStamp(model)
}

/** The deterministic `changeFeed` cause for a projected move. Upgrades only, so no down-wording is needed. */
function projectionCause(conceptId: string, domain: string, level: number, to: ConceptStateKind): string {
  const kidName = FOUNDATION_NODE_MAP[conceptId]?.kidName ?? conceptId
  return `working level: ${domain} now at level ${level} — "${kidName}" → ${to}`
}

export interface AppliedWorkingLevelProjection {
  model: LearnerModel
  /** Concept ids whose state actually moved. Empty ⇒ the caller must write nothing. */
  changedConceptIds: string[]
}

/**
 * Fold the current working levels' band pass into a stored model (pure,
 * merge-shaped). Concepts the pass does not cover, concepts carrying witnessed
 * evidence, and concepts the pass does not *raise* are all left byte-identical —
 * so a projection that moves nothing returns the model it was handed, and the
 * caller can compare identity as well as the id list.
 *
 * `updatedAt` moves only when something did. `synthesisStaleAt`, `projectedThrough` and
 * the `status` promotion are the writer's to stamp — this function is the fold.
 */
export function applyWorkingLevelProjection(
  model: LearnerModel,
  graphs: ConceptGraph[],
  childId: string,
  snapshot: SkillSnapshot | null,
  nowIso: string,
): AppliedWorkingLevelProjection {
  const banded = projectWorkingLevelStates(graphs, childId, snapshot, nowIso)
  const conceptStates = { ...model.conceptStates }
  const changeFeed = [...(model.changeFeed ?? [])]
  const changedConceptIds: string[] = []

  for (const [conceptId, projected] of Object.entries(banded)) {
    const prev: ConceptStateEntry | undefined = conceptStates[conceptId]

    // Rule 1 — a witnessed concept is never moved by a projection.
    if (prev && carriesNonDerivableEvidence(prev)) continue

    const fromState: ConceptStateKind = prev?.state ?? 'not-yet'
    // Rule 2 — upgrade-only.
    if (STATE_RANK[projected.state] <= STATE_RANK[fromState]) continue

    const ref = projected.evidence[0]
    // The band pass stamps exactly one `workingLevel` ref on every state it
    // raises; a raised state with none would break the "every non-`not-yet`
    // state carries evidence" invariant, so it is skipped rather than written.
    if (!ref) continue

    conceptStates[conceptId] = {
      ...prev,
      state: projected.state,
      // Evidence is a trail, so the new reading is APPENDED — the stale
      // "Below phonics working level 5" stays as the record of what was true then.
      evidence: [...(prev?.evidence ?? []), ref],
      seededAt: prev?.seededAt ?? projected.seededAt,
    }
    changedConceptIds.push(conceptId)
    // Rule 3 — every move leaves a line.
    changeFeed.push({
      conceptId,
      from: fromState,
      to: projected.state,
      cause: projectionCause(conceptId, ref.domain ?? '', ref.level ?? 0, projected.state),
      at: nowIso,
    })
  }

  // Rule 4 — nothing moved, so nothing changes. Same object, not a copy.
  if (changedConceptIds.length === 0) return { model, changedConceptIds }

  return {
    model: { ...model, conceptStates, changeFeed, updatedAt: nowIso },
    changedConceptIds,
  }
}
