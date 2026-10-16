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

  it('neither layer invents a numeric ceiling', () => {
    // Review item 5. The writer may not import from `src/features`, so the number
    // rule exists in both layers; what must hold in both is that the ONLY upper
    // bound is exact storage. A literal maximum reappearing in either is the
    // regression this watches for — a guessed program range wearing a different
    // name.
    for (const file of [RULE, WRITER]) {
      const source = code(file)
      expect(source).toContain('Number.isSafeInteger')
      // No named numeric bound on the native number...
      expect(source).not.toMatch(/NATIVE_NUMBER\w*\s*=\s*\d/)
      // ...and no inline comparison against one either.
      expect(source).not.toMatch(/nativeNumber\s*>\s*\d/)
      expect(source).not.toMatch(/\bvalue\s*>\s*\d/)
    }
  })

  it('the Program field is locked while a correction is open', () => {
    // The UI half of item 7, pinned here rather than in a render test because the
    // assertion is about intent, not about how MUI marks a disabled select.
    expect(code(SECTION)).toContain('disabled={correcting !== null}')
  })

  it('the pure rule module holds no Firestore and no React', () => {
    const source = code(RULE)
    expect(source).not.toContain('firebase/firestore')
    expect(source).not.toContain('useState')
    expect(source).not.toMatch(/from 'react'/)
  })
})

/**
 * Round 3, P1 — pinned on source because the renderer cannot show it.
 *
 * The scope token and the family visit/identity pair are what a late completion
 * is compared against, so they have to be in step by the end of the commit that
 * switched: a passive effect runs after paint, and a save already in the air
 * settles in a microtask before that, which is how an outcome belonging to the
 * previous child came to be treated as the current one's. `act` flushes a commit
 * and the passive effects that commit scheduled in one step, so a render test
 * cannot tell the two kinds of effect apart — the behaviour either way is pinned
 * in `NativeProgressSection.test.tsx`; the ordering it rests on is pinned here.
 */
describe('the switch tokens are in step at the commit, not after the paint', () => {
  /** Which kind of effect the statement nearest above `token` belongs to. */
  const effectHolding = (source: string, token: string) => {
    const at = source.indexOf(token)
    expect(at, `${token} should be in the section`).toBeGreaterThan(-1)
    const layout = source.lastIndexOf('useLayoutEffect(', at)
    const passive = source.lastIndexOf('useEffect(', at)
    expect(layout, `${token} should sit inside an effect`).toBeGreaterThan(-1)
    return layout > passive ? 'useLayoutEffect' : 'useEffect'
  }

  for (const token of [
    'scopeRun.current += 1',
    'familyVisit.current += 1',
    'signedInFamily.current =',
  ]) {
    it(`${token} is advanced in a layout effect`, () => {
      expect(effectHolding(code(SECTION), token)).toBe('useLayoutEffect')
    })
  }

  it('the hook’s committed scope is in step at the commit as well', () => {
    // Round 4 P1: the same window, one layer down. A snapshot callback that was
    // already queued and a save already in the air are both checked against this
    // ref, so advancing it in a passive effect is what let the scope that had
    // just been left settle the read — or splice its row — for the new one.
    expect(effectHolding(code(HOOK), 'committedScope.current = scope')).toBe(
      'useLayoutEffect',
    )
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

  it('the stranded retry refuses a kid profile and another family before the writer', () => {
    // PR-1897 P1. The recovery panel is already filtered out of the render after a
    // family change, so a cross-family retry cannot be TAPPED — which is exactly
    // why the handler's own refusal is pinned here instead: the two layers
    // `handleSave` uses, in the handler that re-sends a pinned request.
    const source = code(SECTION)
    const start = source.indexOf('const retryStrandedSave')
    const end = source.indexOf('const dismissStrandedSave')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)
    expect(body).toContain('if (isChildProfile) return')
    expect(body).toContain('request.familyId !== familyId')
    const reachesWriter = body.indexOf('await save(')
    expect(reachesWriter).toBeGreaterThan(-1)
    expect(body.indexOf('if (isChildProfile) return')).toBeLessThan(reachesWriter)
    expect(body.indexOf('request.familyId !== familyId')).toBeLessThan(reachesWriter)
  })
})
