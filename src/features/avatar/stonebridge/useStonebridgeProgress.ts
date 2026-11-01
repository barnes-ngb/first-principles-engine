import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { doc, onSnapshot, query, where } from 'firebase/firestore'

import { stonebridgeProgressCollection, xpLedgerCollection } from '../../../core/firebase/firestore'
import type { StonebridgeProgress } from '../../../core/types/stonebridge'
import {
  advanceMissions,
  countReadingActions,
  initialStonebridgeProgress,
  type MissionComputation,
  type ReadingActivityEvent,
} from './computeStonebridgeProgress'
import { getMission, type StonebridgeMission } from './missions'
import {
  advanceStonebridgeProgressIfUnchanged,
  canonicalToken,
  createStonebridgeProgressIfAbsent,
} from './stonebridgeProgressWrite'

export interface StonebridgeProgressData {
  /** The mission currently shown as the live card. */
  mission: StonebridgeMission | null
  /** Derived counters for the active mission. */
  active: MissionComputation | null
  /** Completed mission ids, in order. */
  completedMissions: string[]
  /** Raised banner location ids. */
  raisedBanners: string[]
  /**
   * Lifetime reading actions counted (book reads + quest completions), or `null`
   * when it is not known. **A failed read is not zero** — the old `?? 0` here is
   * the display half of the defect this hook now refuses to repeat.
   */
  totalReadingActions: number | null
  /**
   * Mission id that completed during *this* session (one-shot per completion).
   * Drives the banner-raise celebration. Caller clears it via {@link clearJustCompleted}.
   * Only ever set once the write that records the completion has actually
   * **committed** — a transaction that was refused, or that no-opped because
   * another client had already moved the village on, celebrates nothing.
   */
  justCompletedMissionId: string | null
  clearJustCompleted: () => void
  /** Nothing to show yet, and nothing has failed — the quiet placeholder. */
  loading: boolean
  /**
   * What is on screen is the **last known** progress for this child, not a
   * current read: the live read failed, or has not settled again after a Retry,
   * **or** the document this mount has watched exist came back absent — the
   * recovery state, which writes nothing and waits for an authoritative read
   * rather than re-creating a village over the hole where one was.
   * Earned banners stay visible; every surface showing them must say the
   * numbers are not fresh.
   */
  stale: boolean
  /**
   * A read for the child on screen did not produce his village: a subscription
   * came back as an error, **or** the document this mount has watched exist came
   * back absent — which is a load that did not deliver his village, not a child
   * who has none. Both are the same sentence to a six-year-old (*"Couldn't load
   * your village."*) and the same one door, and the second must never be read as
   * permission to write a fresh one.
   */
  readError: boolean
  /**
   * The last persist attempted for the child on screen was rejected, and no
   * further write will be attempted for that child until {@link retry} is
   * tapped. Retained per child, so returning to a child whose write failed
   * while his brother was on screen still offers the recovery rather than
   * silently writing again.
   */
  saveError: boolean
  /**
   * A Retry for the child on screen has re-subscribed and neither read has
   * settled yet. Distinct from {@link loading} so a surface can say *trying*
   * instead of implying the data on screen is fresh or that anything saved.
   */
  retrying: boolean
  /** Re-subscribe both reads and re-arm ONE write attempt. Clears nothing earned. */
  retry: () => void
}

const EMPTY: StonebridgeProgressData = {
  mission: null,
  active: null,
  completedMissions: [],
  raisedBanners: [],
  totalReadingActions: null,
  justCompletedMissionId: null,
  clearJustCompleted: () => {},
  loading: true,
  stale: false,
  readError: false,
  saveError: false,
  retrying: false,
  retry: () => {},
}

/**
 * The reading-activity subscription's state.
 *
 * `ready` carries the count — **including a genuine zero**, which is what an
 * empty event query means. `error` is its own state and never collapses to
 * zero: substituting zero for a failed read is what corrupted the first-visit
 * baseline (a baseline of 0 against existing lifetime reading auto-completes
 * missions the child never read for).
 */
type ReadingState =
  | { phase: 'loading' }
  | { phase: 'ready'; count: number }
  | { phase: 'error' }

/**
 * The progress-doc subscription's state.
 *
 * `missing` is **only** a successful snapshot whose doc does not exist. The old
 * code set `doc: null` from the error callback too, so a listener error was read
 * as "no progress yet" and reconciliation wrote a fresh doc over a real,
 * completed village.
 *
 * It is a necessary condition for the initialisation write and no longer a
 * sufficient one: `missing` for a child whose village this mount has already
 * SEEN is the recovery state below, not a first visit (and the write itself is
 * create-if-absent inside a transaction either way).
 */
type ProgressState =
  | { phase: 'loading' }
  | { phase: 'ready'; doc: StonebridgeProgress }
  | { phase: 'missing' }
  | { phase: 'error' }

/**
 * Everything the render needs, in ONE coherent state value.
 *
 * It is a reducer rather than six `useState`s for two reasons the review found
 * the hard way. **One**, last-known progress is a function of *both*
 * subscriptions, so a separate effect that watched them and copied the pair
 * into another state was a cascading effect-state copy (and the lint rule that
 * forbids it is right: there is a frame in which the copy has not happened).
 * Here the retention IS the snapshot transition. **Two**, every side effect of a
 * listener callback — the snapshot, the celebration seed, the last-known pair —
 * is now gated by one `visitId` comparison inside a pure reducer, so a stale
 * callback cannot land half of itself before being rejected, which is exactly
 * what went wrong when the seed sat outside the guard.
 *
 * ── Why the visit id carries a serial ────────────────────────────────────────
 *
 * The previous build stamped everything with `${familyId}_${childId}#${retryN}`
 * and called it a generation. That string **repeats**: leave Lincoln and come
 * back and the new visit's stamp is character-for-character the first visit's,
 * because neither the child nor the Retry count has changed. An advance write
 * issued in visit 1 and acknowledged during visit 3 therefore passed the
 * reducer's guard and raised a banner-raise celebration over a visit that had
 * never completed anything — the blocker the independent review reproduced on
 * candidate 3 (a pending Watchtower advance, a switch to the brother, a return,
 * then the old acknowledgement).
 *
 * So the visit identity is `scope#retry@serial` where `serial` **only ever
 * increases**: it is bumped by the reducer on every observed change of child,
 * family or Retry ticket, which makes each visit's id unique for the life of
 * the mount. The serial lives in this state, not in a ref, because the render
 * is what reads and compares it (`react-hooks/refs` forbids reading a ref here,
 * and a ref holds the value at commit time rather than the value this render is
 * describing). The transition stays a single conditional render-phase dispatch
 * against the *observed* `key`/`retryN` — no effect-body `setState`, no
 * cascade: after the dispatch, `key`/`retryN` match and the branch is not taken
 * again.
 */
interface ProgressView {
  /** `${familyId}_${childId}` — the child this whole value belongs to. */
  key: string
  /** The Retry ticket this data was subscribed under, for this child. */
  retryN: number
  /**
   * Monotonically increasing visit counter. Never reset, never reused — a
   * second visit to the same child under the same ticket gets a higher one.
   */
  serial: number
  /**
   * `${key}#${retryN}@${serial}` — the one identity every snapshot, write and
   * celebration is stamped with. Unique per visit, so no two visits can ever
   * accept each other's callbacks.
   */
  visitId: string
  reading: ReadingState
  progress: ProgressState
  /**
   * Which progress OBSERVATION is on screen, counted within this visit.
   *
   * Bumped by every applied progress state — a snapshot, an adopted
   * transaction read, an error. It is what a delayed transaction answer is
   * checked against, and it exists because the answer's own content cannot
   * decide the question: two successive `missing` snapshots carry *equal
   * values* and are *different observations*, and a `ready → missing`
   * transition is newer information that an older conflict answer must not be
   * allowed to talk over. Comparing documents would accept both; comparing the
   * observation accepts neither.
   */
  progressRevision: number
  /** Last successfully-read pair for `key`. Survives failures and a Retry. */
  lastKnown: { doc: StonebridgeProgress; readingActions: number } | null
  /**
   * Children whose village this mount has SEEN exist — from a snapshot that
   * carried a document, from an adopted transaction read, or from a transaction
   * that created one or found one already there.
   *
   * Never cleared, and deliberately not reset by a Retry or by a switch away
   * and back: it is a fact about the document, not about this visit. For the
   * same reason it is recorded **whatever visit is on screen when the answer
   * arrives** — a create that acknowledges while the brother is being looked at
   * still proves whose village exists, and losing that fact is what let a
   * return visit treat `missing` as a first visit and write a fresh baseline.
   * Recording the fact is not adopting the data: the document itself is only
   * taken by the visit that asked for it.
   */
  knownExistingKeys: ReadonlySet<string>
  /**
   * Children whose document a transaction found ABSENT where this mount had
   * seen it exist — the half of the refusal that a subscription cannot show,
   * because the listener may still be reporting the village it last read.
   *
   * The other half is derived rather than stored: `missing` for a child in
   * {@link knownExistingKeys} is the same refusal, and deriving it (see
   * {@link isVanished}) makes it independent of the ORDER the two facts arrive
   * in — a create acknowledging *after* a newer `missing` snapshot would
   * otherwise leave a refusal nobody had recorded.
   *
   * Either way nothing is written for such a child (a create here would
   * baseline over a history we have watched), the surface says so and offers
   * the one Retry door, and the only thing that clears it is an authoritative
   * existing document — which a Retry can fetch. A delayed answer never clears
   * it: a refusal is newer information than the attempt that was refused.
   *
   * ── The limit this cannot cross ────────────────────────────────────────────
   *
   * A completely FRESH mount cannot tell a document that was deleted from one
   * that was never created: both are a successful `missing`, and nothing stored
   * says which. Telling them apart needs a tombstone, which is a schema change
   * and is deliberately NOT made here. So the guarantee is bounded to this
   * mount — once it has seen a village, it will not create one over the hole
   * where that village was.
   */
  absentWhenExpected: ReadonlySet<string>
  /** Completions already surfaced for `key`, so a reload does not replay them. */
  celebrated: ReadonlySet<string>
  /** The key `celebrated` was seeded for (seeding happens once per child). */
  seededKey: string | null
  /** Mission whose banner-raise is on screen for `key`. */
  celebration: string | null
}

type ViewAction =
  /** The observed child/family/Retry ticket changed: open a brand-new visit. */
  | { type: 'visit'; key: string; retryN: number }
  | { type: 'reading'; visitId: string; reading: ReadingState }
  | { type: 'progress'; visitId: string; progress: ProgressState }
  /**
   * A transaction refused to write and handed back the authoritative document.
   * `observedRevision` is the progress observation the refused attempt was
   * computed from: the answer may only speak for the screen while THAT
   * observation is still the one on screen.
   */
  | {
      type: 'adopt'
      visitId: string
      key: string
      observedRevision: number
      doc: StonebridgeProgress
    }
  /** A transaction found no document where this mount had seen one. */
  | { type: 'absent'; visitId: string; key: string; observedRevision: number }
  /**
   * A transaction proved this child's document exists — it created it, found it
   * already there, or read it while refusing a compare-and-set.
   *
   * Keyed by CHILD and accepted whatever visit is on screen, because it is a
   * fact about the document and not a statement about the screen. It carries no
   * data and can neither celebrate nor change what is displayed.
   */
  | { type: 'exists'; key: string }
  | { type: 'celebrate'; visitId: string; key: string; completed: readonly string[] }
  | { type: 'dismiss' }

function emptyView(key: string, retryN: number, serial: number): ProgressView {
  return {
    key,
    retryN,
    serial,
    visitId: `${key}#${retryN}@${serial}`,
    reading: { phase: 'loading' },
    progress: { phase: 'loading' },
    progressRevision: 0,
    lastKnown: null,
    knownExistingKeys: new Set<string>(),
    absentWhenExpected: new Set<string>(),
    celebrated: new Set<string>(),
    seededKey: null,
    celebration: null,
  }
}

/** A complete, successful pair IS the new last-known. One transition, no copy. */
function withLastKnown(next: ProgressView): ProgressView {
  if (next.reading.phase !== 'ready' || next.progress.phase !== 'ready') return next
  return {
    ...next,
    lastKnown: { doc: next.progress.doc, readingActions: next.reading.count },
  }
}

/**
 * Apply a progress read: a new OBSERVATION, plus what a successful one means.
 *
 * Shared by the subscription and by an adopted transaction read, so there is
 * ONE place that decides it: the revision bump that gives the observation an
 * identity, the celebration seed (once per child, never from an error), and
 * *this child's village exists* — which is also the only thing that clears the
 * refusal below. Decided here rather than in the effect because a reducer is
 * pure and the effect body may not set state.
 */
function withProgress(state: ProgressView, progress: ProgressState): ProgressView {
  let celebrated = state.celebrated
  let seededKey = state.seededKey
  const successful = progress.phase === 'ready' || progress.phase === 'missing'
  // Seed the already-completed set once per child, and ONLY from a successful
  // snapshot: an error must never be read as "nothing completed yet", and a
  // stale child's list must never land here at all.
  if (successful && seededKey !== state.key) {
    celebrated = new Set(progress.phase === 'ready' ? progress.doc.completedMissions : [])
    seededKey = state.key
  }
  let knownExistingKeys = state.knownExistingKeys
  let absentWhenExpected = state.absentWhenExpected
  if (progress.phase === 'ready') {
    knownExistingKeys = withKey(knownExistingKeys, state.key)
    // An authoritative existing document — the one way out of the refusal.
    absentWhenExpected = withoutKey(absentWhenExpected, state.key)
  }
  return withLastKnown({
    ...state,
    progress,
    // Every applied read is a new observation, including one that carries the
    // same value as the last: an older transaction answer stops owning the
    // screen the moment anything newer lands on it.
    progressRevision: state.progressRevision + 1,
    celebrated,
    seededKey,
    knownExistingKeys,
    absentWhenExpected,
  })
}

/**
 * May a delayed transaction answer still speak for what is on screen?
 *
 * Only while it is answering about the observation it was computed from, in the
 * visit and for the child that issued it. Nothing about the answer's CONTENT
 * can decide this, which is the defect Sol's review found: comparing documents
 * accepted a conflict answer over a newer `ready → missing` transition, and
 * accepted an older create answer over a newer `missing` snapshot, because two
 * `missing` observations carry equal values. The observation is what moved, so
 * the observation is what is checked.
 */
function ownsObservation(
  state: ProgressView,
  action: { visitId: string; key: string; observedRevision: number },
): boolean {
  return (
    state.visitId === action.visitId &&
    state.key === action.key &&
    state.progressRevision === action.observedRevision
  )
}

/**
 * Is this child's village gone where this mount had seen it?
 *
 * Derived from the two facts rather than stored, so it cannot depend on the
 * order they arrive in: a transaction that found the document absent, OR a
 * successful `missing` read for a child whose village this mount has watched
 * exist. Both mean the same thing — **this is not a first visit** — and both
 * refuse every write for that child until an authoritative existing document
 * comes back.
 */
function isVanished(state: ProgressView): boolean {
  if (state.absentWhenExpected.has(state.key)) return true
  return state.progress.phase === 'missing' && state.knownExistingKeys.has(state.key)
}

function viewReducer(state: ProgressView, action: ViewAction): ProgressView {
  switch (action.type) {
    case 'visit': {
      if (state.key === action.key && state.retryN === action.retryN) return state
      // A Retry (or leave-and-return) on the SAME child keeps everything earned
      // and everything already surfaced; a different child keeps none of it.
      // Either way the serial advances, so the visit being opened here cannot
      // be mistaken for the one it replaces by anything already in flight.
      const sameChild = state.key === action.key
      return {
        ...emptyView(action.key, action.retryN, state.serial + 1),
        lastKnown: sameChild ? state.lastKnown : null,
        // Both of these are per CHILD and carried across every switch, for the
        // same reason the write lane and the signatures are: they are what this
        // mount knows about documents, and a child whose village has vanished
        // must still be refused a fresh baseline when he is chosen again.
        knownExistingKeys: state.knownExistingKeys,
        absentWhenExpected: state.absentWhenExpected,
        celebrated: sameChild ? state.celebrated : new Set<string>(),
        seededKey: sameChild ? state.seededKey : null,
        celebration: sameChild ? state.celebration : null,
      }
    }
    case 'reading': {
      // Inert for a replaced visit — including leave-and-return and a Retry,
      // whose callbacks are additionally refused at the callback itself.
      if (state.visitId !== action.visitId) return state
      return withLastKnown({ ...state, reading: action.reading })
    }
    case 'progress': {
      if (state.visitId !== action.visitId) return state
      return withProgress(state, action.progress)
    }
    case 'adopt': {
      // The authoritative document a refused write read. It lands only on the
      // visit, the child and the OBSERVATION that issued the attempt — so a
      // delayed conflict result can neither overwrite newer listener state (a
      // village that has since gone missing, a document that has since moved)
      // nor reach a visit that did not ask for it.
      if (!ownsObservation(state, action)) return state
      // Nothing celebrates here. A no-op is not a completion, and the document
      // being adopted may well carry completions somebody else earned.
      return withProgress(state, { phase: 'ready', doc: action.doc })
    }
    case 'absent': {
      // The document is not there, where this mount had seen it. Recorded as
      // the refusal state — never as a first visit — and only while it is still
      // answering about the observation that is on screen.
      if (!ownsObservation(state, action)) return state
      return {
        ...state,
        knownExistingKeys: withKey(state.knownExistingKeys, state.key),
        absentWhenExpected: withKey(state.absentWhenExpected, state.key),
      }
    }
    case 'exists': {
      // A fact about a CHILD's document, from a transaction that read or wrote
      // it. Not gated on the visit, because the answer may well arrive while
      // the brother is on screen and the fact is still true; and carrying no
      // data, so accepting it here cannot show one child's village under
      // another's name, cannot revive an older view and cannot celebrate.
      //
      // It deliberately does NOT clear a refusal: an answer that has been
      // overtaken is older information than the refusal it would clear.
      if (state.knownExistingKeys.has(action.key)) return state
      return { ...state, knownExistingKeys: withKey(state.knownExistingKeys, action.key) }
    }
    case 'celebrate': {
      // A COMMITTED write may raise a banner — and only on the VISIT and the
      // child it was issued for, and only for a completion not already shown.
      // A refused create-if-absent or compare-and-set never gets this far: the
      // issuer dispatches this for an actual commit and for nothing else.
      // The serial inside `visitId` is what makes "the visit it was issued for"
      // mean the actual visit rather than any later visit that happens to have
      // the same child and the same Retry count: an old pending write keeps its
      // target (it still lands on that child's doc) but can no longer surface a
      // celebration over a visit that did not earn it.
      if (state.visitId !== action.visitId || state.key !== action.key) return state
      const fresh = action.completed.find((id) => !state.celebrated.has(id))
      if (!fresh) return state
      return {
        ...state,
        celebrated: new Set(state.celebrated).add(fresh),
        celebration: fresh,
      }
    }
    case 'dismiss':
      return state.celebration === null ? state : { ...state, celebration: null }
  }
}

/** A write transaction that has been issued and not yet settled. */
interface PendingWrite {
  key: string
  /** The visit that issued it — used ONLY to decide whether it may celebrate. */
  visitId: string
  signature: string
  /**
   * Completions this write would record — celebrated only if the transaction
   * actually COMMITTED them. A refused compare-and-set carries the same list
   * and celebrates none of it.
   */
  newlyCompleted: string[]
}

/**
 * One issued attempt: the transaction to run, and what it would record.
 *
 * `source` is the document the proposal was computed from — the other half of
 * the compare-and-set, and the thing a delayed answer is checked against before
 * it may speak for the screen. `null` for a create, which expected no document.
 */
type WriteAttempt =
  | { kind: 'create'; payload: StonebridgeProgress }
  | {
      kind: 'advance'
      source: StonebridgeProgress
      payload: StonebridgeProgress
      newlyCompleted: string[]
    }

/**
 * The create write's dedup signature.
 *
 * Deliberately content-free: there is exactly **one** initialisation per child
 * per mount, however many visits happen. A second create is the stale
 * reset — a Retry (or leave-and-return) racing a create that already landed
 * sees `missing` again before the listener catches up, and would baseline the
 * child back to zero banners. The signature set is keyed by child and is
 * **never cleared by a child switch** for exactly that reason; only a rejected
 * write releases its own signature, and even then nothing is re-attempted
 * until the child taps Try again.
 *
 * It is this mount's half of the guard, and it is not the load-bearing one:
 * another client's create is invisible to it, which is why the write itself is
 * create-if-absent inside a transaction.
 */
const CREATE_SIGNATURE = 'create'

/**
 * A reconcile attempt's dedup signature: the SOURCE document plus the proposal
 * derived from it. Same signature ⇒ same attempt ⇒ already issued.
 *
 * ── Why the source is part of it ─────────────────────────────────────────────
 *
 * The proposal alone used to be the whole signature, which was right while a
 * write was an unconditional `setDoc` that always landed. A compare-and-set may
 * refuse, and a refused write is a write that did not happen — so the same
 * proposal against a DIFFERENT authoritative document is legitimate later work,
 * and a proposal-only signature would suppress it permanently. Including the
 * source is also what stops the opposite failure: re-deriving the same proposal
 * from the same unchanged document is the same attempt and is not re-issued, so
 * a conflict cannot spin.
 *
 * The source is taken whole, `updatedAt` included — it is an observed fact, and
 * a document that differs only in its stamp is a different document to compare
 * against. The PROPOSAL's `updatedAt` is left out, because it changes on every
 * reconcile and would defeat the dedup it exists to provide.
 *
 * Both halves are named by the SAME canonical identity the compare-and-set
 * uses, so "the document I already attempted against" and "the document still
 * stored" can never be two different questions. That identity is type-aware
 * rather than a generic serialisation: a real `DocumentReference` in a field
 * this hook does not know about carries its own `Firestore` instance, and
 * walking it would throw instead of answering.
 */
function advanceSignature(source: StonebridgeProgress, next: StonebridgeProgress): string {
  return [
    'advance',
    canonicalToken(source),
    next.currentMissionId,
    next.completedMissions.join(','),
    next.raisedBanners.join(','),
    canonicalToken(next.missionBaselines),
    canonicalToken(next.activeProgress ?? null),
  ].join('|')
}

function withKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (keys.has(key)) return keys
  const next = new Set(keys)
  next.add(key)
  return next
}

function withoutKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (!keys.has(key)) return keys
  const next = new Set(keys)
  next.delete(key)
  return next
}

/**
 * Live Banner Rally progress for a child.
 *
 * Reads reading activity **read-only** from xpLedger per-event docs and persists
 * derived mission counters to `stonebridgeProgress/{childId}`. This hook NEVER
 * writes to xpLedger / avatarProfile / forge state — mission progress only.
 *
 * ── Write authority (the G1/G7 repair) ───────────────────────────────────────
 *
 * A write is authorised **only** by successful data from *both* subscriptions,
 * for the current visit. A failed read authorises nothing: it keeps the
 * last-known village on screen, says so, and offers Retry.
 *
 * ── And the datastore decides, not this mount ────────────────────────────────
 *
 * Successful current data authorises an ATTEMPT; whether it is written is
 * decided inside one transaction against the stored document — create only
 * while absent, advance only while the stored document still equals the one the
 * proposal was computed from (`stonebridgeProgressWrite.ts`). Everything below
 * this line is per MOUNT, and the race that lost a repaired bridge was between
 * two clients: an earlier one holding an unconditional `setDoc` over a village
 * a newer one had already created and advanced. No lane, signature or visit id
 * can see another client, so none of them can protect the document.
 *
 * A refused transaction wrote nothing, so it celebrates nothing. It adopts the
 * authoritative document — only onto the visit that issued it, and only while
 * the screen still holds exactly what the attempt was computed from — and
 * reconciles again from there, which either completes legitimate later work or
 * finds there is nothing to do.
 *
 * ── One lane PER CHILD, and a rejection that waits for a tap ─────────────────
 *
 * The in-flight write map is keyed by `${familyId}_${childId}`: a brother whose
 * initialisation write never settles (offline — Firestore holds the promise)
 * must not block the other brother's first visit. A write releases only the lane
 * it still owns. **A rejected write is remembered per child, not per visit**,
 * and nothing is written for that child again until the child taps Try again —
 * so a failure that lands while the brother is on screen is still waiting,
 * visible and recoverable, when the child comes back, rather than quietly
 * re-issuing itself. An already-issued write is never claimed to be cancelled;
 * it simply keeps its own target.
 *
 * ── Per child vs per visit ───────────────────────────────────────────────────
 *
 * Those three — the lane, the issued signatures and the rejection memory — are
 * keyed by `${familyId}_${childId}` and survive every switch, because they are
 * facts about the child's document. The **display** side — what is on screen,
 * and which banner-raise may play — is keyed by the unique visit id instead, so
 * a write that outlives its visit still lands on the right document and still
 * dedups itself, while celebrating nothing in a visit that did not earn it.
 */
export function useStonebridgeProgress(familyId: string, childId: string): StonebridgeProgressData {
  const scopeKey = familyId && childId ? `${familyId}_${childId}` : ''

  // A Retry tap, stamped with the child it was tapped for, so a tap for one
  // brother is not a re-read of the other's.
  const [retryRequest, setRetryRequest] = useState<{ key: string; n: number } | null>(null)
  /** Children whose last write was rejected and not yet re-armed by a tap. */
  const [saveFailures, setSaveFailures] = useState<ReadonlySet<string>>(() => new Set())
  /** Bumped when a write is acknowledged, so the live visit reconsiders once. */
  const [writeSettled, setWriteSettled] = useState(0)

  const retryN = retryRequest && retryRequest.key === scopeKey ? retryRequest.n : 0

  const [view, dispatch] = useReducer(viewReducer, { key: scopeKey, retryN }, (seed) =>
    emptyView(seed.key, seed.retryN, 0),
  )

  /**
   * The visit's data is dropped the moment the child, the family or the Retry
   * ticket changes, **DURING RENDER** — so no frame exists in which this hook
   * presents one visit's village as another's, and no effect-body `setState` is
   * needed to clear it. `useSkillMap`'s `UX-344` fix is the precedent and the
   * reason: doing this in an effect leaves exactly that frame open, and this
   * repo's lint forbids the set-state-in-effect form.
   *
   * The comparison is against the *observed* identity (`key` + `retryN`), which
   * is what props and the Retry ticket give us. The new visit's serial — the
   * half that makes the id unique — is minted by the reducer from the previous
   * state, the only place that can do it without a ref.
   *
   * It is conditional and it converges: after the dispatch, `view.key` and
   * `view.retryN` are the observed pair and this branch is not taken again.
   */
  if (view.key !== scopeKey || view.retryN !== retryN) {
    dispatch({ type: 'visit', key: scopeKey, retryN })
  }
  /** This pass's data, which is nothing at all on the pass that resets. */
  const current = view.key === scopeKey && view.retryN === retryN ? view : null
  /** The identity every callback of this visit stamps itself with. */
  const visitId = current ? current.visitId : null

  /** The in-flight write per child, released only by the write that owns it. */
  const pendingByKeyRef = useRef<Map<string, PendingWrite>>(new Map())
  /** Write signatures already issued, per child. NOT reset by a child switch. */
  const issuedByKeyRef = useRef<Map<string, Set<string>>>(new Map())

  // ── Subscribe: reading activity (read-only) + persisted progress ──
  //
  // ONE effect for both, because write authority is a statement about the two
  // of them together: they must be the same visit's, and both must have
  // succeeded. The effect body opens listeners and returns cleanup — it sets no
  // state of its own; every update below arrives through a callback.
  //
  // It is keyed on `visitId`, which changes exactly when the child, the family
  // or the Retry ticket does — so the re-subscribe cadence is unchanged — and
  // every callback below stamps the id of the visit that *opened* it rather
  // than rebuilding a string that a later visit could also produce.
  useEffect(() => {
    if (!familyId || !childId || !visitId) return
    const subscribedVisit = visitId
    let cancelled = false

    const q = query(xpLedgerCollection(familyId), where('childId', '==', childId))
    const unsubReading = onSnapshot(
      q,
      (snapshot) => {
        if (cancelled) return
        const events: ReadingActivityEvent[] = snapshot.docs.map((d) => {
          const data = d.data() as { type?: string; currencyType?: string }
          return { type: data.type, currencyType: data.currencyType }
        })
        // An empty query IS zero. Only this success path may say so.
        dispatch({
          type: 'reading',
          visitId: subscribedVisit,
          reading: { phase: 'ready', count: countReadingActions(events) },
        })
      },
      (err) => {
        if (cancelled) return
        console.warn('useStonebridgeProgress: reading-activity snapshot error', err)
        dispatch({ type: 'reading', visitId: subscribedVisit, reading: { phase: 'error' } })
      },
    )

    const ref = doc(stonebridgeProgressCollection(familyId), childId)
    const unsubProgress = onSnapshot(
      ref,
      (snapshot) => {
        if (cancelled) return
        const data = snapshot.exists() ? (snapshot.data() as StonebridgeProgress) : null
        dispatch({
          type: 'progress',
          visitId: subscribedVisit,
          progress: data ? { phase: 'ready', doc: data } : { phase: 'missing' },
        })
      },
      (err) => {
        if (cancelled) return
        console.warn('useStonebridgeProgress: progress snapshot error', err)
        dispatch({ type: 'progress', visitId: subscribedVisit, progress: { phase: 'error' } })
      },
    )

    return () => {
      // Belt to the reducer's visit guard, and the only thing that covers
      // unmount, where no new visit is ever opened: a callback from a
      // cleaned-up listener does nothing at all, not even a dispatch.
      cancelled = true
      unsubReading()
      unsubProgress()
    }
  }, [familyId, childId, visitId])

  /** The only pair that may be written from, and the only pair that is "fresh". */
  const liveReady = useMemo(
    () =>
      current && current.reading.phase === 'ready' && current.progress.phase === 'ready'
        ? { doc: current.progress.doc, readingActions: current.reading.count }
        : null,
    [current],
  )

  // ── Reconcile + persist (mission-progress doc only) ──────────────
  useEffect(() => {
    if (!scopeKey || !current) return
    // A failed or unsettled read authorises NOTHING — not a create, not an
    // advance, not a baseline.
    if (current.reading.phase !== 'ready') return
    if (current.progress.phase === 'loading' || current.progress.phase === 'error') return
    // A child whose last write was rejected writes nothing until he taps. This
    // is per CHILD, not per visit: the rejection may well have landed while his
    // brother was on screen, and it is still his unsaved progress.
    if (saveFailures.has(scopeKey)) return
    // This CHILD's lane, not a global one: a brother's pending write is none of
    // this visit's business and cannot hold it up.
    if (pendingByKeyRef.current.has(scopeKey)) return
    // His village was there and now it is not. **Missing where a document is
    // expected is not permission to create one**: a baseline written here would
    // be a silent reset of a history this mount has watched, dressed up as a
    // first visit. Nothing is written for him until an authoritative existing
    // document comes back — a Retry re-reads, and the screen says so and keeps
    // the door open in the meantime.
    if (isVanished(current)) return

    const readingActions = current.reading.count
    const now = new Date().toISOString()
    // The target child and family are bound at issue time, so a write always
    // lands on the child it was computed for even if the selection moves before
    // it settles.
    const targetFamilyId = familyId
    const targetChildId = childId
    const lane = pendingByKeyRef.current
    let issued = issuedByKeyRef.current.get(scopeKey)
    if (!issued) {
      issued = new Set<string>()
      issuedByKeyRef.current.set(scopeKey, issued)
    }
    const signatures = issued

    const issue = (signature: string, attempt: WriteAttempt) => {
      // Already issued for this CHILD — in this visit or an earlier one. This is
      // what stops a Retry, or leave-and-return, from re-creating a village
      // whose create is still in flight or has already landed. The dedup, the
      // lane and the rejection memory are all per KEY on purpose: they are
      // statements about the child's document. Only the celebration below is
      // per visit.
      if (signatures.has(signature)) return
      signatures.add(signature)
      /**
       * The observation this attempt is computed from — the one thing that
       * decides whether its answer may still speak for the screen later.
       */
      const observedRevision = current.progressRevision
      const entry: PendingWrite = {
        key: scopeKey,
        visitId: current.visitId,
        signature,
        newlyCompleted: attempt.kind === 'advance' ? attempt.newlyCompleted : [],
      }
      lane.set(entry.key, entry)
      /** Identity, not a key match: a superseded write releases nothing. */
      const releaseOwnLane = () => {
        if (lane.get(entry.key) !== entry) return false
        lane.delete(entry.key)
        return true
      }
      const transaction =
        attempt.kind === 'create'
          ? createStonebridgeProgressIfAbsent({
              familyId: targetFamilyId,
              childId: targetChildId,
              initial: attempt.payload,
            })
          : advanceStonebridgeProgressIfUnchanged({
              familyId: targetFamilyId,
              childId: targetChildId,
              source: attempt.source,
              next: attempt.payload,
            })
      void transaction
        .then((result) => {
          const owned = releaseOwnLane()
          // Whatever else it did, the transaction has told us something about
          // whose village EXISTS — it created one, found one already there, or
          // read one while refusing. That is a fact about the child's document,
          // so it is kept even when this answer arrives in another visit, and
          // it is what stops a later return from reading `missing` as a first
          // visit and baselining over a village that is really there.
          if (
            result.outcome === 'created' ||
            result.outcome === 'exists' ||
            result.outcome === 'conflict'
          ) {
            dispatch({ type: 'exists', key: entry.key })
          }
          // ONE committed completion may celebrate, and only that. The reducer
          // refuses it unless the VISIT and the child are still the ones that
          // issued it, so a late acknowledgement cannot raise a banner over
          // another visit — not a brother's, and not a later visit to the same
          // child, which is the case a scope-plus-retry stamp could not tell
          // apart. A no-op has nothing to celebrate and says nothing here.
          if (result.outcome === 'advanced') {
            dispatch({
              type: 'celebrate',
              visitId: entry.visitId,
              key: entry.key,
              completed: entry.newlyCompleted,
            })
          }
          // A refused write hands back what is actually stored. Adopting it is
          // how this visit stops arguing with the document: the next reconcile
          // runs against the authoritative village, so legitimate later work
          // still lands and work somebody else already did is left alone. The
          // reducer drops it unless this is still the observation it answers
          // about — anything newer on screen owns the screen.
          if (result.outcome === 'exists' || result.outcome === 'conflict') {
            dispatch({
              type: 'adopt',
              visitId: entry.visitId,
              key: entry.key,
              observedRevision,
              doc: result.doc,
            })
          }
          // Expected-existing and not there. Recorded, never recreated.
          if (result.outcome === 'absent') {
            dispatch({
              type: 'absent',
              visitId: entry.visitId,
              key: entry.key,
              observedRevision,
            })
          }
          // The lane this child was waiting behind is free, so the visit that
          // is live NOW reconsiders exactly once — whatever this attempt did.
          // A no-op that only released a lane used to end the turn silently,
          // which left a returned-to visit's genuine pending work unwritten
          // until something else happened to move state. It cannot loop: the
          // reconcile recomputes from the current observation, and the same
          // source and proposal is the same signature, already issued.
          //
          // A REJECTION is still the exception, and still waits for a tap
          // rather than a tick — it does not come through here.
          if (owned) setWriteSettled((n) => n + 1)
        })
        .catch((err) => {
          console.warn('useStonebridgeProgress: persist failed', err)
          releaseOwnLane()
          // Released so a tap can attempt it again — and ONLY a tap: the
          // failure below refuses every automatic re-issue for this child.
          signatures.delete(signature)
          // Recorded against the CHILD, so returning to him shows the failure
          // instead of silently writing again. His brother is unaffected.
          setSaveFailures((prev) => withKey(prev, entry.key))
        })
    }

    // No doc yet → create it with a baseline at the current count so existing
    // lifetime reading doesn't auto-complete the opening mission. Reachable ONLY
    // from a successful snapshot that says the doc does not exist, for a child
    // whose village this mount has never seen — and written only while the
    // document is still absent at the instant of the write.
    if (current.progress.phase === 'missing') {
      issue(CREATE_SIGNATURE, {
        kind: 'create',
        payload: initialStonebridgeProgress(childId, readingActions, now),
      })
      return
    }

    // The source document, kept for the compare-and-set: the proposal below is
    // correct for THIS document and for no other.
    const source = current.progress.doc
    const { state, changed, newlyCompleted } = advanceMissions(source, readingActions, now)
    if (!changed) return
    issue(advanceSignature(source, state), {
      kind: 'advance',
      source,
      payload: state,
      newlyCompleted,
    })
  }, [scopeKey, current, saveFailures, writeSettled, familyId, childId])

  const clearJustCompleted = useCallback(() => dispatch({ type: 'dismiss' }), [])
  const retry = useCallback(() => {
    if (!scopeKey) return
    // Clears the error, not the village: nothing earned, surfaced or already
    // acknowledged is reset here. It re-reads, and it re-arms ONE attempt.
    setSaveFailures((prev) => withoutKey(prev, scopeKey))
    setRetryRequest((prev) => ({ key: scopeKey, n: (prev?.n ?? 0) + 1 }))
  }, [scopeKey])

  return useMemo<StonebridgeProgressData>(() => {
    if (!scopeKey || !current) return EMPTY

    const saveFailed = saveFailures.has(scopeKey)
    /**
     * The village this mount has watched exist is not there now.
     *
     * Nothing is being written for him — that refusal is the point — and this
     * is the half that has to be SEEN. It is reported as a read that did not
     * produce his village, which is what it is: the surfaces' sentence for that
     * is *"Couldn't load your village."* with the one *Try again* beside it,
     * and `StonebridgeRecoveryNotice` already renders exactly that from
     * `readError`. Saying nothing instead left a returned-to child looking at
     * *"Loading your mission…"* with no door, which is the defect Sol's review
     * reproduced — and it is reachable with no last-known data at all, because
     * a switch away and back drops the pair but keeps the refusal.
     *
     * It is not `saveError`: nothing was rejected, and nothing was attempted.
     * An authoritative existing document is what clears it.
     */
    const vanished = isVanished(current)
    const readError =
      current.reading.phase === 'error' || current.progress.phase === 'error' || vanished
    const justCompletedMissionId = current.celebration
    const shown = liveReady ?? current.lastKnown
    // A tap for THIS child whose re-subscribe has not produced a complete read
    // or an error yet. Never "fresh", never "saved".
    const retrying = retryN > 0 && !liveReady && !readError

    if (!shown) {
      // Nothing of his is on screen to be labelled stale — but `readError`
      // above already carries the refusal, so this path is the *"Couldn't load
      // your village."* card with its *Try again*, not the quiet placeholder.
      // That is the A → brother → back-to-A → missing case: the last-known pair
      // went with the switch and the refusal did not.
      return {
        ...EMPTY,
        justCompletedMissionId,
        clearJustCompleted,
        loading: !readError && !saveFailed && !retrying,
        readError,
        saveError: saveFailed,
        retrying,
        retry,
      }
    }

    const { active } = advanceMissions(shown.doc, shown.readingActions, shown.doc.updatedAt)
    return {
      mission: active ? getMission(active.missionId) ?? null : null,
      active,
      completedMissions: shown.doc.completedMissions,
      raisedBanners: shown.doc.raisedBanners,
      totalReadingActions: shown.readingActions,
      justCompletedMissionId,
      clearJustCompleted,
      loading: false,
      stale: !liveReady || vanished,
      readError,
      saveError: saveFailed,
      retrying,
      retry,
    }
  }, [scopeKey, current, liveReady, saveFailures, retryN, clearJustCompleted, retry])
}
