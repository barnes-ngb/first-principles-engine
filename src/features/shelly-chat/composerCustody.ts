// The Ask AI composer's unsent work, across the one route unmount the planner's
// refusal link causes (UX-273). Page-session memory: no URL, no storage, no
// Firestore, no transcript — one slot, one owner, read once.
//
// Three rules the second browser run proved are load-bearing:
//  - a save NEVER clears another owner's entry (StrictMode's simulated unmount
//    ran a save with an empty, not-yet-settled draft and wiped the real one);
//  - a draft is labelled with the owner it was EDITED under, never the latest
//    identity, so a scope change while mounted cannot re-label her work;
//  - an entry that cannot be acted on is PEEKED, never consumed and dropped.
//
// And a fourth, from the acceptance closeout: work carries the SIGN-IN it was
// typed under, and a save under a sign-in that has ended is refused — because a
// logout is itself the unmount that hands the draft over, so ordering alone
// cannot make that safe (see {@link endComposerCustodySession}).

import type { ChatAttachment, ImageFlowStep, RefinementQuestion } from './useShellyChatState'

/**
 * Everything unsent the composer holds — all of it, not the three fields the
 * first cut called "everything": the raw file chooser and its previews, the
 * upload dialog, and the image-refinement form all survive the round trip too.
 * `loadingQuestions` is deliberately absent: a request that is no longer in
 * flight must not be restored as if it were.
 */
export interface ComposerDraft {
  text: string
  attachments: ChatAttachment[]
  referenceImage: ChatAttachment | null
  uploadFiles: File[]
  uploadPreviews: string[]
  uploadDialogOpen: boolean
  imageFlowOpen: boolean
  imageFlowStep: ImageFlowStep
  imageIdea: string
  imageQuestions: RefinementQuestion[]
  imageAnswers: Record<number, string>
}

export const EMPTY_COMPOSER_DRAFT: ComposerDraft = {
  text: '',
  attachments: [],
  referenceImage: null,
  uploadFiles: [],
  uploadPreviews: [],
  uploadDialogOpen: false,
  imageFlowOpen: false,
  imageFlowStep: 'idea',
  imageIdea: '',
  imageQuestions: [],
  imageAnswers: {},
}

/** Who the draft belongs to. The thread is tracked beside it, not inside it. */
export interface ComposerCustodyOwner {
  familyId: string
  profile: string | null
  chatContext: string
  /** The child the tab maps to — `''` when it maps to none. */
  contextChildId: string
}

/** A courtesy bound on page-session memory, not a durability promise. */
export const COMPOSER_CUSTODY_TTL_MS = 10 * 60_000

export type ComposerCustodyLook =
  | { kind: 'none' }
  /** Typed in this very place — hand it straight back. */
  | { kind: 'same-thread'; draft: ComposerDraft }
  /** Typed in another conversation of the same tab — offer it, never place it. */
  | { kind: 'other-thread'; draft: ComposerDraft }

interface HeldCustody {
  owner: ComposerCustodyOwner
  threadId: string | null
  draft: ComposerDraft
  savedAt: number
  /** The sign-in this work was done under. See {@link endComposerCustodySession}. */
  session: number
}

let held: HeldCustody | null = null

// ── The session: whose sign-in this slot belongs to ─────────────────────────
//
// An owner (family / profile / tab / tab's child) is not enough to make a
// logout safe. The composer hands its unsent work over in its UNMOUNT cleanup,
// and a logout is exactly an unmount — so the save and the invalidation race,
// and a save that lands afterwards would re-fill a slot the ending session had
// just emptied. The same shape covers a callback that outlives the route.
//
// So the work is stamped with the sign-in it was done under, the stamp is taken
// once (when the draft's owner is stamped, never re-taken), and a save under a
// session that is over is REFUSED rather than written.

let session = 1

/** The sign-in work saved right now would belong to. */
export function currentComposerCustodySession(): number {
  return session
}

/**
 * End the current sign-in: empty the slot AND refuse anything still to come
 * from it.
 *
 * Called only by the scope observer, for an identity that has gone away
 * (logout, profile exit, an authority downgraded). An ordinary scope change
 * inside one sign-in uses {@link clearComposerCustody} instead, because her
 * still-mounted composer must keep being able to save its own work.
 */
export function endComposerCustodySession(): void {
  session += 1
  held = null
}

export function composerDraftIsEmpty(draft: ComposerDraft): boolean {
  return (
    draft.text.trim() === '' &&
    draft.attachments.length === 0 &&
    draft.referenceImage === null &&
    draft.uploadFiles.length === 0 &&
    draft.uploadPreviews.length === 0 &&
    !draft.uploadDialogOpen &&
    !draft.imageFlowOpen &&
    draft.imageIdea.trim() === '' &&
    draft.imageQuestions.length === 0 &&
    Object.keys(draft.imageAnswers).length === 0
  )
}

export function sameComposerOwner(a: ComposerCustodyOwner, b: ComposerCustodyOwner): boolean {
  return (
    a.familyId === b.familyId &&
    a.profile === b.profile &&
    a.chatContext === b.chatContext &&
    a.contextChildId === b.contextChildId
  )
}

function copy(draft: ComposerDraft): ComposerDraft {
  return {
    ...draft,
    attachments: [...draft.attachments],
    uploadFiles: [...draft.uploadFiles],
    uploadPreviews: [...draft.uploadPreviews],
    imageQuestions: [...draft.imageQuestions],
    imageAnswers: { ...draft.imageAnswers },
  }
}

/**
 * Hand unsent work to custody on the way out, labelled with the owner it was
 * made under.
 *
 * An empty draft clears ONLY this owner's own entry: a pass that runs before the
 * tab has settled (or a StrictMode replay) must not wipe a draft it cannot see.
 */
export function saveComposerCustody(
  owner: ComposerCustodyOwner,
  threadId: string | null,
  draft: ComposerDraft,
  now: number = Date.now(),
  ownedSession: number = session,
): void {
  // The sign-in this work was done under is over: its unmount cleanup, or a
  // callback that outlived the route, must not re-fill a slot the ending
  // session emptied. Omitted means "this one", so an ordinary save is unchanged.
  if (ownedSession !== session) return
  if (composerDraftIsEmpty(draft)) {
    if (held && sameComposerOwner(held.owner, owner) && held.threadId === threadId) held = null
    return
  }
  held = { owner, threadId, draft: copy(draft), savedAt: now, session: ownedSession }
}

/** What is waiting for this caller, without consuming it. */
export function peekComposerCustody(
  owner: ComposerCustodyOwner,
  threadId: string | null,
  now: number = Date.now(),
): ComposerCustodyLook {
  if (!held) return { kind: 'none' }
  // Belt for the same boundary, read-side: an entry from a sign-in that is over
  // is never handed to the next one.
  if (held.session !== session) {
    held = null
    return { kind: 'none' }
  }
  if (now - held.savedAt > COMPOSER_CUSTODY_TTL_MS) {
    held = null
    return { kind: 'none' }
  }
  if (!sameComposerOwner(held.owner, owner)) return { kind: 'none' }
  return held.threadId === threadId
    ? { kind: 'same-thread', draft: copy(held.draft) }
    : { kind: 'other-thread', draft: copy(held.draft) }
}

/**
 * Read and empty the slot, if and only if it belongs to this caller.
 *
 * `acceptOtherThread` is opt-in: a caller that cannot yet SHOW a cross-thread
 * draft must leave it where it is rather than consuming and dropping it.
 */
export function takeComposerCustody(
  owner: ComposerCustodyOwner,
  threadId: string | null,
  options: { acceptOtherThread?: boolean } = {},
  now: number = Date.now(),
): ComposerCustodyLook {
  const look = peekComposerCustody(owner, threadId, now)
  if (look.kind === 'none') return look
  if (look.kind === 'other-thread' && !options.acceptOtherThread) return look
  held = null
  return look
}

/** Drop whatever is held. The scope observer and test isolation use this. */
export function clearComposerCustody(): void {
  held = null
}
