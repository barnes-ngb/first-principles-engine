// ── Parent-confirmed Build Studio hours credit (LOCAL-VISION-007 slice 3) ────
//
// Writer stage 1. Four guarded operations and no UI:
//
//   previewBuildStudioCredit        read-only. Proves one exact saved version and
//                                   returns the proposal a PARENT reviews.
//   confirmBuildStudioCredit        the one write. Re-proves everything inside a
//                                   transaction and writes a receipt, a day bucket
//                                   and an `hours` row together, or nothing.
//   correctBuildStudioCreditHours   lowers (or deletes) the visible `hours` row of
//                                   one credit. Never touches receipt or bucket.
//   readBuildStudioCreditedVersion  the exact saved version a credit names, for the
//                                   parent's detail view and archive download.
//
// ── Why the child's save is untouched ───────────────────────────────────────
//
// Nothing here runs when a child saves. `saveBuildStudioVersion` only stamps a
// server acceptance time on a new version (`creditEligible`); a save succeeds
// whether or not any credit is ever proposed, and no total, minute or credit is
// shown to the child. Credit exists only after a parent opens Records, reviews
// the proposal (date, subject, minutes, source) and confirms — this repo's
// propose → confirm → write rule.
//
// ── What a confirmed credit writes (all in ONE transaction) ─────────────────
//
//   buildStudioCreditReceipts/{child}.{project}.{version}   immutable consumed-source receipt
//   buildStudioCreditDays/{child}.{YYYY-MM-DD}              append-only admission bucket
//   hours/bsc.{child}.{project}.{version}                   the normal hours row, with
//                                                           typed `buildStudioCredit` provenance
//
// Ids use `.` as the separator and every component is `[A-Za-z0-9_-]{1,64}`, so
// two tuples can never build one id and no caller string becomes a path piece.
//
// ── Concurrency ─────────────────────────────────────────────────────────────
//
// The transaction READS (before any write) the exact receipt, the family root,
// the exact version, its baseline and the five day buckets around the credit
// date, and WRITES the receipt, this date's bucket and the hours row. Firestore
// re-runs a transaction whose reads changed, so:
//
//   • two devices confirming the same version: the second re-runs, finds the
//     receipt and returns `alreadySettled` with the FIRST receipt;
//   • two devices admitting the last fixed unit of a day: both read and write the
//     same bucket document, so the loser re-runs against the winner's entry and
//     is `declined` (`over-daily-cap`) — the cap cannot be passed;
//   • two free builds minutes apart across midnight: each reads the other's
//     bucket, so each conflict re-runs against the other (spacing holds).
//
// ── Timezones ───────────────────────────────────────────────────────────────
//
// The school date comes from the version's server acceptance instant read in the
// family root document's `timeZone` (`resolveFamilyTimeZone`, named Central
// fallback). Never the runtime locale, never the device clock, never the retry's
// time. The zone is frozen on the proposal and on the receipt:
//
//   • zone changed between preview and confirm → `stale` / `timezone-changed`; a
//     fresh preview is required. Nothing is written.
//   • zone changed AFTER a credit settled → a retry returns the original receipt.
//   • adjacent dates: the cap counts only the bucket for THIS date, as that date
//     was recorded when each unit was admitted. Spacing and exact-source checks
//     compare absolute instants over the buckets at date ±2, which covers any
//     zone the instant could have been dated in (zones differ by at most 26 h).
//     Consequence, stated plainly: if the family zone changes, the two zones'
//     "same date" can overlap in real time and the cap is applied per recorded
//     date label, not per real 24 hours.
//
// ── Corrections never re-earn ───────────────────────────────────────────────
//
// The bucket keeps the ORIGINAL fixed minutes and the receipt is never changed
// or deleted, so lowering or deleting the visible row frees no capacity, resets
// no spacing and allows no second credit for that version. There is no way here
// to raise minutes, or to change a row's child, date, subject or source.

import {
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  type DocumentReference,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase/firestore'

import { challengeById } from '../../features/build-studio/buildStudioChallenges'
import { BUILD_STUDIO_PROJECT_ID } from '../../features/build-studio/buildStudioStarter'
import {
  buildCreditProposal,
  choosePredecessor,
  claimsChallenge,
  creditDayId,
  creditHoursId,
  creditReceiptId,
  decideAdmission,
  isCreditPathId,
  isSchoolDate,
  NEIGHBOUR_DAYS,
  parseCreditDay,
  proposalKey,
  proveBuildStudioCredit,
  shiftSchoolDate,
  validatedArchiveFiles,
  type BuildStudioCreditProposal,
  type CreditBaseline,
  type CreditProofRejection,
  type StoredVersionDoc,
  type VersionCreditSource,
} from '../../features/build-studio/buildStudioCreditProof'
import {
  creditForSource,
  type BuildStudioCreditRejection,
} from '../../features/build-studio/buildStudioHoursCredit'
import { assertAttributed } from '../../features/records/records.logic'
import { resolveFamilyTimeZone } from '../utils/clockTime'
import {
  buildStudioVersionDocId,
  normalizeChallengeAttempt,
  type BuildStudioCreditProvenance,
  type BuildStudioVersion,
} from '../types/buildStudio'
import { DayBlockType, type SubjectBucket } from '../types/enums'
import {
  buildStudioCreditDaysCollection,
  buildStudioCreditReceiptsCollection,
  buildStudioVersionsCollection,
  db,
  familyRootDoc,
  hoursCollection,
} from './firestore'

/** The `source` stamped on every credit `hours` row. */
export const BUILD_STUDIO_CREDIT_HOURS_SOURCE = 'build-studio-credit'

/** Page size of the predecessor history scan. A page size, NOT a limit on history. */
const HISTORY_PAGE_SIZE = 50

// ── Shapes ──────────────────────────────────────────────────────────────────

/** The immutable consumed-source receipt, as read back. */
export interface BuildStudioSettledCredit {
  receiptId: string
  childId: string
  projectId: string
  versionId: string
  versionDocId: string
  source: VersionCreditSource
  schoolDate: string
  /** The zone the date was resolved in, frozen at confirmation. */
  timeZone: string
  workMs: number
  /** The fixed minutes ADMITTED (an hours row may later be corrected lower). */
  minutes: number
  subjectBucket: SubjectBucket
  hoursDocId: string
  dayId: string
  sourceDigest: string
  baselineDigest: string | null
  predecessorDocId: string | null
}

export interface CreditScope {
  familyId: string
  childId: string
  projectId: string
  versionId: string
}

export type CreditPreviewResult =
  /** Proven and admissible. Show `proposal`; confirm passes it back verbatim. */
  | { status: 'ready'; proposal: BuildStudioCreditProposal }
  /** Proven, but the fixed-credit policy would not admit it now (cap, spacing, …). */
  | { status: 'declined'; proposal: BuildStudioCreditProposal; reason: BuildStudioCreditRejection }
  /** Already credited. `receipt` is the original, whatever the zone is now. */
  | { status: 'alreadySettled'; receipt: BuildStudioSettledCredit }
  | { status: 'unavailable' }
  | { status: 'invalid' }
  | { status: 'unproven'; reason: CreditProofRejection | 'unordered' | 'pending-write' }
  | { status: 'failed'; reason: 'malformed-budget' | 'malformed-receipt' | 'read-failed' }

export type CreditConfirmResult =
  | { status: 'credited'; receipt: BuildStudioSettledCredit }
  | { status: 'alreadySettled'; receipt: BuildStudioSettledCredit }
  /** The preview no longer matches the server. Preview again; nothing was written. */
  | { status: 'stale'; reason: 'timezone-changed' | 'source-changed' }
  | { status: 'declined'; reason: BuildStudioCreditRejection }
  | { status: 'unavailable' }
  | { status: 'invalid' }
  | { status: 'unproven'; reason: CreditProofRejection | 'unordered' | 'pending-write' }
  /** Nothing was written. `retryable` failures are safe to confirm again verbatim. */
  | {
      status: 'failed'
      retryable: boolean
      reason: 'malformed-budget' | 'malformed-receipt' | 'hours-conflict' | 'write-failed'
    }

export type CreditCorrectionResult =
  | { status: 'corrected'; minutes: number }
  | { status: 'deleted' }
  /** The row is not what the parent saw (changed, deleted, not this credit's). Reload. */
  | { status: 'stale'; reason: 'row-missing' | 'row-changed' | 'row-mismatch' }
  | { status: 'invalid'; reason: 'not-lower' | 'not-a-positive-whole-number' | 'bad-scope' }
  | { status: 'noReceipt' }
  | { status: 'failed'; retryable: boolean }

export type CreditVersionReadResult =
  | { status: 'ok'; version: BuildStudioVersion }
  | { status: 'unavailable' }
  | {
      status: 'malformed'
      reason: 'bad-scope' | 'bad-provenance' | 'bad-identity' | 'bad-archive' | 'bad-challenge'
    }
  | { status: 'failed' }

// ── Internals ───────────────────────────────────────────────────────────────

const validScope = (s: CreditScope): boolean =>
  typeof s.familyId === 'string' &&
  s.familyId.length > 0 &&
  !/[/\s]/.test(s.familyId) &&
  isCreditPathId(s.childId) &&
  isCreditPathId(s.projectId) &&
  isCreditPathId(s.versionId)

/** A snapshot, as both `getDocFromServer` and `tx.get` return one. */
interface Snap {
  exists: () => boolean
  data: () => unknown
  id?: string
  metadata?: { hasPendingWrites?: boolean; fromCache?: boolean }
}
type Getter = <T>(ref: DocumentReference<T>) => Promise<Snap>

const refs = (familyId: string, childId: string, projectId: string, versionId: string) => ({
  version: doc(buildStudioVersionsCollection(familyId), buildStudioVersionDocId(childId, projectId, versionId)),
  receipt: doc(buildStudioCreditReceiptsCollection(familyId), creditReceiptId(childId, projectId, versionId)),
  hours: doc(hoursCollection(familyId), creditHoursId(childId, projectId, versionId)),
})

const toDoc = (snap: Snap, fallbackId: string): StoredVersionDoc => ({
  id: snap.id ?? fallbackId,
  data: snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
})

async function familyZone(get: Getter, familyId: string): Promise<string> {
  const snap = await get(familyRootDoc(familyId))
  const raw = snap.exists() ? (snap.data() as { timeZone?: unknown } | undefined)?.timeZone : undefined
  return resolveFamilyTimeZone(typeof raw === 'string' ? raw : undefined)
}

/** The five day buckets around a date, read through `get`. */
async function readBuckets(get: Getter, familyId: string, childId: string, schoolDate: string) {
  const out = new Map<string, { exists: boolean; data: unknown }>()
  for (const offset of NEIGHBOUR_DAYS) {
    const date = shiftSchoolDate(schoolDate, offset)
    const snap = await get(doc(buildStudioCreditDaysCollection(familyId), creditDayId(childId, date)))
    out.set(date, { exists: snap.exists(), data: snap.exists() ? snap.data() : undefined })
  }
  return out
}

/** A receipt document back into its typed form, or `null` when it is not exactly one. */
function parseReceipt(data: unknown, scope: CreditScope): BuildStudioSettledCredit | null {
  if (typeof data !== 'object' || data === null) return null
  const r = data as Record<string, unknown>
  const { childId, projectId, versionId } = scope
  const source = r.source as Record<string, unknown> | undefined
  if (r.schema !== 1 || r.childId !== childId || r.projectId !== projectId || r.versionId !== versionId) {
    return null
  }
  if (!source || (source.kind !== 'challenge' && source.kind !== 'freeBuild')) return null
  if (source.projectId !== projectId || source.versionId !== versionId) return null
  if (typeof r.schoolDate !== 'string' || !isSchoolDate(r.schoolDate)) return null
  if (typeof r.timeZone !== 'string' || typeof r.workMs !== 'number' || !Number.isFinite(r.workMs)) return null
  if (
    r.versionDocId !== buildStudioVersionDocId(childId, projectId, versionId) ||
    r.hoursDocId !== creditHoursId(childId, projectId, versionId) ||
    r.dayId !== creditDayId(childId, r.schoolDate) ||
    r.receiptId !== creditReceiptId(childId, projectId, versionId)
  ) {
    return null
  }
  const typed = source as unknown as VersionCreditSource
  const fixed = creditForSource(typed)
  if (r.minutes !== fixed.minutes || r.subjectBucket !== fixed.subjectBucket) return null
  return {
    receiptId: r.receiptId as string,
    childId,
    projectId,
    versionId,
    versionDocId: r.versionDocId as string,
    source: typed,
    schoolDate: r.schoolDate,
    timeZone: r.timeZone,
    workMs: r.workMs,
    minutes: r.minutes as number,
    subjectBucket: r.subjectBucket as SubjectBucket,
    hoursDocId: r.hoursDocId as string,
    dayId: r.dayId as string,
    sourceDigest: typeof r.sourceDigest === 'string' ? r.sourceDigest : '',
    baselineDigest: typeof r.baselineDigest === 'string' ? r.baselineDigest : null,
    predecessorDocId: typeof r.predecessorDocId === 'string' ? r.predecessorDocId : null,
  }
}

/** What the parent reads on the Records row. Short, and says only what was proven. */
function creditNote(source: VersionCreditSource): string {
  if (source.kind === 'challenge') {
    const goal = challengeById(source.challengeId)?.goal
    return goal ? `Build Studio challenge: ${goal}` : 'Build Studio challenge'
  }
  return 'Build Studio: changed own game'
}

// ── Predecessor lookup ──────────────────────────────────────────────────────
//
// MIXED-VERSION BOUNDARY. A version's predecessor is the latest same-child,
// same-project version that sits BEFORE it, where a version with a server
// `acceptedAt` is placed by that instant and a legacy version (no `acceptedAt`)
// by its client `createdAt`. Two consequences, stated plainly:
//
//   • A NEW supported save is stamped with a later server time than every
//     version that already exists, so it can never be inserted between an older
//     source and that source's predecessor. History after the source is ignored.
//   • A LEGACY row has only a client clock and may materialise late (an offline
//     device syncing). It can become the source's predecessor AFTER a preview.
//     That is why the lookup is repeated, from the server, immediately before the
//     confirming transaction. The web SDK cannot run a query inside a transaction,
//     so a legacy row landing in the few milliseconds between that fresh lookup
//     and the commit is not detectable; the transaction still re-reads and
//     re-proves the exact source and the exact predecessor.
//
// The scan is paged by document id over this child's and project's id prefix
// (`{child}__{project}__…`) with only the best candidate kept in memory, so it has
// no lifetime cap on how many saves a family may have.

type PredecessorLookup =
  | { ok: true; docId: string | null; doc: StoredVersionDoc | null }
  | { ok: false; reason: 'unordered' | 'pending-write' }

async function lookupPredecessor(
  familyId: string,
  childId: string,
  projectId: string,
  source: StoredVersionDoc,
): Promise<PredecessorLookup> {
  const prefix = `${childId}__${projectId}__`
  let best: StoredVersionDoc | null = null
  let cursor: QueryDocumentSnapshot | null = null
  for (;;) {
    const constraints = [
      where(documentId(), '>=', prefix),
      where(documentId(), '<', `${prefix}`),
      orderBy(documentId()),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(HISTORY_PAGE_SIZE),
    ]
    const page = await getDocsFromServer(query(buildStudioVersionsCollection(familyId), ...constraints))
    const batch: StoredVersionDoc[] = []
    for (const d of page.docs) {
      if (d.metadata?.hasPendingWrites) return { ok: false, reason: 'pending-write' }
      batch.push({ id: d.id, data: d.data() as unknown as Record<string, unknown> })
    }
    const pool: StoredVersionDoc[] = best ?[...batch, best] : batch
    const choice = choosePredecessor(source, childId, projectId, pool)
    if (!choice.ok) return { ok: false, reason: 'unordered' }
    best = choice.docId ? (pool.find((p) => p.id === choice.docId) ?? null) : null
    if (page.docs.length < HISTORY_PAGE_SIZE) break
    cursor = page.docs[page.docs.length - 1] as unknown as QueryDocumentSnapshot
  }
  return { ok: true, docId: best ? best.id : null, doc: best }
}

// ── 1. Preview ──────────────────────────────────────────────────────────────

/**
 * Prove one exact saved version and propose its credit. READ-ONLY.
 *
 * Every read is from the server (never the cache), and a version with a pending
 * local write is refused: a local estimate of a server timestamp is not proof.
 */
export async function previewBuildStudioCredit(scope: CreditScope): Promise<CreditPreviewResult> {
  if (!validScope(scope)) return { status: 'invalid' }
  const { familyId, childId, projectId, versionId } = scope
  const r = refs(familyId, childId, projectId, versionId)
  const get: Getter = (ref) => getDocFromServer(ref) as unknown as Promise<Snap>
  // `Snap` is the narrow slice of a snapshot this module reads; the real one satisfies it.

  try {
    const receiptSnap = await get(r.receipt)
    if (receiptSnap.exists()) {
      const receipt = parseReceipt(receiptSnap.data(), scope)
      return receipt
        ? { status: 'alreadySettled', receipt }
        : { status: 'failed', reason: 'malformed-receipt' }
    }

    const versionSnap = await get(r.version)
    if (!versionSnap.exists()) return { status: 'unavailable' }
    if (versionSnap.metadata?.hasPendingWrites) return { status: 'unproven', reason: 'pending-write' }
    const version = toDoc(versionSnap, r.version.id)

    // The baseline, for a free-building save only.
    let baseline: CreditBaseline | null = null
    if (!claimsChallenge(version.data)) {
      const found = await lookupPredecessor(familyId, childId, projectId, version)
      if (!found.ok) return { status: 'unproven', reason: found.reason }
      baseline = found.doc ? { kind: 'version', doc: found.doc } : { kind: 'starter' }
    }

    const proven = proveBuildStudioCredit({ childId, projectId, versionId, version, baseline })
    if (!proven.ok) return { status: 'unproven', reason: proven.reason }

    const proposal = buildCreditProposal({
      familyId,
      childId,
      timeZone: await familyZone(get, familyId),
      versionDocId: version.id,
      proof: proven.proof,
    })
    if (!proposal) return { status: 'failed', reason: 'read-failed' }

    const admission = decideAdmission(proposal, await readBuckets(get, familyId, childId, proposal.schoolDate))
    if (!admission.ok) return { status: 'failed', reason: 'malformed-budget' }
    return admission.decision.admitted
      ? { status: 'ready', proposal }
      : { status: 'declined', proposal, reason: admission.decision.reason }
  } catch {
    return { status: 'failed', reason: 'read-failed' }
  }
}

// ── 2. Confirm ──────────────────────────────────────────────────────────────

/**
 * The parent's explicit confirmation of a previewed proposal. The ONE write.
 *
 * `proposal` is re-derived from the server inside the transaction and compared
 * with {@link proposalKey}; the caller's copy is never trusted for anything but
 * naming which exact version it is about. Results are predictable and nothing is
 * thrown for an expected condition. `failed` + `retryable` is safe to confirm
 * again with the same proposal: the receipt makes the retry idempotent.
 */
export async function confirmBuildStudioCredit(
  proposal: BuildStudioCreditProposal,
): Promise<CreditConfirmResult> {
  const scope: CreditScope = {
    familyId: proposal?.familyId,
    childId: proposal?.childId,
    projectId: proposal?.projectId,
    versionId: proposal?.versionId,
  }
  if (!validScope(scope)) return { status: 'invalid' }
  const { familyId, childId, projectId, versionId } = scope
  const versionDocId = buildStudioVersionDocId(childId, projectId, versionId)
  if (proposal.versionDocId !== versionDocId) return { status: 'invalid' }
  const pred = proposal.predecessorDocId
  if (
    pred !== null &&
    (typeof pred !== 'string' ||
      !pred.startsWith(`${childId}__${projectId}__`) ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(pred) ||
      pred === versionDocId)
  ) {
    return { status: 'invalid' }
  }
  const r = refs(familyId, childId, projectId, versionId)

  try {
    // ── Fresh history, from the server, BEFORE the confirming transaction ──
    // A committed receipt wins over everything here (changed zone, changed
    // history, a removed visible row), so it is read first. Only free work has a
    // predecessor; a legacy row that materialised after the preview, or a caller
    // passing an earlier predecessor, is `stale` and writes nothing.
    if (proposal.source?.kind === 'freeBuild') {
      const settledSnap = await getDocFromServer(r.receipt)
      if (settledSnap.exists()) {
        const receipt = parseReceipt(settledSnap.data(), scope)
        return receipt
          ? { status: 'alreadySettled', receipt }
          : { status: 'failed', retryable: false, reason: 'malformed-receipt' }
      }
      const sourceSnap = (await getDocFromServer(r.version)) as unknown as Snap
      if (!sourceSnap.exists()) return { status: 'unavailable' }
      if (sourceSnap.metadata?.hasPendingWrites) return { status: 'unproven', reason: 'pending-write' }
      const found = await lookupPredecessor(familyId, childId, projectId, toDoc(sourceSnap, versionDocId))
      if (!found.ok) return { status: 'unproven', reason: found.reason }
      if (found.docId !== pred) return { status: 'stale', reason: 'source-changed' }
    }

    return await runTransaction(db, async (tx: Transaction): Promise<CreditConfirmResult> => {
      const get: Getter = (ref) => tx.get(ref) as unknown as Promise<Snap>

      // ── ALL reads first ──
      // 1. The settled receipt wins over everything, including a zone change.
      const receiptSnap = await get(r.receipt)
      if (receiptSnap.exists()) {
        const receipt = parseReceipt(receiptSnap.data(), scope)
        return receipt
          ? { status: 'alreadySettled', receipt }
          : { status: 'failed', retryable: false, reason: 'malformed-receipt' }
      }
      const hoursSnap = await get(r.hours)
      const timeZone = await familyZone(get, familyId)
      const versionSnap = await get(r.version)
      const predSnap = pred ? await get(doc(buildStudioVersionsCollection(familyId), pred)) : null

      if (timeZone !== proposal.timeZone) return { status: 'stale', reason: 'timezone-changed' }
      if (!versionSnap.exists()) return { status: 'unavailable' }
      const version = toDoc(versionSnap, versionDocId)

      let baseline: CreditBaseline | null = null
      if (!claimsChallenge(version.data)) {
        if (predSnap) {
          const predDoc = toDoc(predSnap, pred as string)
          // The exact predecessor must still be an ordered-before sibling of the exact source.
          const order = choosePredecessor(version, childId, projectId, [predDoc])
          if (!order.ok || order.docId !== pred) return { status: 'stale', reason: 'source-changed' }
          baseline = { kind: 'version', doc: predDoc }
        } else {
          baseline = { kind: 'starter' }
        }
      } else if (pred !== null) {
        return { status: 'stale', reason: 'source-changed' }
      }
      const proven = proveBuildStudioCredit({ childId, projectId, versionId, version, baseline })
      if (!proven.ok) return { status: 'unproven', reason: proven.reason }

      const fresh = buildCreditProposal({ familyId, childId, timeZone, versionDocId, proof: proven.proof })
      if (!fresh || proposalKey(fresh) !== proposalKey(proposal)) {
        return { status: 'stale', reason: 'source-changed' }
      }

      const buckets = await readBuckets(get, familyId, childId, fresh.schoolDate)
      const admission = decideAdmission(fresh, buckets)
      if (!admission.ok) return { status: 'failed', retryable: false, reason: 'malformed-budget' }
      if (!admission.decision.admitted) return { status: 'declined', reason: admission.decision.reason }
      // An hours row with no receipt is a state this writer never produces.
      if (hoursSnap.exists()) return { status: 'failed', retryable: false, reason: 'hours-conflict' }

      // ── then ALL writes ──
      const day = buckets.get(fresh.schoolDate) as { exists: boolean; data: unknown }
      const parsedDay = parseCreditDay(day.exists, day.data, childId, fresh.schoolDate)
      if (!parsedDay) return { status: 'failed', retryable: false, reason: 'malformed-budget' }

      const receiptId = creditReceiptId(childId, projectId, versionId)
      const dayId = creditDayId(childId, fresh.schoolDate)
      const hoursDocId = creditHoursId(childId, projectId, versionId)
      const settled: BuildStudioSettledCredit = {
        receiptId,
        childId,
        projectId,
        versionId,
        versionDocId,
        source: fresh.source,
        schoolDate: fresh.schoolDate,
        timeZone: fresh.timeZone,
        workMs: fresh.workMs,
        minutes: fresh.minutes,
        subjectBucket: fresh.subjectBucket,
        hoursDocId,
        dayId,
        sourceDigest: fresh.sourceDigest,
        baselineDigest: fresh.baselineDigest,
        predecessorDocId: fresh.predecessorDocId,
      }

      tx.set(r.receipt, { schema: 1, ...settled, createdAt: serverTimestamp() })
      tx.set(doc(buildStudioCreditDaysCollection(familyId), dayId), {
        schema: 1,
        childId,
        schoolDate: fresh.schoolDate,
        entries: [
          ...parsedDay.entries,
          { receiptId, source: fresh.source, atMs: fresh.workMs, minutes: fresh.minutes },
        ],
      })
      const provenance: BuildStudioCreditProvenance = {
        schema: 1,
        receiptId,
        kind: fresh.source.kind,
        projectId,
        versionId,
        versionDocId,
        ...(fresh.source.kind === 'challenge'
          ? {
              challengeId: fresh.source.challengeId,
              challengeRevision: fresh.source.challengeRevision,
            }
          : {}),
        admittedMinutes: fresh.minutes,
        workAtMs: fresh.workMs,
        timeZone: fresh.timeZone,
      }
      tx.set(
        r.hours,
        assertAttributed({
          childId,
          date: fresh.schoolDate,
          minutes: fresh.minutes,
          blockType: DayBlockType.Project,
          subjectBucket: fresh.subjectBucket,
          source: BUILD_STUDIO_CREDIT_HOURS_SOURCE,
          notes: creditNote(fresh.source),
          buildStudioCredit: provenance,
        }),
      )
      return { status: 'credited', receipt: settled }
    })
  } catch {
    // The transaction outcome is unknown to this call: the commit may have landed.
    // Confirming again is safe — the receipt turns it into `alreadySettled`.
    return { status: 'failed', retryable: true, reason: 'write-failed' }
  }
}

// ── 3. Correction ───────────────────────────────────────────────────────────

/**
 * Lower, or delete, the visible `hours` row of ONE credit.
 *
 * `expectedMinutes` is the row's minutes as the parent saw them; if the row has
 * since changed, been deleted or is not this credit's, nothing is written and the
 * caller reloads. A lower positive whole number, or `'delete'`; never an
 * increase. The receipt, the day bucket and every other field of the row —
 * child, date, subject, block, source, provenance — are untouched.
 */
export async function correctBuildStudioCreditHours(
  scope: CreditScope & { expectedMinutes: number; minutes: number | 'delete' },
): Promise<CreditCorrectionResult> {
  if (!validScope(scope)) return { status: 'invalid', reason: 'bad-scope' }
  const { familyId, childId, projectId, versionId, expectedMinutes, minutes } = scope
  if (!Number.isSafeInteger(expectedMinutes) || expectedMinutes <= 0) {
    return { status: 'invalid', reason: 'not-a-positive-whole-number' }
  }
  if (minutes !== 'delete') {
    if (!Number.isSafeInteger(minutes) || minutes <= 0) {
      return { status: 'invalid', reason: 'not-a-positive-whole-number' }
    }
    if (minutes >= expectedMinutes) return { status: 'invalid', reason: 'not-lower' }
  }
  const r = refs(familyId, childId, projectId, versionId)

  try {
    return await runTransaction(db, async (tx: Transaction): Promise<CreditCorrectionResult> => {
      const receiptSnap = await tx.get(r.receipt)
      const hoursSnap = await tx.get(r.hours)
      if (!receiptSnap.exists()) return { status: 'noReceipt' }
      const receipt = parseReceipt(receiptSnap.data(), scope)
      if (!receipt) return { status: 'stale', reason: 'row-mismatch' }
      if (!hoursSnap.exists()) return { status: 'stale', reason: 'row-missing' }

      const row = hoursSnap.data() as unknown as Record<string, unknown>
      const prov = row.buildStudioCredit as Record<string, unknown> | undefined
      if (
        row.childId !== childId ||
        row.date !== receipt.schoolDate ||
        row.source !== BUILD_STUDIO_CREDIT_HOURS_SOURCE ||
        !prov ||
        prov.receiptId !== receipt.receiptId
      ) {
        return { status: 'stale', reason: 'row-mismatch' }
      }
      if (row.minutes !== expectedMinutes) return { status: 'stale', reason: 'row-changed' }

      if (minutes === 'delete') {
        tx.delete(r.hours)
        return { status: 'deleted' }
      }
      tx.update(r.hours, { minutes })
      return { status: 'corrected', minutes }
    })
  } catch {
    return { status: 'failed', retryable: true }
  }
}

// ── 4. The exact saved version, for the parent ──────────────────────────────

/**
 * The exact version a credit names — never a newer one, never another child's.
 *
 * `provenance` is the FULL provenance the credit's `hours` row recorded. Its
 * schema, project (Apple Dash), `versionDocId` and `receiptId` must equal the
 * deterministic ids of the SELECTED child and the recorded project and version;
 * the document is then read from the server and must agree with every part of it.
 * A credited link to an older authored revision still opens its exact archived
 * source: the challenge is matched against what was recorded, not today's
 * revision. `unavailable` (not there), `malformed` (there, but not what the
 * provenance says) and `failed` (could not be read) are different answers and
 * none of them falls back to another route.
 */
export async function readBuildStudioCreditedVersion(args: {
  familyId: string
  childId: string
  provenance: BuildStudioCreditProvenance
}): Promise<CreditVersionReadResult> {
  const { familyId, childId, provenance } = args
  const scope = { familyId, childId, projectId: provenance?.projectId, versionId: provenance?.versionId }
  if (!validScope(scope as CreditScope) || (provenance.kind !== 'challenge' && provenance.kind !== 'freeBuild')) {
    return { status: 'malformed', reason: 'bad-scope' }
  }
  const { projectId, versionId } = provenance
  const id = buildStudioVersionDocId(childId, projectId, versionId)
  // The recorded provenance must be THIS child's, for Apple Dash, and name this
  // scope's deterministic ids. A link recorded for a sibling never opens here,
  // even if this child has a save with the same version id.
  if (
    provenance.schema !== 1 ||
    projectId !== BUILD_STUDIO_PROJECT_ID ||
    provenance.versionDocId !== id ||
    provenance.receiptId !== creditReceiptId(childId, projectId, versionId)
  ) {
    return { status: 'malformed', reason: 'bad-provenance' }
  }
  if (provenance.kind === 'challenge') {
    if (
      typeof provenance.challengeId !== 'string' ||
      provenance.challengeId === '' ||
      !Number.isSafeInteger(provenance.challengeRevision)
    ) {
      return { status: 'malformed', reason: 'bad-provenance' }
    }
  } else if (provenance.challengeId !== undefined || provenance.challengeRevision !== undefined) {
    return { status: 'malformed', reason: 'bad-provenance' }
  }

  let snap
  try {
    snap = await getDocFromServer(doc(buildStudioVersionsCollection(familyId), id))
  } catch {
    return { status: 'failed' }
  }
  if (!snap.exists()) return { status: 'unavailable' }
  const data = snap.data() as unknown as Record<string, unknown>

  if (data.childId !== childId || data.projectId !== projectId || data.versionId !== versionId) {
    return { status: 'malformed', reason: 'bad-identity' }
  }
  if (!validatedArchiveFiles(data)) return { status: 'malformed', reason: 'bad-archive' }

  if (provenance.kind === 'challenge') {
    const attempt = normalizeChallengeAttempt(data.challengeAttempt)
    if (
      !attempt ||
      attempt.childId !== childId ||
      attempt.projectId !== projectId ||
      attempt.versionId !== versionId ||
      attempt.challengeId !== provenance.challengeId ||
      attempt.challengeRevision !== provenance.challengeRevision
    ) {
      return { status: 'malformed', reason: 'bad-challenge' }
    }
  } else if (claimsChallenge(data)) {
    return { status: 'malformed', reason: 'bad-challenge' }
  }
  return { status: 'ok', version: { ...(data as unknown as BuildStudioVersion), id: snap.id } }
}
