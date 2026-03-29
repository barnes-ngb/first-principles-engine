import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser } from "../authGuard.js";
import { openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";

// ── Request / Response types ────────────────────────────────────

export interface EnhanceSketchRequest {
  familyId: string;
  /** Firebase Storage path of the original sketch image. */
  sketchStoragePath: string;
  /** Optional style hint for the enhancement prompt. */
  style?: "storybook" | "comic" | "realistic" | "minecraft";
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

function buildEnhancePrompt(style?: string): string {
  const styleHint =
    STYLE_HINTS[style ?? "storybook"] ?? STYLE_HINTS["storybook"];
  return (
    `Create a polished children's book illustration ${styleHint}, ` +
    `inspired by this child's hand-drawn sketch. ` +
    `Keep the same composition, characters, and scene layout from the original drawing. ` +
    `Make it colorful, detailed, and full of charm. ` +
    `Maintain the creativity and spirit of the original sketch. ` +
    `Safe for children, family-friendly, no text overlays.`
  );
}

// ── Callable Cloud Function ─────────────────────────────────────

export const enhanceSketch = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 60 },
  async (request): Promise<EnhanceSketchResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    const { uid } = requireApprovedUser(request);

    const { familyId, sketchStoragePath, style } =
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
    const prompt = buildEnhancePrompt(style);

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
          "The sketch enhancement was blocked by the safety filter. Try a different drawing.",
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
