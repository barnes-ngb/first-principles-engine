import { describe, it, expect } from "vitest";

import {
  beatText,
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

describe("beatText", () => {
  it("reads and trims one beat's writing line", () => {
    expect(beatText({ predict: { text: "  it will pop  " } }, "predict")).toBe("it will pop");
  });

  it("returns undefined for a missing, blank or malformed line", () => {
    expect(beatText({ predict: { text: "   " } }, "predict")).toBeUndefined();
    expect(beatText({ predict: { items: [] } }, "predict")).toBeUndefined();
    expect(beatText({}, "predict")).toBeUndefined();
    expect(beatText(undefined, "predict")).toBeUndefined();
    expect(beatText("nope", "predict")).toBeUndefined();
  });
});
