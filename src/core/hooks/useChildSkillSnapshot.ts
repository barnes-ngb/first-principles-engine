import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'

import { skillSnapshotsCollection } from '../firebase/firestore'
import type { SkillSnapshot } from '../types'

export interface UseChildSkillSnapshotResult {
  /** The child's skill snapshot, or null when none exists / not yet loaded. */
  snapshot: SkillSnapshot | null
  /**
   * True once a load attempt has resolved (found, absent, or errored).
   * Distinguishes "still loading" from "loaded, no snapshot" so callers can
   * gate without acting mid-load.
   */
  loaded: boolean
}

/**
 * Load a single child's skill snapshot (doc id = childId). Read-only; the
 * snapshot is owned by the evaluation writers. Used by both the launcher-tile
 * gate and the /quest route guard so the eligibility fetch lives in one place.
 */
export function useChildSkillSnapshot(
  familyId: string | undefined,
  childId: string | undefined,
): UseChildSkillSnapshotResult {
  const [snapshot, setSnapshot] = useState<SkillSnapshot | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!familyId || !childId) {
      setSnapshot(null)
      setLoaded(false)
      return
    }
    let cancelled = false
    setLoaded(false)
    async function load() {
      try {
        const ref = doc(skillSnapshotsCollection(familyId!), childId!)
        const snap = await getDoc(ref)
        if (!cancelled) setSnapshot(snap.data() ?? null)
      } catch {
        // Non-blocking — treat a failed load as "no snapshot".
        if (!cancelled) setSnapshot(null)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [familyId, childId])

  return { snapshot, loaded }
}
