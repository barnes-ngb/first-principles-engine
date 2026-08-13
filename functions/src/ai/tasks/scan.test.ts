import { describe, it, expect } from "vitest";
import { buildScanSystemPrompt, formatCaptureContext } from "./scan.js";

// FEAT-141: the scan prompt is the ONE analysis pass a captured image gets, and
// this run extends it rather than adding a second call. These cases pin the two
// additive pieces: the contentNote instruction, and the capture context that
// grounds it.
describe("formatCaptureContext", () => {
  it("is empty when the caller has no context (prompt unchanged)", () => {
    expect(formatCaptureContext(undefined)).toBe("");
    expect(formatCaptureContext({})).toBe("");
  });

  it("names the planned activity and subject when it has them", () => {
    const text = formatCaptureContext({
      itemLabel: "GATB Math",
      subjectBucket: "Math",
    });
    expect(text).toContain("Planned activity: GATB Math");
    expect(text).toContain("Subject: Math");
  });

  it("renders whichever half it was given", () => {
    expect(formatCaptureContext({ itemLabel: "Read aloud" })).toContain(
      "Planned activity: Read aloud",
    );
    expect(formatCaptureContext({ itemLabel: "Read aloud" })).not.toContain("Subject:");
  });
});

describe("buildScanSystemPrompt — FEAT-141", () => {
  it("asks for a contentNote on both the worksheet and certificate shapes", () => {
    const prompt = buildScanSystemPrompt("Lincoln", "3", []);
    // Once in the worksheet schema, once in the certificate schema — both
    // response shapes must carry it, or half the captures come back note-less.
    expect(prompt).toContain(
      '"contentNote": "string — ONE line, 140 characters MAX, plainly describing what is actually in this photo"',
    );
    expect(prompt).toContain(
      '"contentNote": "string — ONE line, 140 characters MAX, plainly describing what is in this photo"',
    );
  });

  it("tells the model that non-workbook photos are described on their own terms", () => {
    const prompt = buildScanSystemPrompt("Lincoln", "3", []);
    expect(prompt).toContain("Many photos are NOT workbook pages");
    // The note is parent-side metadata; the prompt must say so.
    expect(prompt).toContain("never shown to the child");
  });

  it("includes the capture context only when one was passed", () => {
    const without = buildScanSystemPrompt("Lincoln", "3", []);
    expect(without).not.toContain("CAPTURE CONTEXT");

    const withCtx = buildScanSystemPrompt("Lincoln", "3", [], {
      itemLabel: "GATB Math",
      subjectBucket: "Math",
    });
    expect(withCtx).toContain("CAPTURE CONTEXT");
    expect(withCtx).toContain("Planned activity: GATB Math");
  });
});
