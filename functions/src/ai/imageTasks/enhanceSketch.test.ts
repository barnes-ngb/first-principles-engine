import { describe, expect, it } from "vitest";
import { buildEnhancePrompt } from "./enhanceSketch.js";

describe("buildEnhancePrompt", () => {
  it("builds prompt without caption", () => {
    const result = buildEnhancePrompt("storybook");
    expect(result).toContain("warm hand-painted watercolor");
    expect(result).toContain("inspired by this child's hand-drawn sketch");
    expect(result).not.toContain("The child described this as");
  });

  it("builds prompt with caption included", () => {
    const result = buildEnhancePrompt("comic", "a dragon breathing fire");
    expect(result).toContain("bold, colorful comic book");
    expect(result).toContain('The child described this as: "a dragon breathing fire"');
  });

  it("defaults to storybook style when style is undefined", () => {
    const result = buildEnhancePrompt(undefined);
    expect(result).toContain("warm hand-painted watercolor");
  });

  it("defaults to storybook style when style is unknown", () => {
    const result = buildEnhancePrompt("unknown-style");
    expect(result).toContain("warm hand-painted watercolor");
  });

  it("applies minecraft style", () => {
    const result = buildEnhancePrompt("minecraft");
    expect(result).toContain("blocky pixel art");
  });

  it("always includes safety postfix", () => {
    const result = buildEnhancePrompt("storybook", "some caption");
    expect(result).toContain("Safe for children, family-friendly, no text overlays");
  });
});
