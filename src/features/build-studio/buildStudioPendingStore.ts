/**
 * The one place work that did not land is kept across a remount — a Save that
 * failed, and words nobody has written down yet (LOCAL-BUILD-001/002).
 *
 * ── Why it exists ────────────────────────────────────────────────────────
 *
 * Verification found a real loss: two failed commits, a visible *Try again*,
 * then a tap on *Today* — and on coming back there was no retry, because the
 * editor had unmounted and the exact payload lived in its React state. The
 * departure guard now holds that navigation and makes the choice explicit, but
 * a parent or child may still choose to leave, a profile may change, and React
 * may remount. So the payload is kept HERE, in memory, for its owner.
 *
 * ── What it is, and what it deliberately is not ─────────────────────────
 *
 * A module-level map, so it lives for the page session and nothing longer. It
 * is **not** a new store: nothing is persisted, no collection, no Storage, no
 * `localStorage`. A reload loses it, which is honest and is exactly why
 * `beforeunload` still warns.
 *
 * ── Strictly owner-bound ────────────────────────────────────────────────
 *
 * Keyed by family + child + project — the owner the work was created under,
 * never the live active child. So:
 *
 *   • a sibling's editor cannot see it, because its key is a different key;
 *   • returning to the SAME child offers it back;
 *   • it holds the exact bytes and the exact `versionId`, so the retry is the
 *     same action and the immutable writer's create-or-same-payload rule makes
 *     it idempotent rather than a second version.
 */

import type { PendingNote, PendingSave } from './buildStudioScope'

/** The owner a held payload belongs to. Not the live child — the work's own. */
export interface PendingOwner {
  familyId: string
  childId: string
  projectId: string
}

const ownerKey = (owner: PendingOwner): string =>
  [owner.familyId, owner.childId, owner.projectId].join('\u0000')

/** One payload per owner. A newer unfinished Save replaces an older one. */
const held = new Map<string, PendingSave>()

/**
 * The order each save action was first offered, per owner.
 *
 * The STORE is the authority on "which of these two is newer", and it does not
 * infer it from a timestamp: two actions can share a millisecond, and a tie
 * decided the wrong way is an older payload overwriting a newer one's recovery
 * slot — the exact defect this is for. Offer order is observed, not guessed.
 */
const offered = new Map<string, Map<string, number>>()
let offerSeq = 0

/**
 * Record (once) when an action id was first offered to a slot, and answer with
 * that order. Shared by both slots below, off ONE counter, so "which of these
 * is newer" has a single authority.
 */
function observeOffer(
  bucket: Map<string, Map<string, number>>,
  key: string,
  actionId: string,
): number {
  const own = bucket.get(key) ?? new Map<string, number>()
  if (!own.has(actionId)) {
    offerSeq += 1
    own.set(actionId, offerSeq)
  }
  bucket.set(key, own)
  return own.get(actionId) as number
}

/**
 * May this payload take the slot?
 *
 * The rule, in one place, because the store and the editor's own React state
 * must agree about it. Exported so both read the same answer.
 *
 * Yes when the slot is empty, when it already holds THIS save action, or when
 * what it holds is older. No when it holds a NEWER save — which is the
 * interleaving that went wrong: A fails and is held, the child leaves and comes
 * back, B is captured and held, and A's retry then overwrote B's recovery slot
 * with older bytes.
 *
 * Ordered by `createdAt`, the save action's own stamp (UTC ISO, so string order
 * is chronological). This is the **display** rule, used for what the screen
 * shows; the store below additionally observes real offer order, so a
 * same-millisecond tie cannot let an older payload take a newer one's slot.
 */
export function pendingSlotAccepts(
  slot: PendingSave | null | undefined,
  payload: PendingSave,
): boolean {
  if (!slot) return true
  if (slot.versionId === payload.versionId) return true
  return slot.createdAt <= payload.createdAt
}

/**
 * Keep this owner's unfinished Save.
 *
 * Returns whether it took the slot, so a caller can tell the difference
 * between "held" and "a newer save owns the recovery slot".
 */
export function holdPendingSave(owner: PendingOwner, payload: PendingSave): boolean {
  // The payload carries its own scope, and that scope's owner must be the key
  // it is filed under — otherwise a retry could be offered to the wrong child.
  if (
    payload.scope.familyId !== owner.familyId ||
    payload.scope.childId !== owner.childId ||
    payload.scope.projectId !== owner.projectId
  ) {
    return false
  }
  const key = ownerKey(owner)
  const mine = observeOffer(offered, key, payload.versionId)
  const slot = held.get(key)
  if (slot && slot.versionId !== payload.versionId) {
    // BOTH halves, and both are needed. The stamp rule catches a payload the
    // store has never seen — a retry arriving first would otherwise take the
    // next sequence number and look newer by order alone. The observed order
    // catches a shared timestamp, which the stamp rule reads as a tie.
    if (!pendingSlotAccepts(slot, payload)) return false
    const theirs = offered.get(key)?.get(slot.versionId) ?? 0
    if (theirs > mine) return false
  }
  held.set(key, payload)
  return true
}

/** This owner's unfinished Save, if there is one. */
export function readPendingSave(owner: PendingOwner): PendingSave | null {
  return held.get(ownerKey(owner)) ?? null
}

/**
 * Forget ONE save action's payload — the one that landed, or the one a person
 * discarded.
 *
 * `versionId` is required and is the whole point: an owner-only clear let an
 * old save's acknowledgment wipe a NEWER save's recovery slot. A save may
 * finish its own version; it may never clear another's.
 */
export function clearPendingSave(owner: PendingOwner, versionId: string): void {
  const key = ownerKey(owner)
  const slot = held.get(key)
  if (!slot || slot.versionId !== versionId) return
  held.delete(key)
}

// ── Words that have not been written down ───────────────────────────────────
//
// The same primitive, for the one thing in this feature that genuinely cannot
// be read again. A game can always be captured from the editor once more; a
// sentence a child said once cannot. Verification found accepted words, an edit
// to them, a tap on *Today* — and nothing left, with no warning.
//
// So an accepted draft lives HERE for its owner as well as in the component's
// state: leaving and coming back offers the exact words back, and only an
// explicit *Save my words* writes anything down. Memory only, same as above —
// a reload loses it, which is honest, and is why the departure guard still
// treats unsaved words as work at risk rather than relying on this.

/** One set of words per owner. The newest offered words own the slot. */
const heldNotes = new Map<string, PendingNote>()
const noteOffers = new Map<string, Map<string, number>>()

/**
 * Keep this owner's unsaved words.
 *
 * Returns whether they took the slot. Refused when the payload's own target
 * names a different owner — words must never be offered back to another child —
 * and when the slot already holds a NEWER save action's words, by observed
 * offer order, the same rule the payload slot uses.
 *
 * The SAME action's words may always replace their own entry: a typed
 * correction is still that action's words, and the newest wording is what the
 * person is looking at.
 */
export function holdPendingNote(owner: PendingOwner, payload: PendingNote): boolean {
  if (
    payload.target.familyId !== owner.familyId ||
    payload.target.childId !== owner.childId ||
    payload.target.projectId !== owner.projectId
  ) {
    return false
  }
  const key = ownerKey(owner)
  const mine = observeOffer(noteOffers, key, payload.target.noteActionId)
  const slot = heldNotes.get(key)
  if (slot && slot.target.noteActionId !== payload.target.noteActionId) {
    const theirs = noteOffers.get(key)?.get(slot.target.noteActionId) ?? 0
    if (theirs > mine) return false
  }
  heldNotes.set(key, payload)
  return true
}

/** This owner's unsaved words, if there are any. */
export function readPendingNote(owner: PendingOwner): PendingNote | null {
  return heldNotes.get(ownerKey(owner)) ?? null
}

/**
 * Forget ONE note action's words — the ones that were filed, or the ones a
 * person deliberately discarded.
 *
 * `noteActionId` is required for the reason it is required above: a late
 * acknowledgment of an older set of words may finish its own action and may
 * never clear a newer one's slot.
 */
export function clearPendingNote(owner: PendingOwner, noteActionId: string): void {
  const key = ownerKey(owner)
  const slot = heldNotes.get(key)
  if (!slot || slot.target.noteActionId !== noteActionId) return
  heldNotes.delete(key)
}

/** Test seam: drop everything, both slots. Never called by the app. */
export function resetPendingSaveStore(): void {
  held.clear()
  offered.clear()
  heldNotes.clear()
  noteOffers.clear()
}
