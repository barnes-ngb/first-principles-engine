// ── The one way a learner-model write-back is computed (FEAT-242) ─────────
//
// Five writers fold something into `learnerModels/{childId}`: the workbook
// position sync, the quest write-back, the guided-eval write-back, the daily
// stuck-signal enqueue, and the Review-Chat / Foundations-tab action writer. All
// five used the same two-step shape —
//
//     const snap = await getDoc(modelRef)        // read
//     …compute from snap.data()…                 // ← anything landing here
//     await setDoc(modelRef, payload, { merge: true })   // write
//
// — and that gap is a lost update. Firestore's `{ merge: true }` merges a map
// leaf by leaf but **replaces an array wholesale**, and every one of these
// writers sends arrays: `conceptStates.<id>.evidence`, `openQuestions`,
// `changeFeed`. So a ref written by someone else between the read and the write
// is not merged — it is gone, silently, with no error on either side. Two of the
// five sent the WHOLE model, which widened that from one concept to all of them.
//
// This module is the fix, in one place: the read, the computation and the write
// happen inside a single `runTransaction`, so a conflicting commit re-runs the
// callback against the current document instead of overwriting it. **The
// computation must therefore live inside the callback** — passing in a payload
// computed earlier would put the stale data back and transact nothing of value.
//
// It writes only `learnerModels`. It takes the collection's own document
// reference from the caller, so it cannot be pointed at another collection.

import { runTransaction } from 'firebase/firestore'
import type { DocumentReference, Transaction } from 'firebase/firestore'

import { db } from './firestore'
import type { LearnerModel } from '../types/learnerModel'

/** What one transactional computation decided. */
export interface ModelWriteDecision<T> {
  /**
   * The merge payload, or null/undefined to write NOTHING.
   *
   * Scrubbed of `undefined` before it is sent (Firestore rejects those), exactly
   * as every one of these writers did for itself.
   */
  merge?: Partial<LearnerModel> | null
  /** Whatever the caller wants back — a status, an outcome, the next model. */
  result: T
}

/** Drop `undefined` leaves, the house convention for every model merge. */
function scrub(payload: Partial<LearnerModel>): Partial<LearnerModel> {
  return JSON.parse(JSON.stringify(payload)) as Partial<LearnerModel>
}

/**
 * Read a child's learner model, compute a merge from THAT read, and write it —
 * atomically.
 *
 * `compute` is handed the stored model (or `null` when the document does not
 * exist) and the transaction itself, so a caller that must read a second
 * document — the completion writer reads its own state doc and the cited report
 * — can do so in the same unit. **Firestore requires every read before any
 * write**, so a `compute` that reads must do so before it returns; this helper
 * performs its single write only after `compute` resolves, which is what makes
 * that possible.
 *
 * `compute` may run more than once: a transaction retries on contention, which
 * is precisely the behaviour these writers were missing. It must therefore be
 * free of side effects outside the transaction — in particular, a UI cache must
 * be updated from the RESOLVED result, never from inside the callback.
 */
export async function updateLearnerModelInTransaction<T>(
  modelRef: DocumentReference<LearnerModel>,
  compute: (
    model: LearnerModel | null,
    tx: Transaction,
  ) => ModelWriteDecision<T> | Promise<ModelWriteDecision<T>>,
): Promise<T> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(modelRef)
    const model = snap.exists() ? (snap.data() as LearnerModel) : null
    const decision = await compute(model, tx)
    if (decision.merge) tx.set(modelRef, scrub(decision.merge), { merge: true })
    return decision.result
  })
}
