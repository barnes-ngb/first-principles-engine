/**
 * The before-work page check's task name — the one thing that identifies it.
 *
 * ── Why a task name and not a payload field ─────────────────────────────────
 * The first design declared the intent inside the message payload
 * (`checkPurpose`). Two independent findings killed it:
 *
 *  1. `chat.ts` runs `ensureWorkbookActivityConfigsForChild` — which creates and
 *     updates workbook `activityConfigs`, a learning record — for every child on
 *     every task, **before the handler is chosen**. A dispatcher reading the
 *     task name cannot see a flag buried in a JSON string, and executing the
 *     real dispatcher confirmed the backfill ran for prospective requests.
 *  2. **Release skew.** `deploy.yml` ships hosting before functions, so a new
 *     client talks to the OLD dispatcher for a window. Against it, `scan` +
 *     `checkPurpose` is an ordinary scan: backfill runs, the retrospective
 *     prompt comes back, and nothing tells anyone. A name the old dispatcher
 *     does not know is rejected with `invalid-argument` before the backfill and
 *     before any handler — the failure is loud, visible and writes nothing.
 *
 * So the rule is: **the task name is the intent.** No payload purpose is read
 * anywhere on the server. `handlePageCheck` always asks the prospective
 * question, and `handleScan` has no prospective branch — a forged purpose field
 * cannot make a scan prospective and a missing one cannot make a page check
 * retrospective.
 *
 * Pure: no I/O, no Firestore. Imported by `chat.ts` (to exclude the task from
 * the backfill) and by tests on both sides of the boundary.
 */

/** The dispatcher key, the client's `TaskType.PageCheck`, and the registry entry. */
export const PAGE_CHECK_TASK = "pageCheck";

/**
 * Is this request the before-work page check?
 *
 * Deliberately total and deliberately narrow: exactly one string answers yes.
 * Everything else — `scan`, an unknown task, a non-string — is "no", and keeps
 * every pre-existing behaviour including the backfill.
 */
export function isPageCheckTask(taskType: unknown): boolean {
  return taskType === PAGE_CHECK_TASK;
}
