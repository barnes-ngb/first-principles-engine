import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import {
  plannerConversationsCollection,
  plannerConversationDocId,
} from '../../core/firebase/firestore'
import { hasUnappliedDraftItems } from './unappliedDraft'

/**
 * Subscribe to the planner conversation for a given week + child and report
 * whether it holds a drafted-but-unapplied plan with items (FEAT-111 P2).
 *
 * One doc read (live) — no new collection. Today uses this to replace its
 * passive "items will appear" banner with an actionable "review and apply"
 * prompt when a plan exists but was never applied. Live so the banner clears
 * itself the moment the plan is applied.
 */
export function useUnappliedDraft(
  familyId: string | undefined,
  childId: string | undefined,
  weekStartKey: string | undefined,
): boolean {
  const [hasDraft, setHasDraft] = useState(false)

  useEffect(() => {
    if (!familyId || !childId || !weekStartKey) {
      setHasDraft(false)
      return
    }
    const ref = doc(
      plannerConversationsCollection(familyId),
      plannerConversationDocId(weekStartKey, childId),
    )
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setHasDraft(hasUnappliedDraftItems(snap.exists() ? snap.data() : null))
      },
      (err) => {
        console.warn('[useUnappliedDraft] snapshot error:', err)
        setHasDraft(false)
      },
    )
    return unsub
  }, [familyId, childId, weekStartKey])

  return hasDraft
}
