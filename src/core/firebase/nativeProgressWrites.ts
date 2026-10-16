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
//   • no `learnerModels`, `childSkillMaps`, `skillSnapshots` or `evaluations` —
//     a parent reading a number off a screen has not evidenced a skill;
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
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../types/nativeProgress'
import { parseDateYmd } from '../utils/format'
import {
  db,
  nativeProgressObservationDocId,
  nativeProgressObservationsCollection,
} from './firestore'

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
  /** Entry time. Injected so a test can assert it is separate from `observedOn`. */
  recordedAt?: string
}

/** The highest value the writer will store. Mirrors the form's typo guard. */
export const NATIVE_NUMBER_STORED_MAX = 9999

/**
 * `entryKey` shape. Narrow on purpose: it becomes part of a document path, so a
 * value containing a slash would address a different collection entirely.
 */
const ENTRY_KEY = /^[A-Za-z0-9_-]{8,64}$/

export const NATIVE_PROGRESS_CORRECTION_GONE =
  'The entry you were correcting is no longer there, so nothing was saved.'

export const NATIVE_PROGRESS_CORRECTION_OTHER_CHILD =
  "That entry belongs to a different child, so it can't be corrected from here."

export interface SaveNativeProgressResult {
  /** The row on the record — the one just written, or the one already there. */
  observation: NativeProgressObservation
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

  const n = observation.nativeNumber
  if (!Number.isInteger(n) || n < 1 || n > NATIVE_NUMBER_STORED_MAX) {
    throw new NativeProgressRefused('Use a whole number, like 42.')
  }

  // The calendar check, not just the shape — `2026-02-30` matches the pattern and
  // is not a day.
  if (!parseDateYmd(observation.observedOn)) {
    throw new NativeProgressRefused('Use a real date, like 2026-10-12.')
  }

  const recordedAt = args.recordedAt ?? new Date().toISOString()
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
    note: observation.note?.trim() ? observation.note.trim() : undefined,
    recordedAt,
    entryKey,
    correctsObservationId,
  }

  const rows = nativeProgressObservationsCollection(familyId)
  const ref = doc(rows, id)

  // One transaction, both reads inside it: whether this entry is already on the
  // record, and — for a correction — whether the row it names is still there and
  // still this child's. Reading the original INSIDE the transaction is what makes
  // the link trustworthy: a `getDoc` beforehand could be followed by the original
  // being corrected away, leaving a correction of nothing.
  return runTransaction(db, async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists()) {
      const stored = existing.data()
      // Never overwritten. The first write of an entry key is the record.
      return {
        observation: stored ? { ...stored, id } : row,
        alreadyRecorded: true,
      }
    }

    if (correctsObservationId) {
      const original = await tx.get(doc(rows, correctsObservationId))
      if (!original.exists()) {
        throw new NativeProgressRefused(NATIVE_PROGRESS_CORRECTION_GONE)
      }
      // A correction may not reach across children — that field is the only
      // thing joining two rows, and nothing else would notice if it joined two
      // children's records.
      if (original.data()?.childId !== childId) {
        throw new NativeProgressRefused(NATIVE_PROGRESS_CORRECTION_OTHER_CHILD)
      }
    }

    tx.set(ref, row)
    return { observation: row, alreadyRecorded: false }
  })
}
