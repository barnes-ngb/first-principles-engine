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

/** The `child` sentinel meaning "the whole family" — `BEAT_BOTH` in `src/core/types/dadlab.ts`. */
export const BEAT_BOTH = "both";

/**
 * One beat's writing line, but ONLY when it is this child's to claim.
 *
 * Unlike lab participation — which is whole-family and has no per-child signal
 * (see `loadDadLabReportsInMonth`) — the writing line DOES carry attribution:
 * `LabBeat.textChild` is `'both'` or a specific child **doc id** (ARCH-40, so
 * never a name), chosen in `LabCaptureBeats`' attribution control and defaulting
 * to `'both'`. The monthly-review prompt turns this into a `[predicted]` /
 * `[explained]` tag in a book written for ONE child, so ignoring the attribution
 * would present a sibling's sentence as this child's own (Codex P2, PR #1710).
 *
 * Missing or `'both'` → shared, counts for everyone. Anything else must match
 * `childId` exactly; an unrecognized value is child-specific and not this child,
 * so it does not count — the direction that can only under-claim, never
 * misattribute.
 */
export function beatTextForChild(
  beats: unknown,
  beatId: string,
  childId: string,
): string | undefined {
  if (!beats || typeof beats !== "object" || Array.isArray(beats)) return undefined;
  const beat = (beats as Record<string, unknown>)[beatId] as RawLabBeat | undefined;

  const text = typeof beat?.text === "string" ? beat.text.trim() : "";
  if (!text) return undefined;

  const attribution = (beat as { textChild?: unknown } | undefined)?.textChild;
  const shared =
    attribution == null ||
    (typeof attribution === "string" && (!attribution.trim() || attribution === BEAT_BOTH));
  if (!shared && attribution !== childId) return undefined;

  return text;
}
