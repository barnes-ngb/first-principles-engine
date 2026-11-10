// ── The finalized guided-evaluation source: one atomic save (UX-492) ──────
//
// ## What was wrong
//
// A completed guided evaluation is written to `evaluationSessions` under a
// day-based id — `{childId}_{domain}_{date}` — so BOTH of a day's completed
// attempts write the same document and the later one replaces the earlier. That
// is survivable for a history chip and fatal for evidence: two attempts can
// project the SAME evidence summary (the finding `evidence` string the eval
// writes) while their actual help notes are opposite ("read it unaided" vs
// "read it after I sounded out the first two"). Once the second attempt lands,
// the learner-model ref stamped with that day id points at a record whose notes
// are no longer the ones the applied findings came from, and nothing stored can
// tell the two apart. The second half of the same defect: a failed or still
// pending final save left Apply enabled, so the write-back could stamp a source
// that was absent or not yet committed.
//
// ## The shape of the repair
//
// The daily record is kept, exactly as it is — the query shape, the history
// list, resume, the reward dedup key and every existing reader depend on it.
// What is added is ONE family-scoped `guidedEvaluationSources` document per
// finalization, under a fresh Firestore id captured once at the completed
// reply, holding only scoped metadata, the finalization stamp and the exact
// ordered findings. The daily record's completed version then carries that id
// in `finalizedSourceId`, which is what distinguishes it from a later version
// of the same document.
//
// Both writes go in ONE transaction (the `nativeProgressWrites` pattern: read
// first, write after), so a partial write can never look finalized — either the
// source exists AND the day record names it, or neither happened.
//
// ## Create-once, and what a retry is allowed to do
//
// The record is **application-create-once**: the first commit of an id is the
// record. An attempt whose answer was lost (a dropped connection on commit) can
// be retried with the SAME captured payload and id, and the retry must not
// rewrite the day record — by then a newer attempt may legitimately own it, and
// re-running the old `set` would silently restore the older day. So a retry
// that finds its own id already committed VERIFIES scope and content and
// acknowledges the saved source, writing nothing.
//
// The verification is a normalized equality (`guidedSourceContentMatches`) that
// tolerates the two differences Firestore introduces by itself — key ordering,
// and `undefined` fields omitted on write (`stripUndefined` in the converter) —
// and nothing else. A same-id mismatch is not reconciled and not overwritten:
// it **fails closed** with {@link GuidedEvaluationSourceMismatch}, because an id
// that already holds different evidence means the thing this caller believes it
// finalized is not what is stored.

import { doc, runTransaction } from 'firebase/firestore'

import {
  db,
  evaluationSessionsCollection,
  guidedEvaluationSourcesCollection,
} from '../../core/firebase/firestore'
import type { EvaluationDomain } from '../../core/types/enums'
import type {
  EvaluationFinding,
  EvaluationSession,
  GuidedEvaluationSource,
} from '../../core/types/evaluation'

/**
 * Thrown when the finalization id this save captured already holds a DIFFERENT
 * scope or different findings. Deliberately not recoverable by retrying: the
 * caller keeps its summary and download and says the evaluation could not be
 * confirmed, rather than overwriting stored evidence or claiming a save that
 * does not describe this attempt.
 */
export class GuidedEvaluationSourceMismatch extends Error {
  constructor(public readonly sourceId: string) {
    super(
      `A finalized guided evaluation already exists under id ${sourceId} with different content`,
    )
    this.name = 'GuidedEvaluationSourceMismatch'
  }
}

/**
 * A value in a form two Firestore round-trips can be compared by.
 *
 * Object keys are sorted (Firestore does not preserve the order they were
 * written in) and keys whose value is `undefined` are dropped (the collection
 * converters strip them, so an omitted field and an explicitly-undefined one
 * are the same stored document). Array ORDER is preserved — the findings' order
 * is part of the content here, not an incidental detail: a learner-model ref
 * stores the index of the finding it was projected from.
 */
export function normalizeForCompare(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForCompare)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v === undefined) continue
      out[key] = normalizeForCompare(v)
    }
    return out
  }
  return value
}

/** The scope + content of a finalized source, as equality reads it. */
function comparableSource(source: {
  childId: string
  domain: EvaluationDomain
  sessionDocId: string
  findings: readonly EvaluationFinding[]
}): unknown {
  return normalizeForCompare({
    childId: source.childId,
    domain: source.domain,
    sessionDocId: source.sessionDocId,
    findings: source.findings,
  })
}

/**
 * Does a stored finalized source describe exactly this scope and these ordered
 * findings?
 *
 * `finalizedAt` is deliberately NOT compared: the stored stamp is the moment the
 * finalization was committed, and on the retry path that is the first attempt's
 * clock, which is the one the record should keep. Everything that identifies
 * WHOSE evidence this is and WHAT it says is compared, in full.
 */
export function guidedSourceContentMatches(
  stored: Partial<GuidedEvaluationSource> | undefined,
  expected: {
    childId: string
    domain: EvaluationDomain
    sessionDocId: string
    findings: readonly EvaluationFinding[]
  },
): boolean {
  if (!stored) return false
  if (!Array.isArray(stored.findings)) return false
  return (
    JSON.stringify(
      comparableSource({
        childId: stored.childId as string,
        domain: stored.domain as EvaluationDomain,
        sessionDocId: stored.sessionDocId as string,
        findings: stored.findings,
      }),
    ) === JSON.stringify(comparableSource(expected))
  )
}

/**
 * A fresh finalization id, taken ONCE at the completed reply and then pinned.
 *
 * Generated client-side (`doc(collection)` with no path) so the id exists before
 * the save starts: the caller can pin it alongside the family, child, domain,
 * day id and findings, and a retry — or an Apply admitted meanwhile — names the
 * same document rather than minting a second one.
 */
export function newGuidedEvaluationSourceId(familyId: string): string {
  return doc(guidedEvaluationSourcesCollection(familyId)).id
}

/** Everything a finalization pins before its first await. */
export interface FinalizeGuidedEvaluationArgs {
  familyId: string
  childId: string
  domain: EvaluationDomain
  /** The daily record id — unchanged `{childId}_{domain}_{date}` shape. */
  sessionDocId: string
  /** The finalization id, captured once at the completed reply. */
  sourceId: string
  finalizedAt: string
  /** The completed reply's findings, in order, exactly as recorded. */
  findings: readonly EvaluationFinding[]
  /** The completed daily record, built by the caller as it always was. */
  session: Omit<EvaluationSession, 'id'>
}

/**
 * The acknowledged receipt of a finalization — the ONLY thing a downstream Apply
 * may read its source and findings from. Never a current-session read, never a
 * reconstruction.
 */
export interface GuidedEvaluationReceipt {
  sourceId: string
  sessionDocId: string
  childId: string
  domain: EvaluationDomain
  finalizedAt: string
  /** The stored ordered findings — the source's own, not the caller's copy. */
  findings: EvaluationFinding[]
  /** True when an earlier attempt had already committed this exact source. */
  alreadyFinalized: boolean
}

/**
 * Save the completed daily record and its finalized source in one transaction.
 *
 * Resolves with the receipt when — and only when — the source is committed and
 * readable under the captured id. Rejects on a transport failure (the caller
 * keeps the payload and offers an explicit retry) and on
 * {@link GuidedEvaluationSourceMismatch} (fails closed, no retry).
 */
export async function finalizeGuidedEvaluation(
  args: FinalizeGuidedEvaluationArgs,
): Promise<GuidedEvaluationReceipt> {
  const { familyId, childId, domain, sessionDocId, sourceId, finalizedAt, session } = args
  // The findings are copied into this writer's own array so a later mutation of
  // the caller's state cannot change what is compared or what is stored.
  const findings: EvaluationFinding[] = args.findings.map((f) => ({ ...f }))

  const sourceRef = doc(guidedEvaluationSourcesCollection(familyId), sourceId)
  const dayRef = doc(evaluationSessionsCollection(familyId), sessionDocId)

  const record: GuidedEvaluationSource = {
    childId,
    domain,
    sessionDocId,
    finalizedAt,
    findings,
  }

  return runTransaction(db, async (tx) => {
    // Read first: whether this finalization is already on the record.
    const existing = await tx.get(sourceRef)

    if (existing.exists()) {
      const stored = existing.data() as Partial<GuidedEvaluationSource> | undefined
      if (!guidedSourceContentMatches(stored, { childId, domain, sessionDocId, findings })) {
        throw new GuidedEvaluationSourceMismatch(sourceId)
      }
      // Acknowledged, and NOTHING is written. In particular the day record is
      // left alone: a newer attempt may own it by now, and re-running this
      // attempt's `set` would restore the older day over the newer one.
      return {
        sourceId,
        sessionDocId,
        childId,
        domain,
        finalizedAt: (stored?.finalizedAt as string) ?? finalizedAt,
        findings: (stored?.findings as EvaluationFinding[]) ?? findings,
        alreadyFinalized: true,
      }
    }

    // One commit, both documents. The day record is written with the pointer to
    // the source created beside it, so a record that names a finalization is a
    // record whose finalization exists.
    tx.set(sourceRef, record)
    tx.set(dayRef, { ...session, finalizedSourceId: sourceId })

    return {
      sourceId,
      sessionDocId,
      childId,
      domain,
      finalizedAt,
      findings,
      alreadyFinalized: false,
    }
  })
}
