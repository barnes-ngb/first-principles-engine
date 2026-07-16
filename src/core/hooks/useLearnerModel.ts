import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import { learnerModelsCollection } from '../firebase/firestore'
import type { LearnerModel } from '../types/learnerModel'

export interface UseLearnerModelResult {
  /** The child's learner model, or null when none exists / not yet loaded. */
  model: LearnerModel | null
  /**
   * True until the first snapshot resolves (found or absent). Distinguishes
   * "still loading" from "loaded, no model" so callers can gate without acting
   * mid-load (e.g. the planner focus line stays silent until this is false).
   */
  loading: boolean
}

/**
 * Subscribe to a single child's learner model (doc id = childId) at
 * `families/{familyId}/learnerModels/{childId}` (FEAT-65, Phase 3b).
 *
 * **Read-only.** The model is owned by the seeder / Review-Chat writers / the
 * `learnerSynthesis` beat; surfaces read it and never regenerate on load (D6).
 * The first reusable read hook — the diag panel and Review Chat `getDoc` inline;
 * the Foundations tab and planner focus line share this instead.
 */
export function useLearnerModel(
  familyId: string | undefined,
  childId: string | undefined,
): UseLearnerModelResult {
  const [model, setModel] = useState<LearnerModel | null>(null)
  const [loading, setLoading] = useState(!!familyId && !!childId)
  const key = `${familyId ?? ''}|${childId ?? ''}`
  const [lastKey, setLastKey] = useState(key)

  // Reset synchronously when the child/family changes so a reader never shows a
  // stale sibling's model for a frame.
  if (lastKey !== key) {
    setLastKey(key)
    setModel(null)
    setLoading(!!familyId && !!childId)
  }

  useEffect(() => {
    // The synchronous key-change block above already reset model/loading for the
    // no-family/no-child case; just skip subscribing.
    if (!familyId || !childId) return
    const ref = doc(learnerModelsCollection(familyId), childId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setModel(snap.exists() ? snap.data() : null)
        setLoading(false)
      },
      (err) => {
        console.error('useLearnerModel failed:', err)
        setModel(null)
        setLoading(false)
      },
    )
    return unsub
  }, [familyId, childId])

  return { model, loading }
}
