import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";

// ── Photo Transform ───────────────────────────────────────────────

export interface PhotoTransformRequest {
  familyId: string;
  childId: string;
  themeStyle: "minecraft" | "platformer";
  photoBase64: string;
  photoMimeType: string;
}

export interface PhotoTransformResponse {
  url: string;
  storagePath: string;
}

export const transformAvatarPhoto = onCall(
  { secrets: [openaiApiKey, claudeApiKey], timeoutSeconds: 120 },
  async (request): Promise<PhotoTransformResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, themeStyle, photoBase64, photoMimeType } =
      request.data as PhotoTransformRequest;

    if (!familyId || !childId || !themeStyle || !photoBase64 || !photoMimeType) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (request.auth.uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    const rawStyleInstruction =
      themeStyle === "minecraft"
        ? "Transform this person into a blocky pixel art video game character in 8-bit style, wearing leather armor and carrying a wooden sword, same pose as the original photo, square format, no text"
        : "Transform this person into a cute cartoon platformer game character with rounded cheerful design and bright colors, same pose as the original photo, square format, no text";

    // ── Rewrite for copyright safety ────────────────────────────
    let safeInstruction = rawStyleInstruction;
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const claude = new Anthropic({ apiKey: claudeApiKey.value() });
      const rewriteResult = await claude.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: `You rewrite children's image generation prompts to avoid copyright issues while preserving creative intent.
RULES:
- NEVER include character names or franchise names (no Minecraft, Mario, Nintendo, Steve, etc.)
- Describe the visual style without naming copyrighted IP
- Keep it under 60 words
- Output just the description, no preamble`,
        messages: [{ role: "user", content: rawStyleInstruction }],
      });
      const firstBlock = rewriteResult.content[0];
      if (firstBlock?.type === "text") safeInstruction = firstBlock.text;
    } catch {
      // Proceed with original on rewrite failure
    }

    // ── Call gpt-image-1 edit endpoint ──────────────────────────
    const imageBuffer = Buffer.from(photoBase64, "base64");

    let resultBase64: string;
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiApiKey.value() });

      // Create a File object from the buffer for the API
      const { Blob } = await import("buffer");
      const imageBlob = new Blob([imageBuffer], { type: photoMimeType });
      const imageFile = new File([imageBlob], "photo.png", { type: photoMimeType });

      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: imageFile,
        prompt: `${safeInstruction}. Safe for children, family-friendly.`,
        n: 1,
        size: "1024x1024",
      });

      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new Error("No image data returned from gpt-image-1 edit.");
      resultBase64 = b64;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.toLowerCase().includes("content_policy") ||
        errMsg.toLowerCase().includes("safety") ||
        errMsg.toLowerCase().includes("blocked")
      ) {
        throw new HttpsError(
          "invalid-argument",
          "We couldn't transform this photo — try a different one, or one where you're farther from the camera",
        );
      }
      throw new HttpsError("internal", `Photo transform failed: ${errMsg.slice(0, 200)}`);
    }

    // ── Save to Storage ──────────────────────────────────────────
    const resultBuffer = Buffer.from(resultBase64, "base64");
    const storagePath = `families/${familyId}/avatars/${childId}/photo-transform.png`;
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await file.save(resultBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          generatedBy: "gpt-image-1",
          childId,
          themeStyle,
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // ── Log usage ────────────────────────────────────────────────
    const db = getFirestore();
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "photo-transform",
      model: "gpt-image-1",
      childId,
      themeStyle,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return { url: downloadUrl, storagePath };
  },
);
