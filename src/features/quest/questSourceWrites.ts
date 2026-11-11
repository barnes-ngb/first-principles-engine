// ── The one way a quest session document is written (UX-494) ───────────────
//
// `endSession`, `resetToIntro` and `resumeSession` each did an unconditional
// `setDoc` / `updateDoc` on `evaluationSessions/{id}`, and the id is shared by
// every write a run makes. So the last writer won, whoever it was:
//
//   • a close whose AI summary was still awaiting wrote the run's answers under
//     whatever id the refs held by the time it resumed — a NEWER run's;
//   • `resetToIntro`'s partial save could land on top of a finalized record and
//     turn a complete session back into a resumable one;
//   • a retry of a save whose acknowledgement was lost in flight wrote the
//     payload a second time, with no way to tell that from a fresh write;
//   • a `status: 'resumed'` stamp could be applied to a document that had since
//     been finalized.
//
// This module is the conditional answer, in one place: each write reads the
// document and decides inside a single `runTransaction`, so a conflicting commit
// re-runs the check against the current document instead of overwriting it. It
// writes `evaluationSessions` and nothing else, and it takes the document
// reference from the caller, so it cannot be pointed at another collection.
//
// Deliberately NOT a new store and NOT a general session writer: the guided-eval
// and fluency paths keep their own existing writes untouched. This is the
// interactive quest's save, with its conditions made explicit.

import { doc, runTransaction } from 'firebase/firestore'
import type { DocumentReference } from 'firebase/firestore'

import { db, evaluationSessionsCollection } from '../../core/firebase/firestore'
import type { EvaluationSession } from '../../core/types'
import type { InteractiveSessionData } from './questTypes'

/** The payload shape both saves carry. */
export type QuestSourcePayload = EvaluationSession & InteractiveSessionData

/**
 * The one typed handle on a quest source document.
 *
 * `evaluationSessionsCollection` is typed to the shared `EvaluationSession`, so
 * the interactive-only source fields live outside its view. Narrowing happens
 * here, once, rather than at every call site — and it is still the SAME
 * collection and the same converter, so every existing reader is untouched.
 */
export function questSourceRef(
  familyId: string,
  sessionId: string,
): DocumentReference<QuestSourcePayload> {
  return doc(
    evaluationSessionsCollection(familyId),
    sessionId,
  ) as unknown as DocumentReference<QuestSourcePayload>
}

/** Drop `undefined` leaves — Firestore rejects them (the house convention). */
function scrub<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload)) as T
}

/**
 * Is a stored record one we must never write over?
 *
 * Two shapes qualify. A record carrying `sourceCommittedAt` is a finalized
 * payload written by this repair. A record whose `status` is already `complete`
 * with no commit stamp is a **legacy** finalized session: it predates the stamp,
 * and the honest reading of it is still "finished", not "free to overwrite".
 */
function isFinalizedRecord(stored: Partial<QuestSourcePayload>): boolean {
  return Boolean(stored.sourceCommittedAt) || stored.status === 'complete'
}

/** What a final save decided. */
export type QuestSourceSaveOutcome =
  /** The immutable final payload landed now. */
  | 'saved'
  /**
   * This run's payload was ALREADY committed under this id. The common cause is
   * an acknowledgement lost before the retry — the first write did commit and the
   * client never heard so. A matching committed retry is a success, and it writes
   * nothing, so the stored payload stays immutable.
   */
  | 'already-committed'
  /**
   * A DIFFERENT run has finalized this id. The stored record is preserved exactly
   * as found and this payload is not written. The caller keeps its payload and can
   * offer a retry; what it must not do is report a save.
   */
  | 'conflict'

/**
 * Write a run's one immutable final payload under its original id, conditionally.
 *
 * Throws on a transport failure (the caller holds the payload and offers a retry);
 * returns an outcome for every case the document itself decides.
 */
export async function saveFinalQuestSource(
  sessionRef: DocumentReference<QuestSourcePayload>,
  payload: QuestSourcePayload,
): Promise<QuestSourceSaveOutcome> {
  const runId = payload.questRunId
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef)
    if (!snap.exists()) {
      tx.set(sessionRef, scrub(payload))
      return 'saved'
    }
    const stored = snap.data() as Partial<QuestSourcePayload>
    if (stored.sourceCommittedAt) {
      // Already finalized. Ours, or somebody else's?
      return runId && stored.questRunId === runId ? 'already-committed' : 'conflict'
    }
    if (isFinalizedRecord(stored)) return 'conflict' // legacy complete — preserved
    // A partial / resumed / in-progress record of this run: the final payload is
    // what that document becomes.
    if (stored.questRunId && runId && stored.questRunId !== runId) return 'conflict'
    tx.set(sessionRef, scrub(payload))
    return 'saved'
  })
}

/** What a resumable (partial) save decided. */
export type QuestPartialSaveOutcome =
  | 'saved'
  /**
   * The document is already a finalized record, so this partial is NOT written.
   * A stale exit, a stale Start or a late `resetToIntro` can no longer turn a
   * completed session back into a resumable one.
   */
  | 'refused-finalized'

/**
 * Save the resumable partial for a run that exited early — refusing to overwrite
 * a finalized record under the same id.
 */
export async function saveResumableQuestSource(
  sessionRef: DocumentReference<QuestSourcePayload>,
  payload: QuestSourcePayload,
): Promise<QuestPartialSaveOutcome> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef)
    if (snap.exists() && isFinalizedRecord(snap.data() as Partial<QuestSourcePayload>)) {
      return 'refused-finalized'
    }
    tx.set(sessionRef, scrub(payload))
    return 'saved'
  })
}

/**
 * Mark a reopened partial as `resumed` so the resume card stops offering it —
 * refusing, for the same reason, to stamp a record that has since been finalized.
 */
export async function markQuestSourceResumed(
  sessionRef: DocumentReference<QuestSourcePayload>,
): Promise<'marked' | 'refused-finalized' | 'missing'> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef)
    if (!snap.exists()) return 'missing'
    if (isFinalizedRecord(snap.data() as Partial<QuestSourcePayload>)) return 'refused-finalized'
    tx.set(sessionRef, { status: 'resumed' }, { merge: true })
    return 'marked'
  })
}

/**
 * Record that this source's graph projection failed, so the failure survives a
 * reload and the Mine can offer the scoped retry.
 *
 * A separate, guarded write rather than part of the model transaction: that
 * transaction ROLLS BACK on failure, which is exactly the behaviour that keeps
 * pending work pending — so the only place a failure can be recorded is outside
 * it. Conditional on the run id so it cannot stamp a record another run owns, and
 * it never touches a source already marked `projected`: a failure arriving after
 * a concurrent retry succeeded is not news.
 */
export async function markQuestProjectionFailed(
  sessionRef: DocumentReference<QuestSourcePayload>,
  runId: string,
  outcome: string,
  nowIso: string,
): Promise<'marked' | 'skipped'> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef)
    if (!snap.exists()) return 'skipped'
    const stored = snap.data() as Partial<QuestSourcePayload>
    if (runId && stored.questRunId !== runId) return 'skipped'
    if (stored.modelProjection === 'projected') return 'skipped'
    tx.set(
      sessionRef,
      {
        modelProjection: 'failed',
        modelProjectionOutcome: outcome,
        modelProjectionFailedAt: nowIso,
      },
      { merge: true },
    )
    return 'marked'
  })
}
