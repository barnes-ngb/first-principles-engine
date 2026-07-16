// ── Daily "stuck" signal → learner-model re-test enqueue (FEAT-68) ────────
//
// The thin async writer the Today mastery chip calls. When a completed checklist
// item is marked "stuck", `resolveStuckConcepts` (pure, core) turns the item's
// bridged workbook position into the frontier concept(s) the child is working on;
// this writer enqueues an `openQuestion{ routedTo:'quest' }` per concept onto
// `learnerModels/{childId}` so the next Knowledge Mine session re-tests it
// (`selectQuestTargets` → `applyQuestResultsToModel`, upgrade-only, no-shame).
//
// It REUSES the existing `applyReviewActionToModel` `queueTest` path (the same
// `withOpenQuestion` dedup + `changeFeed` semantics the Foundations Review Chat
// writes) — no forked write path. `learnerModels`-only, merge-only, and
// FIRE-AND-FORGET by design (mirrors `workbookPositionSync` / `questModelSync`): it
// NEVER blocks or fails the chip tap. The parallel `skillSnapshots.conceptualBlock`
// write in `TodayChecklist.handleMasteryChip` is untouched — the two targeting
// systems coexist, deliberately not unified (see `questTargeting.ts:16-19`).

import { doc, getDoc, setDoc } from 'firebase/firestore'

import { learnerModelsCollection } from '../../core/firebase/firestore'
import { applyReviewActionToModel } from '../foundations-review/foundationsReviewActions'
import type { LearnerModel } from '../../core/types/learnerModel'

/** The `openQuestion.reason` stamped on a daily-signal re-test (parent-facing). */
export const STUCK_RETEST_REASON = "Struggled during today's work"

/**
 * Enqueue a `routedTo:'quest'` re-test ask per concept onto the child's learner
 * model, merge-only. No-op when `concepts` is empty or the model has not been seeded
 * (`no-model` — the diag/review seed path owns creation). Dedup (via
 * `withOpenQuestion`) means repeated struggles on the same concept don't pile up
 * asks. Fire-and-forget: any failure is swallowed with a warning so a struggle chip
 * tap is never blocked or reverted.
 */
export async function enqueueStuckRetests(
  familyId: string,
  childId: string,
  concepts: string[],
  nowIso: string,
): Promise<void> {
  if (!familyId || !childId || concepts.length === 0) return
  try {
    const modelRef = doc(learnerModelsCollection(familyId), childId)
    const snap = await getDoc(modelRef)
    if (!snap.exists()) return // seed the model first (diag / review chat)

    let model = snap.data() as LearnerModel
    for (const conceptId of concepts) {
      // Reuse the Review-Chat queueTest semantics verbatim — same dedup, same
      // openQuestion shape. `changedConceptId` is undefined for queueTest (no state
      // change), so only openQuestions / changeFeed move.
      const { model: next } = applyReviewActionToModel(
        model,
        { kind: 'queueTest', childId, conceptId, reason: STUCK_RETEST_REASON },
        nowIso,
      )
      model = next
    }

    // Merge-only, JSON-scrubbed to drop any `undefined` (Firestore rejects them) —
    // the same convention `workbookPositionSync` and the other model writers use.
    // `synthesisStaleAt` touched exactly like the other learner-model writers so the
    // LLM synthesis knows a routed ask changed (FEAT-57, D4).
    const merge: Partial<LearnerModel> = {
      openQuestions: model.openQuestions,
      changeFeed: model.changeFeed,
      updatedAt: model.updatedAt,
      synthesisStaleAt: model.updatedAt,
    }
    await setDoc(modelRef, JSON.parse(JSON.stringify(merge)), { merge: true })
  } catch (err) {
    // Never let the model write-back break the chip tap that triggered it.
    console.warn('[stuckRetest] Failed to enqueue re-test on learner model', err)
  }
}
