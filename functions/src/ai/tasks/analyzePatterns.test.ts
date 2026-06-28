import { describe, expect, it } from "vitest";
import {
  buildPatternAnalysisPrompt,
  summarizeSupports,
} from "./analyzePatterns.js";

// ── summarizeSupports ────────────────────────────────────────────

describe("summarizeSupports", () => {
  it("joins support labels with semicolons", () => {
    const desc = summarizeSupports([
      { label: "Finger tracking", description: "Track words with finger" },
      { label: "Visual checklist", description: "Picture steps" },
    ]);
    expect(desc).toBe("Finger tracking; Visual checklist");
  });

  it("returns empty string when there are no supports", () => {
    expect(summarizeSupports([])).toBe("");
    expect(summarizeSupports(undefined)).toBe("");
  });

  it("drops blank or missing labels", () => {
    const desc = summarizeSupports([
      { label: "Speech support", description: "short routines" },
      { label: "   ", description: "ignored" },
      { description: "no label" },
    ]);
    expect(desc).toBe("Speech support");
  });
});

// ── buildPatternAnalysisPrompt ───────────────────────────────────

describe("buildPatternAnalysisPrompt", () => {
  it("includes support-aware framing when supports are present (no name dependency)", () => {
    const prompt = buildPatternAnalysisPrompt(
      10,
      "Speech support; Short routines",
    );
    expect(prompt).toContain("10 years old");
    expect(prompt).toContain("confirmed learning supports in place");
    expect(prompt).toContain("Speech support; Short routines");
  });

  it("omits support framing when there are no confirmed supports", () => {
    const prompt = buildPatternAnalysisPrompt(6, "");
    expect(prompt).toContain("6 years old");
    expect(prompt).not.toContain("confirmed learning supports in place");
  });

  it("falls back to 'school age' when age is unknown", () => {
    const prompt = buildPatternAnalysisPrompt(null, "");
    expect(prompt).toContain("school age");
  });

  it("does not hardcode any child name or 'neurodivergent' label", () => {
    const prompt = buildPatternAnalysisPrompt(10, "Finger tracking");
    expect(prompt.toLowerCase()).not.toContain("lincoln");
    expect(prompt.toLowerCase()).not.toContain("neurodivergent");
  });
});
