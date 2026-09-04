import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser, checkRateLimit } from "../authGuard.js";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";
import type { ImageOptions } from "../aiService.js";
import { rewriteForCopyright } from "./copyrightUtils.js";
import { recipeDetail, type VisualRecipe } from "./visualRecipe.js";

// ── Request / Response types ────────────────────────────────────

export interface ImageGenRequest {
  familyId: string;
  prompt: string;
  style?: "schedule-card" | "reward-chart" | "theme-illustration" | "book-illustration-minecraft" | "book-illustration-storybook" | "book-illustration-comic" | "book-illustration-realistic" | "book-illustration-garden-warfare" | "book-illustration-platformer" | "book-sticker" | "general";
  /** gpt-image-1.5 sizes. Legacy 1024x1792 / 1792x1024 are silently remapped to 1024x1536 / 1536x1024. */
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "1024x1792" | "1792x1024";
  /**
   * Optional theme ID. Its `imageStylePrefix` is used only when `style` carries
   * no look of its own (`general`, or unrecognised) — an explicitly picked
   * illustration style always wins (FEAT-174).
   */
  themeId?: string;
}

/** gpt-image-1.5 portrait/landscape sizes (replaced DALL-E 3's 1024x1792 / 1792x1024). */
const LEGACY_SIZE_REMAP: Record<string, string> = {
  "1024x1792": "1024x1536",
  "1792x1024": "1536x1024",
};

function remapLegacySize(s: string): string {
  return LEGACY_SIZE_REMAP[s] ?? s;
}

export interface ImageGenResponse {
  /** Public download URL from Firebase Storage. */
  url: string;
  /** Storage path (e.g. families/{id}/generated-images/{file}). */
  storagePath: string;
  /** The prompt the image model actually used (may be revised for safety). */
  revisedPrompt?: string;
}

// ── Style-specific prompt prefixes ──────────────────────────────

/**
 * The look each book-illustration style is drawn in — palette, line, shading —
 * plus, for the three "world" styles, the props that world is made of.
 *
 * **FEAT-174** gave Comic Book, Storybook and Realistic this treatment. They had
 * named only adjectives ("bold", "dynamic", "soft colors", "warm lighting"),
 * which is what every children's book illustration already is, so all three
 * drifted toward one generic look and Comic Book did not read as comic.
 *
 * **FEAT-189** brought the other three in, for the opposite failure. Minecraft,
 * Garden Battle and Platformer World named concrete nouns — but as a *scene*,
 * not as a look: "Bright blue sky, floating brick platforms, green pipes, golden
 * coins, fluffy clouds with eyes, mushrooms, starry power-ups." `buildImagePrompt`
 * then appends the page's own scene, so a page reading "Tom had a map. He was in
 * the hut." reached the model as two incompatible scenes — a platform world AND
 * the inside of a hut — and the model did the only thing that satisfies both: it
 * split the canvas. A parent got a platformer strip across the top with a
 * realistic cabin interior below, and a page whose scene was "Tom saw a big pit"
 * came back as two half-images side by side. The three recipe styles never did
 * this, because a recipe describes **how to draw**, not **what**.
 *
 * So the world flavour is demoted to optional set-dressing, stated as such by
 * {@link worldPropsClause}: dress the scene with these props where the scene
 * allows it, and where it does not — indoors, or anywhere else — keep the LOOK
 * and drop the props. That one sentence is what stops the split, because it
 * tells the model what to do when the scene is a hut.
 *
 * All six now share one shape, so a style added later has to answer the same
 * three questions instead of listing a world.
 */
type BookIllustrationRecipe = VisualRecipe & {
  /**
   * The props this world is made of, as a bare noun list. The conditional
   * framing around them is {@link worldPropsClause}'s, not each recipe's, so the
   * three world styles cannot state the rule three slightly different ways.
   */
  props?: string;
  /**
   * Set when this world's props include living things, so the props clause
   * carries {@link PROP_CREATURES_ASIDE} and they are not read as a violation of
   * {@link BOOK_PAGE_FRAMING}'s "no characters or people".
   *
   * Only Garden Battle needs it, and it is opt-in rather than automatic on every
   * world style: an unconditional aside would invite Minecraft and Platformer
   * World — whose props are blocks, terrain, pipes and coins — to put creatures
   * in a picture that should have none.
   */
  propsIncludeCreatures?: true;
};

const BOOK_ILLUSTRATION_RECIPES: Record<string, BookIllustrationRecipe> = {
  "book-illustration-comic": {
    hint: "in a bold comic book illustration style",
    summary: "A bold comic book background panel for a children's story.",
    palette:
      "high-saturation comic primaries — red, yellow, cyan — in flat fills with no gradients, and strong complementary contrast.",
    line: "a heavy, confident black ink outline of varying weight, thickest on the silhouettes, with speed lines and impact streaks in the background.",
    shading:
      "hard-edged cel shading in two or three steps, with visible halftone dot screens for the midtones, and a dramatic low or high camera angle.",
  },
  "book-illustration-storybook": {
    hint: "in a warm hand-painted watercolor picture book style",
    summary: "A warm hand-painted watercolor scene for a children's picture book page.",
    palette:
      "warm, gently desaturated colors — cream, soft coral, sage — with visible paper white and paper grain showing through.",
    line: "a soft, slightly uneven ink line of medium weight that sometimes lifts off the edge of a shape.",
    shading:
      "translucent watercolor washes with soft blooms where colors meet; no hard black shadows.",
  },
  "book-illustration-realistic": {
    hint: "in a gentle, realistic children's book illustration style",
    summary: "A gentle realistic background scene for a children's book page.",
    palette:
      "naturalistic, muted colors with believable wood, foliage, stone and fabric tones.",
    line: "almost no visible outline — forms are defined by tone and edge contrast.",
    shading:
      "soft directional light with smooth falloff, subtle bounce light, and gentle cast shadows.",
  },
  "book-illustration-minecraft": {
    hint: "in a blocky voxel pixel-art style",
    summary:
      "A children's book page drawn in the look of a blocky voxel pixel-art world.",
    palette:
      "a limited palette of flat, saturated colors — grass green, dirt brown, stone grey — laid down unblended, never mixed.",
    line: "no outlines at all; every form is built from hard-edged cubes with visible pixel steps.",
    shading:
      "flat per-face shading only — one solid tone per cube face, lighter on top, darker on the sides. No gradients, no soft light.",
    props: "cubic blocks, stepped terrain, torches, ore seams",
  },
  "book-illustration-garden-warfare": {
    hint: "in a bright, silly cartoon garden style",
    summary:
      "A children's book page drawn in the look of a bright, silly cartoon garden battle.",
    palette:
      "high-saturation leaf green and warm yellow against soft earth brown, in flat cheerful fills.",
    line: "a bold, rounded outline of even weight on every shape — nothing sharp, nothing spiky, nothing frightening.",
    shading:
      "simple two-tone cartoon shading with one soft drop shadow under each shape, lit by broad flat daylight.",
    props: "sunflowers, pea shooters, walnut barriers, garden pots, silly cartoon zombies in the background",
    propsIncludeCreatures: true,
  },
  "book-illustration-platformer": {
    hint: "in the look of a classic side-scrolling platformer video game",
    summary:
      "A children's book page drawn in the look of a classic side-scrolling platformer video game.",
    palette:
      "saturated primaries — bright blue, warm red, gold and green — in flat unblended fills with no gradients.",
    line: "thick, clean outlines of even weight around chunky rounded shapes; nothing wispy or sketchy.",
    shading:
      "flat cel shading in two steps per shape, drawn side-on in 2D with no perspective depth and no soft light.",
    props: "brick platforms, green pipes, gold coins, question blocks, fluffy clouds, mushroom shapes",
  },
};

/**
 * Every book-illustration page prompt ends with this shared framing.
 *
 * The unified-scene guardrail sits here rather than on each style so the next
 * style added inherits it. It is the belt to {@link worldPropsClause}'s braces:
 * the props clause tells the model what to do with a world's props when the
 * scene is indoors, and this tells it that whatever it decides, the answer is
 * one picture (FEAT-189).
 */
const BOOK_PAGE_FRAMING =
  "One single, unified scene filling the whole image — never split panels, halves, strips, collages or borders. " +
  "Environment and background only, no characters or people. ";

/**
 * Reconciles a world whose props are alive with {@link BOOK_PAGE_FRAMING}'s
 * categorical "no characters or people" (Codex P2 on PR #1758).
 *
 * Before FEAT-189, Garden Battle was the **only** style whose prefix said "no
 * specific characters" rather than "no characters or people" — deliberately
 * looser, because a garden battle without its silly cartoon zombies is just a
 * garden. Routing it through the shared framing swapped that for the strict
 * wording while still asking for the zombies, which left the model to reconcile
 * a prompt that both demands and forbids them.
 *
 * The carve-out is scoped to the one style that needs it rather than written
 * into the shared framing, so the other five keep the strict rule intact — the
 * page picture is the background a story sits on, and its people belong to the
 * words. It names no prop of its own, so a world's nouns still appear only
 * inside the props clause.
 */
const PROP_CREATURES_ASIDE =
  "Any creatures among those props are decorative background set dressing, not the story's characters: " +
  "keep them small, incidental and in the background, and never the subject of the picture. ";

/**
 * The one statement of how a world's props relate to the page's own scene
 * (FEAT-189). Each world recipe supplies only the noun list; this supplies the
 * rule, so the three cannot drift apart.
 */
function worldPropsClause(recipe: BookIllustrationRecipe): string {
  return (
    `Where the scene allows, dress it with the world's props (${recipe.props}); ` +
    "when the scene is indoors or somewhere else, keep the LOOK and drop the props. " +
    (recipe.propsIncludeCreatures ? PROP_CREATURES_ASIDE : "")
  );
}

function bookIllustrationPrefix(styleKey: string): string {
  const recipe = BOOK_ILLUSTRATION_RECIPES[styleKey];
  if (!recipe) return "";
  const props = recipe.props ? worldPropsClause(recipe) : "";
  return `${recipe.summary} ${BOOK_PAGE_FRAMING}${recipeDetail(recipe)}${props}`;
}

/** The six looks a parent can pick in the book generator's style picker. */
export const BOOK_ILLUSTRATION_STYLE_KEYS = [
  "book-illustration-minecraft",
  "book-illustration-storybook",
  "book-illustration-comic",
  "book-illustration-realistic",
  "book-illustration-garden-warfare",
  "book-illustration-platformer",
] as const;

/**
 * Read-only view of the recipe table, for tests and for anything that needs to
 * check what a look actually says. The prompts themselves come from
 * {@link STYLE_PREFIXES}.
 */
export function bookIllustrationRecipe(styleKey: string): BookIllustrationRecipe | undefined {
  return BOOK_ILLUSTRATION_RECIPES[styleKey];
}

export const STYLE_PREFIXES: Record<string, string> = {
  "schedule-card":
    "A friendly, colorful visual schedule card for a child's daily routine. Simple, clear imagery with large icons. ",
  "reward-chart":
    "A cheerful, motivating reward chart illustration for a child. Bright colors, fun characters, encouraging tone. ",
  "theme-illustration":
    "A warm, educational illustration for a homeschool family learning theme. Kid-friendly, inviting art style. ",
  "book-illustration-minecraft": bookIllustrationPrefix("book-illustration-minecraft"),
  "book-illustration-storybook": bookIllustrationPrefix("book-illustration-storybook"),
  "book-illustration-comic": bookIllustrationPrefix("book-illustration-comic"),
  "book-illustration-realistic": bookIllustrationPrefix("book-illustration-realistic"),
  "book-illustration-garden-warfare": bookIllustrationPrefix("book-illustration-garden-warfare"),
  "book-illustration-platformer": bookIllustrationPrefix("book-illustration-platformer"),
  "book-sticker":
    "A single cute cartoon character or object, sticker style. Bold clean outline, colorful flat fill, simple shapes, fun and expressive. Child-friendly, no text, no background elements. ",
  general: "",
};

/**
 * Build the final image prompt with style context and safety guardrails.
 *
 * ── Precedence: the picked style owns the look (FEAT-174) ────────────────────
 * This used to read the other way round — a `themeImagePrefix` REPLACED the style
 * prefix for any `book-illustration-*` style. That silently threw away the one
 * art-style control a parent has. Picking "Comic Book" for a superhero story sent
 * no comic language at all: `inferBookTheme` matched the idea's word "hero" to the
 * `adventure` theme, and "A colorful adventure scene for a children's book"
 * replaced the comic recipe outright. The parent's picker was decorative.
 *
 * (The theme most often blamed for this, `sight_words`, could never have caused
 * it — it is absent from `PRESET_IMAGE_PREFIXES` below, so it resolves to no
 * prefix. The themes that actually overrode a picked style are the ones that map:
 * `adventure`, `animals`, `fantasy`, `space`, `ocean` and the rest.)
 *
 * Now an explicitly picked style wins outright, and a theme prefix applies only
 * where the style contributes nothing to the look — i.e. `general`, or an unknown
 * style — so `themeId` stays meaningful for non-book callers without ever being
 * able to override a control the parent set. A style prefix and a theme prefix
 * are both whole-image style sentences; concatenating them would put two
 * different art directions in one prompt, so exactly one is used.
 */
export function buildImagePrompt(
  userPrompt: string,
  style: string | undefined,
  themeImagePrefix?: string,
): string {
  const stylePrefix = STYLE_PREFIXES[style ?? "general"] ?? "";
  // A picked style is the parent's decision and is never overridden. The theme
  // fills in only when the style has nothing of its own to say.
  const prefix =
    stylePrefix !== ""
      ? stylePrefix
      : themeImagePrefix
        ? themeImagePrefix + " "
        : "";
  const safetyPostfix =
    " Safe for children, family-friendly, no text overlays.";
  return `${prefix}${userPrompt}.${safetyPostfix}`;
}

// ── Callable Cloud Function ─────────────────────────────────────

export const generateImage = onCall(
  { secrets: [openaiApiKey, claudeApiKey], timeoutSeconds: 120 },
  async (request): Promise<ImageGenResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    const { uid } = requireApprovedUser(request);

    const { familyId, prompt, style, size, themeId } =
      request.data as ImageGenRequest;

    // ── Input validation ───────────────────────────────────────
    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("invalid-argument", "familyId is required.");
    }
    if (!prompt || typeof prompt !== "string") {
      throw new HttpsError("invalid-argument", "prompt is required.");
    }
    if (prompt.length > 4000) {
      throw new HttpsError(
        "invalid-argument",
        "prompt must be 4000 characters or fewer.",
      );
    }

    const validSizes = new Set([
      "1024x1024",
      "1024x1536",
      "1536x1024",
      // Legacy DALL-E 3 sizes accepted from clients in flight; remapped below.
      "1024x1792",
      "1792x1024",
    ]);
    if (size && !validSizes.has(size)) {
      throw new HttpsError(
        "invalid-argument",
        `size must be one of: 1024x1024, 1024x1536, 1536x1024`,
      );
    }

    const validStyles = new Set([
      "schedule-card",
      "reward-chart",
      "theme-illustration",
      "book-illustration-minecraft",
      "book-illustration-storybook",
      "book-illustration-comic",
      "book-illustration-realistic",
      "book-illustration-garden-warfare",
      "book-illustration-platformer",
      "book-sticker",
      "general",
    ]);
    if (style && !validStyles.has(style)) {
      throw new HttpsError(
        "invalid-argument",
        `style must be one of: ${[...validStyles].join(", ")}`,
      );
    }

    // ── Authorization: caller must own the family ──────────────
    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    // ── Rate limiting ─────────────────────────────────────────
    await checkRateLimit(uid, "image-generation", 200, 60);

    // ── Rewrite prompt for image-gen safety via Claude ──────────
    const rewriteMode = style === "book-sticker" ? "sticker" as const : "scene" as const;
    const safePrompt = await rewriteForCopyright(prompt, rewriteMode, claudeApiKey.value());

    // ── Resolve theme image prefix ──────────────────────────────
    // Only reaches the prompt when the picked style has no look of its own —
    // see the precedence note on `buildImagePrompt` (FEAT-174). Note this map
    // has drifted from the client's `PRESET_THEMES`: `sight_words`, `family`,
    // `science` and `faith` are absent here and so resolve to no prefix at all.
    let themeImagePrefix: string | undefined;
    if (themeId) {
      // Check preset themes first (server-side map)
      const PRESET_IMAGE_PREFIXES: Record<string, string> = {
        adventure: "A colorful adventure scene for a children's book.",
        animals: "A warm, friendly children's book illustration of animals in nature.",
        fantasy: "A magical fantasy scene for a children's book.",
        minecraft: "A blocky pixel-art Minecraft-style scene. Cubic blocks, pixelated textures, bright colors.",
        space: "A vivid space scene for a children's book. Colorful planets, stars, rockets.",
        dinosaurs: "A prehistoric children's book illustration. Friendly dinosaurs, lush vegetation.",
        ocean: "An underwater children's book illustration. Colorful coral reefs, friendly sea creatures.",
        superheroes: "A bold, colorful superhero scene for a children's book.",
        cooking: "A warm, cheerful kitchen scene for a children's book.",
        sports: "A bright, energetic children's book illustration of kids playing sports.",
        holidays: "A festive, joyful children's book illustration. Holiday decorations, seasonal scenes, warm family celebrations.",
      };
      themeImagePrefix = PRESET_IMAGE_PREFIXES[themeId];

      // Check custom theme in Firestore if not a preset
      if (!themeImagePrefix) {
        try {
          const db = getFirestore();
          const themeDoc = await db.doc(`families/${familyId}/bookThemes/${themeId}`).get();
          if (themeDoc.exists) {
            themeImagePrefix = (themeDoc.data() as Record<string, unknown>).imageStylePrefix as string | undefined;
          }
        } catch {
          // Ignore — use default style prefix
        }
      }
    }

    // ── Generate image ──────────────────────────────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());
    const imagePrompt = buildImagePrompt(safePrompt, style, themeImagePrefix);

    const isSticker = style === "book-sticker";
    const imageOpts: ImageOptions = {
      model: "gpt-image-1.5",
      size: isSticker ? "1024x1024" : remapLegacySize(size ?? "1024x1024"),
      quality: isSticker ? undefined : "medium",
      background: isSticker ? "transparent" : undefined,
      outputFormat: isSticker ? "png" : undefined,
    };

    let imageResponse;
    try {
      imageResponse = await provider.generateImage(imagePrompt, imageOpts);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Image generation failed:", {
        prompt: prompt.slice(0, 100),
        style,
        model: imageOpts.model,
        error: errMsg,
      });

      if (
        errMsg.includes("content_policy") ||
        errMsg.includes("safety") ||
        errMsg.includes("blocked")
      ) {
        throw new HttpsError(
          "invalid-argument",
          "That prompt was blocked by the image generator's safety filter. Try describing the scene differently — avoid character names like Mario, Elsa, etc.",
        );
      }
      if (errMsg.includes("rate_limit") || errMsg.includes("429")) {
        throw new HttpsError(
          "resource-exhausted",
          "Image generation is busy right now. Wait a moment and try again.",
        );
      }
      if (errMsg.includes("invalid_api_key") || errMsg.includes("401")) {
        throw new HttpsError(
          "failed-precondition",
          "Image generation is not configured correctly. Ask Dad to check the API key.",
        );
      }
      if (
        errMsg.includes("403") ||
        errMsg.includes("organization") ||
        errMsg.includes("verification")
      ) {
        throw new HttpsError(
          "failed-precondition",
          "OpenAI org verification incomplete — ask Dad to complete API Organization Verification in the OpenAI dashboard.",
        );
      }
      throw new HttpsError(
        "internal",
        `Image generation failed: ${errMsg.slice(0, 200)}`,
      );
    }

    // ── Get image buffer ──────────────────────────────────────
    let processedBuffer: Buffer;
    const contentType = "image/png";

    if (imageResponse.b64Data) {
      processedBuffer = Buffer.from(imageResponse.b64Data, "base64");
    } else if (imageResponse.url) {
      // Defensive: gpt-image-1.5 always returns b64. Branch retained in case
      // a future provider swap reintroduces URL responses.
      try {
        const response = await fetch(imageResponse.url);
        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status}`);
        }
        processedBuffer = Buffer.from(await response.arrayBuffer());
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new HttpsError(
          "internal",
          `Failed to download generated image: ${errMsg}`,
        );
      }
    } else {
      throw new HttpsError("internal", "Image generation returned no data.");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}.png`;
    const storagePath = `families/${familyId}/generated-images/${filename}`;

    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await file.save(processedBuffer, {
      metadata: {
        contentType,
        metadata: {
          generatedBy: imageOpts.model ?? "gpt-image-1.5",
          originalPrompt: prompt,
          style: style ?? "general",
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // ── Log usage to Firestore ─────────────────────────────────
    const db = getFirestore();
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "image-generation",
      model: imageOpts.model ?? "gpt-image-1.5",
      inputTokens: 0,
      outputTokens: 0,
      prompt: prompt.slice(0, 200),
      style: style ?? "general",
      size: size ?? "1024x1024",
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return {
      url: downloadUrl,
      storagePath,
      revisedPrompt: imageResponse.revisedPrompt,
    };
  },
);
