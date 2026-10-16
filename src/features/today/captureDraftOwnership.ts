/**
 * Capture draft ownership — may this finished save clear the form it was
 * started from, and what does its receipt say (G1/G2)?
 *
 * Every save on the capture card is asynchronous and `resetForm` used to run on
 * completion unconditionally. A 19-minute note written for day A, landing a few
 * seconds later, therefore erased the 41-minute note already typed for day B —
 * and said *"Captured + 19 min logged"* over the top of it, so the erased draft
 * read as saved when nothing had written it. The `FIX-262` latch makes that one
 * save at a time; it does not make the form that save came from still be there.
 *
 * The rule is identity, not comparison. Two numbers travel with a claimed save:
 *
 *   • `visit` — bumped whenever the editor re-points at another family, child or
 *     day. An epoch rather than the scope itself, so day A → day B → day A is a
 *     NEW visit: the person has been somewhere else, and what is on screen is no
 *     longer the thing they submitted.
 *   • `revision` — bumped on every edit to the draft, including media staged
 *     inside the photo and audio surfaces. A counter rather than a text diff, so
 *     typing a word away and back counts as a new draft, which is what it is.
 *
 * A completion clears the form only when BOTH still match. Anything else keeps
 * every field and says so — this module owns that wording too, so the receipt
 * and the rule cannot disagree about which capture was saved.
 *
 * Pure: no React, no clock, no store. The card holds the two counters.
 */

/** The editor's identity at the moment a save claimed the latch. */
export interface CaptureDraftClaim {
  visit: number
  revision: number
  /**
   * Whose capture the write was addressed to, and the day it was written to
   * (`YYYY-MM-DD`). For the receipt only — never part of the rule, which is the
   * two counters. A scope that changed and changed back is a new visit, so
   * comparing these would answer the wrong question.
   */
  childName: string
  day: string
}

/** The editor's identity now, read at completion. */
export interface CaptureDraftState {
  visit: number
  revision: number
}

export type CaptureDraftVerdict =
  /** The submitted draft is still the draft on screen: it may be cleared. */
  | 'owned'
  /** Same visit, edited since: the edits stay. */
  | 'draft-changed'
  /** The editor moved to another family, child or day since (or went and came back). */
  | 'scope-changed'

export function classifyDraftClaim(
  claim: CaptureDraftClaim,
  current: CaptureDraftState,
): CaptureDraftVerdict {
  // Scope first: it is the bigger statement about where the person is, and is
  // reported as such even when the draft was also edited.
  if (claim.visit !== current.visit) return 'scope-changed'
  if (claim.revision !== current.revision) return 'draft-changed'
  return 'owned'
}

/**
 * A receipt for a save that fully succeeded. The `owned` case is the sentence
 * this card always showed, byte for byte. The other two name the capture that
 * actually saved, so *"Captured"* can never be read as a claim about the draft
 * still on screen.
 *
 * `base` carries no trailing full stop (*"Captured + 45 min logged"*).
 */
export function captureSuccessText(
  base: string,
  verdict: CaptureDraftVerdict,
  claim: CaptureDraftClaim,
): string {
  switch (verdict) {
    case 'owned':
      return base
    case 'draft-changed':
      return `${base} — that earlier capture saved. Your newer edits are still here, not saved yet.`
    case 'scope-changed':
      return `${base} — saved for ${claim.childName} on ${claim.day}. What is on screen now is untouched.`
  }
}

/**
 * A receipt for a completion that did NOT fully succeed — hours that failed on
 * their own, or evidence saved with the hours refused. Separate from
 * `captureSuccessText` because that wording says *"that earlier capture saved"*,
 * which over a failure claims a write that did not happen: here the suffix only
 * says WHICH attempt the message is about, and `base` keeps the whole verdict.
 *
 * `base` carries no trailing full stop, as the success bases do.
 */
export function captureUnsavedText(
  base: string,
  verdict: CaptureDraftVerdict,
  claim: CaptureDraftClaim,
): string {
  switch (verdict) {
    case 'owned':
      return base
    case 'draft-changed':
      return `${base} — that was the capture you submitted earlier; your newer edits are still here.`
    case 'scope-changed':
      return `${base} — that was ${claim.childName}'s capture for ${claim.day}; what is on screen now is untouched.`
  }
}

/**
 * A receipt for a save that threw. Same reason as above: an error landing after
 * the editor moved on must say which capture failed, or it reads as a verdict on
 * the draft in front of the parent — and no failure path clears a field, so the
 * current draft is always still there.
 *
 * `base` is a whole sentence ending in a full stop (*"Photo upload failed."*).
 */
export function captureErrorText(
  base: string,
  verdict: CaptureDraftVerdict,
  claim: CaptureDraftClaim,
): string {
  switch (verdict) {
    case 'owned':
      return base
    case 'draft-changed':
      return `${base} That was the capture you submitted earlier; your newer edits are still here.`
    case 'scope-changed':
      return `${base} That was ${claim.childName}'s capture for ${claim.day}; what is on screen now is untouched.`
  }
}
