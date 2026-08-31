import { describe, it, expect } from "vitest";

import { beatTextForChild, labBeatsHaveContent } from "./dadLabReportArtifacts.js";

/**
 * `reportArtifactIds`' own tests moved to
 * `functions/src/shared/dadLabReportArtifacts.test.ts`, next to its one
 * definition (ARCH-47 slice 1) — along with the cross-project `PARITY_FIXTURE`
 * they used to carry. That fixture existed only because the app-side helper and
 * the functions-side port could not be imported together; now there is nothing
 * to pin, and a breaking change fails to compile instead.
 *
 * What remains here are the ports of `src/core/types/dadlab.ts` — a different
 * original, out of ARCH-47 slice 1's scope.
 */
describe("labBeatsHaveContent — the beat-era 'did this lab happen?' witness", () => {
  it("is true for a beat carrying a captured item", () => {
    expect(labBeatsHaveContent({ predict: { items: [{ artifactId: "art-1" }] } })).toBe(true);
  });

  it("is true for a beat carrying only a writing line", () => {
    expect(labBeatsHaveContent({ try: { text: "we blew it up", items: [] } })).toBe(true);
  });

  it("is false for empty, whitespace-only, absent or malformed beats", () => {
    expect(labBeatsHaveContent(undefined)).toBe(false);
    expect(labBeatsHaveContent({})).toBe(false);
    expect(labBeatsHaveContent({ predict: { items: [] }, try: { items: [] } })).toBe(false);
    expect(labBeatsHaveContent({ predict: { text: "   ", items: [] } })).toBe(false);
    expect(labBeatsHaveContent("nope")).toBe(false);
    expect(labBeatsHaveContent({ predict: null })).toBe(false);
  });
});

describe("beatTextForChild — the writing line, only when it is this child's to claim", () => {
  const LINCOLN = "c-lincoln";

  it("reads and trims a line with no attribution (shared by default)", () => {
    expect(beatTextForChild({ predict: { text: "  it will pop  " } }, "predict", LINCOLN)).toBe(
      "it will pop",
    );
  });

  it("reads a line attributed to 'both'", () => {
    expect(
      beatTextForChild({ predict: { text: "it will pop", textChild: "both" } }, "predict", LINCOLN),
    ).toBe("it will pop");
  });

  it("reads a line attributed to this child", () => {
    expect(
      beatTextForChild(
        { predict: { text: "it will pop", textChild: LINCOLN } },
        "predict",
        LINCOLN,
      ),
    ).toBe("it will pop");
  });

  it("does NOT read a line attributed to a sibling (Codex P2, PR #1710)", () => {
    // The prompt renders these as a per-child [predicted] tag, so a sibling's
    // sentence must never be presented as this child's contribution.
    expect(
      beatTextForChild(
        { predict: { text: "it will pop", textChild: "c-london" } },
        "predict",
        LINCOLN,
      ),
    ).toBeUndefined();
  });

  it("treats an unrecognized attribution as not-this-child (under-claim, never misattribute)", () => {
    expect(
      beatTextForChild({ saw: { text: "it popped", textChild: 42 } }, "saw", LINCOLN),
    ).toBeUndefined();
  });

  it("treats a blank attribution string as shared", () => {
    expect(
      beatTextForChild({ saw: { text: "it popped", textChild: "  " } }, "saw", LINCOLN),
    ).toBe("it popped");
  });

  it("returns undefined for a missing, blank or malformed line", () => {
    expect(beatTextForChild({ predict: { text: "   " } }, "predict", LINCOLN)).toBeUndefined();
    expect(beatTextForChild({ predict: { items: [] } }, "predict", LINCOLN)).toBeUndefined();
    expect(beatTextForChild({}, "predict", LINCOLN)).toBeUndefined();
    expect(beatTextForChild(undefined, "predict", LINCOLN)).toBeUndefined();
    expect(beatTextForChild("nope", "predict", LINCOLN)).toBeUndefined();
  });
});
