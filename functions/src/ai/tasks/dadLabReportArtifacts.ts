/**
 * The functions-side reads of a Dad Lab report's BEATS — `labBeatsHaveContent`
 * and `beatTextForChild`, ports of `src/core/types/dadlab.ts`.
 *
 * ── What moved out of here, and why ──────────────────────────────────────────
 * `reportArtifactIds` (UX-85) used to be implemented here a second time, kept in
 * lockstep with `src/features/dad-lab/reportArtifacts.ts` by a parity fixture
 * repeated verbatim in both test files. ARCH-47 gave it ONE definition, in
 * `functions/src/shared/dadLabReportArtifacts.ts`, which both projects compile —
 * so a change that breaks a caller now fails to compile rather than failing a
 * fixture someone has to remember. It is re-exported below so this module's
 * callers (`monthlyReviewData.ts`) keep their import path.
 *
 * The two functions still defined here are ports of a DIFFERENT original
 * (`src/core/types/dadlab.ts`, not `reportArtifacts.ts`) and are deliberately out
 * of ARCH-47 slice 1's scope. `functions/src/shared/README.md` names the
 * remaining duplicated rules and the order they should follow.
 *
 * ── Why a port and not an import ─────────────────────────────────────────────
 * `functions/` cannot import from `src/`. Two independent walls, both measured
 * against this exact import (FEAT-163, re-measured in the ARCH-47 spike):
 *   - `functions/tsconfig.json` sets `rootDir: "./src"`, so any file outside
 *     `functions/src` in the program is TS6059 ("not under rootDir");
 *   - functions compiles with `moduleResolution: "node16"`, under which the
 *     app's own extensionless relative imports (`./enums`) are TS2835.
 * The shared directory answers both without moving `functions/lib/index.js`: it
 * lives inside `functions/src` (so `rootDir` holds) and writes explicit `.js`
 * extensions (so Node16 resolution holds).
 */

import {
  objectValues,
  type RawLabBeat,
} from "../../shared/dadLabReportArtifacts.js";

export {
  reportArtifactIds,
  type RawDadLabReport,
  type RawLabBeat,
  type RawLabBeatItem,
} from "../../shared/dadLabReportArtifacts.js";

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
