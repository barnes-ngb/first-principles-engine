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

  // ── Theme-aware reimagine tests ─────────────────────────────────

  it("injects minecraft theme style into prompt", () => {
    const result = buildEnhancePrompt("storybook", undefined, "minecraft");
    expect(result).toContain("Visual theme:");
    expect(result).toContain("pixel-art");
    expect(result).toContain("Minecraft");
  });

  it("injects fantasy theme style into prompt", () => {
    const result = buildEnhancePrompt("storybook", undefined, "fantasy");
    expect(result).toContain("Visual theme:");
    expect(result).toContain("fairy-tale");
  });

  it("injects adventure theme style into prompt", () => {
    const result = buildEnhancePrompt("storybook", undefined, "adventure");
    expect(result).toContain("Visual theme:");
    expect(result).toContain("adventure");
  });

  it("ignores unknown theme IDs gracefully", () => {
    const result = buildEnhancePrompt("storybook", undefined, "unknown-theme");
    expect(result).not.toContain("Visual theme:");
  });

  it("omits theme clause when theme is undefined", () => {
    const result = buildEnhancePrompt("storybook", undefined, undefined);
    expect(result).not.toContain("Visual theme:");
  });

  it("combines caption and theme in prompt", () => {
    const result = buildEnhancePrompt("comic", "a castle", "fantasy");
    expect(result).toContain('The child described this as: "a castle"');
    expect(result).toContain("Visual theme:");
    expect(result).toContain("fairy-tale");
    expect(result).toContain("bold, colorful comic book");
  });

  it("includes theme style for all preset themes", () => {
    const themes = [
      "minecraft", "fantasy", "adventure", "animals", "science",
      "space", "faith", "dinosaurs", "ocean", "superheroes",
      "holidays", "cooking", "sports", "family", "sight_words",
    ];
    for (const theme of themes) {
      const result = buildEnhancePrompt("storybook", undefined, theme);
      expect(result).toContain("Visual theme:");
    }
  });
});
