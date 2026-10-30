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
}

let held: HeldCustody | null = null

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
): void {
  if (composerDraftIsEmpty(draft)) {
    if (held && sameComposerOwner(held.owner, owner) && held.threadId === threadId) held = null
    return
  }
  held = { owner, threadId, draft: copy(draft), savedAt: now }
}

/** What is waiting for this caller, without consuming it. */
export function peekComposerCustody(
  owner: ComposerCustodyOwner,
  threadId: string | null,
  now: number = Date.now(),
): ComposerCustodyLook {
  if (!held) return { kind: 'none' }
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
