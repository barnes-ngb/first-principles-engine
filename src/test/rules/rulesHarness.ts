import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'

import {
  NativeProgressMeaning,
  NativeProgressProgram,
  NativeProgressSource,
} from '../../core/types/nativeProgress'
import { correctionMarkerId } from '../../core/types/programCompletion'

/**
 * Shared plumbing for the `firestore.rules` suites (FIX-265).
 *
 * Everything here is about talking to a REAL Firestore emulator. There is no mock
 * rules engine and no predicate standing in for one: the rules under test are
 * loaded from `firestore.rules` itself, evaluated by the emulator, and the only
 * thing these tests assert is whether a write the real client could send is
 * accepted or refused. A rules test that passes with no emulator running is a
 * rules test that proves nothing, which is why `emulatorHostPort` throws instead
 * of defaulting.
 */

/** The repo root, from this file. */
const ROOT = resolve(__dirname, '../../..')

const readRules = (relPath: string) => readFileSync(resolve(ROOT, relPath), 'utf-8')

/** The rules as they are deployed — the subject of every current-rules suite. */
export const CURRENT_RULES = readRules('firestore.rules')

/**
 * The rules as they stood before this change — the negative control, frozen.
 * See the fixture's own header for why a drifting control is not a control.
 */
export const LEGACY_RULES = readRules('src/test/rules/fixtures/firestore.legacy.rules')

/**
 * Where the emulator is, from the environment `firebase emulators:exec` exports.
 *
 * Deliberately NOT defaulted to localhost:8080. A default turns "the emulator was
 * never started" into a confusing connection error, and — worse — a suite that
 * found credentials and a real project id in the environment could be pointed
 * somewhere it must never write. Run through `npm run test:rules`.
 */
function emulatorHostPort(envVar: 'FIRESTORE_EMULATOR_HOST' | 'FIREBASE_AUTH_EMULATOR_HOST'): {
  host: string
  port: number
} {
  const raw = process.env[envVar]
  if (!raw) {
    throw new Error(
      `${envVar} is not set. The Firestore rules suite needs a running emulator — ` +
        'run `npm run test:rules`, which starts one via `firebase emulators:exec`.',
    )
  }
  // `127.0.0.1:8080`, and `localhost:9099` — and the auth variable is sometimes
  // exported with a scheme, which `new URL` is the honest way to strip.
  const withScheme = raw.includes('://') ? raw : `http://${raw}`
  const url = new URL(withScheme)
  return { host: url.hostname, port: Number(url.port) }
}

export const firestoreEmulator = () => emulatorHostPort('FIRESTORE_EMULATOR_HOST')
export const authEmulator = () => emulatorHostPort('FIREBASE_AUTH_EMULATOR_HOST')

/**
 * A test environment with one ruleset loaded, on its own project id.
 *
 * Separate project ids per suite is what keeps the negative control honest: the
 * legacy rules are loaded for `…-legacy` only, so no ordering accident can leave
 * them in force for a suite that believes it is testing the current ones, and one
 * suite's `clearFirestore()` can never reach another's fixtures.
 */
export async function ruleEnvironment(
  projectId: string,
  rules: string,
): Promise<RulesTestEnvironment> {
  const { host, port } = firestoreEmulator()
  return initializeTestEnvironment({
    projectId,
    firestore: { host, port, rules },
  })
}

// ── Synthetic identities ─────────────────────────────────────────────────────
//
// Invented strings, shaped like the real ones and belonging to nobody. No family
// id, child id or record from the live project appears anywhere in this suite.

/** The owning family — `familyId` IS the signed-in UID, as in the app. */
export const FAMILY = 'synthetic-family-uid'
/** A second signed-in user who owns a different family. */
export const OTHER_FAMILY = 'synthetic-other-family-uid'
/** Two synthetic children of the owning family. */
export const CHILD = 'synthetic-child-a'
export const OTHER_CHILD = 'synthetic-child-b'

// ── Paths and ids, mirroring the app's own composition ───────────────────────
//
// Restated here rather than imported from `core/firebase/firestore.ts`, because
// importing that module initializes the app's Firebase instance and these suites
// deliberately talk only to their own test contexts. The restatement is pinned
// against the real helpers in `realWriter.rules.test.ts`, which does import them.

/** `{childId}__{entryKey}` — `nativeProgressObservationDocId`. */
export const observationDocId = (childId: string, entryKey: string) =>
  `${childId}__${entryKey}`

export const observationPath = (familyId: string, observationId: string) =>
  `families/${familyId}/nativeProgressObservations/${observationId}`

export const markerPath = (familyId: string, correctedObservationId: string) =>
  `families/${familyId}/nativeProgressCorrectionMarkers/${correctionMarkerId(correctedObservationId)}`

// ── Payloads ─────────────────────────────────────────────────────────────────

/**
 * A type alias rather than an `interface` on purpose: only object type literals
 * get TypeScript's implicit index signature, and without one these fixtures are
 * not assignable to Firestore's `DocumentData` at the `setDoc` call.
 */
export type ObservationFixture = {
  id: string
  childId: string
  program: string
  nativeNumber: number
  meaning: string
  observedOn: string
  source: string
  recordedAt: string
  entryKey: string
  correctsObservationId?: string
}

/**
 * One stored observation, in the shape `nativeProgressWrites` writes.
 *
 * The enum values come from the app's own constants so a renamed meaning or
 * program fails to compile here instead of quietly testing a shape nothing
 * writes. `correctsObservationId` is OMITTED rather than set to undefined for a
 * plain report, exactly as the converter's `stripUndefined` leaves it.
 */
export function observation(
  overrides: Partial<ObservationFixture> & { entryKey: string },
): ObservationFixture {
  const childId = overrides.childId ?? CHILD
  const base: ObservationFixture = {
    id: observationDocId(childId, overrides.entryKey),
    childId,
    program: NativeProgressProgram.FastPhonics,
    nativeNumber: 20,
    meaning: NativeProgressMeaning.CompletedThrough,
    observedOn: '2026-10-01',
    source: NativeProgressSource.ParentReport,
    recordedAt: '2026-10-02T15:00:00.000Z',
    entryKey: overrides.entryKey,
  }
  const merged = { ...base, ...overrides }
  if (merged.correctsObservationId === undefined) delete merged.correctsObservationId
  return merged
}

/** A type alias for the same reason as `ObservationFixture` above. */
export type MarkerFixture = {
  id: string
  childId: string
  correctionObservationId: string
  correctionEntryKey: string
  correctedAt: string
}

/** The marker `nativeProgressWrites` writes for every correction. */
export function marker(args: {
  correctedObservationId: string
  correctionObservationId: string
  correctionEntryKey: string
  childId?: string
  correctedAt?: string
}): MarkerFixture {
  return {
    id: correctionMarkerId(args.correctedObservationId),
    childId: args.childId ?? CHILD,
    correctionObservationId: args.correctionObservationId,
    correctionEntryKey: args.correctionEntryKey,
    correctedAt: args.correctedAt ?? '2026-10-02T15:00:00.000Z',
  }
}
