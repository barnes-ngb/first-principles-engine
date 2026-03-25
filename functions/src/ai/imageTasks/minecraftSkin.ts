import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { openaiApiKey } from "../aiConfig.js";

// ── Minecraft Skin Face Generation (gpt-image-1) ──────────────────

export interface MinecraftSkinRequest {
  familyId: string
  childId: string
  /** Base64-encoded photo of the child (used as reference in prompt) */
  photoDescription: string
  skinTone: string   // e.g. "#F5D6B8"
  hairColor: string  // e.g. "#6B4C32"
  eyeColor: string   // e.g. "#4A6B7A"
}

export interface MinecraftSkinResponse {
  url: string
  storagePath: string
}

/**
 * Generate a Minecraft-style 8×8 pixel face skin using gpt-image-1.
 * The face is rendered as clean pixel art matching the child's coloring.
 * Storage path: families/{familyId}/avatars/{childId}/minecraft-skin.png
 */
export const generateMinecraftSkin = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 60 },
  async (request): Promise<MinecraftSkinResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const {
      familyId,
      childId,
      photoDescription,
      skinTone,
      hairColor,
      eyeColor,
    } = request.data as MinecraftSkinRequest;

    if (!familyId || !childId || !skinTone || !hairColor || !eyeColor) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (request.auth.uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    // Build the prompt — describes the face without referencing copyrighted IPs
    const prompt = `Create a pixel art character face in the classic block-game skin format (8x8 pixels, front view only).

The face should match this child's appearance: ${photoDescription || "fair-skinned child with medium brown hair and blue-gray eyes"}.

Specific colors to use:
- Skin tone: ${skinTone} (fair/light peachy)
- Hair color: ${hairColor} (medium warm brown, visible on top 2 rows and sides)
- Eye color: ${eyeColor} (2 white pixels with colored pupil each)
- Simple mouth: slightly darker skin-tone pixels
- Clean, flat pixel art style — each pixel is a single solid color, no gradients, no anti-aliasing
- Family-friendly, cheerful expression

Output as a clean 8x8 pixel grid image. Each cell should be exactly one flat color. The background should be transparent. This will be applied as a texture to a 3D cube face.`;

    // ── Generate with gpt-image-1 ──────────────────────────────────
    let resultBase64: string;
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiApiKey.value() });

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
        background: "transparent",
        output_format: "png",
      } as Parameters<typeof openai.images.generate>[0]);

      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new Error("No image data returned from gpt-image-1.");
      resultBase64 = b64;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new HttpsError("internal", `Minecraft skin generation failed: ${errMsg.slice(0, 200)}`);
    }

    // ── Save to Storage ────────────────────────────────────────────
    const imageBuffer = Buffer.from(resultBase64, "base64");
    const storagePath = `families/${familyId}/avatars/${childId}/minecraft-skin.png`;
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          generatedBy: "gpt-image-1",
          childId,
          taskType: "minecraft-skin",
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // ── Log usage ──────────────────────────────────────────────────
    const db = getFirestore();
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "minecraft-skin",
      model: "gpt-image-1",
      inputTokens: 0,
      outputTokens: 0,
      childId,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return { url: downloadUrl, storagePath };
  },
);
