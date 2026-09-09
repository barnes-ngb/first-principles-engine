/**
 * A Workshop workflow belongs to the child it was started for — UX-324,
 * Codex round 2 on PR #1817.
 *
 * Making the header chip a real switcher means the active child can change on
 * a screen with no `ChildSelector` of its own, and the Workshop is such a
 * screen. `WorkshopPage` holds a whole multi-step workflow in local state: the
 * wizard creates a `storyGames` draft stamped with the child active when the
 * first step is saved, and every later step updates that document **without**
 * changing its stored `childId`. Meanwhile generation, `currentGame`, the art
 * quota and the XP / artifact rewards all read the **live** active child. So a
 * parent could start for Lincoln, switch to London, and finish: London-
 * calibrated work, London's art quota and London's rewards, all attached to a
 * Lincoln-owned game.
 *
 * **The answer here is to END the workflow, not to re-target it** — which is
 * the opposite of the books answer (`books/draftOwnership.ts`
 * `inFlightDraftNotice`), and deliberately so. There, the draft is a generated
 * story that exists only in local state and cost a paid call, so discarding it
 * would destroy something; the write is bound to the draft instead. Here, the
 * draft is *already saved* under its own child, the Workshop lists it on that
 * child's shelf, and `handleResumeDraft` picks it up exactly where it was left.
 * So going back to the workshop home loses nothing — and it is the only answer
 * that covers every downstream reader at once (generation, quota, rewards,
 * artifacts), rather than threading a child id through four subsystems and
 * hoping the fifth is found.
 *
 * Pure: no React, no Firestore, never throws.
 */

/**
 * Whether an in-flight workflow should be ended because the header moved off
 * the child it belongs to.
 *
 * `workflowChildId` is `null` when nothing is in flight (the workshop home),
 * which is never a reason to reset anything.
 */
export function workflowLeftItsChild(
  workflowChildId: string | null,
  activeChildId: string,
): boolean {
  if (!workflowChildId) return false
  // An empty active id is a child still resolving, not a switch away.
  if (!activeChildId) return false
  return workflowChildId !== activeChildId
}

/**
 * What the parent is told. It names the child the work belongs to and where it
 * still is, because "your wizard closed" without either would read as lost
 * work — and nothing was lost.
 */
export function workshopSwitchedAwayLine(childName: string | undefined): string {
  const whose = childName ? `${childName}'s` : 'the other child’s'
  return `That game is ${whose} — it's saved in their Workshop, ready to pick up. Start a new one here, or switch back to finish it.`
}
