import { describe, expect, it } from "vitest";
import {
  BOOK_ILLUSTRATION_STYLE_KEYS,
  PRESET_IMAGE_PREFIXES,
  STYLE_PREFIXES,
  bookIllustrationRecipe,
  buildImagePrompt,
  gameArtRecipe,
  stickerRecipe,
} from "./generateImage.js";
import { recipeMediums } from "./visualRecipe.js";

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

// ── FEAT-193 ───────────────────────────────────────────────────────

describe("the medium rule — no two book styles share one (FEAT-193 / UX-179)", () => {
  // The sticker picker's Cartoon/Fantasy collapse was a shared *medium*, not
  // shared words. The same rule holds here, and it is what separates the closest
  // measured pair in this picker (Garden Battle ↔ Platformer World, .204): both
  // were "flat saturated fills + thick even outlines + two-step cel", so once
  // FEAT-189 made their props conditional they rested on palette alone.
  const recipes = BOOK_ILLUSTRATION_STYLE_KEYS.map((key) => ({
    key,
    recipe: bookIllustrationRecipe(key)!,
  }));

  it("names a medium for every style", () => {
    for (const { key, recipe } of recipes) {
      expect(recipeMediums(recipe), `${key} names no medium`).not.toHaveLength(0);
    }
  });

  it("gives every style a medium no sibling uses", () => {
    const byMedium = new Map<string, string[]>();
    for (const { key, recipe } of recipes) {
      for (const medium of recipeMediums(recipe)) {
        byMedium.set(medium, [...(byMedium.get(medium) ?? []), key]);
      }
    }
    for (const [medium, keys] of byMedium) {
      expect(keys, `"${medium}" is named by ${keys.join(" and ")}`).toHaveLength(1);
    }
  });

  it("separates Garden Battle from Platformer World structurally, not just on palette (UX-171)", () => {
    // Platformer World always had one: "drawn side-on in 2D with no perspective
    // depth". Garden Battle had none until FEAT-193.
    const garden = bookIllustrationRecipe("book-illustration-garden-warfare")!;
    const platformer = bookIllustrationRecipe("book-illustration-platformer")!;
    expect(platformer.shading).toContain("side-on in 2D");
    expect(garden.shading).toMatch(/three-quarter view/);
    expect(garden.shading).not.toContain("side-on");
  });
});

describe("the two fixed looks are real recipes (FEAT-193 / UX-163, UX-164)", () => {
  // `book-sticker` sits behind three paid doors with no style picker, and was
  // the one look never given the VisualRecipe treatment: "A single cute cartoon
  // character or object, sticker style. Bold clean outline, colorful flat fill,
  // simple shapes, fun and expressive." — adjectives plus a subject constraint.
  // `game-art` did not exist: every Workshop picture was sent as `general`, the
  // empty prefix, while the help sheet claimed one fixed children's-game look.
  for (const [key, name] of [
    ["book-sticker", "sticker"],
    ["game-art", "game art"],
  ] as const) {
    it(`answers palette, line work and shading for ${name}`, () => {
      const prefix = STYLE_PREFIXES[key] ?? "";
      expect(prefix, key).not.toBe("");
      expect(prefix, key).toContain("Palette:");
      expect(prefix, key).toContain("Line work:");
      expect(prefix, key).toContain("Shading:");
    });

  }

  it("carries the never-split guardrail on the sticker (FEAT-189)", () => {
    expect(STYLE_PREFIXES["book-sticker"]).toContain(
      "never split panels, halves, strips, collages or borders",
    );
  });

  it("keeps game art look-only — it states no framing at all", () => {
    // Codex P1, round 2 on PR #1766. This one prefix is prepended to every
    // Workshop prompt including the parent token ("a circular icon, on
    // transparent background"), which runs on `background: "auto"` because the
    // callable forces transparency only for `book-sticker`. A framing sentence
    // demanding a scene that fills the whole image fights the token's own
    // request, and a paid token could come back opaque and full-scene. So the
    // recipe says how to draw and each prompt keeps saying what shape it is —
    // the FEAT-189 split.
    const prefix = STYLE_PREFIXES["game-art"] ?? "";
    for (const framing of [
      "unified scene",
      "filling the whole image",
      "never split panels",
      "Environment and background only",
      "centered",
      "transparent",
    ]) {
      expect(prefix, `game art states framing: "${framing}"`).not.toContain(
        framing,
      );
    }
    // Still a complete look.
    expect(prefix).toContain("Palette:");
    expect(prefix).toContain("Line work:");
    expect(prefix).toContain("Shading:");
  });

  it("states the sticker's rule without taking it back", () => {
    // A sticker is not a scene, so the page styles' "one single, unified SCENE
    // filling the whole image" followed by "no background elements, no SCENE"
    // would be a rule and its own contradiction — the shape PR #1759 established
    // must never be emitted rather than patched. The rule itself still has one
    // definition; only the subject sentence in front of it differs.
    const prefix = STYLE_PREFIXES["book-sticker"] ?? "";
    expect(prefix).toContain("One single subject, centered and complete");
    expect(prefix).toContain("never a sheet or grid of several stickers");
    expect(prefix).not.toContain("unified scene");
  });

  it("keeps the six page styles' framing byte-identical (FEAT-189)", () => {
    for (const key of BOOK_ILLUSTRATION_STYLE_KEYS) {
      expect(STYLE_PREFIXES[key], key).toContain(
        "One single, unified scene filling the whole image — never split panels, halves, strips, collages or borders. ",
      );
    }
  });

  it("asks for no shadow a cutout would remove (UX-162)", () => {
    // Both are rendered on transparent backgrounds — the sticker style always
    // (`isSticker` in the callable), and the Workshop's parent tokens by their
    // own prompt — so their shading is written cutout-safe outright.
    for (const recipe of [stickerRecipe(), gameArtRecipe()]) {
      const ask = recipe.shading.replace(
        /\bno\s+(?:hard\s+|harsh\s+|soft\s+|black\s+)*(?:cast|drop|long)?\s*shadows?\b/gi,
        " ",
      );
      expect(ask).not.toMatch(/cast shadows?|drop shadows?|shadows? on the ground/i);
    }
  });

  it("keeps the sticker's single-subject constraint out of the look itself", () => {
    // The subject rule is framing, not a look — the recipe answers only the
    // three look questions, the way the six page styles do.
    const recipe = stickerRecipe();
    expect(`${recipe.palette} ${recipe.line} ${recipe.shading}`).not.toMatch(
      /single|one character/i,
    );
    expect(STYLE_PREFIXES["book-sticker"]).toContain(
      "Exactly one character or object",
    );
  });
});

describe("theme picture prefixes are hints, not scenes (FEAT-193 / UX-166)", () => {
  // The same failure FEAT-189 removed from three illustration styles, still live
  // one table over: `buildImagePrompt` appends the page's own scene AFTER the
  // prefix, so a subject list here is a second, competing scene. It was harmless
  // only because FEAT-174 made a picked style win — a property of another table,
  // not of this one.
  const SCENE_NOUNS = [
    "treasure map",
    "hidden path",
    "landscapes",
    "lab equipment",
    "experiments",
    "coral reef",
    "sea creatures",
    "city skyline",
    "rockets",
    "astronauts",
    "planets",
    "enchanted forest",
    "mythical creature",
    "volcanic landscape",
    "decorations",
    "chefs",
    "ingredients",
    "dishes",
    "costumes",
    "vegetation",
    "dinosaurs",
    "celebrations",
  ];

  it("covers all fifteen ids a parent can pick", () => {
    expect(Object.keys(PRESET_IMAGE_PREFIXES)).toHaveLength(15);
  });

  it("names no scene furniture in any of them", () => {
    for (const [id, prefix] of Object.entries(PRESET_IMAGE_PREFIXES)) {
      const named = SCENE_NOUNS.filter((noun) =>
        prefix.toLowerCase().includes(noun),
      );
      expect(
        named,
        `theme "${id}" names ${named.join(", ")} — that is a scene, and the page's own scene is appended after it`,
      ).toHaveLength(0);
    }
  });

  it("keeps the copyright clause the client carries on minecraft", () => {
    expect(PRESET_IMAGE_PREFIXES.minecraft).toContain("No character names.");
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
    ).toMatchInlineSnapshot(`"A children's book page drawn in the look of a classic side-scrolling platformer video game. One single, unified scene filling the whole image — never split panels, halves, strips, collages or borders. Environment and background only, no characters or people. Palette: saturated primaries — bright blue, warm red, gold and green — in flat unblended vector fills with no gradients. Line work: thick, clean outlines of even weight around chunky rounded shapes; nothing wispy or sketchy. Shading: flat cel shading in two steps per shape, drawn side-on in 2D with no perspective depth and no soft light. Where the scene allows, dress it with the world's props (brick platforms, green pipes, gold coins, question blocks, fluffy clouds, mushroom shapes); when the scene is indoors or somewhere else, keep the LOOK and drop the props. inside a wooden hut, a lantern, a rolled map on the table. Safe for children, family-friendly, no text overlays."`);
  });
});
