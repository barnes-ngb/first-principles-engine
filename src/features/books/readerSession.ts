import type { Book } from '../../core/types'

/**
 * WHOSE a reading session's records are, and WHEN one session becomes another.
 *
 * A reading session is the `useCreativeTimer` shape (`UX-327`) rather than the
 * `book.childId` shape the reader was written with: the records written on the
 * way out are a claim about a CHILD who read, not about a document that was
 * opened. The two came apart the moment a child's shelf started showing
 * **Together / contributor** books a sibling owns (`readChildShelf` unions
 * `childId == me` with `contributorIds array-contains me`): Lincoln opens a book
 * London owns, and every exit record — the `hours` entry, the `BOOK_READ` XP,
 * the diamonds and the Share artifact's `childId` — went to London, while the
 * artifact's own words said Lincoln read it. One record, two halves naming
 * different children.
 *
 * ── Why a LIFECYCLE and not a single capture ────────────────────────────────
 *
 * Reading the live identity at the write is the `UX-327` defect itself — minutes
 * credited to whoever is selected when the clock stops. Capturing once per mount
 * is the opposite mistake and just as wrong: this host stays mounted across a
 * route-parameter move to another book, across a family change and across a
 * locked-profile change, and a capture that can never move turns all of those
 * into a session that is finalised against a document it no longer describes —
 * so BOTH reads are lost.
 *
 * So the unit is the **committed scope**: a family, a book document and a
 * reader. While that scope holds, the session holds — its clock, its pages, its
 * completion, its audience. When a DIFFERENT scope is committed, the original
 * session is finalised against its own snapshot and a replacement session
 * begins with its own authority, its own clock and none of the first one's
 * state. `id` is monotonic, so `A → B → A` is a third session and an obsolete
 * callback from the first can be told apart from the one now on screen.
 *
 * A scope that merely becomes UNRESOLVABLE — the replacement book has not
 * landed yet, a children read is in flight again — is not a new scope and ends
 * nothing: there is nothing to attribute a change to yet, and the honest answer
 * is to keep the session that is running. That is also why nothing here resets a
 * clock because data settled.
 *
 * Parent profiles keep the legacy book-owner semantics unchanged: FEAT-95's
 * question — whether a parent reading ALOUD is a participant whose own record
 * this is — is deferred, and a deferred question is not answered by quietly
 * applying the child-profile policy to it. A parent's session therefore does not
 * depend on the child list at all: the book owner is already known from the
 * document, and making a known owner wait on an unrelated read is how the
 * parent's own reading stopped being recorded.
 */

/** Which rule produced a session's reader. */
export const ReaderOwnership = {
  /**
   * A locked child profile is reading (`useActiveChild.isChildProfile`, the
   * FEAT-183 capability key — never a literal name). The records are the
   * reader's own, even on a sibling-owned contributor book.
   */
  ChildReader: 'child-reader',
  /**
   * Legacy, and unchanged: the book's own `childId`. A parent profile has no
   * single child it is reading AS, so the book stays the owner of the record and
   * the label stays the one the screen already shows.
   */
  BookOwner: 'book-owner',
} as const
export type ReaderOwnership = (typeof ReaderOwnership)[keyof typeof ReaderOwnership]

/** The identity half of a session: who it is for, and on which document. */
export interface ReaderSessionIdentity {
  readonly familyId: string
  readonly bookId: string
  /** The child every record of this session is addressed to. */
  readonly readerChildId: string
  /**
   * The name the Share artifact's words use, frozen with a CHILD reader's
   * identity. Empty for a book-owner session, whose label is the legacy live one
   * — see `readerSessionLabel`.
   */
  readonly readerName: string
  readonly ownership: ReaderOwnership
}

/** One committed session: an identity, plus which incarnation of it this is. */
export interface ReaderSession extends ReaderSessionIdentity {
  /** Monotonic within one mounted reader, and never reused. */
  readonly id: number
  /** The committed scope. Two sessions with the same key are the same scope. */
  readonly key: string
}

/**
 * The committed scope, as a string.
 *
 * Family, document and reader — the three things a change of which makes the
 * next read a different read. A parent's selected child is deliberately absent:
 * it is not part of a book-owner session's scope, so moving the header chip must
 * not end a parent's reading session (nor start a new one).
 */
export function readerSessionKey(identity: ReaderSessionIdentity): string {
  return `${identity.familyId}|${identity.bookId}|${identity.ownership}|${identity.readerChildId}`
}

/** This render's answers to the questions a reader identity needs. */
export interface ReaderIdentityInputs {
  readonly familyId: string
  /** The loaded book document, or `null`/`undefined` while it has not landed. */
  readonly book: Pick<Book, 'id' | 'childId'> | null | undefined
  /** A locked child profile is reading (`useActiveChild.isChildProfile`). */
  readonly isChildProfile: boolean
  readonly activeChildId: string
  readonly activeChildName: string
  /** The children read has ANSWERED, with children. */
  readonly identitySettled: boolean
  /** The children read FAILED — an answer, but not an identity (`UX-344`). */
  readonly identityFailed: boolean
}

/**
 * The identity a session would be committed for, or `null` when there is
 * nothing honest to commit yet.
 *
 * `null` is a refusal, never a default, and it applies to the CHILD lane only:
 * a locked profile whose child has not settled — or whose read FAILED, which is
 * not an affirmative empty result — resolves to nothing at all and writes
 * nothing, rather than falling back to the book owner's id, who on a contributor
 * book is the sibling. A parent is not gated on that read, because a parent's
 * owner is the document's own field and is already known.
 */
export function resolveReaderSession(
  inputs: ReaderIdentityInputs,
): ReaderSessionIdentity | null {
  const { familyId, book } = inputs
  if (!familyId || !book?.id) return null

  if (inputs.isChildProfile) {
    if (!inputs.identitySettled || inputs.identityFailed) return null
    if (!inputs.activeChildId) return null
    return {
      familyId,
      bookId: book.id,
      readerChildId: inputs.activeChildId,
      readerName: inputs.activeChildName,
      ownership: ReaderOwnership.ChildReader,
    }
  }

  if (!book.childId) return null
  return {
    familyId,
    bookId: book.id,
    readerChildId: book.childId,
    readerName: '',
    ownership: ReaderOwnership.BookOwner,
  }
}

/** The next incarnation of a scope. Ids are monotonic and never reused. */
export function nextReaderSession(
  previousId: number,
  identity: ReaderSessionIdentity,
): ReaderSession {
  return { ...identity, id: previousId + 1, key: readerSessionKey(identity) }
}

/**
 * Does the document on screen belong to this session?
 *
 * Asked when the session's own snapshot is taken, so that a render showing a
 * REPLACEMENT document cannot overwrite the facts the original session will be
 * finalised against. A latest-document ref is not a session snapshot.
 */
export function readerSessionCovers(
  session: ReaderSession | null,
  familyId: string,
  book: Pick<Book, 'id'> | null | undefined,
): boolean {
  if (!session || !book?.id) return false
  return session.familyId === familyId && session.bookId === book.id
}

/**
 * The name a session's Share artifact uses.
 *
 * A child reader's name is frozen with the identity — it is the reader's own,
 * and the id and the words must name one child. A book-owner session keeps the
 * legacy label: the live name the screen was showing, which is the deferred
 * FEAT-95 behaviour and not something this task answers.
 */
export function readerSessionLabel(
  session: ReaderSessionIdentity,
  legacyActiveChildName: string,
): string {
  return session.ownership === ReaderOwnership.ChildReader
    ? session.readerName
    : legacyActiveChildName
}
