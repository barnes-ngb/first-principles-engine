/**
 * The composite day-log document id — THE definition (ARCH-47 slice 2).
 *
 * ── One rule, two compilers ──────────────────────────────────────────────────
 * This rule used to exist twice: once as `src/core/utils/docId.ts` and once as a
 * hand-kept port inline in `functions/src/ai/tasks/monthlyHours.ts`, each with
 * its own copy of `DATE_RE`. The duplication had already cost a real bug: the
 * monthly-review Cloud Function filtered `days` documents on a stored `childId`
 * FIELD, which legacy docs do not carry, so it silently dropped exactly the
 * day-log minutes FEAT-164 exists to include (Codex P2, PR #1711). The port was
 * written to fix that; this module means the next caller does not have to
 * rediscover the rule to get it right.
 *
 * It now has one definition, compiled by BOTH projects — the app reaches in from
 * `src/core/utils/docId.ts` (which keeps its path and re-exports, so its three
 * consumers and the `records.logic.ts` re-export are untouched), and
 * `monthlyHours.ts` imports it directly. Change the rule and break a caller, and
 * it fails to COMPILE on the side that broke. See `functions/src/shared/README.md`
 * for why the shared directory lives under `functions/` and the four conventions
 * it must honour.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * A `days` document id encodes a date and a child id joined by `_`, in either
 * order: `{date}_{childId}` is the current convention, `{childId}_{date}` the
 * legacy one. Which segment is which is decided by which one PARSES as a date —
 * never by position — because both orders are live in the same collection.
 *
 * Both readers live here because they are one rule about one key: splitting them
 * across the wall would leave `DATE_RE` defined on both sides of it, which is
 * precisely the hazard this work exists to end. `parseDateFromDocId` has no
 * functions-side caller today; it is here so the next port is never written.
 *
 * Note the two readers disagree on purpose about an unparseable id:
 * `parseDateFromDocId` falls back to the whole string (a doc id that is just a
 * bare date is the common case), while `deriveChildIdFromDocId` returns
 * `undefined` (guessing a child id would attribute a day to the wrong child).
 *
 * Pure string handling — no Firestore read, no date validation beyond the shape.
 */

/** The `YYYY-MM-DD` shape every stored date carries (see CLAUDE.md, "Dates"). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Extract the `date` portion from a composite Firestore document ID.
 * Handles both `{date}_{childId}` (new) and `{childId}_{date}` (legacy)
 * formats by checking which segment looks like a YYYY-MM-DD date.
 */
export function parseDateFromDocId(docId: string): string {
  const prefix = docId.slice(0, 10);
  if (DATE_RE.test(prefix)) return prefix;
  const suffix = docId.slice(-10);
  if (DATE_RE.test(suffix)) return suffix;
  return docId;
}

/**
 * Derive a childId from a Firestore document ID that encodes both date and
 * childId separated by `_`.  Handles both `${date}_${childId}` and
 * `${childId}_${date}` formats.
 */
export function deriveChildIdFromDocId(docId: string): string | undefined {
  const idx = docId.indexOf("_");
  if (idx === -1) return undefined;

  const first = docId.slice(0, idx);
  const rest = docId.slice(idx + 1);

  if (DATE_RE.test(first) && rest.length > 0) return rest;
  if (DATE_RE.test(rest) && first.length > 0) return first;
  return undefined;
}
