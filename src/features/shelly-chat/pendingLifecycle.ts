// ── What happens to a confirm card that never got tapped (FEAT-162 / UX-33) ─
//
// The portal's core promise is that the CARD is the only thing that writes. A
// card that silently vanishes, or one whose button does nothing, breaks that
// promise from the other end: the parent is left believing a proposal is still
// standing, or that they confirmed something they did not.
//
// The pattern here is not new — `suppressed` (the notices `stagePendingActions`
// records for a proposal dropped before it could become a card) is the portal's
// own proof that a dropped proposal always leaves a sentence. These are the
// same sentences for the three lifecycle moments that had none:
//
//   (a) a NEW turn's cards replace the previous turn's, whole array at a time;
//   (b) a child-tab or thread switch leaves the old cards on screen, where
//       Confirm hits `rejectReason`'s mismatch and returns false — a dead
//       button that says nothing;
//   (c) a write that REJECTS reverts the card to "Confirm" with no error, no
//       toast and no sentence.
//
// Every one of them now ends in a sentence a parent can read. Nothing here
// writes, and nothing here changes what any action writes.

/** Why a still-pending set of cards was dropped. */
export const PendingDropReason = {
  /** A new reply arrived carrying its own proposals. */
  Superseded: 'superseded',
  /** The parent switched child tabs — a different context entirely. */
  ContextSwitch: 'context-switch',
  /** The parent moved to a different (or new) conversation. */
  ThreadSwitch: 'thread-switch',
} as const
export type PendingDropReason = (typeof PendingDropReason)[keyof typeof PendingDropReason]

/** "1 suggestion" / "3 suggestions" — the count guard the audit keeps finding. */
function suggestionCount(count: number): string {
  return `${count} suggestion${count === 1 ? '' : 's'}`
}

/**
 * (a) The next turn replaces the pending array wholesale. That is the right
 * behaviour — a proposal belongs to the reply that made it — but it was
 * silent, so a parent who asked a clarifying question watched their cards
 * disappear with no account of where they went.
 *
 * DROP rather than carry, deliberately, and the run that added this chose the
 * safer half on purpose: carrying a card across a turn would mean a proposal
 * staying confirmable in a conversation that has moved on, and the one thing
 * worse than losing a suggestion is applying a stale one. Asking again is one
 * sentence; an unwanted write is not undoable.
 *
 * Returns `null` when there was nothing pending — no sentence for a
 * non-event.
 */
export function supersededNotice(stillPendingCount: number): string | null {
  if (stillPendingCount <= 0) return null
  return `The ${suggestionCount(stillPendingCount)} from before ${stillPendingCount === 1 ? 'is' : 'are'} gone — this new reply replaced ${stillPendingCount === 1 ? 'it' : 'them'}. Nothing was changed. Ask again if you still want ${stillPendingCount === 1 ? 'it' : 'them'}.`
}

/**
 * (b) A card proposed on one child's tab must never become confirmable on
 * another's, and a card from one conversation must never apply inside the
 * next. Both were previously left on screen: `clearPending` existed but was
 * called from nowhere, so the only thing standing between a stale card and a
 * write was `rejectReason` returning `'child mismatch with active context'` —
 * correct, and completely silent. The button did nothing and said nothing.
 *
 * Cleared, with a sentence. `childName` is the child the cards were proposed
 * FOR (read before the switch lands); it is optional because an unresolved
 * name must drop the possessive rather than invent one (UX-34's rule).
 */
export function pendingDropNotice(
  reason: Exclude<PendingDropReason, typeof PendingDropReason.Superseded>,
  stillPendingCount: number,
  childName?: string,
): string | null {
  if (stillPendingCount <= 0) return null
  const what = suggestionCount(stillPendingCount)
  if (reason === PendingDropReason.ContextSwitch) {
    const whose = childName ? `for ${childName}` : 'for the tab you were on'
    return `The ${what} ${whose} ${stillPendingCount === 1 ? 'is' : 'are'} gone — switching tabs cleared ${stillPendingCount === 1 ? 'it' : 'them'}, because a card can only be confirmed where it was proposed. Nothing was changed.`
  }
  return `The ${what} from the last conversation ${stillPendingCount === 1 ? 'is' : 'are'} gone — a card can only be confirmed in the conversation it was proposed in. Nothing was changed.`
}

/**
 * (c) A confirmed write that rejects. `applyChatAction`'s `finally` already
 * reverted the card to `'pending'` so a retry was possible, but the rejection
 * propagated out of an `onClick` that discards it: the parent saw the button
 * come back and had no way to know whether that was a failure or a misfire.
 *
 * UX-83's shape, in the card's own voice: what failed, that nothing was lost,
 * what to do. Shown on the card itself rather than as a page-level notice,
 * because in a multi-card turn only one of them failed.
 */
export function confirmFailureNotice(): string {
  return "That didn't save — nothing was changed. Tap Confirm to try again."
}
