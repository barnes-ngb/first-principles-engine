import { useCallback, useEffect, useState } from 'react'
import { addDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { watchLibraryCollection } from '../../core/firebase/firestore'
import type { WatchVideo } from '../../core/types'

/**
 * Fields a caller supplies when vetting a video in. The hook stamps `vettedAt`,
 * `createdAt`, and `updatedAt`; `addedBy` is supplied by the caller (the
 * curating parent's identifier).
 */
export type NewWatchVideo = Omit<WatchVideo, 'id' | 'vettedAt' | 'createdAt' | 'updatedAt'>

export interface UseWatchLibraryResult {
  /** Curated videos, most-recently-updated first. */
  videos: WatchVideo[]
  loading: boolean
  error: string | null
  /** Vet a video in (`addDoc`). Returns the new auto-ID. */
  addVideo: (video: NewWatchVideo) => Promise<string>
  /** Patch a video in place (`updateDoc`). Re-stamps `updatedAt`. */
  updateVideo: (id: string, patch: Partial<Omit<WatchVideo, 'id'>>) => Promise<void>
}

/**
 * Subscribe to the family's curated Watch Vehicle library (FEAT-100 slice 1).
 *
 * Mirrors `useKitRosters`/`useActivityConfigs` conventions (auto-ID +
 * converter + `families/{familyId}` path). Scoping (D7):
 *  - `childId` given → `where('childId','in',[childId,'both'])`, so a video
 *    curated for `'both'` is visible to each child, exactly like activity
 *    configs. (Firestore's `in` needs only its automatic single-field index —
 *    no composite index — so ordering is applied client-side.)
 *  - `childId` omitted → the whole family library (the parent management view).
 *
 * No deletes this slice — the design §3 shape has no `retired` flag, so removal
 * is deferred (run-prompt).
 */
export function useWatchLibrary(childId?: string | null): UseWatchLibraryResult {
  const familyId = useFamilyId()
  const [videos, setVideos] = useState<WatchVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId) return

    const base = watchLibraryCollection(familyId)
    const q = childId
      ? query(base, where('childId', 'in', [childId, 'both']))
      : query(base)

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ ...(d.data() as WatchVideo), id: d.id }))
          // Order client-side (avoids a composite index).
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        setVideos(items)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[WatchLibrary] Snapshot error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId, childId])

  const addVideo = useCallback(
    async (video: NewWatchVideo) => {
      if (!familyId) throw new Error('addVideo: no family')
      const now = new Date().toISOString()
      const ref = await addDoc(watchLibraryCollection(familyId), {
        ...video,
        vettedAt: now,
        createdAt: now,
        updatedAt: now,
        // `id` is supplied by the converter on read.
      } as Omit<WatchVideo, 'id'> as WatchVideo)
      return ref.id
    },
    [familyId],
  )

  const updateVideo = useCallback(
    async (id: string, patch: Partial<Omit<WatchVideo, 'id'>>) => {
      if (!familyId) return
      await updateDoc(doc(watchLibraryCollection(familyId), id), {
        ...patch,
        updatedAt: new Date().toISOString(),
      })
    },
    [familyId],
  )

  return { videos, loading, error, addVideo, updateVideo }
}
