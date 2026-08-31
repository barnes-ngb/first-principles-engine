import { describe, it, expect } from "vitest";

import { reportArtifactIds } from "./dadLabReportArtifacts.js";

/**
 * The rule's own tests, next to its one definition (ARCH-47 slice 1).
 *
 * These used to live in `functions/src/ai/tasks/dadLabReportArtifacts.test.ts`
 * alongside a `PARITY_FIXTURE` repeated VERBATIM in
 * `src/features/dad-lab/reportArtifacts.test.ts` — the fixture existed only
 * because the two implementations could not be imported together, and it held
 * only as long as someone remembered it. There is now one implementation, this
 * file runs in BOTH vitest projects (the root run executes
 * `functions/src/**` — ARCH-45), and a change that breaks either caller fails
 * to compile. The fixture was replaced by a stronger guard, not dropped.
 *
 * The app-facing typed wrapper keeps its own suite in
 * `src/features/dad-lab/reportArtifacts.test.ts`, exercising the rule through a
 * real `DadLabReport`.
 */
describe("reportArtifactIds — one answer to 'what is on this report' (UX-85)", () => {
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

  it("unions both sources in child-reports-then-beats order, skipping empty ids", () => {
    // Every rule at once — the case the old cross-project parity fixture carried.
    expect(
      reportArtifactIds({
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
      }),
    ).toEqual(["art-shared", "art-child", "art-london", "art-beat", "art-saw"]);
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
