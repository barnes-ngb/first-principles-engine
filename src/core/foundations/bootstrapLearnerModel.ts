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
import type { ChildSkillMap } from '../curriculum/skillStatus'
import type { LearnerModel } from '../types/learnerModel'
import type { SightWordProgress, SkillSnapshot } from '../types'

/** Which of the two callers this is. See the header. */
export type BootstrapMode = 'create-only' | 'reseed'

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
): Promise<LearnerModel> {
  // Inputs — read outside the transaction. They are not the contended document,
  // and the sight-word read is a collection query, which a transaction cannot run.
  const snapRef = doc(skillSnapshotsCollection(familyId), childId)
  const mapRef = doc(childSkillMapsCollection(familyId), childId)
  const modelRef = doc(learnerModelsCollection(familyId), childId)
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
