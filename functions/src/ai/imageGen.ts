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
  style?: "schedule-card" | "reward-chart" | "theme-illustration" | "book-illustration-minecraft" | "book-illustration-storybook" | "book-illustration-comic" | "book-illustration-realistic" | "book-sticker" | "general";
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
  "book-illustration-minecraft":
    "A Minecraft-style pixel art scene illustration for a children's book page. Blocky, colorful, fun. ",
  "book-illustration-storybook":
    "A warm, hand-painted watercolor illustration for a children's picture book. Soft colors, gentle shapes, inviting. ",
  "book-illustration-comic":
    "A bold comic book panel illustration for a children's story. Dynamic lines, bright colors, expressive characters. ",
  "book-illustration-realistic":
    "A gentle, realistic illustration for a children's book. Warm lighting, friendly tone. ",
  "book-sticker":
    "A cute sticker illustration, die-cut sticker style, cartoon, simple, bold outline, white background. Child-friendly, colorful, no text. ",
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
      "book-illustration-minecraft",
      "book-illustration-storybook",
      "book-illustration-comic",
      "book-illustration-realistic",
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

    let imageResponse;
    try {
      imageResponse = await provider.generateImage(dallePrompt, imageOpts);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("DALL-E generation failed:", {
        prompt: prompt.slice(0, 100),
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

    if (!imageResponse.url) {
      throw new HttpsError("internal", "Image generation returned no URL.");
    }

    // ── Download image and upload to Firebase Storage ────────────
    let imageBuffer: Buffer;
    try {
      const response = await fetch(imageResponse.url);
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new HttpsError(
        "internal",
        `Failed to download generated image: ${errMsg}`,
      );
    }

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

    // Make file publicly accessible (storage rules control read access)
    await file.makePublic();

    // Use persistent public URL (does not expire)
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

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
