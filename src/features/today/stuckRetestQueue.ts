// ── Daily "stuck" signal → learner-model re-test enqueue (FEAT-68) ────────
//
// The thin async writer the Today mastery chip AND engagement flag call. When a
// completed checklist item signals a struggle (a "stuck" mastery chip or an
// `engagement:'struggled'` flag), `resolveStuckConcepts` (pure, core) turns the item
// into the frontier concept(s) the child is working on — via the bridged workbook
// position (FEAT-68) UNIONED with the item's skillTags (FEAT-69), so a NON-workbook
// item now resolves too. This writer enqueues an `openQuestion{ routedTo:'quest' }`
// per concept onto `learnerModels/{childId}` so the next Knowledge Mine session
// re-tests it (`selectQuestTargets` → `applyQuestResultsToModel`, upgrade-only,
// no-shame). `reason` (default `STUCK_RETEST_REASON`) is the parent-facing ask text;
// the engagement caller passes `ENGAGEMENT_RETEST_REASON` so it reads honestly.
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
import { resolveStuckConcepts } from '../../core/foundations/dailySignalTargeting'
import type {
  StuckSignalConfig,
  StuckSignalItem,
} from '../../core/foundations/dailySignalTargeting'
import { applyReviewActionToModel } from '../foundations-review/foundationsReviewActions'
import type { LearnerModel } from '../../core/types/learnerModel'

/** The `openQuestion.reason` stamped on a "stuck" mastery-chip re-test (parent-facing). */
export const STUCK_RETEST_REASON = "Struggled during today's work"

/**
 * The `openQuestion.reason` stamped on an `engagement:'struggled'` re-test (FEAT-69).
 * A distinct constant so the parent-facing ask reads honestly about which daily
 * signal seeded it. (`engagement:'refused'` is deliberately NOT wired — refusal is a
 * regulation signal, not a concept miss.)
 */
export const ENGAGEMENT_RETEST_REASON = "Flagged as a struggle during today's work"

/**
 * Enqueue a `routedTo:'quest'` re-test ask per resolved concept onto the child's
 * learner model, merge-only. Resolution runs HERE — after the model load — so the
 * provisional-position conflict cap (`resolveSyncNativePosition`) can defer a Fast
 * Phonics divisor guess to any directly-witnessed peak; a cheap model-free
 * pre-resolve bails before any read when there is obviously no path (no bridge / no
 * position). No-op when nothing resolves or the model has not been seeded
 * (`no-model` — the diag/review seed path owns creation). Dedup (via
 * `withOpenQuestion`) means repeated struggles on the same concept don't pile up
 * asks. Fire-and-forget: any failure is swallowed with a warning so a struggle chip
 * tap is never blocked or reverted.
 */
export async function enqueueStuckRetests(
  familyId: string,
  childId: string,
  item: StuckSignalItem,
  config: StuckSignalConfig | null | undefined,
  nowIso: string,
  reason: string = STUCK_RETEST_REASON,
): Promise<void> {
  if (!familyId || !childId) return
  // Cheap pure pre-resolve WITHOUT the model — bail before any Firestore read when
  // neither path resolves (no bridged workbook position AND no mapped skillTag). The
  // cap can only narrow the workbook result, never turn [] into a write.
  if (resolveStuckConcepts(item, config).length === 0) return
  try {
    const modelRef = doc(learnerModelsCollection(familyId), childId)
    const snap = await getDoc(modelRef)
    if (!snap.exists()) return // seed the model first (diag / review chat)

    let model = snap.data() as LearnerModel
    // Re-resolve WITH the model so the provisional-position conflict cap applies.
    const concepts = resolveStuckConcepts(item, config, model)
    if (concepts.length === 0) return
    for (const conceptId of concepts) {
      // Reuse the Review-Chat queueTest semantics verbatim — same dedup, same
      // openQuestion shape. `changedConceptId` is undefined for queueTest (no state
      // change), so only openQuestions / changeFeed move.
      const { model: next } = applyReviewActionToModel(
        model,
        { kind: 'queueTest', childId, conceptId, reason },
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
