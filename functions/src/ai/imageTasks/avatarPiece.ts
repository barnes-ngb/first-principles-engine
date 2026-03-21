import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";

// ── Avatar Piece Generation ──────────────────────────────────────

export interface AvatarPieceRequest {
  familyId: string
  childId: string
  pieceId: string
  themeStyle: "minecraft" | "platformer"
  pieceDescription: string
}

export interface AvatarPieceResponse {
  url: string
  storagePath: string
}

/** Build the DALL-E prompt for an avatar armor piece. Copyright-safe. */
function buildAvatarPiecePrompt(
  themeStyle: "minecraft" | "platformer",
  pieceDescription: string,
): string {
  if (themeStyle === "minecraft") {
    return (
      `Full body character portrait, pixel art style, blocky square character design, ` +
      `8-bit video game aesthetic, wearing ${pieceDescription}, heroic pose, ` +
      `simple solid color background, no text, no watermarks, square format. ` +
      `Safe for children, family-friendly.`
    )
  }
  return (
    `Full body character portrait, cute cartoon platformer game style, ` +
    `rounded cheerful character design, bright vibrant colors, wearing ${pieceDescription}, ` +
    `happy playful pose, simple solid color background, no text, no watermarks, square format. ` +
    `Safe for children, family-friendly.`
  )
}

export const generateAvatarPiece = onCall(
  { secrets: [openaiApiKey, claudeApiKey] },
  async (request): Promise<AvatarPieceResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, pieceId, themeStyle, pieceDescription } =
      request.data as AvatarPieceRequest;

    if (!familyId || !childId || !pieceId || !themeStyle || !pieceDescription) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    if (request.auth.uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    // ── Rewrite prompt for copyright safety ─────────────────────
    let safeDescription = pieceDescription;
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const claude = new Anthropic({ apiKey: claudeApiKey.value() });

      const rewriteResult = await claude.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: `You rewrite children's image generation prompts to avoid copyright issues while preserving creative intent.
RULES:
- NEVER include character names or franchise names (no Minecraft, Mario, Nintendo, Steve, etc.)
- Describe the visual style and piece without naming copyrighted IP
- Keep it under 50 words
- Output just the description, no preamble`,
        messages: [{ role: "user", content: pieceDescription }],
      });

      const firstBlock = rewriteResult.content[0];
      if (firstBlock?.type === "text") {
        safeDescription = firstBlock.text;
      }
    } catch {
      // Proceed with original on rewrite failure
    }

    const dallePrompt = buildAvatarPiecePrompt(themeStyle, safeDescription);

    // ── Generate image ───────────────────────────────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());
    let imageResponse;
    try {
      imageResponse = await provider.generateImage(dallePrompt, {
        model: "dall-e-3",
        size: "1024x1024",
        quality: "standard",
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new HttpsError("internal", `Avatar image generation failed: ${errMsg.slice(0, 200)}`);
    }

    // ── Download image ───────────────────────────────────────────
    let imageBuffer: Buffer;
    if (imageResponse.b64Data) {
      imageBuffer = Buffer.from(imageResponse.b64Data, "base64");
    } else if (imageResponse.url) {
      const resp = await fetch(imageResponse.url);
      if (!resp.ok) throw new HttpsError("internal", "Failed to download avatar image.");
      imageBuffer = Buffer.from(await resp.arrayBuffer());
    } else {
      throw new HttpsError("internal", "Avatar image generation returned no data.");
    }

    // ── Save to Storage ──────────────────────────────────────────
    const storagePath = `families/${familyId}/avatars/${childId}/${pieceId}.png`;
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          generatedBy: "dall-e-3",
          pieceId,
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
      taskType: "avatar-piece-generation",
      model: "dall-e-3",
      childId,
      pieceId,
      themeStyle,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return { url: downloadUrl, storagePath };
  },
);
