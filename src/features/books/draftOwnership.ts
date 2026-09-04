/**
 * Whose draft is this, and what happens when someone taps it — UX-108,
 * FEAT-188.
 *
 * Since FEAT-173 the active profile IS the context for the Generate chat: the
 * practice words, the `childId` the server sizes the reading level from, and
 * every line the chat says all follow the child active in the header. That
 * rule was right and is unchanged here.
 *
 * What it was missing is the resume door. A **parent** shelf lists every
 * child's books (`useBookshelf(…, isParent)` loads them all), so a dashed
 * "Continue making this story →" card can be London's while Lincoln is the
 * active child. Tapping it reopened the chat under Lincoln — Lincoln's words,
 * Lincoln's level — and wrote the result into London's book, because
 * `persistStory` spreads the stored doc and keeps its original `childId`.
 * Silently. Nothing on the card said whose draft it was.
 *
 * The owner decided (2026-09-04) that the answer is not a refusal but a
 * **switch**: the card names its child, and resuming a draft for a different
 * child first flips the header to that child — the app's own switch, the one
 * the header pill uses — and then resumes. One tap, no dead end, and the
 * chat's reads and writes follow the header exactly as they do everywhere
 * else. FEAT-173 stands: there is still no second child picker inside the
 * chat, and nothing is inferred from the prose.
 *
 * Two cases are not a switch:
 *   - **A kid profile cannot switch.** `useActiveChild().setActiveChildId` is
 *     a no-op for Lincoln/London by design, so a "switch" there would be a
 *     silent write for the wrong child — the exact bug. A kid shelf only
 *     lists that kid's own books, so this should not arise; it is refused
 *     rather than trusted to be unreachable.
 *   - **An unknown child** (a deleted profile, a legacy id) has nothing to
 *     switch to. The card says so and does not open.
 *
 * Pure: no React, no Firestore, never throws.
 */

/** What the shelf is looking at when it looks at a draft. */
export const DraftOwner = {
  /** The draft belongs to the child already active in the header. */
  Active: 'active',
  /** The draft belongs to a different child in the family. */
  Other: 'other',
  /** The draft's `childId` matches no current child. */
  Unknown: 'unknown',
} as const
export type DraftOwner = (typeof DraftOwner)[keyof typeof DraftOwner]

export interface DraftOwnership {
  kind: DraftOwner
  /** The draft's own `childId`, exactly as stored (`''` when it holds none). */
  childId: string
  /** The owner's name — `undefined` for `Unknown`, which has no child to name. */
  childName?: string
}

/** The minimum a child has to be for this module to name and match them. */
export interface NamedChild {
  id: string
  name: string
}

/**
 * Who the draft is for, relative to the child currently active.
 *
 * Resolved through the family's `children`, never a name literal: a book
 * stores a `childId` and the name is looked up. A book with no `childId`, or
 * one naming a child the family no longer has, is `Unknown` — never silently
 * treated as the active child's.
 */
export function resolveDraftOwnership(
  book: { childId?: string },
  activeChildId: string,
  children: ReadonlyArray<NamedChild>,
): DraftOwnership {
  const childId = book.childId ?? ''
  const match = children.find((c) => c.id === childId)
  if (!match) return { kind: DraftOwner.Unknown, childId }
  return {
    kind: childId === activeChildId ? DraftOwner.Active : DraftOwner.Other,
    childId,
    childName: match.name,
  }
}

/**
 * The line on the card that says whose draft it is — *"London's draft"*.
 * `null` when there is no child to name; the blocked line below covers that
 * case instead, so the card is never silent about it.
 */
export function draftOwnerLabel(ownership: DraftOwnership): string | null {
  if (!ownership.childName) return null
  return `${ownership.childName}'s draft`
}

/**
 * What a parent is told when a draft names a child the family no longer has.
 * Parent-facing (this only renders on a parent shelf), so it is a full
 * sentence rather than kid copy.
 */
export const UNKNOWN_DRAFT_OWNER_LINE =
  "This draft is for a child who isn't in the family any more, so it can't be opened."

/**
 * The same refusal in kid words, held to the shared kid readability bar
 * (`src/test/kidReadability.ts`). A kid shelf lists only that kid's own books,
 * so this is the belt to the parent-only switch path's braces.
 */
export const OTHER_CHILD_DRAFT_KID_LINE = "This story is someone else's. Ask a grown-up."

export interface DraftResumePlan {
  /** Whether tapping the card opens the Generate chat at all. */
  canResume: boolean
  /**
   * The child to make active **before** the chat mounts, or `null` when the
   * header is already on the right child. `useBookGenerateChat` reads the
   * child on mount, so the order is load-bearing, not cosmetic.
   */
  switchToChildId: string | null
  /** The one line the card shows instead of opening; `null` when it opens. */
  blockedLine: string | null
}

/**
 * The whole resume decision in one place: switch-then-resume for a parent on
 * another child's draft, straight through for their own, and a stated refusal
 * for the two cases that have no honest switch.
 */
export function planDraftResume(
  ownership: DraftOwnership,
  opts: { isChildProfile: boolean },
): DraftResumePlan {
  if (ownership.kind === DraftOwner.Unknown) {
    return { canResume: false, switchToChildId: null, blockedLine: UNKNOWN_DRAFT_OWNER_LINE }
  }
  if (ownership.kind === DraftOwner.Active) {
    return { canResume: true, switchToChildId: null, blockedLine: null }
  }
  // Another child's draft. A parent switches to them; a kid cannot switch at
  // all, so for a kid this is a refusal, never a write under their own name.
  if (opts.isChildProfile) {
    return {
      canResume: false,
      switchToChildId: null,
      blockedLine: OTHER_CHILD_DRAFT_KID_LINE,
    }
  }
  return { canResume: true, switchToChildId: ownership.childId, blockedLine: null }
}
