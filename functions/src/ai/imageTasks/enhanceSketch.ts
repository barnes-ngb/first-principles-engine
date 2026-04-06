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
}

export interface EnhanceSketchResponse {
  /** Public download URL of the enhanced image. */
  url: string;
  /** Firebase Storage path of the enhanced image. */
  storagePath: string;
}

// ── Enhancement prompt ──────────────────────────────────────────

const STYLE_HINTS: Record<string, string> = {
  storybook:
    "in a warm hand-painted watercolor children's picture book style",
  comic: "in a bold, colorful comic book illustration style",
  realistic:
    "in a gentle, realistic children's book illustration style with warm lighting",
  minecraft: "in a colorful blocky pixel art style",
};

// ── Theme style mapping ────────────────────────────────────────
// Maps book theme IDs to style descriptions for the reimagine prompt.
// Keeps the server self-contained (no import from client-side books.ts).

const THEME_IMAGE_STYLES: Record<string, string> = {
  minecraft:
    "Blocky pixel-art Minecraft style with cubic shapes and bright colors.",
  fantasy:
    "Whimsical fairy-tale illustration with soft colors and magical elements.",
  adventure:
    "Bold adventure illustration with dramatic lighting and exciting landscapes.",
  animals:
    "Cute, friendly animal illustration with warm, soft colors.",
  science:
    "Clean, educational illustration with bright colors and wonder.",
  space:
    "Cosmic space illustration with stars, planets, and vibrant nebula colors.",
  faith:
    "Warm, gentle illustration with golden light and peaceful tones.",
  dinosaurs:
    "Playful prehistoric illustration with lush jungle and colorful dinosaurs.",
  ocean:
    "Underwater illustration with coral reefs, sea creatures, and ocean blue tones.",
  superheroes:
    "Dynamic superhero illustration with bold colors and action poses.",
  holidays:
    "Festive holiday illustration with warm, cheerful seasonal decorations.",
  cooking:
    "Warm, cheerful kitchen scene with colorful ingredients and friendly style.",
  sports:
    "Bright, energetic illustration with action poses and outdoor settings.",
  family:
    "Warm, cozy illustration with soft lighting and happy family moments.",
  sight_words:
    "Simple, clean illustration with bold colors and minimal detail.",
};

function getThemeImageStyle(theme?: string): string | null {
  if (!theme) return null;
  return THEME_IMAGE_STYLES[theme] ?? null;
}

export function buildEnhancePrompt(
  style?: string,
  caption?: string,
  theme?: string,
): string {
  const styleHint =
    STYLE_HINTS[style ?? "storybook"] ?? STYLE_HINTS["storybook"];
  const captionClause = caption
    ? `The child described this as: "${caption}". `
    : "";
  const themeStyle = getThemeImageStyle(theme);
  const themeClause = themeStyle ? `Visual theme: ${themeStyle} ` : "";
  return (
    `Create a polished children's book illustration ${styleHint}, ` +
    `inspired by this child's hand-drawn sketch. ` +
    `${captionClause}` +
    `${themeClause}` +
    `Keep the same composition, characters, and scene layout from the original drawing. ` +
    `Make it colorful, detailed, and full of charm. ` +
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

    const { familyId, sketchStoragePath, style, caption, theme } =
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

    // ── Enhance via gpt-image-1 edit endpoint ──────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());
    const prompt = buildEnhancePrompt(style, safeCaption, theme);

    console.log("enhanceSketch: starting API call", {
      sketchStoragePath,
      style: style ?? "storybook",
      sketchBufferLength: sketchBuffer.length,
      promptLength: prompt.length,
    });

    let imageResponse;
    try {
      imageResponse = await provider.editImage(
        Buffer.from(sketchBuffer),
        prompt,
        { size: "1024x1024", outputFormat: "png" },
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
          generatedBy: "gpt-image-1",
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
      model: "gpt-image-1",
      inputTokens: 0,
      outputTokens: 0,
      prompt: prompt.slice(0, 200),
      style: style ?? "storybook",
      sourceSketch: sketchStoragePath,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return { url: downloadUrl, storagePath };
  },
);
