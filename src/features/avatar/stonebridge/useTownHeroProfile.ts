/**
 * The town's OWN avatar-profile read — one subscriber, owned by this feature.
 *
 * ── Why the shared hook is not fed into a hero ───────────────────────────────
 *
 * `useAvatarProfile` is correct for what it does (a cosmetic theme) and unsafe
 * for a personal hero, in two ways that are structural rather than incidental:
 *
 *   • **it retains the last profile across a new scope.** Its `useEffect`
 *     re-subscribes on `[familyId, childId]`, but the state it already holds is
 *     only replaced when the NEW subscription's first snapshot arrives. For the
 *     renders in between, a caller asking about London is handed Lincoln's
 *     document. For a theme that is a slightly wrong colour; for a hero it is
 *     the other child's face standing in this child's village.
 *   • **it normalises "missing" and "error" to a default profile.**
 *     `normalizeAvatarProfile(null)` is a whole, valid-looking profile with
 *     default features, so a failed read is indistinguishable from a saved
 *     character. A hero built from it would be a stranger presented as the
 *     child — which is also why "a document that is missing, failed or
 *     unresolved" is NOT a saved personal hero here, and draws nothing.
 *
 * The shared hook is left exactly as it is, and every caller outside this town
 * keeps its behaviour. This is a second, narrower reader for one route.
 *
 * ── What proves the document is this child's ─────────────────────────────────
 *
 * The **path**: `families/{familyId}/avatarProfiles/{childId}`, built from the
 * family the page is authenticated for and the child the shell has already
 * resolved. A legacy document that never stored an embedded `childId` is
 * therefore valid and owned — the absence of a field is not a counter-claim. An
 * explicit embedded `childId` that names somebody ELSE is refused outright: the
 * two claims disagree and the safe reading is "not this child's hero".
 *
 * Neither the raw selected id nor the resolved one is treated as proof of
 * anything by itself (a kid profile's resolved child is derived from the
 * children list, and the raw store is a string that survives an unsettled or
 * failed read). They are what the read is BOUND to, and the binding below is
 * what refuses stale answers.
 *
 * ── The binding, and what cannot get through it ──────────────────────────────
 *
 * Every rendered value and every callback is stamped with one `readId` built
 * from the family, the resolved child, the caller's readiness, a monotonic count
 * of **raw active-child movements** and the Retry ticket. That means:
 *
 *   • a change of family, child or readiness re-binds **during render**, so no
 *     frame exists in which this hook reports the previous child's hero (the
 *     `useStonebridgeProgress` precedent — an effect would leave exactly that
 *     frame open, and this repo's lint forbids set-state-in-effect);
 *   • a raw same-tick `A → B → A` is seen as **two movements**, because the
 *     count comes from the shared store's own synchronous notifications rather
 *     than from comparing a rendered value — React batches that pair into one
 *     render whose `childId` never appears to change, which is precisely the
 *     case a render-level comparison cannot see;
 *   • a success, an error or an unsubscribe callback from a replaced read
 *     dispatches nothing: the callback re-checks the identity epoch and the
 *     movement count it subscribed under, and the reducer additionally refuses
 *     any action whose `readId` is not the one on screen.
 *
 * It initialises nothing and writes nothing — no profile is created, no armor
 * session is touched (`getDailyArmorSession` may create or reset one and is
 * deliberately not called), and no child is selected. A failure is reported
 * honestly with a read-only Retry, and the village, its places and the ordinary
 * doors never wait for it.
 */
import { useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import { avatarProfilesCollection } from '../../../core/firebase/firestore'
import type { AvatarProfile } from '../../../core/types'
import { normalizeAvatarProfile } from '../normalizeProfile'
import { getLibraryIdentityEpoch } from './libraryReturnFlow'
import { subscribeActiveChildId } from '../../../core/hooks/activeChildStore'

// ── The scope authority this read binds to ──────────────────────────────────
//
// The shared active-child store, which is where a selection really changes. It
// notifies synchronously and only on a real change, so counting notifications
// gives a monotonic movement count that an `A → B → A` advances twice. This
// module subscribes once, at load, so the count holds with nothing mounted and
// a movement during an unmount is still counted. It is NOT a new global
// selected child: nothing here stores, derives or writes an id.

let scopeMovements = 0
const scopeListeners = new Set<() => void>()

subscribeActiveChildId(() => {
  scopeMovements += 1
  for (const listener of scopeListeners) listener()
})

/** Monotonic count of observed raw active-child movements. Never reset. */
export function getTownHeroScopeMovements(): number {
  return scopeMovements
}

export function subscribeTownHeroScope(listener: () => void): () => void {
  scopeListeners.add(listener)
  return () => {
    scopeListeners.delete(listener)
  }
}

// ── What the read reports ───────────────────────────────────────────────────

export const TownHeroPhase = {
  /** Nothing is being read: no family, no resolved child, or not ready. */
  Idle: 'idle',
  /** Asked, and no answer yet. Never a hero, never an empty one. */
  Loading: 'loading',
  /** A document exists, is this child's, and is on screen. */
  Ready: 'ready',
  /** A successful read that says this child has no saved character yet. */
  Missing: 'missing',
  /** The read failed, or the document claims to belong to somebody else. */
  Error: 'error',
} as const
export type TownHeroPhase = (typeof TownHeroPhase)[keyof typeof TownHeroPhase]

export const TownHeroFailure = {
  /** The subscription reported an error. A Retry may well fix it. */
  Read: 'read',
  /** The document names a different child. A Retry cannot fix that. */
  Mismatch: 'mismatch',
} as const
export type TownHeroFailure = (typeof TownHeroFailure)[keyof typeof TownHeroFailure]

export interface TownHeroDocument {
  /** The normalised profile of a document proven owned by its path. */
  profile: AvatarProfile
  /**
   * The stored document carried its own `characterFeatures`.
   *
   * The normaliser fills defaults for an absent block, which is right and loses
   * the one fact the drawing needs to be honest: a real owned legacy document
   * is still this child's hero, drawn with documented shared defaults, and the
   * surface may say so instead of implying the colours are theirs.
   */
  hasSavedFeatures: boolean
}

export interface TownHeroRead {
  phase: TownHeroPhase
  /** Only ever the current binding's document. Never a sibling's, never a default. */
  document: TownHeroDocument | null
  failure: TownHeroFailure | null
  /**
   * One exposure of one child's read.
   *
   * Changes when the family, the child, readiness, the raw scope or the Retry
   * ticket does — and **not** when a new snapshot of the same document arrives.
   * That is what the entrance animation keys on, so an incidental write (an
   * `updatedAt` touch, an equip elsewhere) cannot make the hero walk in again.
   */
  exposureKey: string
  retrying: boolean
  /** Re-subscribe. Reads only: nothing is created, written or selected. */
  retry: () => void
}

interface ReadState {
  binding: string
  /** Monotonic within the mount, so no two bindings can share a `readId`. */
  serial: number
  readId: string
  phase: TownHeroPhase
  document: TownHeroDocument | null
  failure: TownHeroFailure | null
}

type ReadAction =
  | { type: 'rebind'; binding: string }
  | {
      type: 'result'
      readId: string
      phase: TownHeroPhase
      document: TownHeroDocument | null
      failure: TownHeroFailure | null
    }

function freshState(binding: string, serial: number): ReadState {
  return {
    binding,
    serial,
    readId: binding ? `${binding}@${serial}` : '',
    phase: binding ? TownHeroPhase.Loading : TownHeroPhase.Idle,
    document: null,
    failure: null,
  }
}

function readReducer(state: ReadState, action: ReadAction): ReadState {
  switch (action.type) {
    case 'rebind': {
      if (state.binding === action.binding) return state
      // A new exposure of a new (or re-asked) read. Nothing is carried over —
      // not the document, not the phase, not the failure — because every one of
      // them is a statement about the binding being replaced.
      return freshState(action.binding, state.serial + 1)
    }
    case 'result': {
      // The one gate every answer passes through, whatever channel it came
      // from: a success, an error, or a mismatch refusal.
      if (state.readId !== action.readId) return state
      return {
        ...state,
        phase: action.phase,
        document: action.document,
        failure: action.failure,
      }
    }
  }
}

export interface UseTownHeroProfileParams {
  familyId: string
  /** The child the shell has RESOLVED — not a raw selected id. */
  childId: string
  /**
   * Is the surrounding identity settled enough to read for this child?
   *
   * The caller already knows this (its children read is loading, or failed) and
   * passing it in keeps this hook from re-deriving an answer somebody else owns.
   * `false` is `idle`: no subscription, no document, and nothing on screen.
   */
  ready: boolean
}

export function useTownHeroProfile({
  familyId,
  childId,
  ready,
}: UseTownHeroProfileParams): TownHeroRead {
  /**
   * The scope authority, subscribed so a movement really re-renders.
   *
   * The VALUE is a count rather than an id on purpose: an id compares equal
   * across a batched `A → B → A` while a count does not.
   */
  const movements = useSyncExternalStore(subscribeTownHeroScope, getTownHeroScopeMovements)

  /** A Retry stamped with the child it was tapped for. */
  const [retryRequest, setRetryRequest] = useState<{ key: string; n: number } | null>(null)
  const scopeKey = familyId && childId ? `${familyId}_${childId}` : ''
  const retryN = retryRequest && retryRequest.key === scopeKey ? retryRequest.n : 0

  const enabled = Boolean(scopeKey) && ready
  const binding = enabled ? `${scopeKey}|${movements}|${retryN}` : ''

  const [state, dispatch] = useReducer(readReducer, binding, (seed) => freshState(seed, 0))
  // Render-phase, conditional, and it converges: after the dispatch the binding
  // matches and this branch is not taken again. No frame shows the old child.
  if (state.binding !== binding) dispatch({ type: 'rebind', binding })
  const current = state.binding === binding ? state : null
  const readId = current?.readId ?? ''

  useEffect(() => {
    if (!enabled || !readId) return
    /**
     * What this subscription was opened under.
     *
     * The epoch is the app's own identity movement counter (a logout, a profile
     * exit, an unsettled or failed children read, a raw selection change). The
     * movement count is the raw store's. Both are read HERE, at subscribe time,
     * and re-read in every callback: an answer that arrives after either moved
     * is answering about an identity this read can no longer vouch for.
     */
    const epochAtSubscribe = getLibraryIdentityEpoch()
    const movementsAtSubscribe = getTownHeroScopeMovements()
    let cancelled = false
    const live = () =>
      !cancelled &&
      getLibraryIdentityEpoch() === epochAtSubscribe &&
      getTownHeroScopeMovements() === movementsAtSubscribe

    const report = (
      phase: TownHeroPhase,
      document: TownHeroDocument | null,
      failure: TownHeroFailure | null,
    ) => dispatch({ type: 'result', readId, phase, document, failure })

    const ref = doc(avatarProfilesCollection(familyId), childId)
    const unsub = onSnapshot(
      ref,
      (snapshot) => {
        if (!live()) return
        if (!snapshot.exists()) {
          // A successful read that says there is no saved character. Honest, and
          // emphatically not a hero: nothing is drawn and nothing is written.
          report(TownHeroPhase.Missing, null, null)
          return
        }
        const data = snapshot.data() as unknown
        if (!data || typeof data !== 'object') {
          report(TownHeroPhase.Error, null, TownHeroFailure.Read)
          return
        }
        const raw = data as Record<string, unknown>
        const stamped = typeof raw.childId === 'string' ? raw.childId.trim() : ''
        if (stamped && stamped !== childId) {
          // Two claims that disagree. The document is not drawn, and a Retry is
          // not offered as a fix for it — re-reading says the same thing.
          report(TownHeroPhase.Error, null, TownHeroFailure.Mismatch)
          return
        }
        report(
          TownHeroPhase.Ready,
          {
            profile: normalizeAvatarProfile(raw),
            hasSavedFeatures: Boolean(
              raw.characterFeatures && typeof raw.characterFeatures === 'object',
            ),
          },
          null,
        )
      },
      (err) => {
        if (!live()) return
        console.warn('useTownHeroProfile: avatar profile snapshot error', err)
        report(TownHeroPhase.Error, null, TownHeroFailure.Read)
      },
    )

    return () => {
      // Belt to the reducer's `readId` gate, and the only thing that covers
      // unmount, where no new binding is ever made: a callback from a
      // cleaned-up listener does nothing at all.
      cancelled = true
      unsub()
    }
  }, [enabled, readId, familyId, childId])

  const retry = useCallback(() => {
    if (!scopeKey) return
    setRetryRequest((prev) => ({
      key: scopeKey,
      n: (prev && prev.key === scopeKey ? prev.n : 0) + 1,
    }))
  }, [scopeKey])

  return useMemo<TownHeroRead>(() => {
    if (!current) {
      // The render that re-binds. Deliberately `loading` rather than the last
      // answer: the previous child's hero may not be shown for a frame.
      return {
        phase: enabled ? TownHeroPhase.Loading : TownHeroPhase.Idle,
        document: null,
        failure: null,
        exposureKey: '',
        retrying: false,
        retry,
      }
    }
    return {
      phase: current.phase,
      document: current.document,
      failure: current.failure,
      exposureKey: current.readId,
      retrying: retryN > 0 && current.phase === TownHeroPhase.Loading,
      retry,
    }
  }, [current, enabled, retryN, retry])
}
