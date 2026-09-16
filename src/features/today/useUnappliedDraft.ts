import { useCallback, useEffect, useState } from 'react'
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
) {
  const scope = JSON.stringify([familyId, childId, weekStartKey])
  const [state, setState] = useState<{
    scope: string; visit: number; attempt: number
    status: 'loading' | 'ready' | 'unavailable'; hasDraft: boolean | null
  }>({ scope, visit: 0, attempt: 0, status: 'loading', hasDraft: null })

  // Reset synchronously when the week/child changes so a reader never shows a
  // stale week's draft banner for a frame (repo pattern — see useLearnerModel).
  if (state.scope !== scope) {
    setState({ scope, visit: state.visit + 1, attempt: 0, status: 'loading', hasDraft: null })
  }
  const { visit, attempt } = state

  useEffect(() => {
    if (!familyId || !childId || !weekStartKey) return
    let active = true
    const ref = doc(
      plannerConversationsCollection(familyId),
      plannerConversationDocId(weekStartKey, childId),
    )
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!active) return
        setState((prev) => prev.visit === visit && prev.attempt === attempt ? {
          ...prev, status: 'ready', hasDraft: hasUnappliedDraftItems(snap.exists() ? snap.data() : null),
        } : prev)
      },
      (err) => {
        if (!active) return
        console.warn('[useUnappliedDraft] snapshot error:', err)
        setState((prev) => prev.visit === visit && prev.attempt === attempt ? { ...prev, status: 'unavailable', hasDraft: null } : prev)
      },
    )
    return () => { active = false; unsub() }
  }, [familyId, childId, weekStartKey, visit, attempt])

  const retry = useCallback(() => {
    setState((prev) => prev.scope === scope && prev.visit === visit && prev.status === 'unavailable'
      ? { ...prev, attempt: prev.attempt + 1, status: 'loading', hasDraft: null } : prev)
  }, [scope, visit])

  return { status: state.status, hasDraft: state.hasDraft, retry }
}
