import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'

import { useFamilyId } from '../../../core/auth/useAuth'
import { nativeProgressObservationsCollection } from '../../../core/firebase/firestore'
import {
  NativeProgressRefused,
  saveNativeProgressObservation,
} from '../../../core/firebase/nativeProgressWrites'
import type { NativeProgressObservation } from '../../../core/types/nativeProgress'
import { failureNotice, type ReviewedObservation } from './nativeProgressRule'

/**
 * Read and record one child's native-program observations (FEAT-241).
 *
 * ── The child is a PARAMETER, never read from the shell ─────────────────────
 *
 * This hook is handed the child it describes, the way `useActivityConfigs` is.
 * That is deliberate: the only writer of this collection is reached through here,
 * and a hook that resolved the child itself would write wherever the header
 * happened to be pointing when an await came back. The surface above pins the
 * child, passes it in, and passes it again on the save.
 *
 * ── A failed read is not an empty record ────────────────────────────────────
 *
 * `observations` is cleared and `observationsScope` nulled **during render**
 * whenever the family or child changes, so one child's history can never be shown
 * under another child's name while a new subscription settles — the house rule
 * from `useDailyPlan` / `useSkillMap` (UX-344/345). A read that FAILS sets
 * `error` and leaves the list empty with the scope stamped: a caller must be able
 * to tell "nothing recorded yet" from "we could not find out", because the first
 * invites an entry and the second is a lie.
 *
 * ── Settlement is stamped with the FAMILY as well as the child ───────────────
 *
 * A child id is unique inside a family, not across sign-ins, so a settlement that
 * named only the child let a queued callback from the account that just signed
 * out present its rows as the new account's answer for the same id (PR-1897
 * review, round 4 P1). Every settlement therefore names family + child, and both
 * callbacks are checked against the scope **committed** at the time they fire and
 * against the generation of the subscription that is current — so a callback from
 * an unsubscribed listener can restore neither rows nor an error, including on an
 * A → B → A round trip where the key is equal again and the visit is not.
 */
export interface SaveObservationRequest {
  /** The family the draft was started under. Pinned by the caller, not read here. */
  familyId: string
  /** The child the draft was started for. Pinned by the caller. */
  childId: string
  /** The draft's identity — reused by a retry of the same entry. */
  entryKey: string
  observation: ReviewedObservation
  /** The row being corrected, when this is a correction. */
  correctsObservationId?: string
}

/** The family + child a read has answered for, or a write is addressed to. */
export interface NativeProgressScope {
  familyId: string
  childId: string
}

/**
 * The write actually in the air — not merely *that* one is.
 *
 * `saving` answers "is a write in flight" and nothing else, which a surface that
 * attributes a pending save to a child cannot use: the parent may have moved on
 * twice while one request was held (PR-1897 review, round 4 P2). This names the
 * record the in-flight request was confirmed for, so a claim about it can be made
 * for that child and family and no other. Set only when the latch has ACCEPTED
 * the write, so a second tap that was refused never appears here.
 */
export interface InFlightSave extends NativeProgressScope {
  entryKey: string
}

export type SaveObservationOutcome =
  | {
      ok: true
      observation: NativeProgressObservation
      /** The entry was already on the record; this call wrote nothing. */
      alreadyRecorded: boolean
      /**
       * Set (FEAT-242) when this correction also invalidated a confirmed
       * whole-program completion that cited the row being corrected — the one
       * authorized integration, carried out in the same transaction as the row.
       * The finished-program surface reads the same outcome off its own record,
       * so this is here for callers that want to say so immediately.
       */
      completionRevoked?: { status: 'revoked' | 'pending'; detail?: string }
    }
  | { ok: false; message: string }

export interface UseNativeProgressObservationsResult {
  /** This child's rows, unsorted — the display order is the rule module's. */
  observations: NativeProgressObservation[]
  loading: boolean
  /** Set when the read failed. An empty list with an error is NOT "none". */
  error: string | null
  /**
   * Which family + child the three fields above describe — `null` until a
   * subscription for the CURRENT pair has answered. The family is part of it
   * because the same child id can belong to two sign-ins.
   */
  observationsScope: NativeProgressScope | null
  /** A confirmed save is in flight. One at a time — see `save`. */
  saving: boolean
  /** Which record that in-flight write belongs to. `null` when none is. */
  savingRequest: InFlightSave | null
  save: (request: SaveObservationRequest) => Promise<SaveObservationOutcome>
}

/** What a second tap on Save gets while the first is still in the air. */
export const NATIVE_PROGRESS_SAVE_IN_FLIGHT =
  'That entry is already saving — give it a moment.'

/** Replace a row with the same id, or add it. Never duplicates. */
function mergeById(
  rows: readonly NativeProgressObservation[],
  row: NativeProgressObservation,
): NativeProgressObservation[] {
  const next = rows.filter((r) => r.id !== row.id)
  next.push(row)
  return next
}

export function useNativeProgressObservations(
  childId: string,
): UseNativeProgressObservationsResult {
  const familyId = useFamilyId()
  const [observations, setObservations] = useState<NativeProgressObservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [observationsScope, setObservationsScope] = useState<NativeProgressScope | null>(
    null,
  )
  const [savingRequest, setSavingRequest] = useState<InFlightSave | null>(null)

  const scopeKey = `${familyId ?? ''}|${childId}`
  /**
   * The scope, and which VISIT of it this is.
   *
   * The key alone cannot tell an A → B → A round trip from never having left, and
   * a listener from the first visit is unsubscribed whether or not its key comes
   * back — so the generation decides what may settle a read, while the key alone
   * decides where a confirmed row belongs.
   */
  const [scope, setScope] = useState({ key: scopeKey, run: 0 })
  if (scope.key !== scopeKey) {
    // During render, not in an effect: an effect runs after the children of this
    // hook's caller have already rendered once with the previous child's rows.
    setScope((prev) => ({ key: scopeKey, run: prev.run + 1 }))
    setObservations([])
    setObservationsScope(null)
    setLoading(true)
    setError(null)
  }

  /**
   * The scope this hook is currently describing, as COMMITTED.
   *
   * The save closure holds the pinned scope on purpose — that is where the write
   * must go. This ref answers a different question: is the surface still showing
   * that family and child, and may its local state therefore be touched?
   *
   * In a layout effect, which is the whole guarantee (round 4 P1): a passive
   * effect runs after paint, while a snapshot callback already queued and a save
   * already in the air both arrive before that — so a switch that has committed
   * was invisible to them and the previous scope's answer settled the new one. A
   * layout effect is in step by the end of the commit that switched.
   */
  const committedScope = useRef(scope)
  useLayoutEffect(() => {
    committedScope.current = scope
  }, [scope])

  /** One confirmed save at a time — the latch that makes a double tap one row. */
  const savingRef = useRef(false)

  useEffect(() => {
    if (!familyId || !childId) return
    const q = query(
      nativeProgressObservationsCollection(familyId),
      where('childId', '==', childId),
    )
    const settles: NativeProgressScope = { familyId, childId }
    const run = scope.run
    let live = true
    /**
     * May this listener still settle the read? Three things have to hold: it has
     * not been unsubscribed, the committed scope is still the one it reads, and
     * it is the subscription of the current visit rather than an earlier one.
     */
    const mine = () =>
      live &&
      committedScope.current.key === `${familyId}|${childId}` &&
      committedScope.current.run === run
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!mine()) return
        setObservations(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
        setObservationsScope(settles)
        setLoading(false)
        setError(null)
      },
      (err) => {
        // Logged either way — a refused read is worth knowing about — but only a
        // CURRENT one may be shown.
        console.error('[NativeProgress] Snapshot error:', err)
        if (!mine()) return
        // A current failure stays distinguishable from an empty history: the list
        // is empty and the scope IS stamped.
        setObservations([])
        setObservationsScope(settles)
        setError(err.message)
        setLoading(false)
      },
    )
    return () => {
      live = false
      unsubscribe()
    }
  }, [familyId, childId, scope.run])

  const save = useCallback(
    async (request: SaveObservationRequest): Promise<SaveObservationOutcome> => {
      // Checked on the ref rather than on `saving`, because two taps in the same
      // tick both read the pre-render state value (FIX-262's latch, same shape).
      if (savingRef.current) {
        return { ok: false, message: NATIVE_PROGRESS_SAVE_IN_FLIGHT }
      }
      savingRef.current = true
      setSavingRequest({
        familyId: request.familyId,
        childId: request.childId,
        entryKey: request.entryKey,
      })
      try {
        const result = await saveNativeProgressObservation({
          familyId: request.familyId,
          childId: request.childId,
          entryKey: request.entryKey,
          observation: request.observation,
          correctsObservationId: request.correctsObservationId,
        })
        // Immediate readback, but only onto the scope that asked for it. A save
        // confirmed for one child completes against that child (the write is
        // bound to the pinned ids above); its ROW must not be spliced into the
        // list the screen is now showing for the other one — or for another
        // household whose child wears the same id. Read off the COMMITTED scope,
        // so a switch in the commit this answer came back in is already seen.
        if (committedScope.current.key === `${request.familyId}|${request.childId}`) {
          setObservations((prev) => mergeById(prev, result.observation))
        }
        return {
          ok: true,
          observation: result.observation,
          alreadyRecorded: result.alreadyRecorded,
          ...(result.completionRevoked
            ? { completionRevoked: result.completionRevoked }
            : {}),
        }
      } catch (err) {
        console.error('[NativeProgress] Save failed:', err)
        // A refusal carries its own sentence — the rule, stated once, in the
        // writer — and it is determinate: the writer rejected the entry and the
        // transaction never committed. Anything ELSE is indeterminate (the commit
        // may have landed and the answer been lost), so it gets `failureNotice`,
        // which claims neither (PR-1897 review, round 2).
        return {
          ok: false,
          message: err instanceof NativeProgressRefused ? err.message : failureNotice(),
        }
      } finally {
        savingRef.current = false
        setSavingRequest(null)
      }
    },
    [],
  )

  return {
    observations,
    loading,
    error,
    observationsScope,
    // Derived, so there is one source of truth for "a write is in the air" and
    // the record it belongs to: they can never disagree.
    saving: savingRequest !== null,
    savingRequest,
    save,
  }
}
