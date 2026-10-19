import {
  assertFails,
  assertSucceeds,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

import { CHILD, CURRENT_RULES, FAMILY, OTHER_FAMILY, ruleEnvironment } from './rulesHarness'

/**
 * **What FIX-265 did NOT change** — the rest of the boundary, asserted.
 *
 * The change replaced one broad `families/{familyId}/{document=**}` grant with an
 * explicit root grant plus a collection-aware one, because overlapping grants
 * combine with OR and the old one would have re-authorized every write the
 * observation rule refuses. A refactor of the grant that covers the whole product
 * is the risky half of this change — far riskier than the narrow rule it exists
 * to make possible — so each shape the old wildcard matched is written out here:
 * the family root document, a plain collection, a deep nested subcollection, the
 * chat thread + message pair that has its own explicit match, the global
 * `chapterBooks` library, and the deletes the duplicate-child survey performs.
 *
 * Every one of these passed before the change. They are here so that the day one
 * of them stops passing, a test says so rather than a parent finding out.
 */

const PROJECT = 'demo-fpe-rules-boundary'

const asFirestore = (ctx: RulesTestContext): Firestore =>
  ctx.firestore() as unknown as Firestore

let testEnv: RulesTestEnvironment

const owner = () => asFirestore(testEnv.authenticatedContext(FAMILY))
const otherFamily = () => asFirestore(testEnv.authenticatedContext(OTHER_FAMILY))
const anonymous = () => asFirestore(testEnv.unauthenticatedContext())

beforeAll(async () => {
  testEnv = await ruleEnvironment(PROJECT, CURRENT_RULES)
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

describe('the owning family keeps every right it had', () => {
  it('reads and writes the family ROOT document', async () => {
    // The old recursive wildcard matched this with zero segments. It is a
    // separate match now, and nothing else in the file would grant it.
    const db = owner()
    await assertSucceeds(setDoc(doc(db, `families/${FAMILY}`), { displayName: 'synthetic' }))
    await assertSucceeds(updateDoc(doc(db, `families/${FAMILY}`), { displayName: 'synthetic 2' }))
    await assertSucceeds(getDoc(doc(db, `families/${FAMILY}`)))
  })

  it('writes, updates and deletes an ordinary collection document', async () => {
    // `children` is the one collection the app really does delete from (the
    // duplicate-child survey), so it is the delete this asserts.
    const db = owner()
    const child = doc(db, `families/${FAMILY}/children/${CHILD}`)
    await assertSucceeds(setDoc(child, { name: 'Synthetic' }))
    await assertSucceeds(updateDoc(child, { name: 'Synthetic Two' }))
    await assertSucceeds(getDocs(collection(db, `families/${FAMILY}/children`)))
    await assertSucceeds(deleteDoc(child))
  })

  it('writes the auto-id and deeply nested shapes', async () => {
    const db = owner()
    // An auto-id collection (`artifacts`, `businessLog`, `watchLibrary`, …).
    await assertSucceeds(
      addDoc(collection(db, `families/${FAMILY}/artifacts`), { childId: CHILD, tags: [] }),
    )
    // A child's own subcollections — the shape a delete must never orphan.
    await assertSucceeds(
      setDoc(doc(db, `families/${FAMILY}/children/${CHILD}/wordProgress/cat`), { seen: 1 }),
    )
    await assertSucceeds(
      setDoc(doc(db, `families/${FAMILY}/children/${CHILD}/transcriptionEvents/ev-1`), {
        finalText: 'synthetic',
      }),
    )
    // And a settings document, which is a collection with one odd id shape.
    await assertSucceeds(
      setDoc(doc(db, `families/${FAMILY}/settings/plannerDefaults_${CHILD}`), { minutes: 20 }),
    )
  })

  it('writes a chat thread and its messages', async () => {
    const db = owner()
    await assertSucceeds(
      setDoc(doc(db, `families/${FAMILY}/shellyChatThreads/thread-1`), { title: 'synthetic' }),
    )
    await assertSucceeds(
      setDoc(doc(db, `families/${FAMILY}/shellyChatThreads/thread-1/messages/m-1`), {
        role: 'user',
        text: 'synthetic',
      }),
    )
  })

  it('writes the completion record and its marker collection', async () => {
    // The three collections the correction contract coordinates with keep their
    // ordinary owner rights — only `nativeProgressObservations` is carved out.
    const db = owner()
    await assertSucceeds(
      setDoc(doc(db, `families/${FAMILY}/programCompletionEvents/${CHILD}__fastPhonics__k1`), {
        childId: CHILD,
      }),
    )
    await assertSucceeds(
      setDoc(doc(db, `families/${FAMILY}/programCompletionState/${CHILD}__fastPhonics`), {
        childId: CHILD,
      }),
    )
    const markerRef = doc(
      db,
      `families/${FAMILY}/nativeProgressCorrectionMarkers/${CHILD}__anyentrykey01`,
    )
    await assertSucceeds(setDoc(markerRef, { childId: CHILD }))
    await assertSucceeds(updateDoc(markerRef, { childId: CHILD }))
    await assertSucceeds(deleteDoc(markerRef))
  })

  it('reads and writes the global chapter book library', async () => {
    const db = owner()
    await assertSucceeds(setDoc(doc(db, 'chapterBooks/book-1'), { title: 'synthetic' }))
    await assertSucceeds(getDoc(doc(db, 'chapterBooks/book-1')))
  })
})

describe('nobody else does', () => {
  it('refuses another family at the root, in a collection and nested', async () => {
    const db = otherFamily()
    await assertFails(setDoc(doc(db, `families/${FAMILY}`), { displayName: 'no' }))
    await assertFails(setDoc(doc(db, `families/${FAMILY}/children/${CHILD}`), { name: 'no' }))
    await assertFails(
      setDoc(doc(db, `families/${FAMILY}/children/${CHILD}/wordProgress/cat`), { seen: 1 }),
    )
    await assertFails(getDoc(doc(db, `families/${FAMILY}/children/${CHILD}`)))
  })

  it('refuses a signed-out client everywhere, including the global library', async () => {
    const db = anonymous()
    await assertFails(setDoc(doc(db, `families/${FAMILY}`), { displayName: 'no' }))
    await assertFails(getDoc(doc(db, `families/${FAMILY}/children/${CHILD}`)))
    await assertFails(setDoc(doc(db, 'chapterBooks/book-1'), { title: 'no' }))
    await assertFails(getDoc(doc(db, 'chapterBooks/book-1')))
  })

  it('refuses a path outside families/ and chapterBooks/ even for a signed-in user', async () => {
    // The default-deny match, unchanged.
    await assertFails(setDoc(doc(owner(), 'somethingElse/doc-1'), { x: 1 }))
  })
})
