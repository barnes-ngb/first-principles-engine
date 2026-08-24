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

  // ── Transparent (sticker) reimagine tests ──────────────────────

  it("omits transparent clause when transparent flag is undefined or false", () => {
    const noFlag = buildEnhancePrompt("storybook");
    expect(noFlag).not.toContain("TRANSPARENT");
    expect(noFlag).not.toContain("clean cutout");

    const explicitFalse = buildEnhancePrompt("storybook", undefined, undefined, false);
    expect(explicitFalse).not.toContain("TRANSPARENT");
    expect(explicitFalse).not.toContain("clean cutout");
  });

  it("adds transparent-background instruction when transparent=true", () => {
    const result = buildEnhancePrompt("storybook", undefined, undefined, true);
    expect(result).toContain("TRANSPARENT background");
    expect(result).toContain("No background scene");
    expect(result).toContain("no shadows on the ground");
    expect(result).toContain("clean cutout");
    expect(result).toContain("sticker");
  });

  it("combines transparent flag with caption and theme", () => {
    const result = buildEnhancePrompt("storybook", "a dragon", "fantasy", true);
    expect(result).toContain('The child described this as: "a dragon"');
    expect(result).toContain("Visual theme:");
    expect(result).toContain("fairy-tale");
    expect(result).toContain("TRANSPARENT background");
    // Safety postfix still present
    expect(result).toContain("Safe for children, family-friendly");
  });
});

// ── FEAT-159: styles you can tell apart ────────────────────────────

/**
 * The nine "Make it fancy" options exactly as the client sends them — mirrors
 * `FANCY_STYLE_OPTIONS` / `resolveFancyEnhanceParams` in
 * `src/features/books/drawingStickerStyles.ts`. That file's own suite asserts
 * this id list, so a change on either side breaks a test rather than silently
 * drifting.
 */
const FANCY_PAYLOADS: Array<{
  id: string;
  style?: string;
  theme?: string;
}> = [
  { id: "cartoon", style: "storybook" },
  { id: "fantasy", theme: "fantasy" },
  { id: "animals", theme: "animals" },
  { id: "adventure", theme: "adventure" },
  { id: "space", theme: "space" },
  { id: "science", theme: "science" },
  { id: "faith", theme: "faith" },
  { id: "family", theme: "family" },
  { id: "minecraft", style: "minecraft", theme: "minecraft" },
];

describe("buildEnhancePrompt — style distinctness (FEAT-159)", () => {
  const render = (p: (typeof FANCY_PAYLOADS)[number]) =>
    buildEnhancePrompt(p.style, undefined, p.theme, true);

  it("renders a distinct prompt for every fancy option", () => {
    // The test that would have caught a collapse: pairwise inequality across
    // the whole option list.
    for (let i = 0; i < FANCY_PAYLOADS.length; i++) {
      for (let j = i + 1; j < FANCY_PAYLOADS.length; j++) {
        expect(
          render(FANCY_PAYLOADS[i]),
          `"${FANCY_PAYLOADS[i].id}" and "${FANCY_PAYLOADS[j].id}" render the same prompt`,
        ).not.toBe(render(FANCY_PAYLOADS[j]));
      }
    }
  });

  it("gives every option its own opening style sentence", () => {
    // Before FEAT-159 eight of nine options opened with the identical
    // watercolor sentence, so the model had almost nothing to separate them by.
    const openings = FANCY_PAYLOADS.map(
      (p) => render(p).split(", inspired by")[0],
    );
    expect(new Set(openings).size).toBe(FANCY_PAYLOADS.length);
  });

  it("names palette, line work and shading for every option", () => {
    for (const payload of FANCY_PAYLOADS) {
      const prompt = render(payload);
      expect(prompt, payload.id).toContain("Palette:");
      expect(prompt, payload.id).toContain("Line work:");
      expect(prompt, payload.id).toContain("Shading:");
    }
  });

  it("gives every option distinct palette, line and shading language", () => {
    const grab = (prompt: string, from: string, to: string) =>
      prompt.slice(prompt.indexOf(from), prompt.indexOf(to));
    const palettes = FANCY_PAYLOADS.map((p) =>
      grab(render(p), "Palette:", "Line work:"),
    );
    const lines = FANCY_PAYLOADS.map((p) =>
      grab(render(p), "Line work:", "Shading:"),
    );
    expect(new Set(palettes).size).toBe(FANCY_PAYLOADS.length);
    expect(new Set(lines).size).toBe(FANCY_PAYLOADS.length);
  });

  it("lets the theme own the look when no base style is named", () => {
    // A themed option must not inherit the generic watercolor sentence — that
    // inheritance is what made Fantasy and Cartoon come back looking alike.
    const fantasy = buildEnhancePrompt(undefined, undefined, "fantasy", true);
    expect(fantasy).not.toContain("warm hand-painted watercolor");
    expect(fantasy).toContain("fairy-tale");
  });

  it("still honors an explicitly named base style alongside a theme", () => {
    // The book reimagine path always names a style; it keeps both blocks.
    const both = buildEnhancePrompt("comic", undefined, "fantasy", false);
    expect(both).toContain("bold, colorful comic book");
    expect(both).toContain("fairy-tale");
  });

  it("tells the model not to drift toward a generic cartoon look", () => {
    expect(buildEnhancePrompt("storybook")).toContain(
      "do not drift toward a generic soft cartoon look",
    );
  });
});

describe("buildEnhancePrompt — one recipe, never two (FEAT-159)", () => {
  // `useBackgroundReimagine` always sends a style AND the book's theme, so this
  // both-present case is the live reimagine path, not a hypothetical.
  const MINECRAFT_RECIPE_STRINGS = [
    "a limited 16-color palette of saturated greens",
    "forms are stacked hard-edged cubes",
    "flat per-face shading only — one solid tone per cube face",
  ];

  it("keeps the theme to its summary when a base style is named", () => {
    const prompt = buildEnhancePrompt("storybook", undefined, "minecraft");
    // The named style's own recipe is what the model follows...
    expect(prompt).toContain("translucent watercolor washes");
    // ...and the theme is present, but only as its one-line summary.
    expect(prompt).toContain("Visual theme:");
    expect(prompt).toContain("Blocky pixel-art Minecraft style");
    for (const fragment of MINECRAFT_RECIPE_STRINGS) {
      expect(prompt, `theme recipe leaked: ${fragment}`).not.toContain(fragment);
    }
  });

  it("emits exactly one palette/line/shading block in the both-present case", () => {
    const prompt = buildEnhancePrompt("comic", undefined, "fantasy", false);
    const count = (needle: string) => prompt.split(needle).length - 1;
    expect(count("Palette:")).toBe(1);
    expect(count("Line work:")).toBe(1);
    expect(count("Shading:")).toBe(1);
  });

  it("still spells the theme out in full when the theme owns the look", () => {
    const prompt = buildEnhancePrompt(undefined, undefined, "minecraft", true);
    for (const fragment of MINECRAFT_RECIPE_STRINGS) {
      expect(prompt).toContain(fragment);
    }
    expect(prompt).not.toContain("warm hand-painted watercolor");
  });

  it("never asks the model to follow two competing recipes", () => {
    // Every shape the builder can produce carries at most one full recipe.
    const shapes: Array<[string | undefined, string | undefined]> = [
      ["storybook", undefined],
      ["storybook", "minecraft"],
      ["comic", "fantasy"],
      ["minecraft", "minecraft"],
      [undefined, "fantasy"],
      [undefined, undefined],
    ];
    for (const [style, theme] of shapes) {
      const prompt = buildEnhancePrompt(style, undefined, theme, true);
      expect(
        prompt.split("Palette:").length - 1,
        `style=${style} theme=${theme}`,
      ).toBe(1);
    }
  });
});
