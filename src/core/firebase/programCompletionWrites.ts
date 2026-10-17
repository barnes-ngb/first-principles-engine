// ── The writes behind a confirmed whole-program completion (FEAT-242) ─────
//
// Three parent acts and one coordinator, each a SINGLE transaction over the
// documents it must agree with:
//
//   confirmProgramCompletion   — the one primary action. Records the parent's
//                                assertion as an immutable event, makes it the
//                                active projection, and writes the reviewed
//                                coverage to the learner model, atomically.
//   applyProgramCompletionProjection — the explicit, safe retry. Finishes an
//                                application (or a withdrawal) that could not
//                                reach a learner model, and applies a reviewed
//                                mapping upgrade. Never runs on a view load.
//   withdrawProgramCompletion  — the correction. Ends the active confirmation
//                                and retracts exactly its own contribution.
//   planCompletionRevokeForCorrection — the coordinator FEAT-241's writer calls
//                                inside ITS transaction, so correcting a cited
//                                report into something that no longer supports a
//                                completion invalidates that completion in the
//                                same persistence boundary.
//
// ── Why these are real transactions, not read-then-write ──────────────────
//
// Every one of them has to agree with at least two documents (the event, the
// active projection, the learner model — and for a confirmation, the cited
// report as well). A `getDoc` beforehand could be followed by a second tap, a
// concurrent eval write-back, or a correction of the very row being cited. So
// all reads happen inside the transaction and before any write, which is also
// what makes the single-active-confirmation rule an invariant rather than a
// race: the state document is the one contended document, and its id is
// derivable without a query (a transaction cannot run one).
//
// ── Rails ─────────────────────────────────────────────────────────────────
//
// Writes exactly three collections: `programCompletionEvents`,
// `programCompletionState` and `learnerModels`. Names no `activityConfigs`
// field, no `skillSnapshots`, no `hours` / `hoursAdjustments` / `days`, no
// `xpLedger`, no `artifacts`, and nothing in `firestore.rules`. It never creates
// an `attestation`, never queues an `openQuestion`, and never marks a
// `completedProgram` (the seeder reads that as `solid`, which a completion is
// expressly not).

import { doc, getDoc, getDocs, query, runTransaction, where } from 'firebase/firestore'
import type { Transaction } from 'firebase/firestore'

import {
  completionMappingFor,
  type ProgramCompletionMapping,
} from '../foundations/fastPhonicsCompletion'
import {
  applyCompletionCoverage,
  completionCoverageHasActiveRefs,
  completionCoverageIsApplied,
  withdrawCompletionCoverage,
} from '../foundations/programCompletionProjection'
import { promotedModelStatus } from '../foundations/modelStatus'
import {
  CompletionAssistance,
  CompletionEventKind,
  CompletionProjectionStatus,
  CompletionWithdrawReason,
  MAX_COMPLETION_EVENTS,
  completionIdFor,
  correctionMarkerId,
  programCompletionEventId,
  programCompletionStateId,
  type ProgramCompletionAssertion,
  type ProgramCompletionEvent,
  type ProgramCompletionProgram,
  type ProgramCompletionState,
} from '../types/programCompletion'
import {
  NativeProgressMeaning,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../types/nativeProgress'
import { todayKey } from '../utils/dateKey'
import { parseDateYmd } from '../utils/format'
import {
  db,
  learnerModelsCollection,
  nativeProgressCorrectionMarkersCollection,
  nativeProgressObservationsCollection,
  programCompletionEventsCollection,
  programCompletionStateCollection,
} from './firestore'
import type { LearnerModel } from '../types/learnerModel'

/** Thrown before anything is written. The message is parent-readable. */
export class ProgramCompletionRefused extends Error {}

export const PROGRAM_COMPLETION_NO_MAPPING =
  'This app has no reviewed coverage map for that program, so it cannot record it as finished.'
export const PROGRAM_COMPLETION_ALREADY_ACTIVE =
  'This program is already recorded as finished. Correct the existing entry instead of adding another.'
export const PROGRAM_COMPLETION_NOT_ACTIVE =
  'That entry is no longer the active one, so nothing was changed. Reload and check what is recorded now.'
export const PROGRAM_COMPLETION_NOTHING_ACTIVE =
  'There is nothing recorded as finished for this program, so there was nothing to change.'
export const PROGRAM_COMPLETION_REPORT_GONE =
  'The entry you were pointing at is no longer there, so nothing was saved.'
export const PROGRAM_COMPLETION_REPORT_OTHER_CHILD =
  "That entry belongs to a different child, so it can't be used here."
export const PROGRAM_COMPLETION_REPORT_NOT_ELIGIBLE =
  'That entry does not say this program was finished, so it cannot be used as the evidence for it.'
export const PROGRAM_COMPLETION_TOO_MANY_EVENTS =
  'This program has as many recorded changes as we keep. Nothing was saved — tell someone before adding more.'
export const PROGRAM_COMPLETION_REPORT_CORRECTED =
  'The entry you pointed at has since been corrected, so it cannot be the evidence for this. Check the corrected entry and confirm again.'
export const PROGRAM_COMPLETION_SOURCE_CHECK_FAILED =
  'We could not check whether that entry has been corrected, so nothing was saved. Try again in a moment.'
export const PROGRAM_COMPLETION_RECORD_CHECK_FAILED =
  'We could not check what is already recorded here, so nothing was saved. Try again in a moment.'
/**
 * A retry of a stored confirmation arrived naming a DIFFERENT entry as its
 * evidence (or none).
 *
 * The record is what was confirmed, so the retry is refused rather than
 * finished against a citation nobody has validated for it. Re-confirming
 * against another entry is a new act, under a new key.
 */
export const PROGRAM_COMPLETION_CITATION_CHANGED =
  'This entry is already recorded, and it points at a different saved entry than the one you have just sent. Nothing was changed — reload and check what is recorded.'

/** `entryKey` shape. Narrow: it becomes part of a document path. */
const ENTRY_KEY = /^[A-Za-z0-9_-]{8,64}$/

/** The content of one confirmation, as the surface reviewed it. */
export interface ReviewedCompletion {
  /** `YYYY-MM-DD` — the day the parent observed the program was finished. */
  observedOn: string
  source: NativeProgressSource
  /** Optional; `unknown` when she did not say. */
  assistance?: CompletionAssistance
  note?: string
  /** An existing native-progress row to cite, when she picked one. */
  reportObservationId?: string
}

export interface ConfirmProgramCompletionArgs {
  familyId: string
  childId: string
  program: ProgramCompletionProgram
  /** The draft's identity. Reused by a retry; new for a new entry. */
  entryKey: string
  completion: ReviewedCompletion
  /** Entry time. Injectable so a test can pin it apart from `observedOn`. */
  recordedAt?: string
  /** Today in the family's local calendar. Injectable, defaults to `todayKey()`. */
  today?: string
}

export interface ProgramCompletionWriteResult {
  state: ProgramCompletionState
  /**
   * The event this call recorded, or `null` when it recorded none — a retry that
   * only finished an outstanding application writes no new act, and saying so is
   * the difference between a receipt and a claim.
   */
  event: ProgramCompletionEvent | null
  /** The act was already on the record and this call did not record it again. */
  alreadyRecorded: boolean
  /** Coverage is on the learner model at the active mapping version. */
  applied: boolean
  /** Truthful pending: the act is recorded, the graph has not been updated. */
  applicationPending: boolean
  conceptIds: string[]
  promotedConceptIds: string[]
}

/** The one definition of "may this report stand as the evidence for completion?" */
export function reportSupportsCompletion(
  row: Pick<NativeProgressObservation, 'program' | 'meaning' | 'nativeNumber'> | undefined | null,
  mapping: ProgramCompletionMapping,
  program: ProgramCompletionProgram,
): boolean {
  if (!row) return false
  if (row.program !== program) return false
  // `workingOn` and `uncertain` never qualify, however large the number: the
  // whole point of FEAT-241's meaning field is that "around peak 20" is not
  // "finished peak 20".
  if (row.meaning !== NativeProgressMeaning.CompletedThrough) return false
  // The last unit exactly. A larger number is not a stronger claim — it is an
  // unsupported one, and it must not auto-qualify.
  return row.nativeNumber === mapping.citableFinalPosition
}

/** An empty projection state for a child+program nothing has been recorded for. */
function emptyState(
  childId: string,
  program: ProgramCompletionProgram,
  nowIso: string,
): ProgramCompletionState {
  return {
    id: programCompletionStateId(childId, program),
    childId,
    program,
    activeEntryKey: null,
    activeAssertion: null,
    activeConfirmedAt: null,
    activeMappingVersion: null,
    projection: { status: CompletionProjectionStatus.Withdrawn },
    eventCount: 0,
    lastEventAt: nowIso,
    sourceConflict: null,
    updatedAt: nowIso,
  }
}

/** Shared argument checks for every act. */
function requireIdentity(familyId: string, childId: string, entryKey: string): void {
  if (!familyId) throw new ProgramCompletionRefused('No family is signed in.')
  if (!childId || /[/\s]/.test(childId)) {
    throw new ProgramCompletionRefused('No child is selected for this entry.')
  }
  if (!ENTRY_KEY.test(entryKey)) {
    throw new ProgramCompletionRefused('That entry could not be identified. Start it again.')
  }
}

/** `YYYY-MM-DD` → an ISO stamp at the start of that day, in UTC. */
export function observedDayToIso(observedOn: string): string {
  return `${observedOn}T00:00:00.000Z`
}

/**
 * Has this row been corrected by a row written BEFORE correction markers
 * existed? Fails CLOSED.
 *
 * The marker (read by id inside the transaction) covers every correction from
 * FEAT-242 onwards, including one committing concurrently. What it cannot cover
 * is a row corrected earlier, whose correction carries `correctsObservationId`
 * and no marker. That needs a query, which a transaction cannot run — so it runs
 * BEFORE the transaction, and a query that FAILS refuses the save: "we could not
 * check" must never resolve to "it is fine".
 *
 * A false positive costs a parent one re-confirmation against the corrected
 * entry. A false negative leaves a live claim resting on a superseded source,
 * which is the finding this exists to close.
 */
async function legacyCorrectionExists(
  familyId: string,
  childId: string,
  observationId: string,
): Promise<boolean> {
  const rows = nativeProgressObservationsCollection(familyId)
  const snap = await getDocs(
    query(
      rows,
      where('childId', '==', childId),
      where('correctsObservationId', '==', observationId),
    ),
  )
  return !snap.empty
}

/**
 * Refuse when this observation has a markerless (legacy) correction. Fails
 * CLOSED — a query that throws refuses the save.
 *
 * One definition, used by every path that would rest coverage on a citation:
 * the caller's citation on a new act, and the STORED citation on a retry.
 */
async function refuseIfLegacyCorrected(
  familyId: string,
  childId: string,
  observationId: string,
): Promise<void> {
  let legacyCorrected: boolean
  try {
    legacyCorrected = await legacyCorrectionExists(familyId, childId, observationId)
  } catch (err) {
    console.error('[programCompletion] correction lookup failed:', err)
    throw new ProgramCompletionRefused(PROGRAM_COMPLETION_SOURCE_CHECK_FAILED)
  }
  if (legacyCorrected) {
    throw new ProgramCompletionRefused(PROGRAM_COMPLETION_REPORT_CORRECTED)
  }
}

/**
 * Record one explicit whole-program completion.
 *
 * The completion is the parent's own assertion: it carries her observation date,
 * where she got it from and (optionally) whether help was involved, and it does
 * NOT require an existing numeric report. Citing one is allowed and checked
 * inside this transaction; nothing numeric can create a completion on its own.
 */
export async function confirmProgramCompletion(
  args: ConfirmProgramCompletionArgs,
): Promise<ProgramCompletionWriteResult> {
  const { familyId, childId, program, entryKey, completion } = args
  requireIdentity(familyId, childId, entryKey)

  const mapping = completionMappingFor(program)
  if (!mapping) throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NO_MAPPING)

  // Re-validated here, not trusted: the form decides what to TELL a parent and
  // this decides what may be STORED. An unknown `source` reaches a label lookup
  // on every later render, so a caller arriving with one is a bug to refuse
  // rather than to record.
  if (!Object.values(NativeProgressSource).includes(completion.source)) {
    throw new ProgramCompletionRefused('Pick where you got this from.')
  }
  if (
    completion.assistance != null &&
    !Object.values(CompletionAssistance).includes(completion.assistance)
  ) {
    throw new ProgramCompletionRefused('Pick one, or leave it as “rather not say”.')
  }

  if (!parseDateYmd(completion.observedOn)) {
    throw new ProgramCompletionRefused('Use a real date, like 2026-10-12.')
  }
  const localToday = args.today ?? todayKey()
  if (!parseDateYmd(localToday)) {
    throw new ProgramCompletionRefused('Could not read today’s date, so nothing was saved.')
  }
  if (completion.observedOn > localToday) {
    throw new ProgramCompletionRefused("That day hasn't happened yet.")
  }

  const recordedAt = args.recordedAt ?? new Date().toISOString()
  if (Number.isNaN(new Date(recordedAt).getTime())) {
    throw new ProgramCompletionRefused('Could not stamp the time of this entry, so nothing was saved.')
  }

  const note = completion.note?.trim() || undefined
  const assistance = completion.assistance ?? CompletionAssistance.Unknown
  const reportId = completion.reportObservationId?.trim() || undefined

  const events = programCompletionEventsCollection(familyId)
  const states = programCompletionStateCollection(familyId)
  const eventId = programCompletionEventId(childId, program, entryKey)
  const stateId = programCompletionStateId(childId, program)
  const eventRef = doc(events, eventId)
  const stateRef = doc(states, stateId)
  const modelRef = doc(learnerModelsCollection(familyId), childId)
  const completionId = completionIdFor(program, entryKey)

  // The pre-transaction half of the source check (see `legacyCorrectionExists`).
  // Fail closed: a lookup that throws refuses the save rather than proceeding on
  // an unchecked citation.
  if (reportId) {
    await refuseIfLegacyCorrected(familyId, childId, reportId)
  }

  // ── The STORED citation, on a retry of this same key ──────────────────────
  //
  // A retry re-sends the entry key and may carry different content — or none at
  // all: the surface's payload is not the record. The record is what was
  // CONFIRMED, and the in-transaction marker read covers only corrections made
  // since markers existed, so the legacy (markerless) query has to run against
  // the stored citation as well. Without this, a retry that omitted
  // `reportObservationId` applied a pending confirmation's coverage while the
  // entry it rested on had been corrected away.
  //
  // Fails closed on a read error, and refuses rather than guesses when the
  // retry's own citation disagrees with the stored one: re-confirming against
  // another entry is a new act, under a new key.
  let preStateSnap
  try {
    preStateSnap = await getDoc(stateRef)
  } catch (err) {
    console.error('[programCompletion] stored-record lookup failed:', err)
    throw new ProgramCompletionRefused(PROGRAM_COMPLETION_RECORD_CHECK_FAILED)
  }
  const preState = preStateSnap.exists()
    ? (preStateSnap.data() as ProgramCompletionState)
    : null
  const storedCitation =
    preState?.activeEntryKey === entryKey
      ? preState?.activeAssertion?.reportObservationId
      : undefined
  if (storedCitation) {
    if (reportId && reportId !== storedCitation) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_CITATION_CHANGED)
    }
    await refuseIfLegacyCorrected(familyId, childId, storedCitation)
  }

  return runTransaction(db, async (tx) => {
    // ── every read first ──
    const eventSnap = await tx.get(eventRef)
    const stateSnap = await tx.get(stateRef)
    const modelSnap = await tx.get(modelRef)
    const reportSnap = reportId
      ? await tx.get(doc(nativeProgressObservationsCollection(familyId), reportId))
      : null
    // The in-transaction half: the marker is written by the native-progress
    // writer in the SAME transaction as a correction, so a correction committing
    // concurrently with this confirmation either loses the race (and this read
    // sees nothing, and its own revocation then runs against the completion) or
    // wins it (and this read sees the marker and refuses).
    const markerSnap = reportId
      ? await tx.get(
          doc(
            nativeProgressCorrectionMarkersCollection(familyId),
            correctionMarkerId(reportId),
          ),
        )
      : null

    const storedState = stateSnap.exists()
      ? ({ ...stateSnap.data(), id: stateId } as ProgramCompletionState)
      : null
    const model = modelSnap.exists() ? (modelSnap.data() as LearnerModel) : null

    // ── the retry of a save that already landed ──
    if (eventSnap.exists()) {
      const stored = { ...eventSnap.data(), id: eventId } as ProgramCompletionEvent
      const state = storedState ?? emptyState(childId, program, recordedAt)
      // A retry whose first attempt landed but could not reach a learner model
      // finishes the job rather than reporting a permanent pending — but it
      // revalidates the STORED citation first, not the caller's payload: the
      // same entry key may be re-sent with different content, and the record is
      // what was confirmed, not what is being asked for now.
      const storedCitation = state.activeAssertion?.reportObservationId
      if (storedCitation) {
        const storedMarker = await tx.get(
          doc(
            nativeProgressCorrectionMarkersCollection(familyId),
            correctionMarkerId(storedCitation),
          ),
        )
        if (storedMarker.exists()) {
          throw new ProgramCompletionRefused(PROGRAM_COMPLETION_REPORT_CORRECTED)
        }
      }
      if (
        state.activeEntryKey === entryKey &&
        state.projection.status === CompletionProjectionStatus.Pending &&
        model
      ) {
        const applied = applyActiveCoverage(tx, {
          modelRef,
          model,
          state,
          mapping,
          completionId,
          recordedAt,
        })
        tx.set(stateRef, applied.state, { merge: true })
        return {
          state: applied.state,
          event: stored,
          alreadyRecorded: true,
          applied: true,
          applicationPending: false,
          conceptIds: applied.conceptIds,
          promotedConceptIds: applied.promotedConceptIds,
        }
      }
      return {
        state,
        event: stored,
        alreadyRecorded: true,
        applied: state.projection.status === CompletionProjectionStatus.Applied,
        applicationPending: state.projection.status === CompletionProjectionStatus.Pending,
        conceptIds: state.projection.conceptIds ?? [],
        promotedConceptIds: state.projection.promotedConceptIds ?? [],
      }
    }

    // ── a genuinely new act ──
    if (storedState && storedState.activeEntryKey) {
      // One effective chain: a second confirmation while one is in force is
      // refused rather than branching, so no two confirmations can both be
      // "active" and inflate the evidence between them.
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_ALREADY_ACTIVE)
    }
    const eventCount = storedState?.eventCount ?? 0
    if (eventCount >= MAX_COMPLETION_EVENTS) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_TOO_MANY_EVENTS)
    }

    // The citation is validated HERE, inside the transaction, against the row as
    // it stands at commit time — a check beforehand could be followed by the row
    // being corrected away, leaving a completion citing something that is no
    // longer there or no longer says what it said.
    let citation: Partial<ProgramCompletionAssertion> = {}
    if (reportId) {
      if (!reportSnap?.exists()) {
        throw new ProgramCompletionRefused(PROGRAM_COMPLETION_REPORT_GONE)
      }
      const row = reportSnap.data() as NativeProgressObservation
      if (row.childId !== childId) {
        throw new ProgramCompletionRefused(PROGRAM_COMPLETION_REPORT_OTHER_CHILD)
      }
      if (markerSnap?.exists()) {
        // ANY correction of the cited row ends it as evidence — including one
        // whose replacement still names the final peak. The claim is not
        // transferred to the corrected row: a new confirmation against it is an
        // explicit act the parent takes, not an inference this writer makes.
        throw new ProgramCompletionRefused(PROGRAM_COMPLETION_REPORT_CORRECTED)
      }
      if (!reportSupportsCompletion(row, mapping, program)) {
        throw new ProgramCompletionRefused(PROGRAM_COMPLETION_REPORT_NOT_ELIGIBLE)
      }
      citation = {
        reportObservationId: reportId,
        reportObservedOn: row.observedOn,
        reportNativeNumber: row.nativeNumber,
        reportMeaning: row.meaning,
      }
    }

    const assertion: ProgramCompletionAssertion = {
      observedOn: completion.observedOn,
      source: completion.source,
      assistance,
      reportedProgramVersion: 'unknown',
      ...(note ? { note } : {}),
      ...citation,
    }

    const event: ProgramCompletionEvent = {
      id: eventId,
      childId,
      program,
      entryKey,
      kind: CompletionEventKind.Confirm,
      recordedAt,
      mappingVersion: mapping.mappingVersion,
      assertion,
    }

    let state: ProgramCompletionState = {
      ...(storedState ?? emptyState(childId, program, recordedAt)),
      activeEntryKey: entryKey,
      activeAssertion: assertion,
      activeConfirmedAt: recordedAt,
      activeMappingVersion: mapping.mappingVersion,
      projection: {
        status: CompletionProjectionStatus.Pending,
        detail:
          'Recorded. The learning picture has not been updated yet — there is no model for this child to update.',
      },
      eventCount: eventCount + 1,
      lastEventAt: recordedAt,
      sourceConflict: null,
      updatedAt: recordedAt,
    }

    let conceptIds: string[] = []
    let promotedConceptIds: string[] = []
    if (model) {
      const applied = applyActiveCoverage(tx, {
        modelRef,
        model,
        state,
        mapping,
        completionId,
        recordedAt,
      })
      state = applied.state
      conceptIds = applied.conceptIds
      promotedConceptIds = applied.promotedConceptIds
    }

    tx.set(eventRef, event)
    tx.set(stateRef, state)

    return {
      state,
      event,
      alreadyRecorded: false,
      applied: Boolean(model),
      applicationPending: !model,
      conceptIds,
      promotedConceptIds,
    }
  })
}

/** Fold the active confirmation's coverage into a model inside a transaction. */
function applyActiveCoverage(
  tx: Transaction,
  input: {
    modelRef: ReturnType<typeof doc>
    model: LearnerModel
    state: ProgramCompletionState
    mapping: ProgramCompletionMapping
    completionId: string
    recordedAt: string
  },
): { state: ProgramCompletionState; conceptIds: string[]; promotedConceptIds: string[] } {
  const { model, mapping, completionId, recordedAt } = input
  const assertion = input.state.activeAssertion
  const observedAtIso = assertion
    ? observedDayToIso(assertion.observedOn)
    : recordedAt

  const { model: next, conceptIds, promotedConceptIds } = applyCompletionCoverage(
    model,
    {
      completionId,
      program: mapping.sourceId,
      programLabel: mapping.label,
      mappingVersion: mapping.mappingVersion,
      observedAtIso,
      detail: mapping.scopeNote,
      targets: mapping.targets,
    },
    recordedAt,
  )

  const merge: Partial<LearnerModel> = {
    conceptStates: Object.fromEntries(
      conceptIds.map((id) => [id, next.conceptStates[id]]),
    ),
    changeFeed: next.changeFeed,
    updatedAt: next.updatedAt,
    // The advice layer refreshes asynchronously (FEAT-57 D4): the stale mark is
    // all this write touches. Nothing re-plans, and no synthesis runs inline.
    synthesisStaleAt: next.updatedAt,
  }
  const promoted = promotedModelStatus(next)
  if (promoted) merge.status = promoted
  tx.set(input.modelRef, JSON.parse(JSON.stringify(merge)), { merge: true })

  return {
    state: {
      ...input.state,
      projection: {
        status: CompletionProjectionStatus.Applied,
        appliedAt: recordedAt,
        appliedMappingVersion: mapping.mappingVersion,
        conceptIds,
        promotedConceptIds,
      },
      updatedAt: recordedAt,
    },
    conceptIds,
    promotedConceptIds,
  }
}

export interface ApplyProjectionArgs {
  familyId: string
  childId: string
  program: ProgramCompletionProgram
  /** The confirmation the surface believes is active. Refused when it is not. */
  expectedEntryKey?: string
  recordedAt?: string
}

/**
 * The explicit, safe retry — and the only way a reviewed mapping upgrade is
 * applied.
 *
 * Finishes whichever side is outstanding: an application that had no model to
 * write to, a withdrawal that had none either, or a standing confirmation whose
 * refs carry an older mapping version. **Never called on a view load** — a
 * surface that re-applied by rendering would make a reviewed re-curation
 * invisible and unauditable.
 */
export async function applyProgramCompletionProjection(
  args: ApplyProjectionArgs,
): Promise<ProgramCompletionWriteResult> {
  const { familyId, childId, program } = args
  if (!familyId) throw new ProgramCompletionRefused('No family is signed in.')
  if (!childId) throw new ProgramCompletionRefused('No child is selected for this entry.')

  const mapping = completionMappingFor(program)
  if (!mapping) throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NO_MAPPING)

  const stateId = programCompletionStateId(childId, program)
  const stateRef = doc(programCompletionStateCollection(familyId), stateId)
  const modelRef = doc(learnerModelsCollection(familyId), childId)
  const recordedAt = args.recordedAt ?? new Date().toISOString()

  // A pending application revalidates its SOURCE as well as its model: the
  // citation may have been corrected between the confirmation and this retry.
  // The legacy half needs a query, so it runs here, before the transaction, off
  // a plain read of the state — and fails closed.
  const preState = await getDoc(stateRef)
  const preCitation = preState.exists()
    ? (preState.data() as ProgramCompletionState).activeAssertion?.reportObservationId
    : undefined
  if (preCitation) {
    await refuseIfLegacyCorrected(familyId, childId, preCitation)
  }

  return runTransaction(db, async (tx) => {
    const stateSnap = await tx.get(stateRef)
    const modelSnap = await tx.get(modelRef)
    if (!stateSnap.exists()) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NOTHING_ACTIVE)
    }
    const state = { ...stateSnap.data(), id: stateId } as ProgramCompletionState
    const model = modelSnap.exists() ? (modelSnap.data() as LearnerModel) : null

    const activeKey = state.activeEntryKey
    if (args.expectedEntryKey && args.expectedEntryKey !== (activeKey ?? '')) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NOT_ACTIVE)
    }

    // The in-transaction half of the source revalidation, against the STORED
    // citation. A withdrawal still needs to be finishable, so this guards only
    // the paths that would APPLY coverage.
    const citation = state.activeAssertion?.reportObservationId
    const willApply =
      state.projection.status !== CompletionProjectionStatus.WithdrawalPending
    if (citation && willApply) {
      // The legacy (markerless) half was checked BEFORE the transaction, against
      // whatever citation the state carried then. If the stored citation has
      // moved since — a different confirmation became active between the two
      // reads — that query was run about another entry, and applying here would
      // rest coverage on a source nothing checked. Refuse; the retry re-runs it.
      if (citation !== preCitation) {
        throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NOT_ACTIVE)
      }
      const marker = await tx.get(
        doc(
          nativeProgressCorrectionMarkersCollection(familyId),
          correctionMarkerId(citation),
        ),
      )
      if (marker.exists()) {
        throw new ProgramCompletionRefused(PROGRAM_COMPLETION_REPORT_CORRECTED)
      }
    }

    // ── an outstanding WITHDRAWAL: supersede the refs that are still live ──
    if (
      state.projection.status === CompletionProjectionStatus.WithdrawalPending &&
      state.lastWithdraw
    ) {
      const completionId = completionIdFor(program, state.lastWithdraw.entryKey)
      // No model to retract from: the withdrawal is still OUTSTANDING. Saying
      // `applicationPending: false` here contradicted the stored
      // `withdrawalPending` status and let a surface report the job finished.
      if (!model) return pendingResult(state, true)
      const withdrawn = withdrawCompletionCoverage(
        model,
        completionId,
        recordedAt,
        `withdrawn: ${state.lastWithdraw.reason}`,
      )
      writeWithdrawalMerge(tx, modelRef, withdrawn.model, withdrawn.conceptIds, recordedAt)
      const next: ProgramCompletionState = {
        ...state,
        projection: {
          status: CompletionProjectionStatus.Withdrawn,
          appliedAt: recordedAt,
          conceptIds: withdrawn.conceptIds,
          detail: withdrawalDetail(withdrawn.reviewNeededConceptIds.length),
        },
        updatedAt: recordedAt,
      }
      tx.set(stateRef, next, { merge: true })
      return {
        state: next,
        event: null,
        alreadyRecorded: false,
        applied: false,
        applicationPending: false,
        conceptIds: withdrawn.conceptIds,
        promotedConceptIds: [],
      }
    }

    if (!activeKey || !state.activeAssertion) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NOTHING_ACTIVE)
    }
    if (!model) return pendingResult(state, true)

    // ── The reapply act's own document, READ before anything is written ──
    //
    // Its id is deterministic (`{activeKey}-v{mappingVersion}`), so a second
    // repair at the same mapping version addresses the SAME document. Writing it
    // blind moved the `recordedAt` of an act that had already happened — the
    // history is immutable, so the stored bytes win and only a genuinely new act
    // is written, counted and dated.
    const reapplyKey = `${activeKey}-v${mapping.mappingVersion}`
    const reapplyRef = doc(
      programCompletionEventsCollection(familyId),
      programCompletionEventId(childId, program, reapplyKey),
    )
    const reapplySnap = await tx.get(reapplyRef)
    const storedReapply = reapplySnap.exists()
      ? ({ ...reapplySnap.data(), id: reapplyRef.id } as ProgramCompletionEvent)
      : null

    const completionId = completionIdFor(program, activeKey)
    const expectedIds = mapping.targets.map((t) => t.conceptId)
    const alreadyApplied =
      state.projection.status === CompletionProjectionStatus.Applied &&
      state.projection.appliedMappingVersion === mapping.mappingVersion &&
      completionCoverageIsApplied(
        model,
        completionId,
        mapping.mappingVersion,
        expectedIds,
      )
    if (alreadyApplied) {
      // Idempotent: same report, same mapping version, nothing to write.
      return {
        state,
        event: null,
        alreadyRecorded: true,
        applied: true,
        applicationPending: false,
        conceptIds: state.projection.conceptIds ?? [],
        promotedConceptIds: state.projection.promotedConceptIds ?? [],
      }
    }

    const previousMappingVersion = state.projection.appliedMappingVersion
    // A re-apply is an act: it is recorded in the history like any other, so a
    // mapping upgrade is auditable rather than a silent change of meaning. A
    // REPEAT repair at the same version is not a second act — it restores refs
    // the act already recorded — so it reuses that event and adds no parent act.
    const newEvent: ProgramCompletionEvent | null = storedReapply
      ? null
      : {
          id: reapplyRef.id,
          childId,
          program,
          entryKey: reapplyKey,
          kind: CompletionEventKind.Reapply,
          recordedAt,
          mappingVersion: mapping.mappingVersion,
          ...(previousMappingVersion ? { previousMappingVersion } : {}),
          detail: `applied reviewed coverage map version ${mapping.mappingVersion}`,
        }
    if (newEvent && state.eventCount >= MAX_COMPLETION_EVENTS) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_TOO_MANY_EVENTS)
    }

    const applied = applyActiveCoverage(tx, {
      modelRef,
      model,
      state,
      mapping,
      completionId,
      recordedAt,
    })
    // Only a genuinely new act moves the counter and the last-act date.
    const nextState: ProgramCompletionState = newEvent
      ? {
          ...applied.state,
          eventCount: state.eventCount + 1,
          lastEventAt: recordedAt,
        }
      : applied.state
    tx.set(stateRef, nextState, { merge: true })
    if (newEvent) tx.set(reapplyRef, newEvent)

    return {
      state: nextState,
      // The act on the RECORD, which for a repeat repair is the earlier one,
      // byte-for-byte. The coverage below it was still rewritten, so this is not
      // reported as "nothing needed changing".
      event: newEvent ?? storedReapply,
      alreadyRecorded: false,
      applied: true,
      applicationPending: false,
      conceptIds: applied.conceptIds,
      promotedConceptIds: applied.promotedConceptIds,
    }
  })
}

/** The truthful "recorded, not applied" answer when there is no model to apply to. */
function pendingResult(
  state: ProgramCompletionState,
  pending: boolean,
): ProgramCompletionWriteResult {
  return {
    state,
    event: null,
    alreadyRecorded: false,
    applied: false,
    applicationPending: pending,
    conceptIds: state.projection.conceptIds ?? [],
    promotedConceptIds: [],
  }
}

function withdrawalDetail(reviewNeeded: number): string {
  return reviewNeeded > 0
    ? `Withdrawn. ${reviewNeeded} concept(s) could not be returned to a known earlier reading, so they are marked for a fresh look and are treated cautiously until then.`
    : 'Withdrawn. The concepts this had raised are back to what they were before it.'
}

/** The merge a withdrawal writes: only the concepts it touched, plus the feed. */
function writeWithdrawalMerge(
  tx: Transaction,
  modelRef: ReturnType<typeof doc>,
  next: LearnerModel,
  conceptIds: readonly string[],
  nowIso: string,
): void {
  if (conceptIds.length === 0) return
  const merge: Partial<LearnerModel> = {
    conceptStates: Object.fromEntries(
      conceptIds.map((id) => [id, next.conceptStates[id]]),
    ),
    changeFeed: next.changeFeed,
    updatedAt: nowIso,
    synthesisStaleAt: nowIso,
  }
  tx.set(modelRef, JSON.parse(JSON.stringify(merge)), { merge: true })
}

export interface WithdrawProgramCompletionArgs {
  familyId: string
  childId: string
  program: ProgramCompletionProgram
  /** This correction's own draft identity (idempotent on retry). */
  entryKey: string
  /** The confirmation being withdrawn — refused when it is not the active one. */
  withdrawsEntryKey: string
  reason: CompletionWithdrawReason
  recordedAt?: string
}

/**
 * The parent's correction: this program is not finished after all.
 *
 * Withdraws exactly the named confirmation's contribution — its own refs, its
 * own promotions — and leaves every other ref, every other confirmation, and
 * every `needsReconcile` flag untouched. A stale correction (the surface naming
 * a confirmation that is no longer active) is REFUSED rather than applied to
 * whatever happens to be active now.
 */
export async function withdrawProgramCompletion(
  args: WithdrawProgramCompletionArgs,
): Promise<ProgramCompletionWriteResult> {
  const { familyId, childId, program, entryKey, withdrawsEntryKey, reason } = args
  requireIdentity(familyId, childId, entryKey)
  if (!Object.values(CompletionWithdrawReason).includes(reason)) {
    throw new ProgramCompletionRefused('Pick what was wrong with it.')
  }

  const mapping = completionMappingFor(program)
  if (!mapping) throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NO_MAPPING)

  const stateId = programCompletionStateId(childId, program)
  const stateRef = doc(programCompletionStateCollection(familyId), stateId)
  const eventId = programCompletionEventId(childId, program, entryKey)
  const eventRef = doc(programCompletionEventsCollection(familyId), eventId)
  const modelRef = doc(learnerModelsCollection(familyId), childId)
  const recordedAt = args.recordedAt ?? new Date().toISOString()

  return runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef)
    const stateSnap = await tx.get(stateRef)
    const modelSnap = await tx.get(modelRef)

    if (!stateSnap.exists()) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NOTHING_ACTIVE)
    }
    const state = { ...stateSnap.data(), id: stateId } as ProgramCompletionState
    const model = modelSnap.exists() ? (modelSnap.data() as LearnerModel) : null

    if (eventSnap.exists()) {
      // This correction is already on the record — report what is stored.
      return {
        state,
        event: { ...eventSnap.data(), id: eventId } as ProgramCompletionEvent,
        alreadyRecorded: true,
        applied: false,
        applicationPending:
          state.projection.status === CompletionProjectionStatus.WithdrawalPending,
        conceptIds: state.projection.conceptIds ?? [],
        promotedConceptIds: [],
      }
    }

    if (state.activeEntryKey !== withdrawsEntryKey || !state.activeEntryKey) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_NOT_ACTIVE)
    }
    if (state.eventCount >= MAX_COMPLETION_EVENTS) {
      throw new ProgramCompletionRefused(PROGRAM_COMPLETION_TOO_MANY_EVENTS)
    }

    const completionId = completionIdFor(program, withdrawsEntryKey)
    const event: ProgramCompletionEvent = {
      id: eventId,
      childId,
      program,
      entryKey,
      kind: CompletionEventKind.Withdraw,
      recordedAt,
      mappingVersion: mapping.mappingVersion,
      withdrawsEntryKey,
      withdrawReason: reason,
    }

    let conceptIds: string[] = []
    let status: ProgramCompletionState['projection']['status'] =
      CompletionProjectionStatus.Withdrawn
    let detail = 'Withdrawn. Nothing had been written to the learning picture.'

    if (model && completionCoverageHasActiveRefs(model, completionId)) {
      const withdrawn = withdrawCompletionCoverage(
        model,
        completionId,
        recordedAt,
        `withdrawn: ${reason}`,
      )
      writeWithdrawalMerge(tx, modelRef, withdrawn.model, withdrawn.conceptIds, recordedAt)
      conceptIds = withdrawn.conceptIds
      detail = withdrawalDetail(withdrawn.reviewNeededConceptIds.length)
    } else if (
      !model &&
      state.projection.status === CompletionProjectionStatus.Applied
    ) {
      // It WAS applied and the model is not there now. Say so, and leave the
      // retry to finish it — never claim the graph was updated.
      status = CompletionProjectionStatus.WithdrawalPending
      detail =
        'Withdrawn here. The learning picture could not be updated — try the apply button to finish it.'
    }

    const next: ProgramCompletionState = {
      ...state,
      activeEntryKey: null,
      activeAssertion: null,
      activeConfirmedAt: null,
      activeMappingVersion: null,
      projection: {
        status,
        appliedAt: recordedAt,
        conceptIds,
        detail,
      },
      eventCount: state.eventCount + 1,
      lastEventAt: recordedAt,
      lastWithdraw: { entryKey: withdrawsEntryKey, reason, at: recordedAt },
      sourceConflict: null,
      updatedAt: recordedAt,
    }

    tx.set(eventRef, event)
    tx.set(stateRef, next)

    return {
      state: next,
      event,
      alreadyRecorded: false,
      applied: false,
      applicationPending: status === CompletionProjectionStatus.WithdrawalPending,
      conceptIds,
      promotedConceptIds: [],
    }
  })
}

// ── The coordinator FEAT-241's writer calls (authorized integration) ──────

export interface CompletionRevokePlanArgs {
  familyId: string
  childId: string
  program: ProgramCompletionProgram
  /** The row being corrected. */
  correctedObservationId: string
  /** The correction row itself — recorded, never promoted to the new basis. */
  correctionObservationId: string
  /** The correction's own draft key — a collision-free event identity. */
  correctionEntryKey: string
  nowIso: string
}

export interface CompletionRevokePlan {
  /** `none` — nothing cited this row. `revoked` / `pending` — see `commit`. */
  status: 'none' | 'revoked' | 'pending'
  detail?: string
  /** The writes, deferred so the caller can keep every read ahead of them. */
  commit: (tx: Transaction) => void
}

/**
 * Plan the revocation of a completion whose cited report is being corrected.
 *
 * Called by `nativeProgressWrites` INSIDE its own transaction, which is the
 * whole point: a correction that says "he hadn't finished" and a completion
 * contribution that says he had must not be able to disagree, even for an
 * instant, and must not depend on the parent later finding a button.
 *
 * Reads happen when this is called; the writes are returned as `commit` so the
 * caller can finish its own reads first (Firestore requires every read before
 * any write).
 *
 * **It never transfers the claim.** A corrected citation ends the completion and
 * records *why*; re-establishing it needs a fresh confirmation, because a
 * correction is a statement about a number, not a new assertion that the program
 * is finished.
 */
/**
 * What an EARLIER attempt of this same correction already did to a completion
 * (FEAT-242 review item 5) — reads only, no writes.
 *
 * A correction whose transaction committed and whose answer was lost leaves the
 * completion already withdrawn, so a retry's `planCompletionRevokeForCorrection`
 * finds nothing active and answers `none`. The receipt would then tell the
 * parent nothing else changed, when the previous attempt had taken coverage
 * back. The act is recoverable because its event id is deterministic: the
 * correction's own draft key.
 *
 * Returns `null` when this correction never revoked anything — which is also
 * what keeps a retry from speaking for a NEWER, unrelated confirmation: the
 * answer comes from this correction's own recorded act, never from whatever
 * happens to be active now.
 */
export async function readRecordedCorrectionRevocation(
  tx: Transaction,
  args: {
    familyId: string
    childId: string
    program: ProgramCompletionProgram
    /** The correction row's own document id. */
    correctionObservationId: string
    /** The correction's draft key — the recorded event's identity. */
    correctionEntryKey: string
  },
): Promise<{ status: 'revoked' | 'pending'; detail?: string } | null> {
  const eventId = programCompletionEventId(
    args.childId,
    args.program,
    `src-${args.correctionEntryKey}`,
  )
  const eventSnap = await tx.get(
    doc(programCompletionEventsCollection(args.familyId), eventId),
  )
  if (!eventSnap.exists()) return null
  const event = eventSnap.data() as ProgramCompletionEvent
  // The recorded act must be THIS correction's: a deterministic id plus the
  // correction row it names, so no other act can be reported as this one's.
  if (event.correctedByObservationId !== args.correctionObservationId) return null

  const stateId = programCompletionStateId(args.childId, args.program)
  const stateSnap = await tx.get(
    doc(programCompletionStateCollection(args.familyId), stateId),
  )
  const state = stateSnap.exists()
    ? ({ ...stateSnap.data(), id: stateId } as ProgramCompletionState)
    : null
  // Still pending only while the record ITSELF says so and still names this
  // correction. A later confirmation clears the conflict, and its coverage is
  // its own — this answer stays a statement about the withdrawal that happened.
  const stillPending =
    state?.sourceConflict?.correctedByObservationId === args.correctionObservationId &&
    state?.projection.status === CompletionProjectionStatus.WithdrawalPending
  return stillPending
    ? {
        status: 'pending',
        detail:
          'Withdrawn here. The learning picture could not be updated — use the apply button to finish it.',
      }
    : {
        status: 'revoked',
        detail: 'Withdrawn because the entry it rested on was corrected.',
      }
}

export async function planCompletionRevokeForCorrection(
  tx: Transaction,
  args: CompletionRevokePlanArgs,
): Promise<CompletionRevokePlan> {
  const noop: CompletionRevokePlan = { status: 'none', commit: () => {} }
  const mapping = completionMappingFor(args.program)
  if (!mapping) return noop

  const stateId = programCompletionStateId(args.childId, args.program)
  const stateRef = doc(programCompletionStateCollection(args.familyId), stateId)
  const stateSnap = await tx.get(stateRef)
  if (!stateSnap.exists()) return noop
  const state = { ...stateSnap.data(), id: stateId } as ProgramCompletionState

  // Only a completion that CITES this row, and is still in force.
  if (!state.activeEntryKey || !state.activeAssertion) return noop
  if (state.activeAssertion.reportObservationId !== args.correctedObservationId) {
    return noop
  }

  // ANY correction of the cited row ends the citation — including one whose
  // replacement still names the final peak. The old row is no longer what the
  // parent says happened, and the claim is NOT transferred to the corrected row:
  // re-establishing it is an explicit confirmation she makes against the entry
  // that now stands.
  const withdrawsEntryKey = state.activeEntryKey
  const completionId = completionIdFor(args.program, withdrawsEntryKey)
  const modelRef = doc(learnerModelsCollection(args.familyId), args.childId)
  const modelSnap = await tx.get(modelRef)
  const model = modelSnap.exists() ? (modelSnap.data() as LearnerModel) : null

  const events = programCompletionEventsCollection(args.familyId)
  // The correction's own draft key, which is unique per entry and already
  // path-safe. NOT a truncation of the correction's document id: two ids sharing
  // a 64-character prefix would have collapsed onto one event and lost the
  // second correction's history.
  const correctionEntryKey = `src-${args.correctionEntryKey}`
  const eventId = programCompletionEventId(
    args.childId,
    args.program,
    correctionEntryKey,
  )
  const event: ProgramCompletionEvent = {
    id: eventId,
    childId: args.childId,
    program: args.program,
    entryKey: correctionEntryKey,
    kind: CompletionEventKind.Withdraw,
    recordedAt: args.nowIso,
    mappingVersion: mapping.mappingVersion,
    withdrawsEntryKey,
    withdrawReason: CompletionWithdrawReason.SourceCorrected,
    correctedByObservationId: args.correctionObservationId,
    detail: 'the entry this rested on was corrected to something that does not support it',
  }

  const conflict = {
    reportObservationId: args.correctedObservationId,
    correctedByObservationId: args.correctionObservationId,
    noticedAt: args.nowIso,
    detail:
      'The entry this rested on was corrected, so the finished-program record was withdrawn. Confirm it again if the program really is finished.',
  }

  if (!model || !completionCoverageHasActiveRefs(model, completionId)) {
    const next: ProgramCompletionState = {
      ...state,
      activeEntryKey: null,
      activeAssertion: null,
      activeConfirmedAt: null,
      activeMappingVersion: null,
      projection: {
        status: model
          ? CompletionProjectionStatus.Withdrawn
          : state.projection.status === CompletionProjectionStatus.Applied
            ? CompletionProjectionStatus.WithdrawalPending
            : CompletionProjectionStatus.Withdrawn,
        appliedAt: args.nowIso,
        conceptIds: [],
        detail: model
          ? 'Withdrawn because the entry it rested on was corrected.'
          : 'Withdrawn here. The learning picture could not be updated — use the apply button to finish it.',
      },
      eventCount: state.eventCount + 1,
      lastEventAt: args.nowIso,
      lastWithdraw: {
        entryKey: withdrawsEntryKey,
        reason: CompletionWithdrawReason.SourceCorrected,
        at: args.nowIso,
      },
      sourceConflict: conflict,
      updatedAt: args.nowIso,
    }
    return {
      status: model ? 'revoked' : 'pending',
      detail: next.projection.detail,
      commit: (writeTx) => {
        writeTx.set(doc(events, eventId), event)
        writeTx.set(stateRef, next)
      },
    }
  }

  const withdrawn = withdrawCompletionCoverage(
    model,
    completionId,
    args.nowIso,
    `withdrawn: ${CompletionWithdrawReason.SourceCorrected}`,
  )
  const next: ProgramCompletionState = {
    ...state,
    activeEntryKey: null,
    activeAssertion: null,
    activeConfirmedAt: null,
    activeMappingVersion: null,
    projection: {
      status: CompletionProjectionStatus.Withdrawn,
      appliedAt: args.nowIso,
      conceptIds: withdrawn.conceptIds,
      detail: withdrawalDetail(withdrawn.reviewNeededConceptIds.length),
    },
    eventCount: state.eventCount + 1,
    lastEventAt: args.nowIso,
    lastWithdraw: {
      entryKey: withdrawsEntryKey,
      reason: CompletionWithdrawReason.SourceCorrected,
      at: args.nowIso,
    },
    sourceConflict: conflict,
    updatedAt: args.nowIso,
  }

  return {
    status: 'revoked',
    detail: next.projection.detail,
    commit: (writeTx) => {
      writeTx.set(doc(events, eventId), event)
      writeTx.set(stateRef, next)
      writeWithdrawalMerge(
        writeTx,
        modelRef,
        withdrawn.model,
        withdrawn.conceptIds,
        args.nowIso,
      )
    },
  }
}
