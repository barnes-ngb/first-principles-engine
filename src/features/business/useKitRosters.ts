import { useCallback, useEffect, useState } from 'react'
import { addDoc, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { kitRostersCollection } from '../../core/firebase/firestore'
import type { KitRoster } from '../../core/types/business'
import { KitRosterStatus } from '../../core/types/business'

/**
 * Fields a caller supplies when creating a roster. The hook stamps `source`,
 * `createdAt`, `updatedAt`, and (when omitted) a default `status`. The kid's
 * words are stored verbatim — the hook never normalizes name/power/menace text.
 */
export type NewKitRoster = Omit<KitRoster, 'id' | 'source' | 'createdAt' | 'updatedAt' | 'status'> & {
  status?: KitRosterStatus
}

export interface UseKitRostersResult {
  /** The active child's rosters, most-recently-updated first. */
  rosters: KitRoster[]
  loading: boolean
  error: string | null
  /** Create a roster (`addDoc`). Returns the new auto-ID. */
  createRoster: (roster: NewKitRoster) => Promise<string>
  /** Patch a roster in place (`updateDoc`). Re-stamps `updatedAt`. */
  updateRoster: (id: string, patch: Partial<Omit<KitRoster, 'id'>>) => Promise<void>
  /** One-off fetch of a single roster (e.g. deep-link / resume). */
  getRoster: (id: string) => Promise<KitRoster | null>
}

/**
 * Subscribe to a child's Kit Builder rosters and expose create / update / get
 * (FEAT-80 slice 1). Mirrors `useBusinessLog`'s auto-ID + converter +
 * `families/{familyId}` conventions, but is **scoped to `childId`** (design §4:
 * "queried and filtered by `childId`") so one child never sees or edits a
 * sibling's kits. Filtering by `childId` alone needs only Firestore's automatic
 * single-field index — no composite index — so ordering is applied client-side.
 *
 * A roster is the running state of a kit being built, not a submit-at-end form:
 * `updateRoster` patches in place so a partially-filled roster (empty lists is
 * valid) is saved and resumable. Kid's words are stored verbatim — no
 * normalization here or in the converter.
 */
export function useKitRosters(childId: string | null): UseKitRostersResult {
  const familyId = useFamilyId()
  const [rosters, setRosters] = useState<KitRoster[]>([])
  const [loading, setLoading] = useState(() => Boolean(childId))
  const [error, setError] = useState<string | null>(null)
  const [trackedChild, setTrackedChild] = useState(childId)

  // Reset immediately when the active child changes (render-phase — the
  // React-recommended way to adjust state on a prop change; see GoalBuilder),
  // so a child never even briefly sees a sibling's rosters before the new
  // subscription's first snapshot arrives. Kept out of the effect body.
  if (trackedChild !== childId) {
    setTrackedChild(childId)
    setRosters([])
    setLoading(Boolean(familyId && childId))
    setError(null)
  }

  useEffect(() => {
    if (!familyId || !childId) return

    const q = query(kitRostersCollection(familyId), where('childId', '==', childId))

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({
            ...(d.data() as KitRoster),
            id: d.id,
          }))
          // Order client-side (see above — avoids a composite index).
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        setRosters(items)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[KitRosters] Snapshot error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId, childId])

  const createRoster = useCallback(
    async (roster: NewKitRoster) => {
      if (!familyId) throw new Error('createRoster: no family')
      const now = new Date().toISOString()
      const ref = await addDoc(kitRostersCollection(familyId), {
        ...roster,
        status: roster.status ?? KitRosterStatus.InProgress,
        source: 'kitBuilder',
        createdAt: now,
        updatedAt: now,
        // `id` is supplied by the converter on read.
      } as Omit<KitRoster, 'id'> as KitRoster)
      return ref.id
    },
    [familyId],
  )

  const updateRoster = useCallback(
    async (id: string, patch: Partial<Omit<KitRoster, 'id'>>) => {
      if (!familyId) return
      await updateDoc(doc(kitRostersCollection(familyId), id), {
        ...patch,
        updatedAt: new Date().toISOString(),
      })
    },
    [familyId],
  )

  const getRoster = useCallback(
    async (id: string): Promise<KitRoster | null> => {
      if (!familyId) return null
      const snap = await getDoc(doc(kitRostersCollection(familyId), id))
      return snap.exists() ? snap.data() : null
    },
    [familyId],
  )

  return { rosters, loading, error, createRoster, updateRoster, getRoster }
}
