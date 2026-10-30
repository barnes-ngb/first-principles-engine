// ── The Ask AI composer's unsent draft, across one route unmount (UX-273) ───
//
// WHY THIS EXISTS. The planner's refusal link is a route change, so `/chat`
// unmounts and `useShellyChatState`'s `input` / `pendingAttachments` /
// `pendingReferenceImage` are discarded with it. The independent browser run
// found the consequence: a parent typing in Ask AI, going to the planner and
// tapping its refusal came back to a composer the incoming question filled
// silently — the collision choice this feature promises could never appear,
// because by then there was nothing left to collide with.
//
// WHAT IT IS, AND THE FOUR LIMITS. One module-level slot, in page-session
// memory, holding one composer's unsent contents plus the identity they were
// typed under.
//
//  1. **Not persistence.** No URL, no `localStorage`/`sessionStorage`, no
//     Firestore. A reload loses it, which is the honest promise: it survives a
//     route unmount, not a visit.
//  2. **Not a transcript store.** It holds a DRAFT — text and the attachments
//     already staged beside it — never messages, never a thread's history, and
//     never more than one of them.
//  3. **Owner-keyed, and restored in place only.** `{family, profile, tab,
//     tab's child}` must match exactly, or nothing is handed back. A draft typed
//     inside a saved conversation is returned only on a visit to that same
//     conversation; the cross-thread case is reported to the caller as such so
//     it can be OFFERED rather than quietly placed somewhere it was not typed.
//  4. **Read once, and never read by a stranger.** A take on a mismatched owner
//     leaves the slot alone (clearing someone's draft to tidy up is the loss this
//     module exists to prevent); a take on a match empties it.
//
// Attachments carry their uploaded Storage `url` (already durable) and a
// page-session `previewUrl` blob. Nothing here revokes either, so a restored
// strip shows the same thumbnails; a reload invalidates the blob, which is the
// same visit boundary the slot itself has.

import type { ChatAttachment } from './useShellyChatState'

/** Everything unsent that the composer holds. */
export interface ComposerDraft {
  text: string
  attachments: ChatAttachment[]
  referenceImage: ChatAttachment | null
}

/** Who the draft belongs to. Thread is tracked separately — see `takeComposerCustody`. */
export interface ComposerCustodyOwner {
  familyId: string
  profile: string | null
  chatContext: string
  /** The child the tab maps to — `''` when it maps to none. */
  contextChildId: string
}

/**
 * How long a held draft stays takeable.
 *
 * A courtesy bound on a page-session slot, not a durability promise: the journey
 * it exists for is one navigation and back.
 */
export const COMPOSER_CUSTODY_TTL_MS = 10 * 60_000

export type ComposerCustodyTake =
  | { kind: 'none' }
  /** Typed in this very place — hand it straight back. */
  | { kind: 'same-thread'; draft: ComposerDraft }
  /** Typed in another conversation of the same tab — offer it, do not place it. */
  | { kind: 'other-thread'; draft: ComposerDraft }

interface HeldCustody {
  owner: ComposerCustodyOwner
  threadId: string | null
  draft: ComposerDraft
  savedAt: number
}

let held: HeldCustody | null = null

export function composerDraftIsEmpty(draft: ComposerDraft): boolean {
  return draft.text.trim() === '' && draft.attachments.length === 0 && draft.referenceImage === null
}

function sameOwner(a: ComposerCustodyOwner, b: ComposerCustodyOwner): boolean {
  return (
    a.familyId === b.familyId &&
    a.profile === b.profile &&
    a.chatContext === b.chatContext &&
    a.contextChildId === b.contextChildId
  )
}

/**
 * Hand the composer's unsent contents to custody on the way out.
 *
 * An empty draft CLEARS the slot rather than storing nothing: leaving a stale
 * draft behind after she cleared the box is a reappearance she did not ask for.
 */
export function saveComposerCustody(
  owner: ComposerCustodyOwner,
  threadId: string | null,
  draft: ComposerDraft,
  now: number = Date.now(),
): void {
  if (composerDraftIsEmpty(draft)) {
    held = null
    return
  }
  held = {
    owner,
    threadId,
    draft: {
      text: draft.text,
      attachments: [...draft.attachments],
      referenceImage: draft.referenceImage,
    },
    savedAt: now,
  }
}

/** Read and empty the slot, if and only if it belongs to this caller. */
export function takeComposerCustody(
  owner: ComposerCustodyOwner,
  threadId: string | null,
  now: number = Date.now(),
): ComposerCustodyTake {
  if (!held) return { kind: 'none' }
  if (now - held.savedAt > COMPOSER_CUSTODY_TTL_MS) {
    held = null
    return { kind: 'none' }
  }
  if (!sameOwner(held.owner, owner)) return { kind: 'none' }
  const { draft, threadId: from } = held
  held = null
  return from === threadId ? { kind: 'same-thread', draft } : { kind: 'other-thread', draft }
}

/** Drop whatever is held. For a scope change, and for test isolation. */
export function clearComposerCustody(): void {
  held = null
}
