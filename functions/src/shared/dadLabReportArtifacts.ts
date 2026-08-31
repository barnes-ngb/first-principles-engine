/**
 * "What is on this Dad Lab report" — THE definition (UX-85, ARCH-47 slice 1).
 *
 * ── One rule, two compilers ──────────────────────────────────────────────────
 * This module used to exist twice: once as `src/features/dad-lab/reportArtifacts.ts`
 * and once as a hand-kept port in `functions/src/ai/tasks/dadLabReportArtifacts.ts`,
 * pinned together by a parity fixture repeated verbatim in both test files. The
 * same evidence-completeness rule was independently wrong three times because it
 * was independently implemented three times, and the guard against a fourth was a
 * test author remembering the fixture existed.
 *
 * It now has one definition, compiled by BOTH projects — the app reaches in from
 * `src/features/dad-lab/reportArtifacts.ts` (which keeps the typed signature its
 * callers use and delegates here), the monthly-review Cloud Function imports it
 * directly. Change the rule and break a caller, and it fails to COMPILE on the
 * side that broke. See `functions/src/shared/README.md` for why the shared
 * directory lives under `functions/` and the two conventions it must honour.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * A lab's evidence is stored on the report in **two** places depending on which
 * capture flow wrote it:
 *
 * - `childReports[*].artifacts[]` — the legacy per-child capture (and the kid
 *   view's own "Capture My Work" writes);
 * - `beats[*].items[].artifactId` — the FEAT-56 three-beat capture, which is
 *   today's DEFAULT and where FEAT-156 routes uploads. Most lab photos land
 *   here from here on.
 *
 * Reading only the child-report side makes a modern lab look empty on the
 * overview card while its detail view is full of photos — Nathan's Aug 22 lab.
 * The two sets legitimately overlap (the same artifact can be referenced from
 * both), so ids are de-duplicated and counted once.
 *
 * Ordering is stable and preserves the pre-existing convention: child-report
 * artifacts first (in `Object.values` order), then beat items in beat order.
 * Pure — no Firestore read, no resolution of whether the artifact doc exists.
 */

/** One captured item within a beat. Loosely typed — this reads raw Firestore data. */
export interface RawLabBeatItem {
  artifactId?: unknown;
  child?: unknown;
}

/** One beat: an optional writing line plus captured items. */
export interface RawLabBeat {
  text?: unknown;
  items?: unknown;
}

/**
 * The subset of a `DadLabReport` doc this module reads.
 *
 * Deliberately structural rather than the app's `DadLabReport`: on the functions
 * side these are raw Firestore documents, and on the app side the collection's
 * converter is an unchecked `snapshot.data() as DadLabReport` cast — so neither
 * caller actually holds a validated object. The app's `DadLabReport` is
 * structurally assignable to this, so its helper stays typed for its own callers.
 */
export interface RawDadLabReport {
  childReports?: unknown;
  beats?: unknown;
}

/** Narrow an unknown value to a plain object's values, or `[]`. */
export function objectValues(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value as Record<string, unknown>);
}

/** Every artifact id a Dad Lab report OWNS — the single answer to "what's on this report". */
export function reportArtifactIds(report: RawDadLabReport): string[] {
  const ids = new Set<string>();

  for (const childReport of objectValues(report?.childReports)) {
    const artifacts = (childReport as { artifacts?: unknown } | null)?.artifacts;
    if (!Array.isArray(artifacts)) continue;
    for (const id of artifacts) if (typeof id === "string" && id) ids.add(id);
  }

  for (const beat of objectValues(report?.beats)) {
    const items = (beat as RawLabBeat | null)?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const id = (item as RawLabBeatItem | null)?.artifactId;
      if (typeof id === "string" && id) ids.add(id);
    }
  }

  return Array.from(ids);
}
