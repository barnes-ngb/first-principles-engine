import { useCallback, useEffect, useState } from 'react'
import { addDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { watchLibraryCollection } from '../../core/firebase/firestore'
import { WatchVideoStatus } from '../../core/types/watch'
import type { WatchVideo } from '../../core/types'

/**
 * Fields a caller supplies when vetting a video in. The hook stamps `vettedAt`,
 * `createdAt`, and `updatedAt`; `addedBy` is supplied by the caller (the
 * curating parent's identifier).
 */
export type NewWatchVideo = Omit<WatchVideo, 'id' | 'vettedAt' | 'createdAt' | 'updatedAt'>

/**
 * Vet one video into the family's library (`addDoc`). Returns the new auto-ID.
 *
 * Module-level rather than hook-bound so the Shelly portal's confirmed vet-in
 * (FEAT-149) can call the SAME writer the form calls, instead of standing up a
 * second `addDoc` against `watchLibrary`. That is the `addSightWord` /
 * `removeSightWord` pattern exactly: one definition of what a library write
 * looks like, one place the `vettedAt` / `createdAt` / `updatedAt` stamps are
 * applied, whichever surface the parent's tap came from.
 *
 * `addedBy` is the caller's to supply and is never defaulted here — it is the
 * provenance of a curation decision, so the surface that took the parent's
 * action is the one that knows whose it was.
 */
export async function addWatchVideo(
  familyId: string,
  video: NewWatchVideo,
): Promise<string> {
  if (!familyId) throw new Error('addWatchVideo: no family')
  const now = new Date().toISOString()
  const ref = await addDoc(watchLibraryCollection(familyId), {
    ...video,
    vettedAt: now,
    createdAt: now,
    updatedAt: now,
    // `id` is supplied by the converter on read.
  } as Omit<WatchVideo, 'id'> as WatchVideo)
  return ref.id
}

export interface UseWatchLibraryResult {
  /** Curated videos, most-recently-updated first. */
  videos: WatchVideo[]
  loading: boolean
  error: string | null
  /** Vet a video in (`addDoc`). Returns the new auto-ID. */
  addVideo: (video: NewWatchVideo) => Promise<string>
  /** Patch a video in place (`updateDoc`). Re-stamps `updatedAt`. */
  updateVideo: (id: string, patch: Partial<Omit<WatchVideo, 'id'>>) => Promise<void>
  /**
   * Retire a video out of the pickable library (FEAT-129). This is what
   * "remove" means here — the document is kept so an already-planned item in a
   * past week still resolves and still plays. Never a `deleteDoc`.
   */
  retireVideo: (id: string) => Promise<void>
  /** Undo a retire — put a video back in the pickable library. */
  restoreVideo: (id: string) => Promise<void>
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
  const [trackedChild, setTrackedChild] = useState(childId)

  // Reset scoped results immediately when the child scope changes (render-phase
  // — the React-recommended way to adjust state on a prop change; see
  // useKitRosters). Without this, a child-scoped consumer keeps showing the
  // prior child's videos as fully loaded until the new subscription's first
  // snapshot arrives — a sibling's private entry could briefly be selectable.
  if (trackedChild !== childId) {
    setTrackedChild(childId)
    setVideos([])
    setLoading(Boolean(familyId))
    setError(null)
  }

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
    (video: NewWatchVideo) => addWatchVideo(familyId, video),
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

  // Retire / restore are `updateVideo` with a fixed patch rather than separate
  // write paths — one merge-write, one `updatedAt` stamp, no second definition
  // of what a library write looks like.
  const retireVideo = useCallback(
    (id: string) => updateVideo(id, { status: WatchVideoStatus.Retired }),
    [updateVideo],
  )

  const restoreVideo = useCallback(
    (id: string) => updateVideo(id, { status: WatchVideoStatus.Active }),
    [updateVideo],
  )

  return { videos, loading, error, addVideo, updateVideo, retireVideo, restoreVideo }
}
