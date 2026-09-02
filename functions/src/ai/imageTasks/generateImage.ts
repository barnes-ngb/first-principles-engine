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
 * The three book-illustration looks that named only adjectives (FEAT-174).
 *
 * Minecraft, Garden Battle and Platformer World always named concrete visual
 * nouns — blocks and terrain, sunflowers and pea shooters, brick platforms and
 * green pipes — so the model had something to separate them by. Comic Book,
 * Storybook and Realistic named only adjectives ("bold", "dynamic", "soft
 * colors", "warm lighting"), and adjectives are what every children's book
 * illustration already is. So all three drifted toward the same generic look and
 * Comic Book did not read as comic — reported by a parent who picked it and got
 * back something that "looks the same as storybook".
 *
 * These reuse the FEAT-159 recipe wording, which already had to solve exactly
 * this for the sticker picker. Palette, line work and shading are the three
 * questions that make a look tell apart at a glance.
 */
const BOOK_ILLUSTRATION_RECIPES: Record<string, VisualRecipe> = {
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
};

/** Every book-illustration page prompt ends with this shared framing. */
const BOOK_PAGE_FRAMING = "Environment and background only, no characters or people. ";

function bookIllustrationPrefix(styleKey: string): string {
  const recipe = BOOK_ILLUSTRATION_RECIPES[styleKey];
  if (!recipe) return "";
  return `${recipe.summary} ${BOOK_PAGE_FRAMING}${recipeDetail(recipe)}`;
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

export const STYLE_PREFIXES: Record<string, string> = {
  "schedule-card":
    "A friendly, colorful visual schedule card for a child's daily routine. Simple, clear imagery with large icons. ",
  "reward-chart":
    "A cheerful, motivating reward chart illustration for a child. Bright colors, fun characters, encouraging tone. ",
  "theme-illustration":
    "A warm, educational illustration for a homeschool family learning theme. Kid-friendly, inviting art style. ",
  "book-illustration-minecraft":
    "A blocky pixel art voxel world scene for a children's book page. Environment only, no characters or people. Cubic blocks with visible pixel steps, dramatic mined terrain, bright sky. Flat per-face shading only — one solid tone per cube face, lighter on top, darker on the sides. No gradients, no outlines. ",
  "book-illustration-storybook": bookIllustrationPrefix("book-illustration-storybook"),
  "book-illustration-comic": bookIllustrationPrefix("book-illustration-comic"),
  "book-illustration-realistic": bookIllustrationPrefix("book-illustration-realistic"),
  "book-illustration-garden-warfare":
    "A fun cartoon garden battle scene for a children's book page. Bright green garden with sunflowers, pea shooters, walnuts as barriers, silly cartoon zombies in the background. Colorful, humorous, family-friendly. Environment only, no specific characters. ",
  "book-illustration-platformer":
    "A colorful side-scrolling platformer video game world for a children's book page. Bright blue sky, floating brick platforms, green pipes, golden coins, fluffy clouds with eyes, mushrooms, starry power-ups. Cheerful and inviting. Environment only, no characters. ",
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
