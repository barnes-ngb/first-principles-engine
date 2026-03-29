import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser } from "../authGuard.js";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";

// ── New Armor Piece Generation (gpt-image-1, transparent PNG) ────

export interface NewArmorPieceRequest {
  familyId: string
  childId: string
  pieceId: string
  tier: string  // stone | diamond | netherite | basic | powerup | champion
  themeStyle: "minecraft" | "platformer"
  prompt: string
}

export interface NewArmorPieceResponse {
  url: string
  storagePath: string
}

/**
 * Generate a single armor piece item image using gpt-image-1.
 * Pieces are transparent-background PNG items intended to be layered over the base character.
 * Storage path: families/{familyId}/avatars/{childId}/{pieceId}-{tier}.png
 */
export const generateArmorPiece = onCall(
  { secrets: [openaiApiKey, claudeApiKey] },
  async (request): Promise<NewArmorPieceResponse> => {
    const { uid } = requireApprovedUser(request);

    const { familyId, childId, pieceId, tier, themeStyle, prompt: rawPrompt } =
      request.data as NewArmorPieceRequest;

    if (!familyId || !childId || !pieceId || !tier || !themeStyle || !rawPrompt) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    // ── Rewrite for copyright safety ────────────────────────────
    let safePrompt = rawPrompt;
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
- Keep it under 60 words
- Output just the description, no preamble`,
        messages: [{ role: "user", content: rawPrompt }],
      });
      const firstBlock = rewriteResult.content[0];
      if (firstBlock?.type === "text") safePrompt = firstBlock.text;
    } catch {
      // Proceed with original on rewrite failure
    }

    // ── Generate with gpt-image-1 (native transparent background) ─
    let resultBase64: string;
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiApiKey.value() });

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: `${safePrompt}. Safe for children, family-friendly.`,
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
      throw new HttpsError("internal", `Armor piece image generation failed: ${errMsg.slice(0, 200)}`);
    }

    // ── Save to Storage ──────────────────────────────────────────
    const imageBuffer = Buffer.from(resultBase64, "base64");
    const storagePath = `families/${familyId}/avatars/${childId}/${pieceId}-${tier}.png`;
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          generatedBy: "gpt-image-1",
          pieceId,
          tier,
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
      taskType: "armor-piece-generation",
      model: "gpt-image-1",
      inputTokens: 0,
      outputTokens: 0,
      childId,
      pieceId,
      tier,
      themeStyle,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return { url: downloadUrl, storagePath };
  },
);
