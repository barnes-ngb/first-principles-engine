import { initializeApp } from 'firebase/app'
// The REAL modular SDK value classes — not a stand-in with an `isEqual` method.
// That is the whole point of this file: the values this compare has to survive
// are SDK objects whose internals are cyclic, and a hand-written fake cannot
// reproduce the failure they cause.
import { Bytes, GeoPoint, Timestamp, collection, doc, getFirestore } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'

import type { StonebridgeProgress } from '../../../core/types/stonebridge'
import {
  canonicalProgressValue,
  canonicalToken,
  progressDocsEqual,
  storedValuesEqual,
} from './stonebridgeProgressWrite'

/**
 * Real-SDK controls for the canonical identity.
 *
 * ── The failure this file exists for ────────────────────────────────────────
 *
 * The first cut of this module compared documents by walking them and built its
 * dedup signature with a sorted `JSON.stringify`. Both are wrong in a way no
 * plain-object test can show:
 *
 *  • a real `DocumentReference` holds its `Firestore` instance, whose object
 *    graph is **cyclic**. A generic walk does not return a wrong answer, it
 *    throws `RangeError` — and a compare that throws is a write that can never
 *    be made, for a child whose village is fine;
 *  • a `Timestamp`, a `GeoPoint`, a `Bytes` and a `Date` have **no own
 *    enumerable keys**, so every one of them serialises to `{}`. Two documents
 *    differing only in such a field compared EQUAL, which is the unsafe
 *    direction: the compare-and-set would commit and overwrite.
 *
 * Only the app's own Firestore module is mocked here (so no real app config is
 * read and nothing connects); `firebase/firestore` itself is the real one, and
 * the references below are built locally — constructing a reference touches no
 * network.
 *
 * POSITIVE CONTROL. Replace the canonical identity with a generic walk and the
 * reference cases throw; replace it with `JSON.stringify` and every *"not"*
 * assertion below fails on two different documents being called the same.
 */

vi.mock('../../../core/firebase/firestore', () => ({
  db: { kind: 'db' },
  stonebridgeProgressCollection: (familyId: string) => ({
    kind: 'stonebridgeProgress',
    familyId,
  }),
}))

/** A local app, named so it cannot collide with another suite's default app. */
const app = initializeApp({ projectId: 'demo-stonebridge-identity' }, 'stonebridge-identity')
const store = getFirestore(app)

const otherApp = initializeApp(
  { projectId: 'demo-stonebridge-other' },
  'stonebridge-identity-other',
)
const otherStore = getFirestore(otherApp)

/**
 * Sol's collision pair: the separator a joined token used is legal inside an
 * app name AND inside a document id, so these two different documents produced
 * one identity.
 */
const pipeAppA = initializeApp({ projectId: 'demo-first' }, 'sol|demo-second|(default)|part')
const pipeAppB = initializeApp({ projectId: 'demo-second' }, 'sol')
const pipeRefA = doc(getFirestore(pipeAppA), 'syntheticStonebridge/a')
const pipeRefASame = doc(getFirestore(pipeAppA), 'syntheticStonebridge/a')
const pipeRefB = doc(getFirestore(pipeAppB), 'part|demo-first|(default)|syntheticStonebridge/a')

const lincolnRef = doc(collection(store, 'families/fam-1/stonebridgeProgress'), 'lincoln')
const sameLincolnRef = doc(collection(store, 'families/fam-1/stonebridgeProgress'), 'lincoln')
const londonRef = doc(collection(store, 'families/fam-1/stonebridgeProgress'), 'london')
const otherProjectLincolnRef = doc(
  collection(otherStore, 'families/fam-1/stonebridgeProgress'),
  'lincoln',
)

const SAVED: StonebridgeProgress = {
  childId: 'lincoln',
  currentMissionId: 'library_hut',
  activeProgress: { missionId: 'library_hut', current: 3, target: 8 },
  completedMissions: ['old_bridge', 'watchtower'],
  raisedBanners: ['old_bridge', 'watchtower'],
  missionBaselines: { old_bridge: 0, watchtower: 5, library_hut: 11 },
  updatedAt: '2026-10-20T10:00:00.000Z',
}

/** A document carrying a value in a field this hook knows nothing about. */
function withField(value: unknown): StonebridgeProgress {
  return { ...SAVED, fromAnotherClient: value } as StonebridgeProgress
}

describe('a real DocumentReference in an unknown field', () => {
  it('is named rather than walked — no RangeError, and an answer', () => {
    const left = withField(lincolnRef)
    const right = withField(sameLincolnRef)

    // The call itself is the assertion: a generic walk throws here.
    expect(() => canonicalProgressValue(left)).not.toThrow()
    expect(canonicalProgressValue(left).opaque).toBe(false)
    // Two references to the same document are the same stored value.
    expect(progressDocsEqual(left, right)).toBe(true)
    expect(canonicalToken(left)).toBe(canonicalToken(right))
  })

  it('distinguishes references by path and by database', () => {
    expect(progressDocsEqual(withField(lincolnRef), withField(londonRef))).toBe(false)
    // Same path, different project: a different document, so a different value.
    expect(progressDocsEqual(withField(lincolnRef), withField(otherProjectLincolnRef))).toBe(false)
  })

  /**
   * POSITIVE CONTROL: join the identity fields on a separator again and this
   * fails — both references produce one token, so a compare-and-set would call
   * two different documents the same document.
   */
  it('cannot be collided by a separator inside an app name or a document id', () => {
    expect(canonicalToken(pipeRefA)).not.toBe(canonicalToken(pipeRefB))
    expect(progressDocsEqual(withField(pipeRefA), withField(pipeRefB))).toBe(false)
    // …and each is still the same value as itself.
    expect(storedValuesEqual(pipeRefA, pipeRefASame)).toBe(true)
    expect(progressDocsEqual(withField(pipeRefA), withField(pipeRefASame))).toBe(true)
  })

  it('is not confused with a map that merely holds the same path', () => {
    const asMap = { type: 'document', path: 'families/fam-1/stonebridgeProgress/lincoln' }
    expect(storedValuesEqual(lincolnRef, asMap)).toBe(false)
  })

  it('keeps the compare and the dedup signature agreeing on it', () => {
    const docs = [
      withField(lincolnRef),
      withField(sameLincolnRef),
      withField(londonRef),
      withField(otherProjectLincolnRef),
    ]
    docs.forEach((left) =>
      docs.forEach((right) => {
        expect(progressDocsEqual(left, right)).toBe(canonicalToken(left) === canonicalToken(right))
      }),
    )
  })
})

describe('the real SDK values that all serialise to {}', () => {
  it('names a Timestamp by its own seconds and nanoseconds', () => {
    const at = new Timestamp(1_700_000_000, 123)
    const same = new Timestamp(1_700_000_000, 123)
    const laterNanos = new Timestamp(1_700_000_000, 124)
    const laterSeconds = new Timestamp(1_700_000_001, 123)

    expect(storedValuesEqual(at, same)).toBe(true)
    expect(storedValuesEqual(at, laterNanos)).toBe(false)
    expect(storedValuesEqual(at, laterSeconds)).toBe(false)
    expect(progressDocsEqual(withField(at), withField(same))).toBe(true)
    expect(progressDocsEqual(withField(at), withField(laterNanos))).toBe(false)
    // …and it is not the same value as the number of millis it describes.
    expect(storedValuesEqual(at, at.toMillis())).toBe(false)
  })

  it('names a GeoPoint by its coordinates', () => {
    expect(storedValuesEqual(new GeoPoint(1, 2), new GeoPoint(1, 2))).toBe(true)
    expect(storedValuesEqual(new GeoPoint(1, 2), new GeoPoint(1, 3))).toBe(false)
    expect(progressDocsEqual(withField(new GeoPoint(1, 2)), withField(new GeoPoint(2, 1)))).toBe(
      false,
    )
  })

  it('names Bytes by their content', () => {
    const bytes = Bytes.fromUint8Array(new Uint8Array([1, 2, 3]))
    const same = Bytes.fromUint8Array(new Uint8Array([1, 2, 3]))
    const different = Bytes.fromUint8Array(new Uint8Array([1, 2, 4]))

    expect(storedValuesEqual(bytes, same)).toBe(true)
    expect(storedValuesEqual(bytes, different)).toBe(false)
    expect(progressDocsEqual(withField(bytes), withField(different))).toBe(false)
  })

  it('does not let one SDK type stand in for another', () => {
    const at = new Timestamp(0, 0)
    expect(storedValuesEqual(at, new GeoPoint(0, 0))).toBe(false)
    expect(storedValuesEqual(at, new Date(0))).toBe(false)
    expect(storedValuesEqual(lincolnRef, at)).toBe(false)
  })

  it('leaves a document with no such field completely unaffected', () => {
    expect(canonicalProgressValue(SAVED).opaque).toBe(false)
    expect(progressDocsEqual(SAVED, { ...SAVED })).toBe(true)
    expect(progressDocsEqual(SAVED, { ...SAVED, updatedAt: 'later' })).toBe(false)
  })
})
