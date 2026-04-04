import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser, checkRateLimit } from "../authGuard.js";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";
import type { ImageOptions } from "../aiService.js";
import { rewriteForCopyright } from "./copyrightUtils.js";

// ── Request / Response types ────────────────────────────────────

export interface ImageGenRequest {
  familyId: string;
  prompt: string;
  style?: "schedule-card" | "reward-chart" | "theme-illustration" | "book-illustration-minecraft" | "book-illustration-storybook" | "book-illustration-comic" | "book-illustration-realistic" | "book-illustration-garden-warfare" | "book-illustration-platformer" | "book-sticker" | "general";
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  /** Optional theme ID — if provided, theme's imageStylePrefix overrides the default style prefix. */
  themeId?: string;
}

export interface ImageGenResponse {
  /** Public download URL from Firebase Storage. */
  url: string;
  /** Storage path (e.g. families/{id}/generated-images/{file}). */
  storagePath: string;
  /** The prompt DALL-E actually used (may be revised for safety). */
  revisedPrompt?: string;
}

// ── Style-specific prompt prefixes ──────────────────────────────

const STYLE_PREFIXES: Record<string, string> = {
  "schedule-card":
    "A friendly, colorful visual schedule card for a child's daily routine. Simple, clear imagery with large icons. ",
  "reward-chart":
    "A cheerful, motivating reward chart illustration for a child. Bright colors, fun characters, encouraging tone. ",
  "theme-illustration":
    "A warm, educational illustration for a homeschool family learning theme. Kid-friendly, inviting art style. ",
  "book-illustration-minecraft":
    "A blocky pixel art voxel world scene for a children's book page. Environment only, no characters or people. Colorful blocks, dramatic terrain, bright sky. ",
  "book-illustration-storybook":
    "A warm hand-painted watercolor scene for a children's picture book page. Background environment only, no characters. Soft colors, gentle shapes, inviting landscape. ",
  "book-illustration-comic":
    "A bold comic book background panel for a children's story. Dynamic environment, no characters. Bright colors, dramatic perspective, action lines. ",
  "book-illustration-realistic":
    "A gentle realistic background scene for a children's book page. Environment only, no people or characters. Warm lighting, friendly atmosphere. ",
  "book-illustration-garden-warfare":
    "A fun cartoon garden battle scene for a children's book page. Bright green garden with sunflowers, pea shooters, walnuts as barriers, silly cartoon zombies in the background. Colorful, humorous, family-friendly. Environment only, no specific characters. ",
  "book-illustration-platformer":
    "A colorful side-scrolling platformer video game world for a children's book page. Bright blue sky, floating brick platforms, green pipes, golden coins, fluffy clouds with eyes, mushrooms, starry power-ups. Cheerful and inviting. Environment only, no characters. ",
  "book-sticker":
    "A single cute cartoon character or object, sticker style. Bold clean outline, colorful flat fill, simple shapes, fun and expressive. Child-friendly, no text, no background elements. ",
  general: "",
};

/** Build the final DALL-E prompt with style context and safety guardrails.
 *  If a themeImagePrefix is provided (from BookThemeConfig), it takes precedence
 *  over the default STYLE_PREFIXES for book illustrations. */
export function buildImagePrompt(
  userPrompt: string,
  style: string | undefined,
  themeImagePrefix?: string,
): string {
  // Theme prefix overrides default style prefix for book illustrations
  const prefix = themeImagePrefix && style?.startsWith("book-illustration")
    ? themeImagePrefix + " "
    : (STYLE_PREFIXES[style ?? "general"] ?? "");
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

    const validSizes = new Set(["1024x1024", "1024x1792", "1792x1024"]);
    if (size && !validSizes.has(size)) {
      throw new HttpsError(
        "invalid-argument",
        `size must be one of: ${[...validSizes].join(", ")}`,
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
    await checkRateLimit(uid, "image-generation", 20, 60);

    // ── Rewrite prompt for DALL-E safety via Claude ─────────────
    const rewriteMode = style === "book-sticker" ? "sticker" as const : "scene" as const;
    const safePrompt = await rewriteForCopyright(prompt, rewriteMode, claudeApiKey.value());

    // ── Resolve theme image prefix ──────────────────────────────
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
    const dallePrompt = buildImagePrompt(safePrompt, style, themeImagePrefix);

    // Use gpt-image-1 for stickers (native transparent bg), DALL-E 3 for everything else
    const isSticker = style === "book-sticker";
    const imageOpts: ImageOptions = {
      model: isSticker ? "gpt-image-1" : "dall-e-3",
      size: isSticker ? "1024x1024" : (size ?? "1024x1024"),
      quality: isSticker ? undefined : "standard",
      background: isSticker ? "transparent" : undefined,
      outputFormat: isSticker ? "png" : undefined,
    };

    let imageResponse;
    try {
      imageResponse = await provider.generateImage(dallePrompt, imageOpts);
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
      throw new HttpsError(
        "internal",
        `Image generation failed: ${errMsg.slice(0, 200)}`,
      );
    }

    // ── Get image buffer ──────────────────────────────────────
    let processedBuffer: Buffer;
    const contentType = "image/png";

    if (imageResponse.b64Data) {
      // gpt-image-1 returns base64 — decode directly (already has transparency)
      processedBuffer = Buffer.from(imageResponse.b64Data, "base64");
    } else if (imageResponse.url) {
      // DALL-E 3 returns a URL — download it
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
          generatedBy: imageOpts.model ?? "dall-e-3",
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
      model: imageOpts.model ?? "dall-e-3",
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
