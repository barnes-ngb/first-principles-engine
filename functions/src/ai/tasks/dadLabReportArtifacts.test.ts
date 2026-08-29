import { describe, it, expect } from "vitest";

import {
  beatTextForChild,
  labBeatsHaveContent,
  reportArtifactIds,
} from "./dadLabReportArtifacts.js";

/**
 * THE PARITY FIXTURE (FEAT-163).
 *
 * `functions/` cannot import from `src/` (TS6059 `rootDir` + TS2835 node16
 * resolution — measured, see the module header), so `reportArtifactIds` exists
 * twice. This fixture is the contract between the two copies: it is repeated
 * VERBATIM in `src/features/dad-lab/reportArtifacts.test.ts` (search that file
 * for "PARITY FIXTURE"), where the app-side helper is asserted to return the
 * same `PARITY_EXPECTED` list. If you change one implementation, this pair
 * fails until you change the other.
 *
 * It exercises every rule at once: both sources, an id referenced from both
 * (counted once), an empty id, and child-reports-then-beats ordering.
 */
export const PARITY_FIXTURE = {
  childReports: {
    lincoln: { prediction: "it pops", artifacts: ["art-shared", "art-child", ""] },
    london: { observation: "loud", artifacts: ["art-london"] },
  },
  beats: {
    predict: {
      items: [
        { artifactId: "art-shared", child: "both" },
        { artifactId: "art-beat", child: "both" },
      ],
    },
    try: { text: "we blew it up", items: [{ artifactId: "", child: "both" }] },
    saw: { items: [{ artifactId: "art-saw", child: "c-lincoln" }] },
  },
};

export const PARITY_EXPECTED = [
  "art-shared",
  "art-child",
  "art-london",
  "art-beat",
  "art-saw",
];

describe("reportArtifactIds — the functions-side port of src/features/dad-lab/reportArtifacts.ts", () => {
  it("agrees with the app-side helper on the shared parity fixture", () => {
    expect(reportArtifactIds(PARITY_FIXTURE)).toEqual(PARITY_EXPECTED);
  });

  it("reads the legacy per-child capture", () => {
    expect(
      reportArtifactIds({
        childReports: {
          lincoln: { prediction: "it pops", artifacts: ["art-a", "art-b"] },
          london: { observation: "loud", artifacts: ["art-c"] },
        },
      }),
    ).toEqual(["art-a", "art-b", "art-c"]);
  });

  it("reads beat items — the FEAT-156 default, where lab photos now land", () => {
    expect(
      reportArtifactIds({
        childReports: {},
        beats: {
          predict: { items: [{ artifactId: "art-p", child: "both" }] },
          try: { text: "we blew it up", items: [{ artifactId: "art-t", child: "c-lincoln" }] },
          saw: { items: [{ artifactId: "art-s", child: "both" }] },
        },
      }),
    ).toEqual(["art-p", "art-t", "art-s"]);
  });

  it("counts an id referenced from both sides exactly once", () => {
    const ids = reportArtifactIds({
      childReports: { lincoln: { artifacts: ["art-shared", "art-child"] } },
      beats: {
        predict: {
          items: [
            { artifactId: "art-shared", child: "both" },
            { artifactId: "art-beat", child: "both" },
          ],
        },
        try: { items: [] },
        saw: { items: [] },
      },
    });
    expect(ids).toEqual(["art-shared", "art-child", "art-beat"]);
    expect(ids.filter((id) => id === "art-shared")).toHaveLength(1);
  });

  it("returns nothing for a report with no evidence anywhere", () => {
    expect(reportArtifactIds({})).toEqual([]);
    expect(
      reportArtifactIds({
        childReports: { lincoln: { prediction: "a guess", artifacts: [] } },
        beats: { predict: { text: "a word", items: [] }, try: { items: [] }, saw: { items: [] } },
      }),
    ).toEqual([]);
  });

  it("is defensive about the malformed docs a raw Firestore read can hand it", () => {
    expect(reportArtifactIds({ childReports: undefined, beats: undefined })).toEqual([]);
    // Non-object / non-array shapes must not throw — this reads untyped docs.
    expect(reportArtifactIds({ childReports: "nope", beats: 7 })).toEqual([]);
    expect(reportArtifactIds({ childReports: { a: null }, beats: { predict: null } })).toEqual([]);
    expect(
      reportArtifactIds({
        childReports: { lincoln: { artifacts: ["", "art-real", 42] } },
        beats: { predict: { items: [{ artifactId: "" }, { child: "both" }] } },
      }),
    ).toEqual(["art-real"]);
  });
});

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
