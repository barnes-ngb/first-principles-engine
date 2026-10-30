import { useEffect, useRef } from 'react'

import { clearPlannerAskHandoff } from '../planner-chat/plannerAskHandoff'
import { clearComposerCustody } from './composerCustody'

/**
 * Drop UX-273's two page-session slots when the scope they belong to changes —
 * even while Ask AI is unmounted (its own guards cannot run then).
 *
 * Mounted at the shell, because that is where account / role / child all change.
 * It is an OBSERVER: it reads the scope and never sets it, holds no state, and
 * touches nothing but the hand-off slot and the composer-custody slot (so it is
 * not a child-switch census candidate — no React state, no write; see the
 * census §4 note). An unresolved scope is not a change: a value settling from
 * `''` on first load must not count as a switch.
 */
export function useHandoffScopeWatch(
  familyId: string,
  profile: string | null,
  activeChildId: string,
): void {
  const resolved = Boolean(familyId) && profile !== null && Boolean(activeChildId)
  const key = resolved ? `${familyId}|${profile}|${activeChildId}` : ''
  const seen = useRef<string | null>(null)

  useEffect(() => {
    if (key === '') return
    if (seen.current === null) {
      seen.current = key
      return
    }
    if (seen.current === key) return
    seen.current = key
    clearPlannerAskHandoff()
    clearComposerCustody()
  }, [key])
}
