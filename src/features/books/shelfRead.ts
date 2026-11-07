/**
 * The bookshelf read's own contract: what its query can say about itself, the
 * identity it reads FOR, and which frame a page draws from the two.
 *
 * ── Why it is its own module ─────────────────────────────────────────────────
 *
 * Four existing shelf suites mock `./useBook` whole (`useBookshelf` only), so a
 * page that imported this vocabulary from there would throw on an export the
 * mock does not have — before any component rendered, and for every assertion
 * in the file. Nothing here reads, writes, renders or imports anything, so
 * nothing here needs mocking by anybody: the hook and the page share one
 * definition and the stubs stay as small as they were.
 */

/**
 * What the shelf's own query can honestly say about itself.
 *
 * Five answers, kept apart because collapsing any two of them makes the shelf
 * lie. A read nobody has asked for is not a read in flight; a child whose
 * identity read FAILED is not a child with no books; a read that was refused is
 * not an empty shelf; and an empty shelf is not a failure.
 */
export const ShelfReadPhase = {
  /** Nothing to ask for yet — no family, or no child resolved so far. */
  Unsettled: 'unsettled',
  /**
   * The child this shelf would read for is UNKNOWN: their identity read failed.
   *
   * Its own phase and not an error of this read's, because the failure and the
   * recovery both belong to the children read — the surface offers that read's
   * own retry and this one asks nothing at all.
   */
  Unknown: 'unknown',
  /** Asked and not answered yet. */
  Pending: 'pending',
  /** Answered — the rows ARE the answer, including a genuinely empty one. */
  Ready: 'ready',
  /** Refused or dropped. Never presented as a result. */
  Error: 'error',
} as const
export type ShelfReadPhase = (typeof ShelfReadPhase)[keyof typeof ShelfReadPhase]

/**
 * The state of the scoped children read, exactly as `useActiveChild` already
 * publishes it — passed in by the surface that already calls it, never read a
 * second time here. Both are optional so an existing caller or stub that knows
 * nothing about readiness reads as "settled", which is what it used to mean.
 */
export interface ShelfIdentityState {
  /** The children read has not answered yet. */
  loading?: boolean
  /** It failed. `loading` stays true beside it; a failure is not an answer. */
  failed?: boolean
}

/** Is the child this shelf would read for actually known right now? */
export function shelfIdentityKnown(identity?: ShelfIdentityState): boolean {
  return !identity?.loading && !identity?.failed
}

/** What the SHELF — its counts, its filters and its grid — is showing. */
export const ShelfFrame = {
  /** No answer yet. Says so, claims nothing else. */
  Waiting: 'waiting',
  /** The identity is unknown; its own read owns the recovery. */
  IdentityUnknown: 'identity-unknown',
  /** This read was refused; this shelf owns the recovery. */
  Failed: 'failed',
  /** An answer, which may be a genuinely empty shelf. */
  Settled: 'settled',
} as const
export type ShelfFrame = (typeof ShelfFrame)[keyof typeof ShelfFrame]

/**
 * Which frame a phase means.
 *
 * Fails CLOSED: a result with no phase at all — an old or partial stub of the
 * hook — reads as *waiting*, never as a ready shelf, so the one thing a missing
 * phase can never do is claim an answer nobody gave.
 */
export function resolveShelfFrame(phase: ShelfReadPhase | undefined): ShelfFrame {
  switch (phase) {
    case ShelfReadPhase.Ready:
      return ShelfFrame.Settled
    case ShelfReadPhase.Error:
      return ShelfFrame.Failed
    case ShelfReadPhase.Unknown:
      return ShelfFrame.IdentityUnknown
    default:
      return ShelfFrame.Waiting
  }
}
