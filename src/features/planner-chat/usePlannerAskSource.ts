// Planner-side ownership for UX-273's hand-off: WHOSE question is on screen.
//
// The page's first cut derived the hand-off source from the live family / child
// / week on every render. That is true of the HEADER, not of the transcript:
// `messages` is local state installed by a listener and by awaited model
// replies, so a switch during an await relabels an old refusal with the new
// child and week — and the receiver cannot tell, because every field it
// re-checks agrees with itself.
//
// This hook holds the one extra fact that makes the claim checkable: the scope
// the transcript on screen was READ or REQUESTED under. It is stamped by the
// caller at the moment of the read or the reply (never re-derived), compared
// against the live scope at RENDER, and asked again at ACTIVATION — because a
// tap can land on a render the shell has already superseded.
//
// It writes nothing, reads nothing, and holds no child-scoped work: its whole
// output is "may this refusal carry her sentence, or does the button fall back
// to UX-269's plain navigation".

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  plannerAskSourceOwned,
  samePlannerAskSource,
  type PlannerAskHandoffSource,
  type PlannerAskSourceKey,
} from './plannerAskHandoff'

export interface PlannerAskSourceInputs {
  /** The hand-off is a parent door; a child profile never carries a question. */
  isParent: boolean
  familyId: string
  /** The shell's child, live. */
  activeChildId: string
  /** Her name, for the receiving note. Omitted until the child has loaded. */
  childName?: string
  /** The planning week the page is showing, live. */
  weekStart: string
}

export interface PlannerAskSource {
  /**
   * The scope live right now. Captured by the caller BEFORE an await and handed
   * back to {@link PlannerAskSource.stampTranscript} after it, so the stamp
   * describes the request rather than whatever the shell is showing when it
   * lands.
   */
  live: PlannerAskSourceKey
  /** Record which scope the transcript now on screen came from. */
  stampTranscript: (source: PlannerAskSourceKey) => void
  /** Forget it: nothing on screen is provably anyone's (an unresolved child). */
  clearTranscript: () => void
  /**
   * What a refusal's button may carry, or `undefined` when ownership cannot be
   * proven — in which case every link behaves exactly as UX-269 shipped.
   */
  handoffSource: PlannerAskHandoffSource | undefined
  /** Re-asked at the TAP, from a ref, so a stale click cannot stage. */
  authorizeHandoff: () => boolean
}

export function usePlannerAskSource({
  isParent,
  familyId,
  activeChildId,
  childName,
  weekStart,
}: PlannerAskSourceInputs): PlannerAskSource {
  // Derived during render, not in an effect: an effect's value is one commit
  // behind, and the render that is one commit behind is the one that offers the
  // button. Held as STATE adjusted during render — React's own
  // "adjusting state when a prop changes" — rather than as a ref written in
  // render, which is a mutation a thrown-away render would make invisibly.
  // Monotonic, so A → B → A ends on a third epoch and the first one's pending
  // work can never be mistaken for the current visit's.
  const scopeKey = `${familyId}|${activeChildId}|${weekStart}`
  const [scope, setScope] = useState<{ key: string; epoch: number }>({ key: scopeKey, epoch: 1 })
  const generation = scope.key === scopeKey ? scope.epoch : scope.epoch + 1
  if (scope.key !== scopeKey) {
    setScope({ key: scopeKey, epoch: generation })
  }

  const live = useMemo<PlannerAskSourceKey>(
    () => ({ familyId, childId: activeChildId, weekStart, epoch: generation }),
    [familyId, activeChildId, weekStart, generation],
  )

  const [stamped, setStamped] = useState<PlannerAskSourceKey | null>(null)
  const stampTranscript = useCallback((source: PlannerAskSourceKey) => {
    // Identity-preserving: a listener that re-fires for the same scope must not
    // cost a render.
    setStamped((prev) => (prev && samePlannerAskSource(prev, source) ? prev : source))
  }, [])
  const clearTranscript = useCallback(() => setStamped(null), [])

  const owned = isParent && plannerAskSourceOwned(stamped, live)

  const handoffSource = useMemo<PlannerAskHandoffSource | undefined>(() => {
    if (!owned || !stamped) return undefined
    // Read off the STAMP, not the live values — they are equal here by the check
    // above, and taking them from the stamp is what keeps that true if the two
    // ever drift apart. The name is the live child's, which `owned` has just
    // proved is the stamped one.
    return {
      familyId: stamped.familyId,
      childId: stamped.childId,
      ...(childName ? { childName } : {}),
      weekStart: stamped.weekStart,
    }
  }, [owned, stamped, childName])

  // Committed in a layout effect, so the answer a tap gets is the one the render
  // she is looking at actually committed — and so nothing is mutated during a
  // render that may be discarded. It starts `false`, which is the fail-closed
  // direction: a click cannot happen before the first commit.
  const ownedNow = useRef(false)
  useLayoutEffect(() => {
    ownedNow.current = owned
  }, [owned])
  const authorizeHandoff = useCallback(() => ownedNow.current, [])

  return { live, stampTranscript, clearTranscript, handoffSource, authorizeHandoff }
}
