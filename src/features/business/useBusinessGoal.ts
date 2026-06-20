import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { businessGoalsCollection } from '../../core/firebase/firestore'
import type { BusinessGoal, BusinessGoalMilestone } from '../../core/types/business'
import { withCumulativeThresholds } from './goalMath'

/** A milestone as the builder edits it — id + label + price, no stored threshold. */
export interface EditableMilestone {
  id: string
  label: string
  price: number
}

export interface UseBusinessGoalResult {
  /** The saved milestone stack (thresholds recomputed on read), or `[]`. */
  milestones: BusinessGoalMilestone[]
  loading: boolean
  saving: boolean
  error: string | null
  /**
   * Persist the milestone stack for `childId`. Recomputes cumulative thresholds,
   * then writes via `setDoc(..., { merge: true })` — never a bare overwrite.
   */
  saveMilestones: (childId: string, milestones: EditableMilestone[]) => Promise<void>
}

/**
 * Subscribe to and write the Barnes Bros goal config for a child operator
 * (FEAT-30 chunk 3). One doc per child at `businessGoals/{childId}`.
 *
 * This config holds only the target rungs + prices — never any progress. The
 * thermometer derives progress by summing the additive `businessLog`.
 */
export function useBusinessGoal(childId: string | null): UseBusinessGoalResult {
  const familyId = useFamilyId()
  const [milestones, setMilestones] = useState<BusinessGoalMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId || !childId) {
      setMilestones([])
      setLoading(false)
      return
    }
    setLoading(true)

    const ref = doc(businessGoalsCollection(familyId), childId)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data()
        setMilestones(data?.milestones ?? [])
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[BusinessGoal] Snapshot error:', err)
        setError(err.message)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId, childId])

  const saveMilestones = useCallback(
    async (operatorId: string, edits: EditableMilestone[]) => {
      if (!familyId) return
      setSaving(true)
      setError(null)
      try {
        // Drop blank rungs; floor prices defensively, then stamp thresholds.
        const cleaned = edits
          .map((m) => ({
            id: m.id,
            label: m.label.trim(),
            price: Number.isFinite(m.price) && m.price > 0 ? m.price : 0,
          }))
          .filter((m) => m.label !== '')
        const stamped = withCumulativeThresholds(cleaned)

        const ref = doc(businessGoalsCollection(familyId), operatorId)
        const payload: Omit<BusinessGoal, 'id'> = {
          childId: operatorId,
          milestones: stamped,
          updatedAt: new Date().toISOString(),
        }
        await setDoc(ref, payload, { merge: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not save goal.'
        setError(message)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [familyId],
  )

  return { milestones, loading, saving, error, saveMilestones }
}
