import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { stripComments } from '../../../test/childSwitchSources'

/**
 * The boundary, read off the source — and only the parts behaviour cannot show.
 *
 * `nativeProgressWrites.test.ts` already proves the writer touches one collection,
 * because its mock exports nothing else to touch. What a behavioural test cannot
 * show is the ABSENCE of a second lane somewhere else in the feature: a helper
 * that quietly updates `activityConfigs.currentPosition` "while we're here" would
 * pass every test in this folder and be exactly the drift this feature's isolation
 * exists to prevent. So these assertions are deliberately narrow:
 *
 *  1. no module in the feature names any other collection, writer or planning
 *     field — asserted on source with COMMENTS REMOVED, because the writer's own
 *     header lists those names in prose precisely to say it does not use them;
 *  2. the hook performs no Firestore write itself (the one writer is the module
 *     that re-validates); and
 *  3. the capability check is in the save handler as well as at the control,
 *     which no render-level test can reach once the control is unmounted.
 *
 * It does NOT claim that no Firestore write is possible from here — an import
 * graph cannot prove that, and pretending otherwise is the overreach the
 * `beforeWorkPageCheckWiring` note was written about.
 */

const root = process.cwd()
const read = (relPath: string) => readFileSync(join(root, relPath), 'utf8')

const WRITER = 'src/core/firebase/nativeProgressWrites.ts'
const HOOK = 'src/features/progress/native-progress/useNativeProgressObservations.ts'
const SECTION = 'src/features/progress/native-progress/NativeProgressSection.tsx'
const RULE = 'src/features/progress/native-progress/nativeProgressRule.ts'

const code = (relPath: string) => stripComments(read(relPath))

/**
 * Every rail this feature is isolated from, named rather than counted.
 *
 * A named list is its own check: adding a lane means deleting a line here, which
 * is a visible diff on a test, not an omission.
 */
const FORBIDDEN = [
  'activityConfigsCollection',
  'setActivityConfigPosition',
  'syncActivityPositionToModel',
  'addActivityConfig',
  'completeActivityConfig',
  'currentPosition',
  'totalUnits',
  'unitLabel',
  'skillSnapshotsCollection',
  'writeSnapshotUpdate',
  'skillSnapshotWrites',
  'xpLedgerCollection',
  'addXpEvent',
  'hoursCollection',
  'hoursAdjustmentsCollection',
  'daysCollection',
  'dayWriteGuard',
  'dailyPlansCollection',
  'learnerModelsCollection',
  'bootstrapLearnerModel',
  'childSkillMapsCollection',
  'updateSkillMapFromFindings',
  'evaluationsCollection',
  'ladderProgressCollection',
  'workbookConfigsCollection',
  'sightWordProgressCollection',
  'artifactsCollection',
  'uploadArtifactFile',
]

describe('the feature touches one collection and no rail', () => {
  for (const file of [WRITER, HOOK, SECTION, RULE]) {
    it(`${file} names no other collection, writer or planning field`, () => {
      const source = code(file)
      const found = FORBIDDEN.filter((token) => source.includes(token))
      expect(found).toEqual([])
    })
  }

  it('the writer imports exactly three things from firestore.ts', () => {
    const source = code(WRITER)
    const match = source.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/firestore'/)
    expect(match).toBeTruthy()
    const names = (match?.[1] ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .sort()
    expect(names).toEqual([
      'db',
      'nativeProgressObservationDocId',
      'nativeProgressObservationsCollection',
    ])
  })

  it('the writer performs one kind of write, and it is a transactional set', () => {
    const source = code(WRITER)
    for (const verb of ['addDoc(', 'updateDoc(', 'deleteDoc(', 'writeBatch(', 'setDoc(']) {
      expect(source.includes(verb), `${verb} should not appear`).toBe(false)
    }
    expect(source).toContain('runTransaction(')
    expect(source.match(/tx\.set\(/g)).toHaveLength(1)
  })

  it('the hook writes nothing itself — the writer is the one lane', () => {
    const source = code(HOOK)
    for (const verb of [
      'setDoc(',
      'addDoc(',
      'updateDoc(',
      'deleteDoc(',
      'writeBatch(',
      'runTransaction(',
    ]) {
      expect(source.includes(verb), `${verb} should not appear`).toBe(false)
    }
    expect(source).toContain('saveNativeProgressObservation(')
  })

  it('the two layers cannot drift on the typo guard', () => {
    // The writer may not import from `src/features`, so the ceiling exists twice
    // on purpose — the form's message and the storage limit. Two constants with
    // one value need something that notices when only one of them moves, and
    // reading them out of the source is cheaper than inverting the layering.
    const formCeiling = code(RULE).match(/NATIVE_NUMBER_TYPO_CEILING = (\d+)/)?.[1]
    const storedMax = code(WRITER).match(/NATIVE_NUMBER_STORED_MAX = (\d+)/)?.[1]
    expect(formCeiling).toBeTruthy()
    expect(storedMax).toBe(formCeiling)
  })

  it('the pure rule module holds no Firestore and no React', () => {
    const source = code(RULE)
    expect(source).not.toContain('firebase/firestore')
    expect(source).not.toContain('useState')
    expect(source).not.toMatch(/from 'react'/)
  })
})

describe('the capability check is in the handler, not only the control', () => {
  it('the save handler refuses a kid profile before it reaches the writer', () => {
    const source = code(SECTION)
    const start = source.indexOf('const handleSave')
    const end = source.indexOf('const startCorrection')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)
    expect(body).toContain('if (isChildProfile) return')
    // ...and before the call, not after it.
    expect(body.indexOf('if (isChildProfile) return')).toBeLessThan(body.indexOf('await save('))
  })

  it('the form itself is gated on the same capability', () => {
    const source = code(SECTION)
    expect(source).toMatch(/if \(isChildProfile\) \{\s*return \(/)
  })
})
