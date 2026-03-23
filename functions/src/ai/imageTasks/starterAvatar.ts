import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";

// ── Starter Avatar Generation ─────────────────────────────────────

export interface StarterAvatarRequest {
  familyId: string
  childId: string
  themeStyle: "minecraft" | "platformer"
}

export interface StarterAvatarResponse {
  url: string
  storagePath: string
}

const STARTER_AVATAR_RAW_PROMPTS: Record<"minecraft" | "platformer", string> = {
  minecraft:
    "Full body character portrait, pixel art style, blocky square character design, " +
    "8-bit video game aesthetic, wearing simple brown leather armor and carrying a " +
    "wooden sword and wooden shield, neutral ready stance, simple dark stone background, " +
    "no text, no watermarks, square format",
  platformer:
    "Full body character portrait, cute cartoon platformer game style, " +
    "rounded cheerful character design, bright vibrant colors, wearing a simple " +
    "colorful starter outfit with a small cape, happy confident pose, " +
    "simple light blue sky background, no text, no watermarks, square format",
};

export const generateStarterAvatar = onCall(
  { secrets: [openaiApiKey, claudeApiKey] },
  async (request): Promise<StarterAvatarResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, themeStyle } = request.data as StarterAvatarRequest;

    if (!familyId || !childId || !themeStyle) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (request.auth.uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    const rawPrompt = STARTER_AVATAR_RAW_PROMPTS[themeStyle];

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
- Describe the visual style and character without naming copyrighted IP
- Keep it under 80 words
- Output just the description, no preamble`,
        messages: [{ role: "user", content: rawPrompt }],
      });
      const firstBlock = rewriteResult.content[0];
      if (firstBlock?.type === "text") safePrompt = firstBlock.text;
    } catch {
      // Proceed with original on rewrite failure
    }

    // ── Generate with DALL-E 3 ──────────────────────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());
    let imageResponse;
    try {
      imageResponse = await provider.generateImage(
        `${safePrompt}. Safe for children, family-friendly.`,
        { model: "dall-e-3", size: "1024x1024", quality: "standard" },
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new HttpsError("internal", `Starter avatar generation failed: ${errMsg.slice(0, 200)}`);
    }

    // ── Download image buffer ────────────────────────────────────
    let imageBuffer: Buffer;
    if (imageResponse.b64Data) {
      imageBuffer = Buffer.from(imageResponse.b64Data, "base64");
    } else if (imageResponse.url) {
      const resp = await fetch(imageResponse.url);
      if (!resp.ok) throw new HttpsError("internal", "Failed to download starter avatar image.");
      imageBuffer = Buffer.from(await resp.arrayBuffer());
    } else {
      throw new HttpsError("internal", "Starter avatar generation returned no data.");
    }

    // ── Save to Storage ──────────────────────────────────────────
    const storagePath = `families/${familyId}/avatars/${childId}/starter.png`;
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await file.save(imageBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          generatedBy: "dall-e-3",
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
      taskType: "starter-avatar-generation",
      model: "dall-e-3",
      inputTokens: 0,
      outputTokens: 0,
      childId,
      themeStyle,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return { url: downloadUrl, storagePath };
  },
);
