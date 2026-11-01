// ── Banner Rally — the atomic Stonebridge progress write ──────────
//
// `useStonebridgeProgress` computes a proposed progress document from two live
// subscriptions. That proposal is correct for the document the hook was LOOKING
// at. It is not correct for a document another client has moved on in the
// meantime — and two clients are ordinary here: a phone and a tablet, a second
// tab, the same village open twice.
//
// The lost-progress blocker this module exists for was reproduced exactly that
// way. An earlier client still saw `missing` and held an unconditional
// `setDoc`; a newer client created the village and repaired the bridge; then the
// earlier create committed and erased the completion, the banner and the
// baselines. The same shape with an advance: an earlier client's first-mission
// advance, computed before the newer client's completion, overwrote it.
//
// A per-mount write lane, a dedup signature and a visit id cannot see any of
// that. They are facts about ONE client, and the race is between clients. So
// the decision moves to the datastore, where it is the only place it can be
// made: one transaction reads the target document and writes only if the
// document is still the one the proposal was computed from.
//
//   • create — only while the document is still ABSENT;
//   • advance — only while the stored document still equals, field for field,
//     the source document the unchanged proposal was derived from.
//
// On a mismatch nothing is written and the authoritative document is returned,
// for the caller to adopt under its own current visit. `updatedAt` and client
// clocks decide nothing: the test is content equality (stable to key order,
// type-preserving, and carrying fields this module has never heard of).
//
// **Absent where a document was expected is not permission to create one.** The
// caller has watched that village exist; writing a fresh baseline over the hole
// where it was is the reset this whole run is about. The transaction reports it
// instead, and the caller shows an honest recovery state.
//
// No math lives here. `advanceMissions` / `initialStonebridgeProgress` compute
// the proposal; this module stores it unchanged or refuses it.
//
// ── Why the result is RETURNED ───────────────────────────────────────────────
//
// A transaction callback may run more than once — Firestore replays it when the
// document it read changed under it. So nothing here records anything in a
// closure, bumps a counter or sets a flag: the only output is the value the
// callback returns, which is the value of the attempt that actually committed.
// A celebration decided by a side effect inside the callback would be a party
// thrown by an attempt that was thrown away.

import { doc, runTransaction } from 'firebase/firestore'

import { db, stonebridgeProgressCollection } from '../../../core/firebase/firestore'
import type { StonebridgeProgress } from '../../../core/types/stonebridge'

/** What the create transaction did. Immutable, from the committed attempt. */
export type StonebridgeCreateResult =
  /** The document was absent and this transaction wrote the baseline. */
  | { outcome: 'created'; doc: StonebridgeProgress }
  /**
   * Somebody else had already created it. **Nothing was written** — the stored
   * village is returned so the caller can adopt it rather than reset it.
   */
  | { outcome: 'exists'; doc: StonebridgeProgress }

/** What the advance transaction did. Immutable, from the committed attempt. */
export type StonebridgeAdvanceResult =
  /** The stored document still matched the source; the proposal is committed. */
  | { outcome: 'advanced'; doc: StonebridgeProgress }
  /**
   * The stored document had moved on. **Nothing was written** — the
   * authoritative document is returned to be adopted and reconsidered.
   */
  | { outcome: 'conflict'; doc: StonebridgeProgress }
  /**
   * The document is not there at all, where the caller had seen it exist.
   * Nothing was written and nothing was recreated: a baseline written here
   * would erase a history this module cannot see.
   */
  | { outcome: 'absent' }

// ── One canonical identity, for both the compare and the dedup ──────────────
//
// Equality and the caller's dedup signature are the SAME function here, because
// two answers to "is this the document I read" that can disagree are a defect
// waiting for the one input where they do.
//
// It is **type-aware and finite**, never a generic walk:
//
//  • a generic walk reaches SDK internals. A real modular `DocumentReference`
//    carries its `Firestore` instance, which is cyclic — walking it throws
//    `RangeError` rather than answering, and a compare that throws is a write
//    that cannot be made. Sol's review found exactly that;
//  • `JSON.stringify` cannot name any of these values. A `Date`, a `Timestamp`,
//    a `GeoPoint` and a `DocumentReference` all serialise to `{}` (no own
//    enumerable keys), so two DIFFERENT documents compared equal — the unsafe
//    direction, which is an overwrite. `NaN` and `±Infinity` collapse to `null`
//    the same way.
//
// So every value Firestore can store is named by its own type: null, boolean,
// number (including NaN, ±Infinity and a signed zero), string, bytes,
// timestamp, geopoint, reference (by app / project / database / path), vector,
// array and map. Maps are the ONLY thing whose keys are walked, and only when
// the value really is a plain object — which is what a Firestore map reads back
// as, and what keeps a map `{ latitude, longitude }` from being mistaken for a
// `GeoPoint`.
//
// Unknown FIELDS are ordinary: they are named by value like every other field,
// so a document another client has added something to is not the document we
// read, and the field itself rides through the proposal untouched.
//
// An unknown VALUE TYPE — something no Firestore read can produce today — is
// reported rather than guessed at: the token stays deterministic (so a dedup
// signature cannot spin) and EQUALITY refuses, because a value this module
// cannot name must never be claimed unchanged. Refusing costs a no-op and an
// honest recovery state; guessing costs the child's village.

/** The depth at which a value stops being a progress document. Finite by force. */
const MAX_DEPTH = 24

/** A canonical identity for a stored value, and whether it can be trusted. */
export interface CanonicalValue {
  /** Deterministic, type-aware, finite. Never built by walking SDK internals. */
  token: string
  /** True when some value could not be named by type. Equality then refuses. */
  opaque: boolean
}

interface CanonState {
  opaque: boolean
}

/** Three property hops, no recursion, no iteration — and never a throw. */
function referenceToken(value: object, state: CanonState): string {
  try {
    const ref = value as {
      type?: unknown
      path?: unknown
      firestore?: {
        app?: { name?: unknown; options?: { projectId?: unknown } }
        // The one internal read, by name and optional: multi-database identity
        // is not on the public surface, and a reference's database is part of
        // which document it is. Absent, the project id below carries it.
        _databaseId?: { projectId?: unknown; database?: unknown }
      }
    }
    const text = (candidate: unknown) => (typeof candidate === 'string' ? candidate : '')
    const store = ref.firestore
    // Encoded as a TUPLE, not joined on a separator: an app name and a document
    // id may both legally contain the separator, and joining let two different
    // documents produce one token — Sol's review collided a real pair.
    return `r|${JSON.stringify([
      text(ref.type),
      text(store?.app?.name),
      text(store?._databaseId?.projectId) || text(store?.app?.options?.projectId),
      text(store?._databaseId?.database),
      text(ref.path),
    ])}`
  } catch {
    // A getter that throws (a terminated instance, a future SDK shape) is a
    // value we cannot name. Refuse rather than report a guess.
    state.opaque = true
    return 'x|reference'
  }
}

function canonicalOf(value: unknown, state: CanonState, depth: number): string {
  if (value === null) return 'z'
  if (value === undefined) return 'u'

  switch (typeof value) {
    case 'string':
      return `s|${JSON.stringify(value)}`
    case 'boolean':
      return value ? 'b|1' : 'b|0'
    case 'bigint':
      return `g|${value.toString()}`
    case 'number': {
      // The four numbers `JSON.stringify` cannot tell apart from each other or
      // from `null`. A signed zero is kept distinct on the safe side: it means
      // a no-op, never an overwrite.
      if (Number.isNaN(value)) return 'n|NaN'
      if (value === Number.POSITIVE_INFINITY) return 'n|Inf'
      if (value === Number.NEGATIVE_INFINITY) return 'n|-Inf'
      if (Object.is(value, -0)) return 'n|-0'
      return `n|${value}`
    }
    case 'function':
    case 'symbol':
      state.opaque = true
      return 'x|callable'
    default:
      break
  }

  // Objects from here down — `typeof` has answered every other shape above.
  if (typeof value !== 'object' || value === null) {
    state.opaque = true
    return 'x|unknown'
  }

  if (depth >= MAX_DEPTH) {
    state.opaque = true
    return 'x|deep'
  }

  if (Array.isArray(value)) {
    // Length first: an array's identity includes how long it is, and ORDER is
    // part of it — completion order is the child's history.
    return `a|${value.length}|${value
      .map((item) => canonicalOf(item, state, depth + 1))
      .join('|,|')}`
  }

  const prototype = Object.getPrototypeOf(value) as object | null
  if (prototype === Object.prototype || prototype === null) {
    // A plain object is a Firestore MAP, and the only thing whose keys are
    // walked. Sorted, because key order is not part of a map's value and two
    // reads of the same document are not promised to insert in the same order.
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `m|${keys.length}|${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalOf(record[key], state, depth + 1)}`)
      .join('|,|')}`
  }

  // A class instance. Named by TYPE, never iterated — which is what keeps this
  // out of an SDK's internals and out of its cycles.
  return classInstanceToken(value, state, depth)
}

/**
 * The Firestore value types that are objects but not maps.
 *
 * Every branch reads a bounded, named set of properties and recurses only into
 * numbers or a plain array. The whole thing is guarded because a property on a
 * class this module does not own is free to be a getter that throws, and the
 * answer to "did this document change" may never be an exception.
 */
function classInstanceToken(value: object, state: CanonState, depth: number): string {
  try {
    if (value instanceof Date) {
      const time = value.getTime()
      return Number.isNaN(time) ? 'd|NaN' : `d|${time}`
    }

    const shaped = value as {
      seconds?: unknown
      nanoseconds?: unknown
      toMillis?: unknown
      latitude?: unknown
      longitude?: unknown
      toBase64?: unknown
      toArray?: unknown
      type?: unknown
      path?: unknown
    }

    // Timestamp — by its own seconds and nanoseconds, which is its value.
    if (
      typeof shaped.seconds === 'number' &&
      typeof shaped.nanoseconds === 'number' &&
      typeof shaped.toMillis === 'function'
    ) {
      return `t|${canonicalOf(shaped.seconds, state, depth + 1)}|${canonicalOf(
        shaped.nanoseconds,
        state,
        depth + 1,
      )}`
    }
    // GeoPoint — by its coordinates. Reached only for a class instance, so a
    // stored MAP of the same two fields stays a map and the two never collide.
    if (typeof shaped.latitude === 'number' && typeof shaped.longitude === 'number') {
      return `p|${canonicalOf(shaped.latitude, state, depth + 1)}|${canonicalOf(
        shaped.longitude,
        state,
        depth + 1,
      )}`
    }
    // Bytes — by their content, in the SDK's own encoding of it.
    if (typeof shaped.toBase64 === 'function') {
      return `y|${String((shaped.toBase64 as () => string)())}`
    }
    // VectorValue — by its numbers, through the SDK's own accessor.
    if (typeof shaped.toArray === 'function') {
      return `v|${canonicalOf((shaped.toArray as () => unknown)(), state, depth + 1)}`
    }
    // A reference — by which document it is, not by the client it was made from.
    if (typeof shaped.type === 'string' && typeof shaped.path === 'string') {
      return referenceToken(value, state)
    }
  } catch {
    state.opaque = true
    return 'x|threw'
  }

  state.opaque = true
  return 'x|unknown'
}

/**
 * The canonical identity of a stored value.
 *
 * One function behind both the compare-and-set and the caller's dedup
 * signature, so the two can never disagree about whether a document changed.
 *
 * It cannot throw. A compare that throws is a write that can never be made, for
 * a child whose village is perfectly fine — so anything unexpected becomes a
 * deterministic token plus a refusal to claim equality.
 */
export function canonicalProgressValue(value: unknown): CanonicalValue {
  const state: CanonState = { opaque: false }
  try {
    const token = canonicalOf(value, state, 0)
    return { token, opaque: state.opaque }
  } catch {
    return { token: 'x|threw', opaque: true }
  }
}

/**
 * The identity string alone — for a dedup signature, where the question is only
 * "is this the same attempt I have already made".
 *
 * Deterministic even for a value this module cannot name, because a signature
 * that changed on every reconcile would re-issue a write that can never commit.
 */
export function canonicalToken(value: unknown): string {
  return canonicalProgressValue(value).token
}

/**
 * Equality of two values as Firestore stores them, by canonical identity.
 *
 * Refuses on any value it could not name by type, on either side: the only two
 * answers it may give are "this is certainly the value I read" and "it may not
 * be", and the second one writes nothing.
 */
export function storedValuesEqual(a: unknown, b: unknown): boolean {
  const left = canonicalProgressValue(a)
  if (left.opaque) return false
  const right = canonicalProgressValue(b)
  if (right.opaque) return false
  return left.token === right.token
}

/**
 * Field-for-field equality of two stored progress documents — the
 * compare-and-set test. The same rule as {@link storedValuesEqual}, named for
 * the one job it does here.
 */
export function progressDocsEqual(a: StonebridgeProgress, b: StonebridgeProgress): boolean {
  return storedValuesEqual(a, b)
}

/**
 * Initialise a child's village — **only** while it does not exist.
 *
 * The create a first visit owes, made safe against the client that got there
 * first: if the document is already stored, this writes nothing and hands back
 * what is stored. A `missing` subscription is a true statement about a moment,
 * and this is the check that it is still true at the instant of the write.
 */
export async function createStonebridgeProgressIfAbsent(args: {
  familyId: string
  childId: string
  /** The baseline, computed by `initialStonebridgeProgress`. Unchanged here. */
  initial: StonebridgeProgress
}): Promise<StonebridgeCreateResult> {
  const ref = doc(stonebridgeProgressCollection(args.familyId), args.childId)
  return runTransaction(db, async (tx): Promise<StonebridgeCreateResult> => {
    const snapshot = await tx.get(ref)
    const stored = snapshot.exists()
      ? (snapshot.data() as StonebridgeProgress | undefined)
      : undefined
    if (stored) return { outcome: 'exists', doc: stored }
    tx.set(ref, args.initial)
    return { outcome: 'created', doc: args.initial }
  })
}

/**
 * Persist an advance — **only** while the stored document is still the one the
 * advance was computed from.
 *
 * `source` is that document, as the caller read it; `next` is the proposal
 * derived from it, byte for byte as `advanceMissions` returned it. A mismatch
 * writes nothing: the proposal describes a village that has moved, and the
 * caller re-reads instead. An identical document still commits — the compare is
 * against the source, not against the proposal, so a legitimate re-attempt of
 * the same work is not refused as a conflict.
 */
export async function advanceStonebridgeProgressIfUnchanged(args: {
  familyId: string
  childId: string
  source: StonebridgeProgress
  next: StonebridgeProgress
}): Promise<StonebridgeAdvanceResult> {
  const ref = doc(stonebridgeProgressCollection(args.familyId), args.childId)
  return runTransaction(db, async (tx): Promise<StonebridgeAdvanceResult> => {
    const snapshot = await tx.get(ref)
    const current = snapshot.exists()
      ? (snapshot.data() as StonebridgeProgress | undefined)
      : undefined
    if (!current) return { outcome: 'absent' }
    if (!progressDocsEqual(current, args.source)) return { outcome: 'conflict', doc: current }
    tx.set(ref, args.next)
    return { outcome: 'advanced', doc: args.next }
  })
}
