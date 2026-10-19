import {
  assertSucceeds,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  CHILD,
  CURRENT_RULES,
  FAMILY,
  LEGACY_RULES,
  observation,
  observationDocId,
  observationPath,
  ruleEnvironment,
} from './rulesHarness'

/**
 * **The negative control: the SAME writes, against the rules as they were.**
 *
 * A suite that only shows the new rules refusing something proves very little —
 * a typo in a fixture, a malformed payload or a missing field would refuse it
 * just as thoroughly, and the suite would still be green. So every write the
 * current rules refuse for FIX-265's reason is replayed here against the frozen
 * pre-change ruleset, where it must SUCCEED. That is what makes the denial
 * attributable to the change.
 *
 * It is a control, not a finding. These writes are what the product's own
 * append-only policy always intended to be impossible and what the current
 * client has never sent; what the old rules lacked was any way to say so to a
 * tab that had been open since before FEAT-242.
 */

const PROJECT = 'demo-fpe-rules-legacy'

const asFirestore = (ctx: RulesTestContext): Firestore =>
  ctx.firestore() as unknown as Firestore

let testEnv: RulesTestEnvironment

const owner = () => asFirestore(testEnv.authenticatedContext(FAMILY))

const ORIGINAL_KEY = 'originalentry01'
const CORRECTION_KEY = 'correctionentry1'
const ORIGINAL_ID = observationDocId(CHILD, ORIGINAL_KEY)
const CORRECTION_ID = observationDocId(CHILD, CORRECTION_KEY)

beforeAll(async () => {
  testEnv = await ruleEnvironment(PROJECT, LEGACY_RULES)
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(asFirestore(ctx), observationPath(FAMILY, ORIGINAL_ID)),
      observation({ entryKey: ORIGINAL_KEY }),
    )
  })
})

describe('the rules under control really are the old ones', () => {
  it('is a different ruleset from the one that deploys', () => {
    // A frozen control that has been "kept in sync" is not a control. If these
    // two files ever read the same, every assertion below is vacuous.
    expect(LEGACY_RULES).not.toEqual(CURRENT_RULES)
    expect(LEGACY_RULES).toContain('match /families/{familyId}/{document=**}')
    expect(LEGACY_RULES).not.toContain('nativeProgressObservations')
    expect(CURRENT_RULES).toContain('nativeProgressObservations')
  })
})

describe('what the OLD rules permitted', () => {
  it('admitted the markerless correction the current rules refuse', async () => {
    // The headline control, paired with
    // `nativeProgressObservations.rules.test.ts` › "refuses the old client".
    await assertSucceeds(
      setDoc(
        doc(owner(), observationPath(FAMILY, CORRECTION_ID)),
        observation({
          entryKey: CORRECTION_KEY,
          nativeNumber: 17,
          correctsObservationId: ORIGINAL_ID,
        }),
      ),
    )
  })

  it('admitted an update and a delete of a stored row', async () => {
    // Append-only was a policy held entirely by the one client writer. Both of
    // these succeeded, which is what "enforced rather than described" means.
    await assertSucceeds(
      updateDoc(doc(owner(), observationPath(FAMILY, ORIGINAL_ID)), { nativeNumber: 19 }),
    )
    await assertSucceeds(deleteDoc(doc(owner(), observationPath(FAMILY, ORIGINAL_ID))))
  })
})
