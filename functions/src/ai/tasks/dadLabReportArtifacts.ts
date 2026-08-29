/**
 * "What is on this Dad Lab report" — the functions-side PORT of
 * `src/features/dad-lab/reportArtifacts.ts` (UX-85) and of `labBeatsHaveContent`
 * from `src/core/types/dadlab.ts`.
 *
 * ── Why a port and not an import ─────────────────────────────────────────────
 * `functions/` cannot import from `src/`. Two independent walls, both measured
 * against this exact import (FEAT-163):
 *   - `functions/tsconfig.json` sets `rootDir: "./src"`, so any file outside
 *     `functions/src` in the program is TS6059 ("not under rootDir");
 *   - functions compiles with `moduleResolution: "node16"`, under which the
 *     app's own extensionless relative imports (`./enums`) are TS2835.
 * So this is a deliberate second implementation, like `sanitizeJson`. It MUST
 * stay rule-identical to the app-side helper; a fixture shared verbatim with
 * `src/features/dad-lab/reportArtifacts.test.ts` pins the two together — see
 * `PARITY_FIXTURE` in `dadLabReportArtifacts.test.ts`, and the mirrored
 * "functions-side port" case in the app-side test.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * A lab's evidence lives in **two** places depending on which capture flow
 * wrote it:
 *   - `childReports[*].artifacts[]` — the legacy per-child capture;
 *   - `beats[*].items[].artifactId` — the FEAT-56 three-beat capture, today's
 *     DEFAULT and where FEAT-156 routes uploads.
 * Reading only the child-report side makes a modern lab look empty. Ids are
 * de-duplicated (the two sets legitimately overlap) and ordered child-reports
 * first, then beats in beat order — byte-identical to the app-side helper.
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

/** The subset of a `DadLabReport` doc this module reads. */
export interface RawDadLabReport {
  childReports?: unknown;
  beats?: unknown;
}

/** Narrow an unknown value to a plain object's values, or `[]`. */
function objectValues(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value as Record<string, unknown>);
}

/**
 * Every artifact id a Dad Lab report OWNS. Port of `reportArtifactIds`
 * (`src/features/dad-lab/reportArtifacts.ts`) — keep the two in lockstep.
 */
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

/**
 * True when any beat carries a writing line or a captured item. Port of
 * `labBeatsHaveContent` (`src/core/types/dadlab.ts`).
 *
 * This is the beat-era answer to "did this lab actually happen?" — the question
 * `childReports` used to be the only witness for.
 */
export function labBeatsHaveContent(beats: unknown): boolean {
  return objectValues(beats).some((beat) => {
    const b = beat as RawLabBeat | null;
    const text = typeof b?.text === "string" ? b.text.trim() : "";
    const items = Array.isArray(b?.items) ? b.items : [];
    return text.length > 0 || items.length > 0;
  });
}

/** Read one beat's writing line, or `undefined` when it has none. */
export function beatText(beats: unknown, beatId: string): string | undefined {
  if (!beats || typeof beats !== "object" || Array.isArray(beats)) return undefined;
  const beat = (beats as Record<string, unknown>)[beatId] as RawLabBeat | undefined;
  const text = typeof beat?.text === "string" ? beat.text.trim() : "";
  return text ? text : undefined;
}
