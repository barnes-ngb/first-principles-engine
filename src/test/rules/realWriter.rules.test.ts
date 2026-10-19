import { assertFails } from '@firebase/rules-unit-testing'
import { connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { beforeAll, describe, expect, it } from 'vitest'

import { EvidenceRefStatus } from '../../core/foundations'
import { getFirebaseAuth } from '../../core/firebase/firebase'
import {
  db,
  learnerModelsCollection,
  nativeProgressCorrectionMarkersCollection,
  nativeProgressObservationDocId,
  nativeProgressObservationsCollection,
  programCompletionEventsCollection,
  programCompletionStateCollection,
} from '../../core/firebase/firestore'
import { saveNativeProgressObservation } from '../../core/firebase/nativeProgressWrites'
import { confirmProgramCompletion } from '../../core/firebase/programCompletionWrites'
import {
  ConceptStateKind,
  EvidenceKind,
  type ConceptStateEntry,
  type EvidenceRef,
  type LearnerModel,
} from '../../core/types/learnerModel'
import {
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
  type NativeProgressObservation,
} from '../../core/types/nativeProgress'
import {
  CompletionProjectionStatus,
  ProgramCompletionProgram,
  completionIdFor,
  correctionMarkerId,
  programCompletionEventId,
  programCompletionStateId,
} from '../../core/types/programCompletion'
import { authEmulator, firestoreEmulator, observationDocId } from './rulesHarness'

/**
 * **The current writers, against the real rules** (FIX-265).
 *
 * The hand-crafted suites decide what the rule admits; this one decides whether
 * the app can still save. It drives the ACTUAL
 * `saveNativeProgressObservation` / `confirmProgramCompletion` transactions —
 * the app's own modules, collection helpers, converters and document ids —
 * against the emulator, signed in as a real UID from the Auth emulator. A
 * hand-built batch that satisfies the rule proves the rule is satisfiable; only
 * the writers themselves prove the product still works.
 *
 * It also proves the one thing a hand-built batch cannot: that a full correction
 * — the row, its marker, the completion event, the completion projection AND the
 * learner model, in ONE transaction — stays inside Firestore's per-request budget
 * for the `get` / `getAfter` / `exists` calls the rule makes. That limit is not
 * visible in a single-document test, and guessing at it was explicitly not
 * acceptable. Which is why the completion test seeds a real synthetic learner
 * model and requires the coverage to be APPLIED rather than accepting a pending
 * answer: a pending application writes no model document, so it would have left
 * the widest commit in the product untested.
 *
 * Synthetic throughout: the family is an anonymous emulator UID, every child is
 * an invented string, and no live project is reachable from this process. Each
 * test uses its OWN child so that the shared projection document
 * (`programCompletionState/{child}__{program}`) cannot carry one test's state
 * into another's.
 */

const TODAY = '2026-10-05'
const OBSERVED_ON = '2026-10-01'
const RECORDED_AT = '2026-10-02T15:00:00.000Z'

/** A concept nothing in the Fast Phonics mapping names, with its own evidence. */
const UNRELATED_CONCEPT = 'synthetic.unrelated.concept'

/** The signed-in UID, which the app uses as the family id. */
let familyId = ''

beforeAll(async () => {
  // Pointed at the emulator BEFORE the first read or write, and only at the
  // emulator: `firestoreEmulator()` throws when the host is not in the
  // environment, so this file cannot silently run against a real project.
  const firestore = firestoreEmulator()
  const auth = authEmulator()
  connectFirestoreEmulator(db, firestore.host, firestore.port)
  const authInstance = getFirebaseAuth()
  connectAuthEmulator(authInstance, `http://${auth.host}:${auth.port}`, {
    disableWarnings: true,
  })
  const credential = await signInAnonymously(authInstance)
  familyId = credential.user.uid
  expect(familyId).toBeTruthy()
})

const observationsOf = () => nativeProgressObservationsCollection(familyId)
const modelRef = (childId: string) => doc(learnerModelsCollection(familyId), childId)
const stateRef = (childId: string) =>
  doc(
    programCompletionStateCollection(familyId),
    programCompletionStateId(childId, ProgramCompletionProgram.FastPhonics),
  )
const markerRef = (correctedId: string) =>
  doc(nativeProgressCorrectionMarkersCollection(familyId), correctionMarkerId(correctedId))
/** The withdraw act a correction records — its id is the correction's own key. */
const withdrawEventRef = (childId: string, correctionEntryKey: string) =>
  doc(
    programCompletionEventsCollection(familyId),
    programCompletionEventId(
      childId,
      ProgramCompletionProgram.FastPhonics,
      `src-${correctionEntryKey}`,
    ),
  )

const readModel = async (childId: string) =>
  (await getDoc(modelRef(childId))).data() as LearnerModel

/** One evidence ref on a concept, written by nothing in this feature. */
const unrelatedEvidence: EvidenceRef = {
  kind: EvidenceKind.WorkingLevel,
  sourceId: 'synthetic-working-level',
  note: 'synthetic evidence that this feature must not touch',
  observedAt: '2026-09-01T00:00:00.000Z',
  recordedAt: '2026-09-01T00:00:00.000Z',
  level: 3,
}

const unrelatedEntry: ConceptStateEntry = {
  state: ConceptStateKind.Forming,
  evidence: [unrelatedEvidence],
  seededAt: '2026-09-01T00:00:00.000Z',
}

/**
 * The learner model shape the Foundations tab creates, with one unrelated concept
 * already on it. Seeded through the app's own converter as the owning family — an
 * ordinary owner write to a collection FIX-265 does not touch.
 */
const syntheticModel = (childId: string): LearnerModel => ({
  childId,
  graphVersion: 'reading@1+math@1',
  status: 'seeded',
  conceptStates: { [UNRELATED_CONCEPT]: unrelatedEntry },
  modalityCalibration: {
    reading: { note: 'synthetic' },
    writing: { note: 'synthetic' },
    math: { note: 'synthetic' },
  },
  whatMattersNext: [],
  changeFeed: [],
  openQuestions: [],
  seededAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
})

/** One plain report at the citable final peak, through the product's writer. */
const saveReport = (childId: string, entryKey: string) =>
  saveNativeProgressObservation({
    familyId,
    childId,
    entryKey,
    observation: {
      program: NativeProgressProgram.FastPhonics,
      nativeNumber: 20,
      meaning: NativeProgressMeaning.CompletedThrough,
      observedOn: OBSERVED_ON,
      source: NativeProgressSource.ParentReport,
    },
    recordedAt: RECORDED_AT,
    today: TODAY,
  })

/** A correction of `correctedId` — a different number, same program and child. */
const saveCorrection = (childId: string, entryKey: string, correctedId: string) =>
  saveNativeProgressObservation({
    familyId,
    childId,
    entryKey,
    observation: {
      program: NativeProgressProgram.FastPhonics,
      nativeNumber: 17,
      meaning: NativeProgressMeaning.CompletedThrough,
      observedOn: OBSERVED_ON,
      source: NativeProgressSource.ParentReport,
    },
    correctsObservationId: correctedId,
    recordedAt: RECORDED_AT,
    today: TODAY,
  })

const confirmCiting = (childId: string, entryKey: string, reportObservationId: string) =>
  confirmProgramCompletion({
    familyId,
    childId,
    program: ProgramCompletionProgram.FastPhonics,
    entryKey,
    completion: {
      observedOn: OBSERVED_ON,
      source: NativeProgressSource.ParentReport,
      reportObservationId,
    },
    recordedAt: RECORDED_AT,
    today: TODAY,
  })

/** This completion's own coverage refs on one concept. */
const ownRefs = (entry: ConceptStateEntry | undefined, completionId: string) =>
  (entry?.evidence ?? []).filter(
    (ref) =>
      ref.kind === EvidenceKind.ProgramCompletionCoverage &&
      ref.completionId === completionId,
  )

describe('the document id the rule is keyed on', () => {
  it('is composed the same way here as in the app', () => {
    // The hand-crafted suites restate `{childId}__{entryKey}` rather than import
    // the app's helper (importing it would initialize the app's Firebase
    // instance). This is the one place both are in scope, so this is where the
    // restatement is pinned.
    expect(nativeProgressObservationDocId('c', 'someentrykey01')).toBe(
      observationDocId('c', 'someentrykey01'),
    )
  })
})

describe('the current writer still saves', () => {
  it('records a plain report, and a retry returns the stored row', async () => {
    const child = 'synthetic-child-plain'
    const entryKey = 'plainreport0001'
    const first = await saveReport(child, entryKey)
    expect(first.alreadyRecorded).toBe(false)
    expect(first.observation.nativeNumber).toBe(20)

    const retry = await saveReport(child, entryKey)
    expect(retry.alreadyRecorded).toBe(true)
  })

  it('records a correction and its marker in one transaction', async () => {
    const child = 'synthetic-child-correction'
    const original = await saveReport(child, 'original0000001')

    const result = await saveCorrection(child, 'correction00001', original.observation.id)
    expect(result.alreadyRecorded).toBe(false)
    expect(result.observation.correctsObservationId).toBe(original.observation.id)

    // The marker the rule required is on the record, naming this correction.
    const marker = await getDoc(markerRef(original.observation.id))
    expect(marker.exists()).toBe(true)
    expect(marker.data()?.correctionObservationId).toBe(result.observation.id)
    expect(marker.data()?.correctionEntryKey).toBe('correction00001')
    expect(marker.data()?.childId).toBe(child)

    // ...and the row it corrected is untouched, as append-only promises.
    const originalSnap = await getDoc(doc(observationsOf(), original.observation.id))
    expect(originalSnap.data()?.nativeNumber).toBe(20)
  })

  it('is idempotent on a retried correction, and admits a second correction', async () => {
    const child = 'synthetic-child-recorrect'
    const original = await saveReport(child, 'original0000002')

    const first = await saveCorrection(child, 'correction00002', original.observation.id)
    const retried = await saveCorrection(child, 'correction00002', original.observation.id)
    expect(retried.alreadyRecorded).toBe(true)
    expect(retried.observation.id).toBe(first.observation.id)

    // Correcting the same row again: the marker is rewritten to name the newer
    // correction, which is the pre/post state the rule discriminates on.
    const second = await saveCorrection(child, 'correction00003', original.observation.id)
    expect(second.alreadyRecorded).toBe(false)
    const marker = await getDoc(markerRef(original.observation.id))
    expect(marker.data()?.correctionObservationId).toBe(second.observation.id)
  })
})

describe('a correction of a cited row, through both writers and a real model', () => {
  it('applies the coverage, then revokes it and restores the prior baseline', async () => {
    // The whole reason the rule exists, with every document the widest commit in
    // the product touches actually present: the row, the marker, the act log, the
    // projection and the learner model.
    const child = 'synthetic-child-completion'
    const completionKey = 'completion00001'
    const correctionKey = 'correction00004'
    const original = await saveReport(child, 'original0000003')
    await setDoc(modelRef(child), syntheticModel(child))

    const confirmed = await confirmCiting(child, completionKey, original.observation.id)
    expect(confirmed.state.activeEntryKey).toBe(completionKey)
    // APPLIED, not pending: a pending application writes no model document, and
    // accepting one would have left the model write out of this test entirely.
    expect(confirmed.applied).toBe(true)
    expect(confirmed.applicationPending).toBe(false)
    expect(confirmed.promotedConceptIds.length).toBeGreaterThan(0)

    const completionId = completionIdFor(ProgramCompletionProgram.FastPhonics, completionKey)
    const promoted = confirmed.promotedConceptIds
    const applied = await readModel(child)

    for (const conceptId of promoted) {
      const entry = applied.conceptStates[conceptId]
      // Covered, never mastered — the cap the whole feature rests on.
      expect(entry?.state, conceptId).toBe(ConceptStateKind.Forming)
      const active = ownRefs(entry, completionId).filter(
        (ref) => ref.status === EvidenceRefStatus.Active,
      )
      expect(active, conceptId).toHaveLength(1)
      expect(active[0].ownsPromotion, conceptId).toBe(true)
      // The model started with none of these concepts, so the baseline this
      // promotion recorded is `not-yet` — which is what a withdrawal restores.
      expect(active[0].baselineState, conceptId).toBe(ConceptStateKind.NotYet)
      expect(active[0].readState, conceptId).toBe(ConceptStateKind.Forming)
      expect(active[0].mappingVersion, conceptId).toBe(confirmed.state.activeMappingVersion)
    }
    expect(applied.conceptStates[UNRELATED_CONCEPT]).toEqual(unrelatedEntry)

    // ── The correction. One transaction: row + marker + withdraw act +
    // projection + model.
    const correction = await saveCorrection(child, correctionKey, original.observation.id)
    expect(correction.completionRevoked?.status).toBe('revoked')

    const state = await getDoc(stateRef(child))
    expect(state.data()?.activeEntryKey).toBeNull()
    expect(state.data()?.activeAssertion).toBeNull()
    // Settled, NOT `withdrawalPending`: the model was reachable and its refs were
    // superseded in the same commit, so there is no apply step left over.
    expect(state.data()?.projection.status).toBe(CompletionProjectionStatus.Withdrawn)
    expect(state.data()?.projection.status).not.toBe(
      CompletionProjectionStatus.WithdrawalPending,
    )

    const revoked = await readModel(child)
    for (const conceptId of promoted) {
      const entry = revoked.conceptStates[conceptId]
      const refs = ownRefs(entry, completionId)
      // This completion's claim is gone — superseded and kept, never deleted.
      expect(refs.filter((r) => r.status === EvidenceRefStatus.Active), conceptId).toHaveLength(0)
      expect(refs.some((r) => r.status === EvidenceRefStatus.Superseded), conceptId).toBe(true)
      // The baseline the promotion recorded is what the concept reads at again,
      // and it reads it plainly rather than under a review flag.
      const baseline = refs[refs.length - 1]?.baselineState
      expect(baseline, conceptId).toBe(ConceptStateKind.NotYet)
      expect(entry?.state, conceptId).toBe(baseline)
      expect(entry?.completionReviewNeeded ?? false, conceptId).toBe(false)
    }
    // And the evidence that had nothing to do with any of this is byte-identical.
    expect(revoked.conceptStates[UNRELATED_CONCEPT]).toEqual(unrelatedEntry)
  })

  it('recreates a deleted marker on a retry, recording no second act', async () => {
    // The retry backfill, through the writer rather than by hand. Marker
    // permissions are deliberately unchanged by FIX-265, so an owner CAN delete
    // one — and the retry path exists because a correction whose first attempt
    // landed and lost its answer must be able to put the marker back. What it
    // must NOT do is record the withdrawal twice or rewrite the stored row.
    const child = 'synthetic-child-backfill'
    const completionKey = 'completion00002'
    const correctionKey = 'correction00005'
    const original = await saveReport(child, 'original0000004')
    await setDoc(modelRef(child), syntheticModel(child))
    await confirmCiting(child, completionKey, original.observation.id)

    const first = await saveCorrection(child, correctionKey, original.observation.id)
    expect(first.completionRevoked?.status).toBe('revoked')

    // Owner-permitted delete of the marker — the unchanged permission this test
    // is built on. Asserted, so the fixture cannot silently fail to arrange.
    await deleteDoc(markerRef(original.observation.id))
    expect((await getDoc(markerRef(original.observation.id))).exists()).toBe(false)

    const rowBefore = (await getDoc(doc(observationsOf(), first.observation.id))).data()
    const eventBefore = (await getDoc(withdrawEventRef(child, correctionKey))).data()
    const stateBefore = (await getDoc(stateRef(child))).data()
    const modelBefore = await readModel(child)
    expect(eventBefore).toBeTruthy()
    const eventsBefore = await getDocs(
      query(programCompletionEventsCollection(familyId), where('childId', '==', child)),
    )

    const retry = await saveCorrection(child, correctionKey, original.observation.id)
    expect(retry.alreadyRecorded).toBe(true)
    // The receipt still says what happened to the coverage, recovered from this
    // correction's own recorded act rather than from whatever is active now.
    expect(retry.completionRevoked?.status).toBe('revoked')

    // The marker is back, naming the same correction.
    const marker = await getDoc(markerRef(original.observation.id))
    expect(marker.exists()).toBe(true)
    expect(marker.data()?.correctionObservationId).toBe(first.observation.id)
    expect(marker.data()?.correctionEntryKey).toBe(correctionKey)
    expect(marker.data()?.childId).toBe(child)

    // Nothing else moved: the stored correction, the withdraw act, the projection
    // and the model are byte-identical, and no second act was recorded.
    expect((await getDoc(doc(observationsOf(), first.observation.id))).data()).toEqual(rowBefore)
    expect((await getDoc(withdrawEventRef(child, correctionKey))).data()).toEqual(eventBefore)
    expect((await getDoc(stateRef(child))).data()).toEqual(stateBefore)
    expect(await readModel(child)).toEqual(modelBefore)
    const eventsAfter = await getDocs(
      query(programCompletionEventsCollection(familyId), where('childId', '==', child)),
    )
    expect(eventsAfter.size).toBe(eventsBefore.size)
  })
})

describe('the old client, through the app’s own paths', () => {
  it('is refused when it writes the correction row alone', async () => {
    // FEAT-241's writer, reconstructed: the same collection helper, the same
    // converter, the same document id — and no marker. This is the write a stale
    // tab sends, and it is refused for the real family identity rather than for a
    // synthetic one.
    const child = 'synthetic-child-oldclient'
    const original = await saveReport(child, 'original0000005')

    const correctionId = nativeProgressObservationDocId(child, 'oldclient000001')
    const row: NativeProgressObservation = {
      id: correctionId,
      childId: child,
      program: NativeProgressProgram.FastPhonics,
      nativeNumber: 17,
      meaning: NativeProgressMeaning.CompletedThrough,
      observedOn: OBSERVED_ON,
      source: NativeProgressSource.ParentReport,
      recordedAt: RECORDED_AT,
      entryKey: 'oldclient000001',
      correctsObservationId: original.observation.id,
    }
    await assertFails(setDoc(doc(observationsOf(), correctionId), row))

    // Nothing landed: the refusal is a refusal, not a partial write.
    const written = await getDoc(doc(observationsOf(), correctionId))
    expect(written.exists()).toBe(false)
  })

  it('is still free to write a PLAIN report', async () => {
    // The temporary cost of this change is scoped to corrections. An old tab can
    // go on recording ordinary progress, which is the common case.
    const child = 'synthetic-child-oldplain'
    const id = nativeProgressObservationDocId(child, 'oldclient000002')
    const row: NativeProgressObservation = {
      id,
      childId: child,
      program: NativeProgressProgram.FastPhonics,
      nativeNumber: 12,
      meaning: NativeProgressMeaning.WorkingOn,
      observedOn: OBSERVED_ON,
      source: NativeProgressSource.ParentReport,
      recordedAt: RECORDED_AT,
      entryKey: 'oldclient000002',
    }
    await setDoc(doc(observationsOf(), id), row)
    const written = await getDoc(doc(observationsOf(), id))
    expect(written.exists()).toBe(true)
  })
})
