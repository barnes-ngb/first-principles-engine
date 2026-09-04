import { describe, expect, it } from "vitest";
import {
  BOOK_ILLUSTRATION_STYLE_KEYS,
  STYLE_PREFIXES,
  bookIllustrationRecipe,
  buildImagePrompt,
} from "./generateImage.js";

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
    // Garden Battle, Platformer World and Minecraft used to be exempt — they
    // predated the recipe table and described a specific world instead. FEAT-189
    // brought them in, so all six answer all three now and there is no exemption
    // for a style to be added under.
    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      const prefix = STYLE_PREFIXES[key] ?? "";
      expect(prefix, key).toContain("Palette:");
      expect(prefix, key).toContain("Line work:");
      expect(prefix, key).toContain("Shading:");
    }
  });
});

/**
 * FEAT-189 — the world styles split the canvas.
 *
 * Minecraft, Garden Battle and Platformer World named their world as a *scene*
 * ("Bright blue sky, floating brick platforms, green pipes, golden coins…").
 * `buildImagePrompt` appends the page's own scene after the style prefix, so a
 * page reading "Tom had a map. He was in the hut." reached the model as two
 * incompatible scenes and it satisfied both by splitting the image — a reported
 * platformer strip above a realistic cabin interior, and a "Tom saw a big pit"
 * page that came back as two half-images side by side.
 */
describe("world styles are looks, not scene lists (FEAT-189)", () => {
  /** The three styles whose world flavour is now conditional set-dressing. */
  const WORLD_STYLES = {
    "book-illustration-platformer": [
      "brick platform",
      "green pipe",
      "gold coin",
      "question block",
      "mushroom",
    ],
    "book-illustration-garden-warfare": [
      "sunflower",
      "pea shooter",
      "walnut",
      "zombie",
    ],
    "book-illustration-minecraft": ["stepped terrain", "torch", "ore seam"],
  } as const;

  const PROPS_CLAUSE = /Where the scene allows, dress it with the world's props \([^)]*\); when the scene is indoors or somewhere else, keep the LOOK and drop the props\. /;

  it("no longer opens the platformer prompt with a scene list", () => {
    // The exact string the owner's split-canvas pages were drawn from.
    const prefix = STYLE_PREFIXES["book-illustration-platformer"] ?? "";
    expect(prefix).not.toContain(
      "A colorful side-scrolling platformer video game world for a children's book page.",
    );
    expect(prefix).not.toContain("Bright blue sky, floating brick platforms");
  });

  it("names each world as a rendering, never as a scene, in its summary", () => {
    // A summary that names subject matter is an instruction to draw it. These
    // name what the picture is drawn to look LIKE, which composes with any page.
    const SCENE_NOUNS = [
      "blue sky",
      "brick platform",
      "green pipe",
      "coin",
      "power-up",
      "sunflower",
      "pea shooter",
      "walnut",
      "zombie",
      "mined terrain",
    ];
    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      const summary = (bookIllustrationRecipe(key)?.summary ?? "").toLowerCase();
      expect(summary, key).not.toBe("");
      for (const noun of SCENE_NOUNS) {
        expect(summary, `${key} summary names the scene noun "${noun}"`).not.toContain(noun);
      }
    }
  });

  it("states world props as conditional set-dressing, on those three only", () => {
    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      const prefix = STYLE_PREFIXES[key] ?? "";
      const isWorld = key in WORLD_STYLES;
      expect(PROPS_CLAUSE.test(prefix), `${key} props clause`).toBe(isWorld);
    }
  });

  it("keeps every world prop inside that clause and nowhere else", () => {
    // This is the fix: outside the "where the scene allows" sentence the prompt
    // must say nothing about what is IN the picture, so an indoor page has no
    // second scene to reconcile.
    for (const [key, props] of Object.entries(WORLD_STYLES)) {
      const prefix = STYLE_PREFIXES[key] ?? "";
      const withoutProps = prefix.replace(PROPS_CLAUSE, "").toLowerCase();
      for (const prop of props) {
        expect(prefix.toLowerCase(), `${key} should still offer "${prop}"`).toContain(prop);
        expect(
          withoutProps,
          `${key} states "${prop}" unconditionally — it will fight the page's own scene`,
        ).not.toContain(prop);
      }
    }
  });

  it("tells every book style the answer is one picture", () => {
    // In the shared framing, not per style, so the next style added inherits it.
    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      expect(STYLE_PREFIXES[key] ?? "", key).toContain(
        "One single, unified scene filling the whole image — never split panels, halves, strips, collages or borders.",
      );
    }
  });

  it("never states a ban Garden Battle's own props would break", () => {
    // Codex P2, twice. Before FEAT-189, Garden Battle was the ONLY style saying
    // "no specific characters" instead of "no characters or people", because its
    // look asks for silly cartoon zombies; routing it through the shared framing
    // took the allowance away and kept the prop. The first fix appended a later
    // sentence calling the zombies "not the story's characters" — which describes
    // what they are not and never exempts them, so the model could still satisfy
    // "no characters" by dropping them. The contradiction must not be emitted at
    // all, not stated and then walked back.
    const garden = STYLE_PREFIXES["book-illustration-garden-warfare"] ?? "";
    expect(garden).toContain("silly cartoon zombies");
    expect(garden).not.toContain("no characters or people");
    expect(garden).toContain("no people, and none of the story's characters");
    expect(garden).toContain("those ARE allowed and expected");
  });

  it("keeps the categorical ban on every style whose props are objects", () => {
    // The exception is scoped to the style that opts in — a blanket one would
    // invite creatures into a Minecraft or Platformer page whose props are
    // blocks, terrain, pipes and coins.
    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      const prefix = STYLE_PREFIXES[key] ?? "";
      if (key === "book-illustration-garden-warfare") continue;
      expect(prefix, key).toContain("Environment and background only, no characters or people.");
      expect(prefix, key).not.toContain("ARE allowed and expected");
    }
  });

  it("forbids people and story characters on all six either way", () => {
    // Both framings ban the same two things; only the prop-creature exception
    // differs, so no style can quietly stop excluding the story's cast.
    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      const prefix = STYLE_PREFIXES[key] ?? "";
      expect(prefix, key).toContain("Environment and background only");
      expect(prefix, key).toMatch(
        /no characters or people|no people, and none of the story's characters/,
      );
    }
  });

  it("sends this exact prompt for Platformer World on an indoor page", () => {
    // The reported page: "Tom had a map. He was in the hut." Reviewable in full
    // because the whole point of the fix is what the model is told here.
    expect(
      buildImagePrompt(
        "inside a wooden hut, a lantern, a rolled map on the table",
        "book-illustration-platformer",
      ),
    ).toMatchInlineSnapshot(`"A children's book page drawn in the look of a classic side-scrolling platformer video game. One single, unified scene filling the whole image — never split panels, halves, strips, collages or borders. Environment and background only, no characters or people. Palette: saturated primaries — bright blue, warm red, gold and green — in flat unblended fills with no gradients. Line work: thick, clean outlines of even weight around chunky rounded shapes; nothing wispy or sketchy. Shading: flat cel shading in two steps per shape, drawn side-on in 2D with no perspective depth and no soft light. Where the scene allows, dress it with the world's props (brick platforms, green pipes, gold coins, question blocks, fluffy clouds, mushroom shapes); when the scene is indoors or somewhere else, keep the LOOK and drop the props. inside a wooden hut, a lantern, a rolled map on the table. Safe for children, family-friendly, no text overlays."`);
  });
});
