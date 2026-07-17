import { useCallback, useEffect, useState } from 'react'
import { addDoc, doc, getDoc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'

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
  /** Rosters for the family, most-recently-updated first. */
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
 * Subscribe to the family's Kit Builder rosters and expose create / update /
 * get (FEAT-80 slice 1). Mirrors `useBusinessLog`'s auto-ID + converter +
 * `families/{familyId}` conventions.
 *
 * A roster is the running state of a kit being built, not a submit-at-end form:
 * `updateRoster` patches in place so a partially-filled roster (empty lists is
 * valid) is saved and resumable. Kid's words are stored verbatim — no
 * normalization here or in the converter.
 */
export function useKitRosters(): UseKitRostersResult {
  const familyId = useFamilyId()
  const [rosters, setRosters] = useState<KitRoster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId) return

    const q = query(kitRostersCollection(familyId), orderBy('updatedAt', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as KitRoster),
          id: d.id,
        }))
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
  }, [familyId])

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
