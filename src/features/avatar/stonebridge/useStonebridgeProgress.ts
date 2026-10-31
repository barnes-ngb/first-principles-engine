import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { doc, onSnapshot, query, setDoc, where } from 'firebase/firestore'

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
   * Only ever set once the write that records the completion is **acknowledged**.
   */
  justCompletedMissionId: string | null
  clearJustCompleted: () => void
  /** Nothing to show yet, and nothing has failed — the quiet placeholder. */
  loading: boolean
  /**
   * What is on screen is the **last known** progress for this child, not a
   * current read: the live read failed, or has not settled again after a Retry.
   * Earned banners stay visible; every surface showing them must say the
   * numbers are not fresh.
   */
  stale: boolean
  /** A subscription for the child on screen came back as an error. */
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
 * `missing` is **only** a successful snapshot whose doc does not exist — the one
 * fact that authorises the initialisation write. The old code set `doc: null`
 * from the error callback too, so a listener error was read as "no progress
 * yet" and reconciliation wrote a fresh doc over a real, completed village.
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
 * is now gated by one `epoch` comparison inside a pure reducer, so a stale
 * callback cannot land half of itself before being rejected, which is exactly
 * what went wrong when the seed sat outside the guard.
 */
interface ProgressView {
  /**
   * `${familyId}_${childId}#${retryN}` — the subscription generation this data
   * belongs to. Derived from props and state only, never from a ref, because
   * the render compares it (a ref holds the value at commit time, which is not
   * what the render is describing — and `react-hooks/refs` forbids reading one
   * here).
   */
  epoch: string
  /** `${familyId}_${childId}` — the child this whole value belongs to. */
  key: string
  reading: ReadingState
  progress: ProgressState
  /** Last successfully-read pair for `key`. Survives failures and a Retry. */
  lastKnown: { doc: StonebridgeProgress; readingActions: number } | null
  /** Completions already surfaced for `key`, so a reload does not replay them. */
  celebrated: ReadonlySet<string>
  /** The key `celebrated` was seeded for (seeding happens once per child). */
  seededKey: string | null
  /** Mission whose banner-raise is on screen for `key`. */
  celebration: string | null
}

type ViewAction =
  | { type: 'scope'; epoch: string; key: string }
  | { type: 'reading'; epoch: string; reading: ReadingState }
  | { type: 'progress'; epoch: string; progress: ProgressState }
  | { type: 'celebrate'; epoch: string; key: string; completed: readonly string[] }
  | { type: 'dismiss' }

function emptyView(key: string, epoch: string): ProgressView {
  return {
    epoch,
    key,
    reading: { phase: 'loading' },
    progress: { phase: 'loading' },
    lastKnown: null,
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

function viewReducer(state: ProgressView, action: ViewAction): ProgressView {
  switch (action.type) {
    case 'scope': {
      if (state.epoch === action.epoch) return state
      // A Retry (or leave-and-return) on the SAME child keeps everything earned
      // and everything already surfaced; a different child keeps none of it.
      const sameChild = state.key === action.key
      return {
        ...emptyView(action.key, action.epoch),
        lastKnown: sameChild ? state.lastKnown : null,
        celebrated: sameChild ? state.celebrated : new Set<string>(),
        seededKey: sameChild ? state.seededKey : null,
        celebration: sameChild ? state.celebration : null,
      }
    }
    case 'reading': {
      // Inert for a replaced generation — including leave-and-return and a
      // Retry, whose callbacks are additionally refused at the callback itself.
      if (state.epoch !== action.epoch) return state
      return withLastKnown({ ...state, reading: action.reading })
    }
    case 'progress': {
      if (state.epoch !== action.epoch) return state
      let celebrated = state.celebrated
      let seededKey = state.seededKey
      const successful = action.progress.phase === 'ready' || action.progress.phase === 'missing'
      // Seed the already-completed set once per child, and ONLY from a
      // successful snapshot: an error must never be read as "nothing completed
      // yet", and a stale child's list must never land here at all.
      if (successful && seededKey !== state.key) {
        celebrated = new Set(
          action.progress.phase === 'ready' ? action.progress.doc.completedMissions : [],
        )
        seededKey = state.key
      }
      return withLastKnown({ ...state, progress: action.progress, celebrated, seededKey })
    }
    case 'celebrate': {
      // An acknowledged write may raise a banner only on the generation and the
      // child it was issued for, and only for a completion not already shown.
      if (state.epoch !== action.epoch || state.key !== action.key) return state
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

/** A `setDoc` that has been issued and not yet settled. */
interface PendingWrite {
  key: string
  epoch: string
  signature: string
  /** Completions this write records — celebrated only if it is acknowledged. */
  newlyCompleted: string[]
}

/**
 * The create write's dedup signature.
 *
 * Deliberately content-free: there is exactly **one** initialisation per child
 * per mount, however many generations happen. A second create is the stale
 * reset — a Retry (or leave-and-return) racing a create that already landed
 * sees `missing` again before the listener catches up, and would baseline the
 * child back to zero banners. The signature set is keyed by child and is
 * **never cleared by a child switch** for exactly that reason; only a rejected
 * write releases its own signature, and even then nothing is re-attempted
 * until the child taps Try again.
 */
const CREATE_SIGNATURE = 'create'

/**
 * A reconcile write's dedup signature — every field it would persist **except**
 * `updatedAt`, which changes on every reconcile and would defeat the dedup it
 * exists to provide. Same signature ⇒ same write ⇒ already issued.
 */
function advanceSignature(state: StonebridgeProgress): string {
  return [
    'advance',
    state.currentMissionId,
    state.completedMissions.join(','),
    state.raisedBanners.join(','),
    JSON.stringify(state.missionBaselines),
    JSON.stringify(state.activeProgress ?? null),
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
 * for the current generation. A failed read authorises nothing: it keeps the
 * last-known village on screen, says so, and offers Retry.
 *
 * ── One lane PER CHILD, and a rejection that waits for a tap ─────────────────
 *
 * The in-flight write map is keyed by `${familyId}_${childId}`: a brother whose
 * initialisation `setDoc` never settles (offline — Firestore holds the promise)
 * must not block the other brother's first visit. A write releases only the lane
 * it still owns. **A rejected write is remembered per child, not per
 * generation**, and nothing is written for that child again until the child taps
 * Try again — so a failure that lands while the brother is on screen is still
 * waiting, visible and recoverable, when the child comes back, rather than
 * quietly re-issuing itself. An already-issued write is never claimed to be
 * cancelled; it simply keeps its own target.
 */
export function useStonebridgeProgress(familyId: string, childId: string): StonebridgeProgressData {
  const scopeKey = familyId && childId ? `${familyId}_${childId}` : ''

  // A Retry tap, stamped with the child it was tapped for, so a tap for one
  // brother is not a re-read of the other's.
  const [retryRequest, setRetryRequest] = useState<{ key: string; n: number } | null>(null)
  /** Children whose last write was rejected and not yet re-armed by a tap. */
  const [saveFailures, setSaveFailures] = useState<ReadonlySet<string>>(() => new Set())
  /** Bumped when a write is acknowledged, so the live generation reconsiders once. */
  const [writeSettled, setWriteSettled] = useState(0)

  const retryN = retryRequest && retryRequest.key === scopeKey ? retryRequest.n : 0
  const epoch = `${scopeKey}#${retryN}`

  const [view, dispatch] = useReducer(viewReducer, { key: scopeKey, epoch }, (seed) =>
    emptyView(seed.key, seed.epoch),
  )

  /**
   * The generation's data is dropped the moment the child, the family or the
   * Retry ticket changes, **DURING RENDER** — so no frame exists in which this
   * hook presents one generation's village as another's, and no effect-body
   * `setState` is needed to clear it. `useSkillMap`'s `UX-344` fix is the
   * precedent and the reason: doing this in an effect leaves exactly that frame
   * open, and this repo's lint forbids the set-state-in-effect form.
   *
   * It is conditional and it converges: after the dispatch, `view.epoch` is
   * `epoch` and this branch is not taken again.
   */
  if (view.epoch !== epoch) {
    dispatch({ type: 'scope', epoch, key: scopeKey })
  }
  /** This pass's data, which is nothing at all on the pass that resets. */
  const current = view.epoch === epoch && view.key === scopeKey ? view : null

  /** The in-flight `setDoc` per child, released only by the write that owns it. */
  const pendingByKeyRef = useRef<Map<string, PendingWrite>>(new Map())
  /** Write signatures already issued, per child. NOT reset by a child switch. */
  const issuedByKeyRef = useRef<Map<string, Set<string>>>(new Map())

  // ── Subscribe: reading activity (read-only) + persisted progress ──
  //
  // ONE effect for both, because write authority is a statement about the two
  // of them together: they must be the same generation's, and both must have
  // succeeded. The effect body opens listeners and returns cleanup — it sets no
  // state of its own; every update below arrives through a callback.
  useEffect(() => {
    if (!familyId || !childId) return
    const key = `${familyId}_${childId}`
    const subscribedEpoch = `${key}#${retryN}`
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
          epoch: subscribedEpoch,
          reading: { phase: 'ready', count: countReadingActions(events) },
        })
      },
      (err) => {
        if (cancelled) return
        console.warn('useStonebridgeProgress: reading-activity snapshot error', err)
        dispatch({ type: 'reading', epoch: subscribedEpoch, reading: { phase: 'error' } })
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
          epoch: subscribedEpoch,
          progress: data ? { phase: 'ready', doc: data } : { phase: 'missing' },
        })
      },
      (err) => {
        if (cancelled) return
        console.warn('useStonebridgeProgress: progress snapshot error', err)
        dispatch({ type: 'progress', epoch: subscribedEpoch, progress: { phase: 'error' } })
      },
    )

    return () => {
      // Belt to the reducer's epoch guard, and the only thing that covers
      // unmount and a same-epoch re-subscribe: a callback from a cleaned-up
      // listener does nothing at all, not even a dispatch.
      cancelled = true
      unsubReading()
      unsubProgress()
    }
  }, [familyId, childId, retryN])

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
    // is per CHILD, not per generation: the rejection may well have landed
    // while his brother was on screen, and it is still his unsaved progress.
    if (saveFailures.has(scopeKey)) return
    // This CHILD's lane, not a global one: a brother's pending write is none of
    // this generation's business and cannot hold it up.
    if (pendingByKeyRef.current.has(scopeKey)) return

    const readingActions = current.reading.count
    const now = new Date().toISOString()
    // The target is bound at issue time, so a write always lands on the child it
    // was computed for even if the selection moves before it settles.
    const targetRef = doc(stonebridgeProgressCollection(familyId), childId)
    const lane = pendingByKeyRef.current
    let issued = issuedByKeyRef.current.get(scopeKey)
    if (!issued) {
      issued = new Set<string>()
      issuedByKeyRef.current.set(scopeKey, issued)
    }
    const signatures = issued

    const issue = (signature: string, payload: StonebridgeProgress, newlyCompleted: string[]) => {
      // Already issued for this CHILD — in this generation or an earlier one.
      // This is what stops a Retry, or leave-and-return, from re-creating a
      // village whose create is still in flight or has already landed.
      if (signatures.has(signature)) return
      signatures.add(signature)
      const entry: PendingWrite = { key: scopeKey, epoch, signature, newlyCompleted }
      lane.set(entry.key, entry)
      /** Identity, not a key match: a superseded write releases nothing. */
      const releaseOwnLane = () => {
        if (lane.get(entry.key) !== entry) return false
        lane.delete(entry.key)
        return true
      }
      void setDoc(targetRef, payload)
        .then(() => {
          const owned = releaseOwnLane()
          // The reducer refuses this unless the generation and the child are
          // still the ones that issued it, so a late acknowledgement cannot
          // raise a banner over another visit.
          dispatch({
            type: 'celebrate',
            epoch: entry.epoch,
            key: entry.key,
            completed: entry.newlyCompleted,
          })
          // The lane is free; the live generation reconsiders once. Only on
          // success — a rejection must wait for the tap, not for a tick.
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
    // from a successful snapshot that says the doc does not exist.
    if (current.progress.phase === 'missing') {
      issue(CREATE_SIGNATURE, initialStonebridgeProgress(childId, readingActions, now), [])
      return
    }

    const { state, changed, newlyCompleted } = advanceMissions(
      current.progress.doc,
      readingActions,
      now,
    )
    if (!changed) return
    issue(advanceSignature(state), state, newlyCompleted)
  }, [scopeKey, epoch, current, saveFailures, writeSettled, familyId, childId])

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

    const readError =
      current.reading.phase === 'error' || current.progress.phase === 'error'
    const saveFailed = saveFailures.has(scopeKey)
    const justCompletedMissionId = current.celebration
    const shown = liveReady ?? current.lastKnown
    // A tap for THIS child whose re-subscribe has not produced a complete read
    // or an error yet. Never "fresh", never "saved".
    const retrying = retryN > 0 && !liveReady && !readError

    if (!shown) {
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
      stale: !liveReady,
      readError,
      saveError: saveFailed,
      retrying,
      retry,
    }
  }, [scopeKey, current, liveReady, saveFailures, retryN, clearJustCompleted, retry])
}
