import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser } from "../authGuard.js";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";
import { rewriteForCopyright } from "./copyrightUtils.js";

// ── Request / Response types ────────────────────────────────────

export interface EnhanceSketchRequest {
  familyId: string;
  /** Firebase Storage path of the original sketch image. */
  sketchStoragePath: string;
  /** Optional style hint for the enhancement prompt. */
  style?: "storybook" | "comic" | "realistic" | "minecraft";
  /** Optional caption/description of the sketch (e.g. "my dragon drawing"). Filtered for copyright. */
  caption?: string;
  /** Optional book theme ID — influences the reimagine style to match the book's visual identity. */
  theme?: string;
  /**
   * When true, the reimagined image is rendered with a transparent background
   * (no environment, no shadows on ground) so it can be used as a positionable
   * sticker. Default false → produces a full-scene illustration.
   */
  transparent?: boolean;
}

export interface EnhanceSketchResponse {
  /** Public download URL of the enhanced image. */
  url: string;
  /** Firebase Storage path of the enhanced image. */
  storagePath: string;
}

// ── Enhancement prompt ──────────────────────────────────────────

/**
 * A look, spelled out (FEAT-159).
 *
 * Every option the "Make it fancy" picker offers used to reach this builder with
 * `style` undefined, so eight of the nine surfaced options rendered the *same*
 * dominant sentence ("in a warm hand-painted watercolor…") and differed only by
 * one short theme line inside an otherwise identical prompt. The prompts were
 * never literally identical — the routing was fine — but the model had almost
 * nothing to separate them by, which is why Cartoon, Fantasy and Blocky came
 * back looking alike. Naming **palette, line weight and shading** for each look
 * is what makes them tell apart at a glance.
 */
interface VisualRecipe {
  /** Fits the slot "Create a polished children's book illustration ___,". */
  hint: string;
  /** One-line identity of the look. */
  summary: string;
  palette: string;
  line: string;
  shading: string;
}

function recipeDetail(recipe: VisualRecipe): string {
  return (
    `Palette: ${recipe.palette} ` +
    `Line work: ${recipe.line} ` +
    `Shading: ${recipe.shading} `
  );
}

const STYLE_RECIPES: Record<string, VisualRecipe> = {
  storybook: {
    hint: "in a warm hand-painted watercolor children's picture book style",
    summary: "Warm hand-painted watercolor picture-book illustration.",
    palette:
      "warm, gently desaturated colors — cream, soft coral, sage — with visible paper white showing through.",
    line: "a soft, slightly uneven ink line of medium weight that sometimes lifts off the edge.",
    shading:
      "translucent watercolor washes with soft blooms where colors meet; no hard black shadows.",
  },
  comic: {
    hint: "in a bold, colorful comic book illustration style",
    summary: "Bold comic-book panel art.",
    palette:
      "high-saturation primaries with flat fills and no gradients; strong complementary contrast.",
    line: "a heavy, confident black outline of varying weight, thickest on silhouettes.",
    shading:
      "hard-edged cel shading in two or three steps, with halftone dots for midtones.",
  },
  realistic: {
    hint: "in a gentle, realistic children's book illustration style with warm lighting",
    summary: "Gentle representational illustration with warm light.",
    palette:
      "naturalistic, muted colors with believable skin, wood, and fabric tones.",
    line: "almost no visible outline — forms are defined by tone and edge contrast.",
    shading:
      "soft directional light with smooth falloff, subtle bounce light, and gentle cast shadows.",
  },
  minecraft: {
    hint: "in a colorful blocky pixel art style",
    summary: "Blocky voxel pixel-art.",
    palette:
      "a limited palette of flat, saturated blocky colors — grass green, dirt brown, stone grey — never blended.",
    line: "no outlines at all; every form is built from hard-edged cubes with visible pixel steps.",
    shading:
      "flat per-face shading only — each cube face one solid tone, lighter on top, darker on the sides. No gradients.",
  },
};

// ── Theme style mapping ────────────────────────────────────────
// Maps book theme IDs to visual recipes for the reimagine prompt.
// Keeps the server self-contained (no import from client-side books.ts).

const THEME_IMAGE_STYLES: Record<string, VisualRecipe> = {
  minecraft: {
    hint: "in a blocky pixel-art Minecraft style",
    summary:
      "Blocky pixel-art Minecraft style with cubic shapes and bright colors.",
    palette:
      "a limited 16-color palette of saturated greens, browns and greys, flat and unblended.",
    line: "no outlines at all; forms are stacked hard-edged cubes with visible pixel steps.",
    shading:
      "flat per-face shading only — one solid tone per cube face, lighter on top. No gradients, no soft light.",
  },
  fantasy: {
    hint: "in a whimsical fairy-tale illustration style",
    summary:
      "Whimsical fairy-tale illustration with soft colors and magical elements.",
    palette:
      "dusty lilac, moss green and candlelight gold, with a faint glow around anything magical.",
    line: "a fine, tapering ink line — noticeably thinner than the house cartoon style — that breaks away in places.",
    shading:
      "soft watercolor washes that bleed past the line, with luminous highlights and no hard shadow.",
  },
  adventure: {
    hint: "in a bold adventure-illustration style",
    summary:
      "Bold adventure illustration with dramatic lighting and exciting landscapes.",
    palette:
      "sun-bleached ochre and deep teal shadow, with one hot highlight color.",
    line: "a confident varied-weight brush line — heavy on the shadow side, lifting to nothing on the lit side.",
    shading:
      "high-contrast directional light with strong cast shadows and a bright rim light on the silhouette.",
  },
  animals: {
    hint: "in a cute, friendly animal-illustration style",
    summary: "Cute, friendly animal illustration with warm, soft colors.",
    palette: "warm creams, ginger and soft brown, with pink cheek accents.",
    line: "a thick, rounded, even-weight outline with no sharp corners anywhere.",
    shading:
      "simple two-tone shading with visible fur or feather texture; no hard shadows.",
  },
  science: {
    hint: "in a clean, educational diagram-illustration style",
    summary: "Clean, educational illustration with bright colors and wonder.",
    palette:
      "clean primary red, blue and yellow on generous white space; nothing muddy.",
    line: "a crisp, uniform technical line of constant weight, like a well-drawn diagram.",
    shading:
      "flat fills with a single soft light-grey drop shadow. No gradients, no texture.",
  },
  space: {
    hint: "in a cosmic space-art style",
    summary:
      "Cosmic space illustration with stars, planets, and vibrant nebula colors.",
    palette:
      "deep indigo and violet darks with electric cyan and magenta nebula accents.",
    line: "little to no outline — forms are defined by glow and bright edge light against the dark.",
    shading:
      "airbrushed gradients with bloom around bright areas and fine star speckles.",
  },
  faith: {
    hint: "in a warm, reverent illustration style",
    summary: "Warm, gentle illustration with golden light and peaceful tones.",
    palette: "warm amber, ivory and soft olive, low saturation throughout.",
    line: "a soft, low-contrast line drawn in warm brown rather than black.",
    shading:
      "gentle golden light from one side with long soft shadows and no harsh contrast.",
  },
  dinosaurs: {
    hint: "in a playful prehistoric illustration style",
    summary:
      "Playful prehistoric illustration with lush jungle and colorful dinosaurs.",
    palette:
      "deep jungle greens and volcanic orange, with patterned scaly accent colors.",
    line: "a chunky, slightly rough outline that thickens over scales and claws.",
    shading:
      "bold two-tone shading with dappled light filtering through leaves.",
  },
  ocean: {
    hint: "in an underwater illustration style",
    summary:
      "Underwater illustration with coral reefs, sea creatures, and ocean blue tones.",
    palette: "aqua and deep blue with coral pink and sunlit turquoise accents.",
    line: "a flowing, wavering line that softens as it recedes into the water.",
    shading:
      "rippling caustic light from above, soft blue depth haze, and no hard edges.",
  },
  superheroes: {
    hint: "in a dynamic superhero comic style",
    summary: "Dynamic superhero illustration with bold colors and action poses.",
    palette: "primary red, blue and gold at full saturation against dark sky.",
    line: "a bold, angular outline with sharp speed-line accents.",
    shading:
      "hard cel shading with dramatic under-lighting and strong highlight edges.",
  },
  holidays: {
    hint: "in a festive holiday illustration style",
    summary:
      "Festive holiday illustration with warm, cheerful seasonal decorations.",
    palette: "deep evergreen, cranberry red and warm gold, with candlelight warmth.",
    line: "a decorative, slightly ornamental line with rounded terminals.",
    shading: "cozy warm glow from within the scene, soft shadows, gentle sparkle.",
  },
  cooking: {
    hint: "in a warm kitchen-illustration style",
    summary:
      "Warm, cheerful kitchen scene with colorful ingredients and friendly style.",
    palette: "buttery cream, tomato red and fresh herb green — appetizing and warm.",
    line: "a friendly rounded line of even weight, a little bouncy.",
    shading: "soft daylight from a window with gentle shadows under objects.",
  },
  sports: {
    hint: "in a bright, energetic sports-illustration style",
    summary: "Bright, energetic illustration with action poses and outdoor settings.",
    palette: "bright field green, sky blue and a single vivid team accent color.",
    line: "a fast, gestural line with motion streaks trailing the action.",
    shading: "crisp outdoor sunlight with sharp cast shadows on the ground.",
  },
  family: {
    hint: "in a cozy, homey illustration style",
    summary: "Warm, cozy illustration with soft lighting and happy family moments.",
    palette: "muted terracotta, wheat and sage — homey and deliberately desaturated.",
    line: "a soft pencil-textured line with slightly rough, grainy edges.",
    shading:
      "soft diffuse indoor light with a visible paper grain over everything.",
  },
  sight_words: {
    hint: "in a simple, bold beginner-reader illustration style",
    summary: "Simple, clean illustration with bold colors and minimal detail.",
    palette: "a handful of bold flat colors, high contrast, nothing subtle.",
    line: "a thick, perfectly even outline with very simple shapes.",
    shading: "no shading at all — flat color fills only.",
  },
};

function getThemeRecipe(theme?: string): VisualRecipe | null {
  if (!theme) return null;
  return THEME_IMAGE_STYLES[theme] ?? null;
}

export function buildEnhancePrompt(
  style?: string,
  caption?: string,
  theme?: string,
  transparent?: boolean,
): string {
  const themeRecipe = getThemeRecipe(theme);
  const explicitStyle = style ? STYLE_RECIPES[style] : undefined;

  // When a theme is picked and no base style was named, the theme owns the whole
  // look. Otherwise every themed option inherits the same watercolor sentence and
  // nine distinct picker options collapse into one look (FEAT-159). An explicitly
  // named style still wins the opening line and keeps its own detail block, so the
  // book reimagine path (which always names a style) is unchanged in shape.
  const baseRecipe =
    explicitStyle ?? (themeRecipe ? null : STYLE_RECIPES["storybook"]);
  const leadRecipe = baseRecipe ?? (themeRecipe as VisualRecipe);

  const captionClause = caption
    ? `The child described this as: "${caption}". `
    : "";
  const baseDetailClause = baseRecipe ? recipeDetail(baseRecipe) : "";
  // Exactly one full recipe reaches the model, ever. When the theme owns the
  // look it spells itself out; when an explicit style is present the theme drops
  // back to its one-line summary — the shape it had before FEAT-159 — and stays
  // subordinate by its brevity. Emitting both would put two complete, competing
  // palette/line/shading blocks under a single "follow the above exactly",
  // which is an instruction to obey contradictory instructions. That case is not
  // hypothetical: `useBackgroundReimagine` always sends a style AND the book's
  // theme, so a minecraft-themed book at storybook intensity would ask for
  // watercolor washes and flat per-face cube shading in the same breath.
  const themeOwnsLook = !baseRecipe;
  const themeClause = !themeRecipe
    ? ""
    : themeOwnsLook
      ? `Visual theme: ${themeRecipe.summary} ${recipeDetail(themeRecipe)}`
      : `Visual theme: ${themeRecipe.summary} `;
  const transparentClause = transparent
    ? "IMPORTANT: Render only the character/object on a fully TRANSPARENT background. " +
      "No background scene, no ground, no shadows on the ground, no environment, no border. " +
      "The result must be a clean cutout suitable for use as a sticker. "
    : "";
  return (
    `Create a polished children's book illustration ${leadRecipe.hint}, ` +
    `inspired by this child's hand-drawn sketch. ` +
    `${captionClause}` +
    `${baseDetailClause}` +
    `${themeClause}` +
    `${transparentClause}` +
    `Keep the same composition, characters, and scene layout from the original drawing. ` +
    `Follow the palette, line work, and shading described above exactly — they are ` +
    `what make this style different from the others, so do not drift toward a ` +
    `generic soft cartoon look. ` +
    `Maintain the creativity and spirit of the original sketch. ` +
    `Safe for children, family-friendly, no text overlays.`
  );
}

// ── Callable Cloud Function ─────────────────────────────────────

export const enhanceSketch = onCall(
  { secrets: [openaiApiKey, claudeApiKey], timeoutSeconds: 180, memory: "1GiB" },
  async (request): Promise<EnhanceSketchResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    const { uid } = requireApprovedUser(request);

    const { familyId, sketchStoragePath, style, caption, theme, transparent } =
      request.data as EnhanceSketchRequest;

    // ── Input validation ───────────────────────────────────────
    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("invalid-argument", "familyId is required.");
    }
    if (!sketchStoragePath || typeof sketchStoragePath !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "sketchStoragePath is required.",
      );
    }

    // ── Authorization ──────────────────────────────────────────
    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    // ── Caption validation ──────────────────────────────────────
    if (caption !== undefined && typeof caption !== "string") {
      throw new HttpsError("invalid-argument", "caption must be a string.");
    }
    if (caption && caption.length > 500) {
      throw new HttpsError(
        "invalid-argument",
        "caption must be 500 characters or fewer.",
      );
    }

    // ── Copyright-filter the caption via Claude rewriter ───────
    let safeCaption: string | undefined;
    if (caption && caption.trim()) {
      safeCaption = await rewriteForCopyright(
        caption.trim(),
        "sketch",
        claudeApiKey.value(),
      );
    }

    // ── Download original sketch from Storage ──────────────────
    const bucket = getStorage().bucket();
    const sketchFile = bucket.file(sketchStoragePath);

    const [exists] = await sketchFile.exists();
    if (!exists) {
      throw new HttpsError("not-found", "Sketch image not found in storage.");
    }

    const [sketchBuffer] = await sketchFile.download();

    // ── Enhance via gpt-image-1.5 edit endpoint ────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());
    const prompt = buildEnhancePrompt(style, safeCaption, theme, transparent);

    console.log("enhanceSketch: starting API call", {
      sketchStoragePath,
      style: style ?? "storybook",
      transparent: transparent ?? false,
      sketchBufferLength: sketchBuffer.length,
      promptLength: prompt.length,
    });

    let imageResponse;
    try {
      imageResponse = await provider.editImage(
        Buffer.from(sketchBuffer),
        prompt,
        {
          size: "1024x1024",
          // gpt-image-1.5 edit always returns PNG; only background controls
          // whether the cutout is transparent.
          outputFormat: "png",
          background: transparent ? "transparent" : "auto",
        },
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Sketch enhancement failed:", {
        sketchStoragePath,
        style,
        error: errMsg,
      });

      if (
        errMsg.includes("content_policy") ||
        errMsg.includes("safety") ||
        errMsg.includes("blocked")
      ) {
        throw new HttpsError(
          "invalid-argument",
          "The sketch enhancement was blocked by the safety filter. Try describing what the character looks like instead of using their name!",
        );
      }
      if (errMsg.includes("rate_limit") || errMsg.includes("429")) {
        throw new HttpsError(
          "resource-exhausted",
          "Image enhancement is busy right now. Wait a moment and try again.",
        );
      }
      throw new HttpsError(
        "internal",
        `Sketch enhancement failed: ${errMsg.slice(0, 200)}`,
      );
    }

    // ── Save enhanced image to Storage ─────────────────────────
    console.log("enhanceSketch: API call completed", {
      hasB64Data: !!imageResponse.b64Data,
      hasUrl: !!imageResponse.url,
      b64DataLength: imageResponse.b64Data?.length ?? 0,
    });

    if (!imageResponse.b64Data) {
      throw new HttpsError(
        "internal",
        "Sketch enhancement returned no image data.",
      );
    }

    const enhancedBuffer = Buffer.from(imageResponse.b64Data, "base64");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}_enhanced.png`;
    const storagePath = `families/${familyId}/sketches/${filename}`;
    const enhancedFile = bucket.file(storagePath);

    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await enhancedFile.save(enhancedBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          generatedBy: "gpt-image-1.5",
          sourceSketch: sketchStoragePath,
          style: style ?? "storybook",
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // ── Log usage ──────────────────────────────────────────────
    const db = getFirestore();
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "sketch-enhancement",
      model: "gpt-image-1.5",
      inputTokens: 0,
      outputTokens: 0,
      prompt: prompt.slice(0, 200),
      style: style ?? "storybook",
      transparent: transparent ?? false,
      sourceSketch: sketchStoragePath,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return { url: downloadUrl, storagePath };
  },
);
