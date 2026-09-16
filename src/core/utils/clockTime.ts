/**
 * The ONE answer to *what time of day does this stamp read* (UX-431).
 *
 * ── Why it needs a home ────────────────────────────────────────────────────
 *
 * Before this there were four ad-hoc copies of a clock format across the app
 * (`ArmorTab`, `ChatMessageBubble`, `AvatarAdminTab`, `KidTodayView`), each a
 * bare `new Date(value).toLocaleTimeString(...)`, and every one of them has the
 * same two holes. `UX-431` converts the fourth; **the other three are left
 * exactly as they are** — none of them dates a record a compliance figure or a
 * schedule reads (an armor session, a chat bubble, an admin readout), so
 * rewiring them is not this run's to do, and the count above is derived by
 * `grep -rn toLocaleTimeString src/ --include=*.ts --include=*.tsx | grep -v test`,
 * which returns those three and nothing else once this module is in place.
 *
 * The two holes:
 *
 *   1. **It reads the runtime's zone, not the family's.** `UX-215`'s lesson is
 *      that a date derived from a clock nobody named is a date nobody can
 *      reason about. On a phone standing in the family's kitchen the two agree,
 *      which is exactly why the mistake survives until it does not.
 *   2. **It does not survive a bad stamp.** `new Date('')` is an Invalid Date;
 *      `toLocaleTimeString` renders it as the literal string *"Invalid Date"*,
 *      and `Intl.DateTimeFormat.format` **throws** a `RangeError` on it. An
 *      artifact written before `createdAt` was stamped, or one whose stamp did
 *      not survive a migration, is real data — `KidTodayView` already prints
 *      *"Invalid Date"* for one — so an unreadable stamp answers `null` here
 *      and the caller renders no time rather than a lie or a crash.
 *
 * ── The zone ───────────────────────────────────────────────────────────────
 *
 * {@link FAMILY_TIME_ZONE} is a hand-kept copy of `DEFAULT_FAMILY_TIME_ZONE` in
 * `functions/src/ai/familyClock.ts`. It cannot be imported: that module is not
 * in `functions/src/shared/`, the one directory both projects compile. This is
 * the `weekHours.REVIEW_SAVE_TIME_ZONE` precedent exactly — a hand-kept copy
 * **pinned by a source scan** (`clockTime.test.ts`), because a hand-kept copy
 * with nothing standing on it is the guard ARCH-47 exists to replace.
 *
 * **A known and deliberate tension**, stated rather than discovered later: an
 * artifact's *day* is `todayKey()`, which reads the device's **local** fields,
 * while its *time* is read here in the family's zone. On a device standing in
 * that zone — every device this family owns — the two agree exactly. On a
 * device that is not, a capture near midnight can be filed under the device's
 * day and read with the family's clock. The alternative is worse: a clock
 * nobody named, which is the thing `UX-215` was filed about.
 *
 * ── The family's own setting wins (Codex round 1, P2) ──────────────────────
 *
 * `FamilySettings.timeZone` is a real, optional field on `Child.settings`, and
 * treating the app's default as *"the configured family zone"* would show every
 * capture at the wrong clock time for a family that had set one. So callers
 * pass it, through {@link resolveFamilyTimeZone} — which also decides what a
 * zone the runtime cannot parse means. It means **fall back to the app's own
 * default**, not to nothing: a stored zone is a setting that may be stale or
 * mistyped, and answering `null` for every row would take the whole column away
 * over one bad string. That is not "a second unnamed clock" — the fallback is
 * the same named constant this module already documents.
 */

/**
 * The family's civil zone. Mirrors `DEFAULT_FAMILY_TIME_ZONE` in
 * `functions/src/ai/familyClock.ts`; pinned against it by a source scan.
 */
export const FAMILY_TIME_ZONE = 'America/Chicago'

/**
 * `"9:05 AM"` for an ISO stamp, read in `timeZone`, or `null` when the stamp
 * cannot be read at all.
 *
 * `null` rather than a placeholder string, so the CALLER decides what an
 * unreadable stamp looks like on its own surface — a parent's evidence list and
 * a kid's inventory do not have to say the same thing, and neither of them has
 * to say *"Invalid Date"*.
 */
export function formatClockTime(
  value: string | undefined | null,
  timeZone: string = FAMILY_TIME_ZONE,
): string | null {
  if (!value) return null
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(instant)
  } catch {
    // A zone this runtime does not know. The stamp is fine and the zone is not,
    // so answer with the same `null` an unreadable stamp gets rather than
    // falling back to a second, unnamed clock.
    return null
  }
}

/**
 * The zone to read a family's records in: their own setting where it is one the
 * runtime can parse, {@link FAMILY_TIME_ZONE} otherwise.
 *
 * Separate from {@link formatClockTime} on purpose. *Which zone is this
 * family's* and *what does this stamp read in that zone* are two questions, and
 * only the first one has a sensible fallback — a stamp that cannot be read is
 * not recoverable, while a zone that cannot be parsed is.
 */
export function resolveFamilyTimeZone(configured?: string | null): string {
  const zone = configured?.trim()
  if (!zone) return FAMILY_TIME_ZONE
  try {
    // Throws `RangeError` on a zone this runtime does not know. Formatting the
    // epoch is the cheapest way to ask, and it asks the same `Intl` that
    // `formatClockTime` will use, so the two cannot disagree about validity.
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date(0))
    return zone
  } catch {
    return FAMILY_TIME_ZONE
  }
}
