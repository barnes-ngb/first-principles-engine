import type { Book } from '../../core/types'

/**
 * WHOSE a reading session's records are — the one answer, in one place.
 *
 * A reading session is the `useCreativeTimer` shape (`UX-327`) rather than the
 * `book.childId` shape the reader was written with: the records it writes on the
 * way out are a claim about a CHILD who read, not about a document that was
 * opened. The two came apart the moment a child's shelf started showing
 * **Together / contributor** books a sibling owns (`readChildShelf` unions
 * `childId == me` with `contributorIds array-contains me`): Lincoln opens a book
 * London owns, and every record the exit wrote — the `hours` entry, the
 * `BOOK_READ` XP, the diamonds and the Share artifact's `childId` — went to
 * London, while the Share artifact's own words said Lincoln read it. One record,
 * two incompatible halves.
 *
 * The rule here is deliberately NOT "read the live active child at the write".
 * That is the `UX-327` defect in its original form — minutes credited to whoever
 * is selected when the clock stops. It is also not "read it at the first render",
 * because the child list and the book document both arrive late and an
 * unresolved identity must not be guessed from the book's owner, which is the
 * sibling this exists to stop crediting. So: the session CAPTURES its reader the
 * first time one is legitimately resolved, and the capture is immutable for the
 * life of that session — a later profile, child, family or book change cannot
 * redirect it, and `A → B → A` is the same session coming back rather than a
 * third one.
 *
 * Parent profiles keep the legacy book-owner semantics unchanged: FEAT-95's
 * question — whether a parent reading ALOUD is a participant whose own record
 * this is — is deferred, and a deferred question is not answered by quietly
 * applying the child-profile policy to it.
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
   * single child it is reading AS, so the book stays the owner of the record.
   */
  BookOwner: 'book-owner',
} as const
export type ReaderOwnership = (typeof ReaderOwnership)[keyof typeof ReaderOwnership]

/**
 * One captured reading session's identity — immutable, and the authority for
 * every record that session writes.
 *
 * It carries its own `familyId` and `bookId` rather than reading them live, so a
 * session that outlives the screen it was opened on writes to the document it
 * was opened FOR or does not write at all.
 */
export interface ReaderSessionIdentity {
  readonly familyId: string
  readonly bookId: string
  /** The child every record of this session is addressed to. */
  readonly readerChildId: string
  /** The name the Share artifact's words use. Frozen with the identity. */
  readonly readerName: string
  readonly ownership: ReaderOwnership
}

/** This render's answers to the three questions a reader identity needs. */
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
 * The reader this session would be captured for, or `null` when there is
 * nothing honest to capture yet.
 *
 * `null` is a refusal, never a default: a child profile whose child has not
 * settled — or whose read FAILED, which is not an affirmative empty result —
 * resolves to nothing at all, and the session writes nothing, rather than
 * falling back to the book owner's id. The caller captures the first non-null
 * answer and keeps it.
 */
export function resolveReaderSession(
  inputs: ReaderIdentityInputs,
): ReaderSessionIdentity | null {
  const { familyId, book } = inputs
  if (!familyId || !book?.id) return null

  if (inputs.isChildProfile) {
    // An unresolved or failed child read is not a reader. Guessing one from
    // `book.childId` here is exactly the mis-attribution this module exists for.
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

  // Parent profile — legacy, book-owned. The child read still has to have
  // ANSWERED (settled or failed), because the artifact's words read the selected
  // child's name and a name captured before the list lands would be blank where
  // the live read would have had one. A failure answers with no name, which is
  // what the live read would have said too.
  if (!inputs.identitySettled && !inputs.identityFailed) return null
  if (!book.childId) return null
  return {
    familyId,
    bookId: book.id,
    readerChildId: book.childId,
    readerName: inputs.activeChildName,
    ownership: ReaderOwnership.BookOwner,
  }
}

/**
 * Does a captured session still describe the document on screen?
 *
 * Asked at the WRITE, so a session whose host has since moved to another book or
 * another family writes nothing instead of posting its minutes against a
 * replacement document. Refusing is the only safe answer: the alternative is a
 * record with one session's reader and another book's facts.
 */
export function readerSessionMatches(
  session: ReaderSessionIdentity | null,
  familyId: string,
  book: Pick<Book, 'id'> | null | undefined,
): boolean {
  if (!session || !book?.id) return false
  return session.familyId === familyId && session.bookId === book.id
}
