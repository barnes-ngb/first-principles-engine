/**
 * Deciding when a still-running monthly-book generation has actually landed.
 *
 * `generateMonthlyReviewNow` is allowed 540s of server time. When the client
 * gives up before that (see `GENERATE_TIMEOUT_MS` in `GenerateNowDialog`, and
 * the 70s Firebase SDK default that caused this bug), the server keeps working
 * and writes `families/{familyId}/monthlyReviews/{childId}_{month}` anyway.
 * So a `deadline-exceeded` on the client is a *client* abort, not a failure —
 * we watch the doc the server is about to write instead of reporting a dead end.
 *
 * The hard part is telling "the book we just asked for" from "a book that was
 * already sitting there" (a regenerate overwrites an existing doc). Two signals,
 * either of which is sufficient:
 *
 *   - the doc **changed** while we were watching (appeared, or `generatedAt`
 *     moved) — clock-independent, and the normal case;
 *   - the doc's `generatedAt` is at or past the tap — covers the narrow race
 *     where the server finished just as the client aborted, so the very first
 *     snapshot we see is already the new book.
 *
 * The first rule is what makes this safe under clock skew: the client's tap
 * time and the server's `generatedAt` come from different clocks, so a
 * timestamp comparison alone could wait forever on a phone running fast.
 */

/** Doc id the server writes for a child + month (`monthlyReview.ts`). */
export function monthlyReviewDocId(childId: string, month: string): string {
  return `${childId}_${month}`
}

export interface DraftReadyArgs {
  /**
   * `generatedAt` on the first snapshot after we started watching; `null` when
   * the doc did not exist yet.
   */
  baseline: string | null
  /** `generatedAt` on the snapshot being judged; `null` when there is no doc. */
  current: string | null
  /** ISO timestamp of the tap that started this generation. */
  tappedAt: string
}

/**
 * True when `current` proves the generation we started has produced a book.
 *
 * Deliberately conservative: an unparseable or missing `generatedAt` on an
 * unchanged doc reads as "not ready" rather than resolving the dialog onto
 * somebody's older book.
 */
export function isDraftReady({
  baseline,
  current,
  tappedAt,
}: DraftReadyArgs): boolean {
  // No doc yet — the server is still working.
  if (current === null) return false
  // The doc appeared, or was rewritten, while we watched.
  if (baseline === null || current !== baseline) return true
  // Unchanged doc: only a timestamp at/after the tap earns a resolve.
  const written = Date.parse(current)
  const tapped = Date.parse(tappedAt)
  if (Number.isNaN(written) || Number.isNaN(tapped)) return false
  return written >= tapped
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
