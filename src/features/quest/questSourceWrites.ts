// ── The one way a quest session document is written (UX-494) ───────────────
//
// `endSession`, `resetToIntro` and `resumeSession` each did an unconditional
// `setDoc` / `updateDoc` on `evaluationSessions/{id}`, and the id is shared by
// every write a run makes. So the last writer won, whoever it was: a close whose
// AI summary was still awaiting wrote its answers under whatever id the refs then
// held; a late partial landed on top of a finalized record and made it resumable
// again; a retry of a save whose acknowledgement was lost wrote the payload a
// second time, indistinguishably from a fresh write.
//
// Every write here reads the document and decides inside one `runTransaction`,
// so a conflicting commit re-runs the check against the current document instead
// of overwriting it. It writes `evaluationSessions` and nothing else, and takes
// the reference from the caller, so it cannot be pointed at another collection.
//
// The guided-eval and fluency paths keep their own existing writes untouched.

import { doc, getDoc, runTransaction } from 'firebase/firestore'
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
 * the interactive-only source fields sit outside its view. Narrowing happens
 * here, once — same collection, same converter, every existing reader untouched.
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
 * The graph-projection fields, which are the ONLY mutable part of a committed
 * source: the projection stamps itself as applied or skipped long after the
 * answers are immutable.
 */
const MUTABLE_SOURCE_FIELDS = new Set([
  'id',
  'modelProjection',
  'modelProjectionOutcome',
  'modelProjectedAt',
  'modelProjectionFailedAt',
])

/** Stable-key-ordered JSON, so two equal payloads always produce one string. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

/**
 * The immutable content of a source, canonically.
 *
 * This is what makes "a matching committed retry" mean what it says. Comparing
 * `questRunId` alone was wrong: a run writes ONE final payload, so a second
 * payload arriving under the same run id with different answers is not a lost
 * acknowledgement — it is two different records competing for one document, and
 * reporting it as `already-committed` would have the caller claim a save for
 * answers nobody stored and then project a graph from the other ones.
 */
export function canonicalQuestSourceContent(
  source: Partial<QuestSourcePayload>,
): string {
  const immutable: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (MUTABLE_SOURCE_FIELDS.has(key)) continue
    if (value === undefined) continue
    immutable[key] = value
  }
  return canonicalJson(immutable)
}

/**
 * Is a stored record one we must never write over?
 *
 * A record carrying `sourceCommittedAt` is a finalized payload written by this
 * repair. A record whose `status` is already `complete` without that stamp is a
 * LEGACY finalized session: it predates the stamp, and the honest reading of it
 * is still "finished", not "free to overwrite".
 */
function isFinalizedRecord(stored: Partial<QuestSourcePayload>): boolean {
  return Boolean(stored.sourceCommittedAt) || stored.status === 'complete'
}

/**
 * Does the stored record belong to the same run, child, type and original
 * domain/mode as the payload about to be written?
 *
 * Guarded on EVERY write to an existing document. A document id collision, a
 * reassigned record, or a payload whose domain/mode came from a newer session
 * must not be allowed to edit a record it does not own — a `questMode` rewritten
 * under an existing id is exactly the mis-stamping this repair exists for.
 */
function ownsStoredRecord(
  stored: Partial<QuestSourcePayload>,
  payload: Partial<QuestSourcePayload>,
): boolean {
  if (stored.sessionType && stored.sessionType !== 'interactive') return false
  if (stored.childId && payload.childId && stored.childId !== payload.childId) return false
  if (stored.questRunId && payload.questRunId && stored.questRunId !== payload.questRunId) {
    return false
  }
  if (stored.domain && payload.domain && stored.domain !== payload.domain) return false
  // `questMode` is optional on both sides; only a DISAGREEMENT disqualifies.
  if (stored.questMode && payload.questMode && stored.questMode !== payload.questMode) return false
  return true
}

/** What a final save decided. */
export type QuestSourceSaveOutcome =
  /** The immutable final payload landed now. */
  | 'saved'
  /**
   * This exact payload was ALREADY committed under this id — an acknowledgement
   * lost before the retry. A success that writes nothing, so the stored payload
   * stays immutable.
   */
  | 'already-committed'
  /**
   * The stored record is finalized and is NOT this payload — another run's, a
   * legacy complete, or the same run id carrying different answers. Preserved
   * exactly as found. The caller keeps its payload; what it must not do is
   * report a save or project a graph.
   */
  | 'conflict'

/**
 * Write a run's one immutable final payload under its original id,
 * conditionally. Throws on a transport failure (the caller holds the payload and
 * offers a retry); returns an outcome for every case the document decides.
 */
export async function saveFinalQuestSource(
  sessionRef: DocumentReference<QuestSourcePayload>,
  payload: QuestSourcePayload,
): Promise<QuestSourceSaveOutcome> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef)
    if (!snap.exists()) {
      tx.set(sessionRef, scrub(payload))
      return 'saved'
    }
    const stored = snap.data() as Partial<QuestSourcePayload>

    if (isFinalizedRecord(stored)) {
      // The one success: byte-for-byte the same immutable content, ours.
      if (
        ownsStoredRecord(stored, payload) &&
        canonicalQuestSourceContent(stored) === canonicalQuestSourceContent(scrub(payload))
      ) {
        return 'already-committed'
      }
      return 'conflict'
    }

    // An un-finalized record (this run's partial / resumed / in-progress doc).
    if (!ownsStoredRecord(stored, payload)) return 'conflict'
    tx.set(sessionRef, scrub(payload))
    return 'saved'
  })
}

/** What a resumable (partial) save decided. */
export type QuestPartialSaveOutcome =
  | 'saved'
  /**
   * The document is a finalized record, so this partial is NOT written. A stale
   * exit, a stale Start or a late `resetToIntro` can no longer turn a completed
   * session back into a resumable one.
   */
  | 'refused-finalized'
  /** The document belongs to another run, child or mode. Left exactly as found. */
  | 'refused-mismatch'

/**
 * Save the resumable partial for a run that exited early. Throws on a transport
 * failure — the caller retains the payload and offers the in-memory retry, so a
 * manual exit that could not reach Firestore is reported rather than lost.
 */
export async function saveResumableQuestSource(
  sessionRef: DocumentReference<QuestSourcePayload>,
  payload: QuestSourcePayload,
): Promise<QuestPartialSaveOutcome> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef)
    if (snap.exists()) {
      const stored = snap.data() as Partial<QuestSourcePayload>
      if (isFinalizedRecord(stored)) return 'refused-finalized'
      if (!ownsStoredRecord(stored, payload)) return 'refused-mismatch'
    }
    tx.set(sessionRef, scrub(payload))
    return 'saved'
  })
}

/** What marking a reopened partial as `resumed` decided. */
export type QuestResumeStampOutcome =
  | 'marked'
  | 'refused-finalized'
  | 'refused-mismatch'
  | 'missing'

/**
 * Mark a reopened partial as `resumed` so the resume card stops offering it —
 * refusing a record that has since been finalized, and one this run does not own.
 */
export async function markQuestSourceResumed(
  sessionRef: DocumentReference<QuestSourcePayload>,
  expect: { childId: string; questRunId: string; domain?: string; questMode?: string },
): Promise<QuestResumeStampOutcome> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef)
    if (!snap.exists()) return 'missing'
    const stored = snap.data() as Partial<QuestSourcePayload>
    if (isFinalizedRecord(stored)) return 'refused-finalized'
    if (!ownsStoredRecord(stored, expect as Partial<QuestSourcePayload>)) return 'refused-mismatch'
    tx.set(sessionRef, { status: 'resumed' }, { merge: true })
    return 'marked'
  })
}

/**
 * Read a stored source, for the Resume tap's own eligibility check.
 *
 * The resume card's copy was loaded before the tap, and between the two a
 * delayed close may have finalized the run or a parent may have abandoned it.
 * `questResumeRefusal` judges what comes back.
 */
export async function readQuestSource(
  sessionRef: DocumentReference<QuestSourcePayload>,
): Promise<Partial<QuestSourcePayload> | null> {
  const snap = await getDoc(sessionRef)
  return snap.exists() ? (snap.data() as Partial<QuestSourcePayload>) : null
}
