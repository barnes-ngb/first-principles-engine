// ── The one way a learner model comes into existence (UX-286) ─────────────
//
// `seedLearnerModel` had exactly one caller — `FoundationsDiagPanel.seedChild`,
// behind `canEdit` **and** `?diag=1`, in a panel whose own docstring says it
// "exists only to prove the model". Every other writer opens with
// `if (!snap.exists()) return`, the synthesis beat returns `skipped-no-model`, and
// `buildLearnerModelSlice` returns `""`. So on a family that has never typed that
// URL flag the engine's central document does not exist and every consumer
// degrades silently to nothing.
//
// This module is that seed-a-child body, extracted verbatim so there is **one
// definition** of it (the `writeReviewAction.ts` precedent) rather than a copy per
// trigger. It does not decide *when* to run — the diag panel calls it as a
// deliberate re-seed, the Foundations tab calls it once, create-only, when the
// snapshot resolves absent.
//
// Reads `skillSnapshots` / `childSkillMaps` / `sightWordProgress` / the existing
// `learnerModels` doc. Writes **only** `learnerModels` (merge). No
// `skillSnapshots`, no `childSkillMaps`, no XP, no hours, no compliance, no LLM.
//
// **Racing two callers is safe by construction, not by luck.** The write re-reads
// the existing document inside this function and folds it through
// `mergeSeededModel`, so a document that appeared between the caller's decision
// and this write is merged, not replaced — and since UX-290 that merge preserves
// every evidence ref the seeder cannot re-derive. Callers still guard (a wasted
// round of four reads is worth avoiding); this is the floor under the guard.

import { doc, getDoc, getDocs, query, runTransaction } from 'firebase/firestore'

import {
  childSkillMapsCollection,
  db,
  learnerModelsCollection,
  sightWordProgressCollection,
  skillSnapshotsCollection,
} from '../firebase/firestore'
import { foundationGraphs } from './index'
import { mergeSeededModel, seedLearnerModel } from './seedLearnerModel'
import { promotedModelStatus } from './modelStatus'
import {
  applyWorkingLevelProjection,
  newestDrivingLevelStamp,
  shouldReprojectWorkingLevels,
} from './workingLevelProjection'
import type { ChildSkillMap } from '../curriculum/skillStatus'
import type { LearnerModel } from '../types/learnerModel'
import type { SightWordProgress, SkillSnapshot } from '../types'

/**
 * Which caller this is. See the header.
 *
 * - `'create-only'` — the Foundations tab's once-per-child create. A document
 *   that appeared meanwhile is left exactly as it is.
 * - `'reseed'` — the `?diag=1` button. Recomputes everything and folds it through
 *   {@link mergeSeededModel}.
 * - `'reproject'` — the narrow refresh (UX-291). Recomputes the **band-derived**
 *   states only, from the child's current working levels, and only when those
 *   levels are newer than the last projection. Never creates a document, never
 *   reads the skill map or the sight-word list, never demotes, and writes nothing
 *   at all when the levels have not moved.
 */
export type BootstrapMode = 'create-only' | 'reseed' | 'reproject'

/**
 * Seed (or re-seed) one child's `learnerModels/{childId}` from their derived
 * signals and return the model the document now holds.
 *
 * Throws on failure — callers decide how to surface it. There is no swallowed
 * error here: a bootstrap that silently did nothing is the defect this exists to
 * remove.
 */
export async function bootstrapLearnerModel(
  familyId: string,
  childId: string,
  mode: BootstrapMode = 'create-only',
): Promise<LearnerModel | null> {
  const snapRef = doc(skillSnapshotsCollection(familyId), childId)
  const mapRef = doc(childSkillMapsCollection(familyId), childId)
  const modelRef = doc(learnerModelsCollection(familyId), childId)

  // The narrow path (UX-291). It reads ONE input — the snapshot the levels live
  // on — because a projection of working levels needs nothing else, and a page
  // view is not worth four reads.
  if (mode === 'reproject') {
    return reprojectWorkingLevels(childId, snapRef, modelRef)
  }

  // Inputs — read outside the transaction. They are not the contended document,
  // and the sight-word read is a collection query, which a transaction cannot run.
  const [snapDoc, mapDoc, swSnap] = await Promise.all([
    getDoc(snapRef),
    getDoc(mapRef),
    getDocs(query(sightWordProgressCollection(familyId))),
  ])

  const snapshot: SkillSnapshot | null = snapDoc.exists()
    ? (snapDoc.data() as SkillSnapshot)
    : null
  const skillMap: ChildSkillMap | null = mapDoc.exists()
    ? (mapDoc.data() as ChildSkillMap)
    : null
  const sightWords: SightWordProgress[] = swSnap.docs
    .filter((d) => d.id.startsWith(`${childId}_`))
    .map((d) => d.data() as SightWordProgress)

  const fresh = seedLearnerModel(foundationGraphs, childId, snapshot, skillMap, sightWords)

  // The contended document is read AND written in one unit, so a concurrent
  // incremental write is not overwritten by a stale seed.
  return runTransaction(db, async (tx) => {
    const existingDoc = await tx.get(modelRef)
    const existing = existingDoc.exists() ? (existingDoc.data() as LearnerModel) : null

    // A document that appeared since the caller decided is left exactly as it is.
    if (mode === 'create-only' && existing) return existing

    const merged = mergeSeededModel(existing, fresh)
    // Writes ONLY learnerModels (merge).
    tx.set(modelRef, merged, { merge: true })
    return merged
  })
}

/**
 * Recompute the band-derived concept states from the child's current working
 * levels (UX-291). Returns the model the document now holds, or `null` when there
 * is no model to project onto — this mode never creates one.
 *
 * **Both documents are read inside the transaction** (Codex round 1). The skill
 * snapshot is the projection's *input*, so reading it outside opened a window: a
 * quest finishing on another device between that read and the commit would be
 * projected from the older snapshot and then watermarked as processed, and the
 * next visit would skip it — UX-291's own defect through a narrower door. Both
 * are plain document gets, which a web-SDK transaction can do; the seed path's
 * reads stay outside only because one of them is a collection query, which it
 * cannot.
 *
 * **The watermark is the level stamp that was actually projected, never `now`** —
 * see `lastProjectionStamp`. A wall clock could watermark past a level this
 * projection never read.
 *
 * Three write shapes, and only three:
 *   - levels not newer      → no write at all;
 *   - levels newer, nothing moved (every affected concept is already at or above
 *     what the level says, or carries witnessed evidence) → `projectedThrough`
 *     alone, so the same no-op is not recomputed on every later visit;
 *   - states moved          → states + `changeFeed` + `updatedAt` +
 *     `projectedThrough` + `synthesisStaleAt` (FEAT-57 D4), and the shared
 *     `promotedModelStatus` rule (UX-322) applied rather than re-implemented.
 */
async function reprojectWorkingLevels(
  childId: string,
  snapRef: ReturnType<typeof doc>,
  modelRef: ReturnType<typeof doc>,
): Promise<LearnerModel | null> {
  return runTransaction(db, async (tx) => {
    // Every read before any write, as Firestore requires.
    const existingDoc = await tx.get(modelRef)
    if (!existingDoc.exists()) return null
    const existing = existingDoc.data() as LearnerModel

    const snapDoc = await tx.get(snapRef)
    // No snapshot means no working levels, and a projection with no levels is a
    // projection of `not-yet` — which the upgrade-only fold would discard anyway.
    if (!snapDoc.exists()) return existing
    const snapshot = snapDoc.data() as SkillSnapshot

    if (!shouldReprojectWorkingLevels(existing, snapshot)) return existing

    // The watermark: exactly the newest level this projection is computed from.
    const projectedThrough = newestDrivingLevelStamp(snapshot) as string
    const now = new Date().toISOString()
    const { model: next, changedConceptIds } = applyWorkingLevelProjection(
      existing,
      foundationGraphs,
      childId,
      snapshot,
      now,
    )

    if (changedConceptIds.length === 0) {
      // Record what was projected, and nothing else — no `updatedAt`, no
      // `synthesisStaleAt`, no feed line.
      tx.set(modelRef, { projectedThrough }, { merge: true })
      return { ...existing, projectedThrough }
    }

    const payload: LearnerModel = { ...next, projectedThrough, synthesisStaleAt: now }
    const promoted = promotedModelStatus(payload)
    if (promoted) payload.status = promoted

    // Merge-only, JSON-scrubbed to drop any `undefined` (Firestore rejects them),
    // exactly like every other model writer.
    tx.set(modelRef, JSON.parse(JSON.stringify(payload)), { merge: true })
    return payload
  })
}
