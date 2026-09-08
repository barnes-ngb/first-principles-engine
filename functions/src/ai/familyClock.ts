/**
 * The family's clock — the one place a Cloud Function turns "now" into a date.
 *
 * A Cloud Function runs in the **runtime's** zone, which is UTC. Everything this
 * app keys on is a **civil** date in the family's zone: day documents are
 * `{date}_{childId}` built from a browser `Date`, weeks are Sunday-start civil
 * weeks, and a records document is named by the day a person would say it was.
 * So any handler that derives a date from `new Date()` is reading a different
 * clock from the one its schedule fires on, and is correct only for the hours
 * where the two happen not to disagree.
 *
 * These two lived in `tasks/shellyChat.ts`, which is where the class was first
 * fixed. `evaluate.ts` needs the same rule for the weekly review's week key
 * (UX-266) and cannot import it from there — `shellyChat.ts` already imports
 * `summarizeTeachBacks` from `evaluate.ts`, so that direction is a cycle. They
 * moved here rather than being copied; `shellyChat.ts` re-exports them, so its
 * callers and tests are untouched.
 */

/**
 * The family's timezone when they haven't set one — the same zone every
 * scheduled function in this repo already runs on (`evaluate`, `monthlyReview`,
 * `fileFeatureRequests`, `sweepCompliancePacks`). `Family.timeZone` overrides it.
 */
export const DEFAULT_FAMILY_TIME_ZONE = "America/Chicago";

/**
 * `now` as the CIVIL date (`YYYY-MM-DD`) in a given zone (Codex P2, PR #1667).
 *
 * Day documents are keyed by the **client's local** date (`{date}_{childId}`,
 * built from a browser `Date`). A Cloud Function runs in the runtime's zone —
 * UTC by default — so on a Sunday evening in the US, `new Date()` on the server
 * is already Monday, and deriving the week from it selects the week the family
 * has not started yet. The THIS WEEK section would then read five documents that
 * are not the family's week at all, and every action emitted from it would be
 * refused by the client gate as out-of-week. Sunday evening is exactly when a
 * homeschool parent plans, so this is the wrong hour to be an hour off.
 *
 * `en-CA` because its short date format IS `YYYY-MM-DD`. An unknown zone makes
 * `Intl` throw; we fall back to the runtime's own civil date rather than take
 * the whole chat down over a bad profile field.
 */
export function civilDateInZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    console.warn(`[familyClock] unknown timeZone ${timeZone} — falling back to runtime local`);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
}

/**
 * `now` as a `Date` whose **local** fields are the family's civil date, with the
 * time zeroed.
 *
 * The bridge between the two clocks. Date arithmetic in this codebase is written
 * against local getters (`getDay`, `getDate`, `setDate`) because it mirrors
 * client rules written the same way, so a handler that wants to apply one of
 * those rules to "today, where the family lives" needs a `Date` positioned there
 * rather than the raw instant. Constructing from the field triple keeps it in
 * the runtime's own local zone, so the getters read back exactly the civil date
 * that went in — parsing `"YYYY-MM-DD"` as a string would be interpreted as UTC
 * and could land on the day before.
 */
export function civilDateObjectInZone(
  now: Date,
  timeZone: string = DEFAULT_FAMILY_TIME_ZONE,
): Date {
  const [y, m, d] = civilDateInZone(now, timeZone).split("-").map(Number);
  return new Date(y, m - 1, d);
}
