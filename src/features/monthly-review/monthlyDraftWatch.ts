/**
 * Deciding when a still-running monthly-book generation has actually landed.
 *
 * `generateMonthlyReviewNow` is allowed 540s of server time. When the client
 * gives up before that (see `GENERATE_TIMEOUT_MS` in `GenerateNowDialog`, and
 * the 70s Firebase SDK default that caused this bug), the server may still be
 * working and will write `families/{familyId}/monthlyReviews/{childId}_{month}`
 * when it finishes. So a `deadline-exceeded` on the client is a *client* abort,
 * not a proven failure — we watch the doc the server is about to write instead
 * of reporting a dead end.
 *
 * The hard part is telling "the book we just asked for" from "a book that was
 * already sitting there", because a regenerate overwrites an existing doc.
 *
 * **Readiness is change-based only, and deliberately involves no clock.** The
 * tap happens on the phone's clock and `generatedAt` is written on the server's;
 * comparing the two decides a correctness question with two unsynchronised
 * inputs. A device running even a few minutes slow would find an existing
 * draft's `generatedAt` "after" the tap and open the **stale** book while the
 * real generation was still running. So the only thing that counts as proof is
 * the doc *changing* while we watch: appearing where there was none, or being
 * rewritten. Do not "simplify" this into a timestamp comparison.
 *
 * The cost of refusing clock evidence is one narrow case — the server finished
 * in the instant the client aborted, so there is no change left for us to
 * observe. That case cannot be distinguished from a stale doc without trusting
 * a clock, so it is handled the honest way instead: the wait is bounded
 * (`WAIT_GRACE_MS`) and ends by pointing the parent at the book list.
 */

/**
 * How long to keep watching after the client gives up, before telling the
 * parent plainly that we stopped.
 *
 * Needed because the client's 540s deadline and the function's own
 * `timeoutSeconds: 540` are the same budget: a `deadline-exceeded` can mean the
 * server was killed at its wall rather than that it is still writing, and a
 * killed function produces no doc write and no subscription error — nothing
 * that would ever end the wait. The grace covers the server's tail (its clock
 * starts after cold start, so it outlives the client's by that much) without
 * leaving a modal claiming progress forever.
 */
export const WAIT_GRACE_MS = 180_000

/** Doc id the server writes for a child + month (`monthlyReview.ts`). */
export function monthlyReviewDocId(childId: string, month: string): string {
  return `${childId}_${month}`
}

/**
 * A comparable stand-in for "which version of the draft is this" — `null` when
 * there is no doc at all.
 *
 * Presence is tracked separately from `generatedAt` on purpose: a doc that
 * exists but carries no `generatedAt` must not be indistinguishable from *no
 * doc*, or the first snapshot would read as "it appeared!" and open the
 * pre-existing book immediately.
 */
export type DraftFingerprint = string | null

/** Marks a doc that exists but has no usable `generatedAt`. */
const UNDATED = ''

export function fingerprintDraft(
  review: { generatedAt?: string } | null | undefined,
): DraftFingerprint {
  if (!review) return null
  return review.generatedAt ?? UNDATED
}

export interface DraftReadyArgs {
  /** Fingerprint of the first snapshot after we started watching. */
  baseline: DraftFingerprint
  /** Fingerprint of the snapshot being judged. */
  current: DraftFingerprint
}

/**
 * True only when `current` shows the draft changed since we started watching —
 * which is the one thing that proves the generation we started produced it.
 */
export function isDraftReady({ baseline, current }: DraftReadyArgs): boolean {
  // No doc yet — nothing has landed.
  if (current === null) return false
  // The doc appeared while we watched.
  if (baseline === null) return true
  // The doc was rewritten while we watched.
  return current !== baseline
}

/**
 * Is this rejection the client giving up on a call the server may still be
 * running? Firebase surfaces callable errors as `functions/<code>`; the bare
 * code is accepted too so a re-wrapped error still routes to the wait path.
 */
export function isDeadlineExceeded(err: unknown): boolean {
  const code = (err as { code?: unknown } | null | undefined)?.code
  if (typeof code === 'string') {
    return (
      code === 'deadline-exceeded' || code === 'functions/deadline-exceeded'
    )
  }
  return false
}
