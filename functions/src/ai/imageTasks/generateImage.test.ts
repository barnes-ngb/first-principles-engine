import { describe, expect, it } from "vitest";
import { BOOK_ILLUSTRATION_STYLE_KEYS, STYLE_PREFIXES, buildImagePrompt } from "./generateImage.js";

/**
 * The theme prefix a superhero story idea actually produced before FEAT-174:
 * `inferBookTheme` matches the idea's word "hero" to the `adventure` theme, and
 * `adventure` IS in the server's preset map, so this string replaced whatever
 * illustration style the parent had picked.
 */
const ADVENTURE_THEME_PREFIX =
  "A colorful adventure scene for a children's book. Exciting landscapes, treasure maps, hidden paths.";

describe("buildImagePrompt — the picked style owns the look (FEAT-174)", () => {
  it("keeps the comic style when a theme prefix is also present", () => {
    const prompt = buildImagePrompt(
      "a hero flies over the city",
      "book-illustration-comic",
      ADVENTURE_THEME_PREFIX,
    );

    // The reported bug: Comic Book rendered as a generic storybook scene because
    // the theme prefix replaced the comic one outright.
    expect(prompt).not.toContain("treasure maps");
    expect(prompt).not.toContain(ADVENTURE_THEME_PREFIX);
    expect(prompt).toContain("comic book");
    expect(prompt).toContain("halftone");
    expect(prompt).toContain("a hero flies over the city");
  });

  it("keeps every book illustration style intact against a theme prefix", () => {
    for (const styleKey of BOOK_ILLUSTRATION_STYLE_KEYS) {
      const prompt = buildImagePrompt("a scene", styleKey, ADVENTURE_THEME_PREFIX);
      expect(prompt).toContain(STYLE_PREFIXES[styleKey]);
      expect(prompt).not.toContain(ADVENTURE_THEME_PREFIX);
    }
  });

  it("still uses the theme prefix when the style has no look of its own", () => {
    // `general` contributes nothing, so a theme is the only art direction there.
    expect(buildImagePrompt("a scene", "general", ADVENTURE_THEME_PREFIX)).toContain(
      ADVENTURE_THEME_PREFIX,
    );
    expect(buildImagePrompt("a scene", undefined, ADVENTURE_THEME_PREFIX)).toContain(
      ADVENTURE_THEME_PREFIX,
    );
  });

  it("never emits both a style prefix and a theme prefix", () => {
    // Two whole-image style sentences in one prompt is two art directions.
    const prompt = buildImagePrompt("a scene", "book-illustration-storybook", ADVENTURE_THEME_PREFIX);
    expect(prompt).not.toContain(ADVENTURE_THEME_PREFIX);
  });

  it("keeps the user's prompt and the safety postfix", () => {
    const prompt = buildImagePrompt("a red barn", "book-illustration-comic");
    expect(prompt).toContain("a red barn");
    expect(prompt).toContain("Safe for children, family-friendly, no text overlays.");
  });
});

/**
 * The FEAT-159 near-collapse guard, on the book-illustration surface. Three of
 * the six styles used to name only adjectives ("bold", "dynamic", "soft colors",
 * "warm lighting"), which is what every children's book illustration already is,
 * so they drifted toward one generic look. A style added later must not be able
 * to reintroduce that.
 */
describe("book illustration style prefixes are distinguishable", () => {
  it("covers all six styles a parent can pick", () => {
    expect(BOOK_ILLUSTRATION_STYLE_KEYS).toHaveLength(6);
    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      expect(STYLE_PREFIXES[key] ?? "").not.toBe("");
    }
  });

  it("are pairwise distinct", () => {
    const prefixes = BOOK_ILLUSTRATION_STYLE_KEYS.map((k) => STYLE_PREFIXES[k]);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("each name at least one concrete visual noun, not adjectives alone", () => {
    // Things you could point at in the finished picture — a renderer can draw
    // "halftone" or "green pipes"; it cannot draw "bold" or "dynamic".
    const CONCRETE_NOUNS = [
      "halftone",
      "ink",
      "outline",
      "watercolor",
      "paper",
      "cube",
      "block",
      "pixel",
      "pipe",
      "coin",
      "platform",
      "sunflower",
      "pea shooter",
      "walnut",
      "cast shadow",
      "speed line",
      "brush",
      "wash",
    ];

    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      const prefix = (STYLE_PREFIXES[key] ?? "").toLowerCase();
      const named = CONCRETE_NOUNS.filter((noun) => prefix.includes(noun));
      expect(named, `${key} names only adjectives — give it a concrete visual noun`).not.toHaveLength(0);
    }
  });

  it("each answer palette, line work and shading", () => {
    // The three questions FEAT-159's VisualRecipe exists to force an answer to.
    // Garden Battle and Platformer World predate the recipe table and describe a
    // specific world instead, so they are exempt — but the three that collapsed
    // must stay specific.
    const RECIPE_STYLES = [
      "book-illustration-comic",
      "book-illustration-storybook",
      "book-illustration-realistic",
    ];
    for (const key of RECIPE_STYLES) {
      const prefix = STYLE_PREFIXES[key] ?? "";
      expect(prefix, key).toContain("Palette:");
      expect(prefix, key).toContain("Line work:");
      expect(prefix, key).toContain("Shading:");
    }
  });
});
