import { useCallback, useEffect, useRef, useState } from 'react'
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
 * `observations` is cleared and `observationsChildId` nulled **during render**
 * whenever the family or child changes, so one child's history can never be shown
 * under another child's name while a new subscription settles — the house rule
 * from `useDailyPlan` / `useSkillMap` (UX-344/345). A read that FAILS sets
 * `error` and leaves the list empty with the child stamped: a caller must be able
 * to tell "nothing recorded yet" from "we could not find out", because the first
 * invites an entry and the second is a lie.
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

export type SaveObservationOutcome =
  | {
      ok: true
      observation: NativeProgressObservation
      /** The entry was already on the record; this call wrote nothing. */
      alreadyRecorded: boolean
    }
  | { ok: false; message: string }

export interface UseNativeProgressObservationsResult {
  /** This child's rows, unsorted — the display order is the rule module's. */
  observations: NativeProgressObservation[]
  loading: boolean
  /** Set when the read failed. An empty list with an error is NOT "none". */
  error: string | null
  /** Which child the three fields above describe. `null` until one answers. */
  observationsChildId: string | null
  /** A confirmed save is in flight. One at a time — see `save`. */
  saving: boolean
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
  const [observationsChildId, setObservationsChildId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const scopeKey = `${familyId ?? ''}|${childId}`
  const [renderedScope, setRenderedScope] = useState(scopeKey)
  if (renderedScope !== scopeKey) {
    // During render, not in an effect: an effect runs after the children of this
    // hook's caller have already rendered once with the previous child's rows.
    setRenderedScope(scopeKey)
    setObservations([])
    setObservationsChildId(null)
    setLoading(true)
    setError(null)
  }

  /**
   * The scope this hook is CURRENTLY describing, readable after an await.
   *
   * The save closure holds the pinned scope on purpose — that is where the write
   * must go. This ref answers a different question: is the surface still showing
   * that child, and may its local state therefore be touched? An A → B → A switch
   * is handled by comparing the key rather than a counter, because the key is the
   * thing being asked about: if the family and child are the same again, the rows
   * belong here again.
   */
  const scopeRef = useRef(scopeKey)
  useEffect(() => {
    scopeRef.current = scopeKey
  }, [scopeKey])

  /** One confirmed save at a time — the latch that makes a double tap one row. */
  const savingRef = useRef(false)

  useEffect(() => {
    if (!familyId || !childId) return
    const q = query(
      nativeProgressObservationsCollection(familyId),
      where('childId', '==', childId),
    )
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setObservations(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
        setObservationsChildId(childId)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[NativeProgress] Snapshot error:', err)
        setObservations([])
        setObservationsChildId(childId)
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [familyId, childId])

  const save = useCallback(
    async (request: SaveObservationRequest): Promise<SaveObservationOutcome> => {
      // Checked on the ref rather than on `saving`, because two taps in the same
      // tick both read the pre-render state value (FIX-262's latch, same shape).
      if (savingRef.current) {
        return { ok: false, message: NATIVE_PROGRESS_SAVE_IN_FLIGHT }
      }
      savingRef.current = true
      setSaving(true)
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
        // list the screen is now showing for the other one.
        if (scopeRef.current === `${request.familyId}|${request.childId}`) {
          setObservations((prev) => mergeById(prev, result.observation))
        }
        return {
          ok: true,
          observation: result.observation,
          alreadyRecorded: result.alreadyRecorded,
        }
      } catch (err) {
        console.error('[NativeProgress] Save failed:', err)
        // A refusal carries its own sentence — the rule, stated once, in the
        // writer. Anything else is a failure, and says the entry is unsaved.
        return {
          ok: false,
          message: err instanceof NativeProgressRefused ? err.message : failureNotice(),
        }
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [],
  )

  return { observations, loading, error, observationsChildId, saving, save }
}
