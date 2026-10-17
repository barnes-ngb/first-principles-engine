// ── The one write that records a native-program observation (FEAT-241) ───────
//
// `nativeProgressObservations` and nothing else. This module imports exactly one
// collection helper, and the list of what it deliberately does NOT touch is the
// point of the feature:
//
//   • no `activityConfigs` — no `currentPosition`, no `totalUnits`, and in
//     particular NOT `setActivityConfigPosition`, whose whole job is to move a
//     workbook's bookmark and, through `syncActivityPositionToModel`, the
//     learner model with it;
//   • no `childSkillMaps`, `skillSnapshots` or `evaluations` — a parent reading a
//     number off a screen has not evidenced a skill;
//   • no `learnerModels` **from an ordinary report**, in either direction: typing
//     "lesson 42" still changes nothing anywhere. The ONE exception, authorized
//     with FEAT-242 and implemented through the shared completion coordinator
//     rather than by reaching into the model from here, is a CORRECTION that
//     invalidates a whole-program completion which cited the corrected row — see
//     `planCompletionRevokeForCorrection` at the call site below for why that one
//     has to share this transaction;
//   • no `hours`, `hoursAdjustments` or `days` — nothing here is time taught;
//   • no `xpLedger`, no `dailyArmorSessions` — nothing here is earned;
//   • no `artifacts` and no Storage — a photo is not required and none is taken.
//
// Those are the propose-and-confirm rails in `CLAUDE.md`. An isolated collection
// is what makes this feature a small change instead of a proposal against all of
// them: the rails are not touched, not read, and not reachable from here.
//
// ── Append-only, and idempotent on retry ────────────────────────────────────
//
// One write per confirmed save, at a document id built from the draft's own
// `entryKey`, inside a transaction that **creates or does nothing**. So the same
// confirmed save retried after a failure — the ordinary case on a phone, where
// the first attempt may well have landed and lost its answer — cannot write a
// second row, and cannot overwrite the first either: if the document is already
// there the stored row is returned with `alreadyRecorded`, and the caller shows a
// receipt for what is actually on the record rather than for what it just sent.
//
// A row once written is never updated. A correction is a NEW row carrying
// `correctsObservationId`, and the row it corrects stays exactly as it was.
//
// ── Why it re-validates what the form already checked ───────────────────────
//
// The form's rule module is the same rule, and this is still not a duplicate: the
// UI check decides what to TELL a parent, and this one decides what may be
// STORED. A caller reaching here with a non-integer number, an impossible date or
// an unknown program is a bug, and a writer that trusted its caller would record
// the bug rather than refuse it.

import { doc, runTransaction } from 'firebase/firestore'

import {
  NOTE_MAX_LENGTH,
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../types/nativeProgress'
import { correctionMarkerId } from '../types/programCompletion'
import type {
  NativeProgressCorrectionMarker,
  ProgramCompletionProgram,
} from '../types/programCompletion'
import { todayKey } from '../utils/dateKey'
import { parseDateYmd } from '../utils/format'
import {
  db,
  nativeProgressCorrectionMarkersCollection,
  nativeProgressObservationDocId,
  nativeProgressObservationsCollection,
} from './firestore'
import {
  planCompletionRevokeForCorrection,
  readRecordedCorrectionRevocation,
} from './programCompletionWrites'

/** Thrown before anything is written. The message is parent-readable. */
export class NativeProgressRefused extends Error {}

export interface SaveNativeProgressArgs {
  /** The family the draft was started under, pinned by the caller. */
  familyId: string
  /** The child the draft was started for, pinned by the caller. */
  childId: string
  /** The draft's identity. Reused by a retry; new for a new entry. */
  entryKey: string
  /** The reviewed content — validated again here, not trusted. */
  observation: {
    program: NativeProgressProgram
    nativeNumber: number
    meaning: NativeProgressMeaning
    observedOn: string
    source: NativeProgressSource
    note?: string
  }
  /** The row being corrected, when this is a correction. */
  correctsObservationId?: string
  /**
   * Entry time. Injected so a test can pin it and assert it stays separate from
   * `observedOn`; validated like any other input, because an unparseable stamp
   * would make the whole history's "Entered …" column meaningless.
   */
  recordedAt?: string
  /**
   * Today, as `YYYY-MM-DD` in the family's own local calendar.
   *
   * Defaults to `todayKey()` — the app's one definition of a local day, the same
   * one the form's date field is bounded by. Injectable so a test pins it rather
   * than depending on the wall clock (review item 6).
   */
  today?: string
}

/**
 * `entryKey` shape. Narrow on purpose: it becomes part of a document path, so a
 * value containing a slash would address a different collection entirely.
 */
const ENTRY_KEY = /^[A-Za-z0-9_-]{8,64}$/

export const NATIVE_PROGRESS_CORRECTION_GONE =
  'The entry you were correcting is no longer there, so nothing was saved.'

export const NATIVE_PROGRESS_CORRECTION_OTHER_CHILD =
  "That entry belongs to a different child, so it can't be corrected from here."

/**
 * A correction may not change which program the entry is about.
 *
 * `correctsObservationId` is the only thing joining two rows, and a row's program
 * decides the unit its number is read in — so a "correction" that moved a lesson
 * 42 entry to Fast Phonics would silently restate it as peak 41 and leave the
 * history reading as though both had been observed. A different program is a
 * different observation, which is a new entry rather than a fix (review item 7).
 */
export const NATIVE_PROGRESS_CORRECTION_OTHER_PROGRAM =
  'That entry is about a different program. Save this as a new entry instead of a correction.'

export interface SaveNativeProgressResult {
  /** The row on the record — the one just written, or the one already there. */
  observation: NativeProgressObservation
  /**
   * What this save did to a confirmed whole-program completion that CITED the
   * row being corrected (FEAT-242), when it did anything.
   *
   * `revoked` — the completion was withdrawn and its coverage retracted in this
   * same transaction. `pending` — withdrawn here, but the learner model could not
   * be reached, so the surface must offer the apply retry rather than claim the
   * learning picture was updated. Absent — nothing cited this row, or the
   * correction still supports the completion.
   */
  completionRevoked?: { status: 'revoked' | 'pending'; detail?: string }
  /**
   * True when this entry was already stored and this call wrote nothing.
   *
   * A retry whose first attempt landed. Not an error: the parent's intent is on
   * the record, so the caller shows the receipt for the STORED row.
   */
  alreadyRecorded: boolean
}

/**
 * Record one observation. Returns the row on the record, and whether this call
 * is the one that put it there.
 *
 * Throws {@link NativeProgressRefused} for anything it will not store; the
 * message is the sentence a caller renders. Nothing partial is ever left behind —
 * there is exactly one write, and every check runs before it.
 */
export async function saveNativeProgressObservation(
  args: SaveNativeProgressArgs,
): Promise<SaveNativeProgressResult> {
  const { familyId, childId, entryKey, observation } = args

  if (!familyId) throw new NativeProgressRefused('No family is signed in.')
  // A child id reaches a document path, and an empty one would silently write to
  // `__{entryKey}` — a row belonging to nobody.
  if (!childId || /[/\s]/.test(childId)) {
    throw new NativeProgressRefused('No child is selected for this entry.')
  }
  if (!ENTRY_KEY.test(entryKey)) {
    throw new NativeProgressRefused('That entry could not be identified. Start it again.')
  }

  if (!Object.values(NativeProgressProgram).includes(observation.program)) {
    throw new NativeProgressRefused('Pick which program this number came from.')
  }
  if (!Object.values(NativeProgressMeaning).includes(observation.meaning)) {
    throw new NativeProgressRefused('Pick what the number means.')
  }
  if (!Object.values(NativeProgressSource).includes(observation.source)) {
    throw new NativeProgressRefused('Pick where the number came from.')
  }

  // Positive, whole, and storable exactly. There is deliberately NO ceiling: a
  // bound this repo cannot derive would be an invented program range, and a real
  // number read off a real screen must never be refused as a typo. What it can
  // know is that past `Number.MAX_SAFE_INTEGER` the value stored is not the value
  // sent, which is a property of the field (review item 5).
  const n = observation.nativeNumber
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new NativeProgressRefused('Use a whole number, like 42.')
  }

  // The calendar check, not just the shape — `2026-02-30` matches the pattern and
  // is not a day.
  if (!parseDateYmd(observation.observedOn)) {
    throw new NativeProgressRefused('Use a real date, like 2026-10-12.')
  }
  // ...and not a day that has not happened. The same refusal as the form's, here
  // as well as there, because the form decides what to TELL a parent and this
  // decides what may be STORED — and a future observation is the one value that
  // cannot be a reading of something that happened. Backdating stays freely
  // allowed; the form's lower typo guard is a UI convenience and is not re-made
  // here, so the writer refuses only what is false rather than what looks odd.
  const localToday = args.today ?? todayKey()
  if (!parseDateYmd(localToday)) {
    throw new NativeProgressRefused('Could not read today’s date, so nothing was saved.')
  }
  if (observation.observedOn > localToday) {
    throw new NativeProgressRefused("That day hasn't happened yet.")
  }

  // The entry time is validated too, since it may be injected: a row whose
  // `recordedAt` cannot be read would render an "Entered" date of nothing.
  const recordedAt = args.recordedAt ?? new Date().toISOString()
  if (Number.isNaN(new Date(recordedAt).getTime())) {
    throw new NativeProgressRefused('Could not stamp the time of this entry, so nothing was saved.')
  }

  // The note's one bound, trimmed once and checked against the SAME constant the
  // form checks — imported rather than restated, because two copies of a length
  // would drift and the longer one would decide what is stored. Refused rather
  // than truncated: a note cut mid-sentence is a sentence the parent did not
  // write, stored as though she had.
  const note = observation.note?.trim() || undefined
  if (note && note.length > NOTE_MAX_LENGTH) {
    throw new NativeProgressRefused(`Keep the note under ${NOTE_MAX_LENGTH} characters.`)
  }

  const id = nativeProgressObservationDocId(childId, entryKey)

  const correctsObservationId = args.correctsObservationId?.trim() || undefined
  if (correctsObservationId === id) {
    throw new NativeProgressRefused('An entry cannot correct itself.')
  }

  const row: NativeProgressObservation = {
    id,
    childId,
    program: observation.program,
    nativeNumber: n,
    meaning: observation.meaning,
    observedOn: observation.observedOn,
    source: observation.source,
    note,
    recordedAt,
    entryKey,
    correctsObservationId,
  }

  const rows = nativeProgressObservationsCollection(familyId)
  const ref = doc(rows, id)
  const markers = nativeProgressCorrectionMarkersCollection(familyId)

  /**
   * The marker for a corrected row (FEAT-242). Written for EVERY correction —
   * not only when a completion happens to cite the row today — because a
   * completion confirmed tomorrow has no other way to learn, inside its own
   * transaction, that the row it is about to cite has been superseded.
   */
  const markerFor = (correctedId: string): NativeProgressCorrectionMarker => ({
    id: correctionMarkerId(correctedId),
    childId,
    correctionObservationId: id,
    correctionEntryKey: entryKey,
    correctedAt: recordedAt,
  })

  // One transaction, both reads inside it: whether this entry is already on the
  // record, and — for a correction — whether the row it names is still there and
  // still this child's. Reading the original INSIDE the transaction is what makes
  // the link trustworthy: a `getDoc` beforehand could be followed by the original
  // being corrected away, leaving a correction of nothing.
  return runTransaction(db, async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists()) {
      const stored = existing.data()
      const storedCorrects = stored?.correctsObservationId
      // A retry whose first attempt landed must not silently omit the marker:
      // the row is on the record either way, and a missing marker would leave a
      // corrected row looking citable forever. Read first, then write — the
      // transaction's ordering rule.
      const markerRef = storedCorrects
        ? doc(markers, correctionMarkerId(storedCorrects))
        : null
      const markerSnap = markerRef ? await tx.get(markerRef) : null
      // ...and the completion coordinator is consulted on this path too. The
      // first attempt's ANSWER was lost, so what it did to a finished-program
      // record citing this row is unknown — and the retry's receipt may not
      // claim "nothing else changed" without knowing. The plan is idempotent:
      // an ACTIVE completion citing the row is withdrawn, anything else is a
      // no-op, and the status it returns is what the receipt says. Reads here,
      // writes below, in that order.
      //
      // The program is read off the STORED row, not off this caller's payload:
      // the record is what was written, and a retry's payload is not.
      const retryRevoke = storedCorrects
        ? await planCompletionRevokeForCorrection(tx, {
            familyId,
            childId,
            program: (stored?.program ?? observation.program) as ProgramCompletionProgram,
            correctedObservationId: storedCorrects as string,
            correctionObservationId: id,
            correctionEntryKey: entryKey,
            nowIso: recordedAt,
          })
        : null
      // ...and when the plan has nothing to do, the act this correction already
      // performed is recovered from its own recorded event (review item 5). The
      // first attempt may have committed the withdrawal and lost its answer, in
      // which case there is no active completion left to revoke and a silent
      // `none` would let the receipt claim nothing else changed. This reads only
      // THIS correction's recorded act, so a newer, unrelated confirmation is
      // neither touched nor spoken for.
      const recordedRevoke =
        storedCorrects && (!retryRevoke || retryRevoke.status === 'none')
          ? await readRecordedCorrectionRevocation(tx, {
              familyId,
              childId,
              program: (stored?.program ?? observation.program) as ProgramCompletionProgram,
              correctionObservationId: id,
              correctionEntryKey: (stored?.entryKey as string) ?? entryKey,
            })
          : null

      if (markerRef && !markerSnap?.exists()) {
        tx.set(markerRef, markerFor(storedCorrects as string))
      }
      retryRevoke?.commit(tx)
      // The row itself is never overwritten. The first write of an entry key is
      // the record.
      const retryOutcome =
        retryRevoke && retryRevoke.status !== 'none'
          ? { status: retryRevoke.status, detail: retryRevoke.detail }
          : recordedRevoke
      return {
        observation: stored ? { ...stored, id } : row,
        alreadyRecorded: true,
        ...(retryOutcome
          ? {
              completionRevoked: {
                status: retryOutcome.status,
                ...(retryOutcome.detail ? { detail: retryOutcome.detail } : {}),
              },
            }
          : {}),
      }
    }

    let revoke: Awaited<ReturnType<typeof planCompletionRevokeForCorrection>> | null = null

    if (correctsObservationId) {
      const original = await tx.get(doc(rows, correctsObservationId))
      if (!original.exists()) {
        throw new NativeProgressRefused(NATIVE_PROGRESS_CORRECTION_GONE)
      }
      // A correction may not reach across children — that field is the only
      // thing joining two rows, and nothing else would notice if it joined two
      // children's records.
      const originalRow = original.data()
      if (originalRow?.childId !== childId) {
        throw new NativeProgressRefused(NATIVE_PROGRESS_CORRECTION_OTHER_CHILD)
      }
      // ...nor across programs, for the same reason and with the same blast
      // radius: the program decides the unit the number is read in.
      if (originalRow?.program !== observation.program) {
        throw new NativeProgressRefused(NATIVE_PROGRESS_CORRECTION_OTHER_PROGRAM)
      }

      // ── The ONE authorized integration (FEAT-242) ─────────────────────
      //
      // This collection is otherwise isolated from every rail, and still is: a
      // plain report never moves a plan, a position or a skill, and this call
      // changes nothing about that. What it does is close a hole the isolation
      // could not: a parent can CONFIRM, separately and explicitly, that a whole
      // program is finished, and may cite one of these rows as her evidence.
      // Correcting that row to "he hadn't finished" while the confirmation's
      // coverage stayed live would leave the app's advice resting on a record the
      // parent had just corrected — and leaving it to an optional button means
      // the disagreement lasts until she happens to find one.
      //
      // So the revocation is planned HERE (reads) and committed in THIS
      // transaction (writes below), which is the only way the two can never
      // disagree. It is still narrow: it fires only for a correction, only when
      // an ACTIVE completion cites exactly this row, and only when the correction
      // no longer supports it. It never transfers the claim to the corrected row
      // — a completion can only be re-established by a fresh confirmation.
      revoke = await planCompletionRevokeForCorrection(tx, {
        familyId,
        childId,
        program: observation.program as ProgramCompletionProgram,
        correctedObservationId: correctsObservationId,
        correctionObservationId: id,
        correctionEntryKey: entryKey,
        nowIso: recordedAt,
      })
    }

    // Every read is done; the writes begin here (Firestore's ordering rule).
    tx.set(ref, row)
    if (correctsObservationId) {
      // The marker is written for the correction itself, independent of any
      // completion. Overwritten on purpose when a row is corrected twice: the
      // marker answers "has this been corrected, and by what most recently".
      tx.set(doc(markers, correctionMarkerId(correctsObservationId)), markerFor(correctsObservationId))
    }
    revoke?.commit(tx)
    return {
      observation: row,
      alreadyRecorded: false,
      ...(revoke && revoke.status !== 'none'
        ? {
            completionRevoked: {
              status: revoke.status,
              ...(revoke.detail ? { detail: revoke.detail } : {}),
            },
          }
        : {}),
    }
  })
}
