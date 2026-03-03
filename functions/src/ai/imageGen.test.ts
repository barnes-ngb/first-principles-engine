import { describe, expect, it } from "vitest";
import { buildImagePrompt } from "./imageGen.js";

describe("buildImagePrompt", () => {
  it("prepends schedule-card style prefix", () => {
    const result = buildImagePrompt("morning routine", "schedule-card");
    expect(result).toContain(
      "A friendly, colorful visual schedule card for a child's daily routine",
    );
    expect(result).toContain("morning routine");
    expect(result).toContain("Safe for children");
  });

  it("prepends reward-chart style prefix", () => {
    const result = buildImagePrompt("star chart", "reward-chart");
    expect(result).toContain(
      "A cheerful, motivating reward chart illustration",
    );
    expect(result).toContain("star chart");
  });

  it("prepends theme-illustration style prefix", () => {
    const result = buildImagePrompt("ocean life", "theme-illustration");
    expect(result).toContain(
      "A warm, educational illustration for a homeschool family",
    );
    expect(result).toContain("ocean life");
  });

  it("uses no prefix for general style", () => {
    const result = buildImagePrompt("a happy dog", "general");
    expect(result).toBe(
      "a happy dog. Safe for children, family-friendly, no text overlays.",
    );
  });

  it("defaults to general when style is undefined", () => {
    const result = buildImagePrompt("a rainbow", undefined);
    expect(result).toBe(
      "a rainbow. Safe for children, family-friendly, no text overlays.",
    );
  });

  it("always appends safety postfix", () => {
    for (const style of [
      "schedule-card",
      "reward-chart",
      "theme-illustration",
      "general",
      undefined,
    ]) {
      const result = buildImagePrompt("test", style);
      expect(result).toContain(
        "Safe for children, family-friendly, no text overlays.",
      );
    }
  });
});
