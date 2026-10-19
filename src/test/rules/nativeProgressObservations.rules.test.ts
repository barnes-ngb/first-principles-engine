import {
  assertFails,
  assertSucceeds,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  CHILD,
  CURRENT_RULES,
  FAMILY,
  OTHER_CHILD,
  OTHER_FAMILY,
  marker,
  markerPath,
  observation,
  observationDocId,
  observationPath,
  ruleEnvironment,
} from './rulesHarness'

/**
 * **A stale tab must not correct a cited row and leave the completion standing**
 * (FIX-265) — proved against a real Firestore emulator, not a predicate.
 *
 * Every assertion in this file is a write the client SDK could actually send,
 * evaluated by the emulator against `firestore.rules` as loaded from the file
 * that deploys. The pairing is the point: for each refusal there is an admission
 * one field away from it, so the rule is shown to be narrow rather than merely
 * strict — and `legacyRulesControl.rules.test.ts` replays the headline refusal
 * against the OLD rules, where it must succeed.
 *
 * What is NOT asserted here: anything about the reading itself. The number, the
 * meaning, the observed day and the note are the parent's and are checked by
 * `nativeProgressWrites`; the rule has no opinion about them and these tests do
 * not pretend it does.
 */

const PROJECT = 'demo-fpe-rules-current'

/**
 * One documented cast, in one place.
 *
 * `rules-unit-testing` returns the Firestore instance from its own peer copy of
 * the SDK. It is the same object the app's `firebase/firestore` functions operate
 * on — there is a single `firebase` in the tree, which is what the peer range is
 * for — but the two type declarations are reached by different paths, so TS wants
 * the bridge spelled out rather than inferred.
 */
const asFirestore = (ctx: RulesTestContext): Firestore =>
  ctx.firestore() as unknown as Firestore

let testEnv: RulesTestEnvironment

/** The owning family's client — signed in as the UID that names the family. */
const owner = () => asFirestore(testEnv.authenticatedContext(FAMILY))
/** A second signed-in user, who owns a different family. */
const otherFamily = () => asFirestore(testEnv.authenticatedContext(OTHER_FAMILY))
/** Signed out. */
const anonymous = () => asFirestore(testEnv.unauthenticatedContext())

/** Seed state the rules would (rightly) refuse to let a client create. */
const seed = (write: (db: Firestore) => Promise<unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await write(asFirestore(ctx))
  })

// ── The fixture everything below is built on ─────────────────────────────────
//
// An original row the parent recorded, and the correction she is about to make.
const ORIGINAL_KEY = 'originalentry01'
const CORRECTION_KEY = 'correctionentry1'
const ORIGINAL_ID = observationDocId(CHILD, ORIGINAL_KEY)
const CORRECTION_ID = observationDocId(CHILD, CORRECTION_KEY)

const seedOriginal = () =>
  seed((db) =>
    setDoc(doc(db, observationPath(FAMILY, ORIGINAL_ID)), observation({ entryKey: ORIGINAL_KEY })),
  )

/** The correction the parent is saving: a NEW row naming the one it corrects. */
const correctionRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...observation({ entryKey: CORRECTION_KEY, nativeNumber: 17, correctsObservationId: ORIGINAL_ID }),
  ...overrides,
})

const matchingMarker = () =>
  marker({
    correctedObservationId: ORIGINAL_ID,
    correctionObservationId: CORRECTION_ID,
    correctionEntryKey: CORRECTION_KEY,
  })

/**
 * The current writer's correction: the row and its marker in ONE commit.
 *
 * A batch, not two writes — the real writer uses `runTransaction`, and both land
 * in a single request either way, which is the only thing `getAfter` cares about.
 * `realWriter.rules.test.ts` drives the actual transaction.
 */
const commitCorrection = (
  db: Firestore,
  row: Record<string, unknown>,
  markerDoc: Record<string, unknown> | null,
  markerAt = markerPath(FAMILY, ORIGINAL_ID),
) => {
  const batch = writeBatch(db)
  batch.set(doc(db, observationPath(FAMILY, CORRECTION_ID)), row)
  if (markerDoc) batch.set(doc(db, markerAt), markerDoc)
  return batch.commit()
}

beforeAll(async () => {
  testEnv = await ruleEnvironment(PROJECT, CURRENT_RULES)
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

describe('plain observations are untouched', () => {
  it('lets the owning family create an ordinary report', async () => {
    const db = owner()
    await assertSucceeds(
      setDoc(doc(db, observationPath(FAMILY, ORIGINAL_ID)), observation({ entryKey: ORIGINAL_KEY })),
    )
  })

  it('lets the owning family read one row and list the collection', async () => {
    await seedOriginal()
    const db = owner()
    await assertSucceeds(getDoc(doc(db, observationPath(FAMILY, ORIGINAL_ID))))
    // The app's own read: one equality filter on childId, sorted in memory.
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `families/${FAMILY}/nativeProgressObservations`),
          where('childId', '==', CHILD),
        ),
      ),
    )
  })

  it('treats an explicit null correctsObservationId as a plain report', async () => {
    // The converter's `stripUndefined` and `ignoreUndefinedProperties` mean an
    // ordinary report OMITS the field — but a client that sends an explicit null
    // is not declaring a correction either, and must not be refused for failing a
    // contract it never invoked. Admitted with no marker anywhere.
    const row: Record<string, unknown> = {
      ...observation({ entryKey: ORIGINAL_KEY }),
      correctsObservationId: null,
    }
    await assertSucceeds(setDoc(doc(owner(), observationPath(FAMILY, ORIGINAL_ID)), row))
  })

  it('refuses an anonymous client and another family', async () => {
    await assertFails(
      setDoc(
        doc(anonymous(), observationPath(FAMILY, ORIGINAL_ID)),
        observation({ entryKey: ORIGINAL_KEY }),
      ),
    )
    await assertFails(
      setDoc(
        doc(otherFamily(), observationPath(FAMILY, ORIGINAL_ID)),
        observation({ entryKey: ORIGINAL_KEY }),
      ),
    )
    await seedOriginal()
    await assertFails(getDoc(doc(otherFamily(), observationPath(FAMILY, ORIGINAL_ID))))
  })
})

describe('append-only, enforced rather than described', () => {
  beforeEach(seedOriginal)

  it('refuses an update to a stored row', async () => {
    await assertFails(
      updateDoc(doc(owner(), observationPath(FAMILY, ORIGINAL_ID)), { nativeNumber: 19 }),
    )
  })

  it('refuses a whole-document overwrite', async () => {
    // `setDoc` over an existing document is an update, which is how a "harmless"
    // re-save would have rewritten the record a parent is reading back.
    await assertFails(
      setDoc(
        doc(owner(), observationPath(FAMILY, ORIGINAL_ID)),
        observation({ entryKey: ORIGINAL_KEY, nativeNumber: 19 }),
      ),
    )
  })

  it('refuses a delete', async () => {
    await assertFails(deleteDoc(doc(owner(), observationPath(FAMILY, ORIGINAL_ID))))
  })

  it('still allows anything BELOW an observation document', async () => {
    // No such subcollection exists today. The grant is preserved anyway, because
    // removing a right nothing asked to remove is its own regression — and this
    // asserts the mandatory extra path segment did not take it away.
    await assertSucceeds(
      setDoc(
        doc(owner(), `${observationPath(FAMILY, ORIGINAL_ID)}/annotations/note-1`),
        { note: 'synthetic' },
      ),
    )
  })
})

describe('a correction must coordinate its marker, atomically', () => {
  beforeEach(seedOriginal)

  it('admits the current writer: row and marker in one commit', async () => {
    await assertSucceeds(commitCorrection(owner(), correctionRow(), matchingMarker()))
  })

  it('refuses the old client: the correction row alone', async () => {
    // The finding, exactly. FEAT-241's writer sends this and nothing else.
    await assertFails(
      setDoc(doc(owner(), observationPath(FAMILY, CORRECTION_ID)), correctionRow()),
    )
  })

  it('refuses the old client even when a completion cites the row', async () => {
    // The denial must not depend on a completion existing: the rule cannot see
    // the coverage, and a correction that arrives before tomorrow's confirmation
    // is the same hazard one day later.
    await seed(async (db) => {
      await setDoc(doc(db, `families/${FAMILY}/programCompletionState/${CHILD}__fastPhonics`), {
        childId: CHILD,
        program: 'fastPhonics',
        activeEntryKey: 'completionkey01',
        activeAssertion: { reportObservationId: ORIGINAL_ID },
      })
    })
    await assertFails(
      setDoc(doc(owner(), observationPath(FAMILY, CORRECTION_ID)), correctionRow()),
    )
  })

  it('refuses the old client when nothing has ever been confirmed', async () => {
    // The pre-transaction "is anything citing this row" query answers none here,
    // and the write is still refused — the rule is about the coordination the
    // record needs, not about what is live at the moment of the save.
    await assertFails(
      setDoc(doc(owner(), observationPath(FAMILY, CORRECTION_ID)), correctionRow()),
    )
  })

  it('refuses a marker written at the correction row id instead of the corrected one', async () => {
    // The marker's id IS the corrected row's id — that is what lets a completion
    // transaction find it by id with no query. A marker filed under the new row
    // answers a question nobody asks.
    await assertFails(
      commitCorrection(
        owner(),
        correctionRow(),
        matchingMarker(),
        markerPath(FAMILY, CORRECTION_ID),
      ),
    )
  })

  it('refuses a marker naming a different correction', async () => {
    await assertFails(
      commitCorrection(
        owner(),
        correctionRow(),
        marker({
          correctedObservationId: ORIGINAL_ID,
          correctionObservationId: observationDocId(CHILD, 'someotherrow01'),
          correctionEntryKey: CORRECTION_KEY,
        }),
      ),
    )
  })

  it('refuses a marker for another child', async () => {
    await assertFails(
      commitCorrection(
        owner(),
        correctionRow(),
        marker({
          correctedObservationId: ORIGINAL_ID,
          correctionObservationId: CORRECTION_ID,
          correctionEntryKey: CORRECTION_KEY,
          childId: OTHER_CHILD,
        }),
      ),
    )
  })

  it('refuses a marker naming another draft', async () => {
    await assertFails(
      commitCorrection(
        owner(),
        correctionRow(),
        marker({
          correctedObservationId: ORIGINAL_ID,
          correctionObservationId: CORRECTION_ID,
          correctionEntryKey: 'adifferentdraft1',
        }),
      ),
    )
  })

  it('refuses a correction whose row carries no child or draft identity', async () => {
    const noChild = correctionRow()
    delete noChild.childId
    await assertFails(commitCorrection(owner(), noChild, matchingMarker()))

    const noEntryKey = correctionRow()
    delete noEntryKey.entryKey
    await assertFails(commitCorrection(owner(), noEntryKey, matchingMarker()))
  })

  it('refuses an empty corrected id', async () => {
    // `''` is not "no correction": it declares one and names nothing, which is a
    // marker path that cannot exist. Refused rather than waved through as plain.
    await assertFails(
      setDoc(
        doc(owner(), observationPath(FAMILY, CORRECTION_ID)),
        correctionRow({ correctsObservationId: '' }),
      ),
    )
  })

  it('refuses a corrected id that is not a string', async () => {
    // A number or a list declares a correction and names nothing addressable. The
    // type is checked BEFORE the marker path is interpolated from it, so this is
    // a denial with a reason rather than an evaluation error — and it is refused
    // even though a perfectly good marker for the real original is on the record.
    await seed((db) => setDoc(doc(db, markerPath(FAMILY, ORIGINAL_ID)), matchingMarker()))
    await assertFails(
      setDoc(
        doc(owner(), observationPath(FAMILY, CORRECTION_ID)),
        correctionRow({ correctsObservationId: 42 }),
      ),
    )
    await assertFails(
      setDoc(
        doc(owner(), observationPath(FAMILY, CORRECTION_ID)),
        correctionRow({ correctsObservationId: [ORIGINAL_ID] }),
      ),
    )
  })

  it('refuses a STALE marker left by an earlier correction', async () => {
    // A row corrected once already has a marker. It names the FIRST correction,
    // and an old client's second correction writes no new one — so the marker
    // present is not about this write.
    await seed((db) =>
      setDoc(
        doc(db, markerPath(FAMILY, ORIGINAL_ID)),
        marker({
          correctedObservationId: ORIGINAL_ID,
          correctionObservationId: observationDocId(CHILD, 'firstcorrection1'),
          correctionEntryKey: 'firstcorrection1',
        }),
      ),
    )
    await assertFails(
      setDoc(doc(owner(), observationPath(FAMILY, CORRECTION_ID)), correctionRow()),
    )
  })

  it('refuses a PREEXISTING marker that already names this correction', async () => {
    // The control that `getAfter` alone would fail. With the marker already in
    // place, the post-state matches perfectly and nothing in this commit wrote
    // it — so "atomic" would have been a claim rather than a check. The pre-state
    // discriminator is what refuses it.
    await seed((db) => setDoc(doc(db, markerPath(FAMILY, ORIGINAL_ID)), matchingMarker()))
    await assertFails(
      setDoc(doc(owner(), observationPath(FAMILY, CORRECTION_ID)), correctionRow()),
    )
  })

  it('admits a re-correction, whose marker already names a DIFFERENT correction', async () => {
    // The compatible half of the two tests above: correcting the same row twice
    // is ordinary, the writer overwrites the marker in the same commit, and the
    // pre-state names the earlier correction rather than this one.
    await seed((db) =>
      setDoc(
        doc(db, markerPath(FAMILY, ORIGINAL_ID)),
        marker({
          correctedObservationId: ORIGINAL_ID,
          correctionObservationId: observationDocId(CHILD, 'firstcorrection1'),
          correctionEntryKey: 'firstcorrection1',
        }),
      ),
    )
    await assertSucceeds(commitCorrection(owner(), correctionRow(), matchingMarker()))
  })

  it('admits a correction OF a correction', async () => {
    // The chain case: the row being corrected is itself a correction, so the
    // marker lands at its id and nothing about the first marker is involved.
    const firstKey = 'firstcorrection1'
    const firstId = observationDocId(CHILD, firstKey)
    await seed((db) =>
      setDoc(
        doc(db, observationPath(FAMILY, firstId)),
        observation({ entryKey: firstKey, correctsObservationId: ORIGINAL_ID }),
      ),
    )
    const db = owner()
    const batch = writeBatch(db)
    batch.set(
      doc(db, observationPath(FAMILY, CORRECTION_ID)),
      correctionRow({ correctsObservationId: firstId }),
    )
    batch.set(
      doc(db, markerPath(FAMILY, firstId)),
      marker({
        correctedObservationId: firstId,
        correctionObservationId: CORRECTION_ID,
        correctionEntryKey: CORRECTION_KEY,
      }),
    )
    await assertSucceeds(batch.commit())
  })

  it('admits the retry backfill, which writes a marker and no row', async () => {
    // A retry whose first attempt landed writes only the missing marker. Markers
    // are left exactly as permissive as they were, so append-only cannot block
    // the one write that repairs a half-finished correction.
    await seed((db) =>
      setDoc(
        doc(db, observationPath(FAMILY, CORRECTION_ID)),
        observation({ entryKey: CORRECTION_KEY, correctsObservationId: ORIGINAL_ID }),
      ),
    )
    await assertSucceeds(
      setDoc(doc(owner(), markerPath(FAMILY, ORIGINAL_ID)), matchingMarker()),
    )
  })

  it('refuses another family and an anonymous client even with a perfect marker', async () => {
    await assertFails(commitCorrection(otherFamily(), correctionRow(), matchingMarker()))
    await assertFails(commitCorrection(anonymous(), correctionRow(), matchingMarker()))
  })

  it('leaves the stored original and its own id alone on an admitted correction', async () => {
    // The correction is a new row; the row it corrects is the record and must
    // still read back exactly as written.
    await assertSucceeds(commitCorrection(owner(), correctionRow(), matchingMarker()))
    const stored = await getDoc(doc(owner(), observationPath(FAMILY, ORIGINAL_ID)))
    expect(stored.data()?.nativeNumber).toBe(20)
    expect(stored.data()?.correctsObservationId).toBeUndefined()
  })
})
