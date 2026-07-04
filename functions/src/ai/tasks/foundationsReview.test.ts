import { describe, expect, it } from "vitest";
import {
  buildFoundationsReviewRole,
  extractReviewAgenda,
  formatAgenda,
} from "./foundationsReview.js";
import type { ChatTaskMessage } from "../chatTypes.js";

const AGENDA = {
  domain: "reading",
  subjectLabel: "reading",
  concepts: [
    { conceptId: "reading.phonics.blends", name: "Blend sounds", description: "Reads words like stop, frog", state: "frontier", evidence: ["from the June check"] },
    { conceptId: "reading.phonics.longVowels", name: "Long vowel words", description: "Reads words like cake, boat", state: "not-yet", evidence: [] },
  ],
};

describe("extractReviewAgenda", () => {
  it("pulls the agenda from the marker and cleans the message", () => {
    const messages: ChatTaskMessage[] = [
      { role: "user", content: `[FOUNDATIONS_REVIEW]${JSON.stringify(AGENDA)}[/FOUNDATIONS_REVIEW]\nStart it.` },
    ];
    const { agenda, messages: out } = extractReviewAgenda(messages);
    expect(agenda?.concepts).toHaveLength(2);
    expect(out[0].content).not.toContain("FOUNDATIONS_REVIEW");
    expect(out[0].content).toContain("Start it.");
  });

  it("supplies a clean start line when the marker is the whole message", () => {
    const messages: ChatTaskMessage[] = [
      { role: "user", content: `[FOUNDATIONS_REVIEW]${JSON.stringify(AGENDA)}[/FOUNDATIONS_REVIEW]` },
    ];
    const { messages: out } = extractReviewAgenda(messages);
    expect(out[0].content).toBe("Let's start the reading review.");
  });

  it("tolerates a missing/unparseable marker (null agenda, messages untouched)", () => {
    const messages: ChatTaskMessage[] = [{ role: "user", content: "hello" }];
    const { agenda, messages: out } = extractReviewAgenda(messages);
    expect(agenda).toBeNull();
    expect(out[0].content).toBe("hello");
  });
});

describe("formatAgenda", () => {
  it("renders concepts in order with plain names, no band numbers", () => {
    const text = formatAgenda(AGENDA);
    expect(text).toContain("EXACT ORDER");
    expect(text).toContain("Blend sounds");
    // ordered
    expect(text.indexOf("Blend sounds")).toBeLessThan(text.indexOf("Long vowel words"));
  });

  it("handles an empty agenda gracefully", () => {
    expect(formatAgenda({ domain: "math", subjectLabel: "math", concepts: [] })).toContain("empty");
    expect(formatAgenda(null)).toContain("empty");
  });
});

describe("buildFoundationsReviewRole — locked display + action rules", () => {
  const role = buildFoundationsReviewRole("child-1", "Lincoln", "reading");

  it("threads the childId into the action grammar and names all three write kinds", () => {
    expect(role).toContain('"childId":"child-1"');
    expect(role).toContain('"kind":"attest"');
    expect(role).toContain('"kind":"covered"');
    expect(role).toContain('"kind":"queueTest"');
  });

  it("forbids band numbers and percentages, and carries no-shame rails", () => {
    expect(role).toContain("NEVER show band numbers");
    expect(role).toContain("NEVER show percentages");
    expect(role.toLowerCase()).toContain("no shame");
    expect(role).toContain("PROPOSED"); // never "saved/done"
  });
});
