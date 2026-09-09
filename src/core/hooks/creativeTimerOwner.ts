/**
 * Whose session is this timer counting — UX-327.
 *
 * `useCreativeTimer` writes an `hours` row when the timer stops, and it wrote
 * that row against the child the hook was rendered with **at the moment Done
 * was tapped**. The timer is mounted on several screens, the header's child
 * switcher (UX-324) reaches all of them, and the running timer survives the
 * change — so a session started for Lincoln and stopped after a switch was
 * logged as **London's hours**, in the collection the Records page, the
 * compliance pack and `collectHoursContributions` all read.
 *
 * A logged session is evidence of what happened, and what happened happened for
 * one child. So the write follows the **session**, not the header — the same
 * principle the books draft (UX-324 round 1) and the Workshop workflow (round 2)
 * were fixed on, applied to the one of them that reaches the compliance rail.
 *
 * The owner was already being persisted: `startTimer` writes `childId` into the
 * `localStorage` record so a timer survives a reload. It simply was not carried
 * in memory, and `resumePersistedTimer` restored start time, subject and
 * description while dropping it. Both halves are closed here.
 *
 * **This changes no hours math**: not `collectHoursContributions`, not a fold,
 * not a rounding rule, not the 5-minute floor. Only *whose* a row is.
 *
 * Pure: no React, no Firestore, never throws.
 */

/**
 * The child an hours row is written for.
 *
 * The session's own owner wins. The live child is the fallback for a timer that
 * carries none — an in-memory state from before this field existed, or a
 * persisted record written by an older build — which is exactly the behaviour
 * that shipped before, so nothing regresses on that path.
 */
export function resolveTimerOwner(
  ownerChildId: string | null | undefined,
  activeChildId: string,
): string {
  return ownerChildId || activeChildId
}

/** True when the header has moved off the child this session belongs to. */
export function timerOwnerDiffers(
  ownerChildId: string | null | undefined,
  activeChildId: string,
): boolean {
  if (!ownerChildId || !activeChildId) return false
  return ownerChildId !== activeChildId
}

/**
 * What the running timer says once the header is on someone else. It names the
 * child the minutes will be logged to, **before** Done is tapped — the UX-313
 * rule (a records write says whose it is before it happens, not in the receipt
 * afterwards) on the surface where it matters most.
 */
export function timerOwnerLine(ownerName: string | undefined): string {
  return ownerName
    ? `This time is ${ownerName}'s — it will be logged to ${ownerName}.`
    : 'This time will be logged to the child it was started for.'
}
