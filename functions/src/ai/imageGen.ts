import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { openaiApiKey } from "./aiConfig.js";
import { createOpenAiProvider } from "./providers/openai.js";
import type { ImageOptions } from "./aiService.js";

// ── Request / Response types ────────────────────────────────────

export interface ImageGenRequest {
  familyId: string;
  prompt: string;
  style?: "schedule-card" | "reward-chart" | "theme-illustration" | "general";
  size?: "1024x1024" | "1024x1792" | "1792x1024";
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
  general: "",
};

/** Build the final DALL-E prompt with style context and safety guardrails. */
export function buildImagePrompt(
  userPrompt: string,
  style: string | undefined,
): string {
  const prefix = STYLE_PREFIXES[style ?? "general"] ?? "";
  const safetyPostfix =
    " Safe for children, family-friendly, no text overlays.";
  return `${prefix}${userPrompt}.${safetyPostfix}`;
}

// ── Callable Cloud Function ─────────────────────────────────────

export const generateImage = onCall(
  { secrets: [openaiApiKey] },
  async (request): Promise<ImageGenResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, prompt, style, size } =
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
      "general",
    ]);
    if (style && !validStyles.has(style)) {
      throw new HttpsError(
        "invalid-argument",
        `style must be one of: ${[...validStyles].join(", ")}`,
      );
    }

    // ── Authorization: caller must own the family ──────────────
    if (request.auth.uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    // ── Generate image via DALL-E 3 ─────────────────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());

    const dallePrompt = buildImagePrompt(prompt, style);
    const imageOpts: ImageOptions = {
      size: size ?? "1024x1024",
      quality: "standard",
    };

    const imageResponse = await provider.generateImage(dallePrompt, imageOpts);

    if (!imageResponse.url) {
      throw new HttpsError("internal", "Image generation returned no URL.");
    }

    // ── Download image and upload to Firebase Storage ────────────
    const response = await fetch(imageResponse.url);
    if (!response.ok) {
      throw new HttpsError(
        "internal",
        "Failed to download generated image from provider.",
      );
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}.png`;
    const storagePath = `families/${familyId}/generated-images/${filename}`;

    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          generatedBy: "dall-e-3",
          originalPrompt: prompt,
          style: style ?? "general",
        },
      },
    });

    // Make publicly readable via signed URL (valid for 7 days)
    const [downloadUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    // ── Log usage to Firestore ─────────────────────────────────
    const db = getFirestore();
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "image-generation",
      model: "dall-e-3",
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
