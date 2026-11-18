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

/**
 * ONE unresolved note per owner, and a newer one may NOT take the slot.
 *
 * This is the one place the words rule differs from the game rule above, and
 * the difference is real. Two captures of a game are two versions of the same
 * thing, so the newest supersedes the older and the older can be captured
 * again. Two notes are two different sentences about two different saves —
 * neither supersedes anything, and a lost one cannot be said again. Verification
 * walked straight into it: A held, leave, return, B said, leave — and B took
 * the only slot, so A's retry was gone without anybody discarding it.
 *
 * So the slot is first-come, and only a resolution frees it: the write landing,
 * or a person deliberately discarding. The editor reads the same answer and
 * does not offer the mic again until then, which is why that is not a trap.
 */
const heldNotes = new Map<string, PendingNote>()

/**
 * ── And it is the single current answer, not a copy somebody kept ─────────
 *
 * The slot is OBSERVABLE. A mounted editor subscribes rather than mirroring it
 * into its own state, because a mirror went stale in the exact case that
 * matters: a write started, the child left, the write landed and cleared the
 * slot, and the page he came back to still showed "these words are waiting" —
 * and, worse, refused him the mic for a note that was already filed.
 *
 * ── One send at a time, per owner, and it is claimed ─────────────────────
 *
 * A send CLAIM says "this action is being written right now", survives the
 * mount that started it, and is what makes Retry and Discard conditional
 * instead of a guess from a local flag. A mount that does not hold the claim
 * does not get to say the write failed, and a person is not offered a retry of
 * something that is still running.
 *
 * ── A deliberate discard leaves a mark ──────────────────────────────────
 *
 * Discarding tombstones the action id, so a failure arriving afterwards cannot
 * put the words somebody threw away back on the page.
 */
const noteListeners = new Map<string, Set<() => void>>()
const discardedNotes = new Map<string, Set<string>>()
const sendClaims = new Map<string, { actionId: string; claimId: string }>()
let claimSeq = 0

function announceNotes(key: string): void {
  for (const listener of [...(noteListeners.get(key) ?? [])]) listener()
}

/** Watch this owner's slot. The editor renders from here, not from a copy. */
export function subscribePendingNote(owner: PendingOwner, listener: () => void): () => void {
  const key = ownerKey(owner)
  const own = noteListeners.get(key) ?? new Set<() => void>()
  own.add(listener)
  noteListeners.set(key, own)
  return () => {
    own.delete(listener)
  }
}

/** This owner's unsaved words, if there are any. A stable reference. */
export function readPendingNote(owner: PendingOwner): PendingNote | null {
  return heldNotes.get(ownerKey(owner)) ?? null
}

/** Was this exact action deliberately thrown away? Then it stays away. */
export function noteWasDiscarded(owner: PendingOwner, noteActionId: string): boolean {
  return discardedNotes.get(ownerKey(owner))?.has(noteActionId) ?? false
}

/**
 * Keep this owner's unsaved words.
 *
 * Returns whether they took the slot. Refused when the payload's own target
 * names a different owner — words must never be offered back to another child;
 * when a DIFFERENT note action is still unresolved here; and when this action
 * was deliberately discarded, so nothing can resurrect it.
 *
 * The same action's words may always replace their own entry: a typed
 * correction, an attempt count and a state change are all still that action.
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
  if (discardedNotes.get(key)?.has(payload.target.noteActionId)) return false
  const slot = heldNotes.get(key)
  if (slot && slot.target.noteActionId !== payload.target.noteActionId) return false
  if (slot === payload) return true
  heldNotes.set(key, payload)
  announceNotes(key)
  return true
}

/**
 * Claim the right to send ONE action's words.
 *
 * Returns the claim, or `null` when this owner already has a send running —
 * including one started by a mount that has gone away. Two mounts could
 * otherwise retry the same action at once, and a late failure from either could
 * contradict the other's result.
 */
export function claimNoteSend(owner: PendingOwner, noteActionId: string): string | null {
  const key = ownerKey(owner)
  if (sendClaims.has(key)) return null
  claimSeq += 1
  const claimId = `claim-${claimSeq}`
  sendClaims.set(key, { actionId: noteActionId, claimId })
  const slot = heldNotes.get(key)
  if (slot && slot.target.noteActionId === noteActionId && slot.state !== 'sending') {
    heldNotes.set(key, { ...slot, state: 'sending' })
  }
  announceNotes(key)
  return claimId
}

/** Is a write running for this owner right now, whoever started it? */
export function noteSendInFlight(owner: PendingOwner): boolean {
  return sendClaims.has(ownerKey(owner))
}

/** Give the claim up. Only the holder's own claim is released. */
export function releaseNoteSend(owner: PendingOwner, claimId: string): void {
  const key = ownerKey(owner)
  if (sendClaims.get(key)?.claimId !== claimId) return
  sendClaims.delete(key)
  announceNotes(key)
}

/**
 * Record that a claimed send came back and did not land.
 *
 * CONDITIONAL, and every condition earned one: only the live claim may report
 * a failure, only the action that claim is for, and only while the slot still
 * holds that action. An unconditional re-hold put discarded words back on the
 * page and contradicted an acknowledgment that had already arrived.
 */
export function failPendingNote(
  owner: PendingOwner,
  claimId: string,
  payload: PendingNote,
): boolean {
  const key = ownerKey(owner)
  const claim = sendClaims.get(key)
  if (!claim || claim.claimId !== claimId) return false
  if (claim.actionId !== payload.target.noteActionId) return false
  const slot = heldNotes.get(key)
  if (!slot || slot.target.noteActionId !== payload.target.noteActionId) return false
  heldNotes.set(key, { ...payload, state: 'failed' })
  announceNotes(key)
  return true
}

/**
 * Forget ONE note action's words, because they were filed.
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
  announceNotes(key)
}

/**
 * Throw ONE action's words away because a person said so — and remember that,
 * so a failure arriving later cannot bring them back.
 */
export function discardPendingNote(owner: PendingOwner, noteActionId: string): void {
  const key = ownerKey(owner)
  const marks = discardedNotes.get(key) ?? new Set<string>()
  marks.add(noteActionId)
  discardedNotes.set(key, marks)
  const slot = heldNotes.get(key)
  if (slot && slot.target.noteActionId === noteActionId) heldNotes.delete(key)
  announceNotes(key)
}

/** Test seam: drop everything, both slots. Never called by the app. */
export function resetPendingSaveStore(): void {
  held.clear()
  offered.clear()
  heldNotes.clear()
  discardedNotes.clear()
  sendClaims.clear()
}
