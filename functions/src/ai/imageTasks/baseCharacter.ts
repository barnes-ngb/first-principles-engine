import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser } from "../authGuard.js";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";

// ── Base Character Generation (DALL-E 3, full body no armor) ──────

export interface BaseCharacterRequest {
  familyId: string
  childId: string
  themeStyle: "minecraft" | "platformer"
}

export interface BaseCharacterResponse {
  url: string
  storagePath: string
}

const BASE_CHARACTER_RAW_PROMPTS: Record<"minecraft" | "platformer", string> = {
  minecraft:
    "Pixel art video game character, blocky 8-bit style, full body, facing forward, " +
    "arms relaxed at sides, neutral stance. Wearing ONLY a plain brown tunic and " +
    "plain brown trousers. Absolutely NO armor of any kind. NO chest plate. " +
    "NO helmet. NO shield. NO sword. NO weapons. NO boots with details. " +
    "Plain flat shoes only. NO accessories. NO equipment. Simple plain clothing only. " +
    "Dark stone background. Centered in frame. Square format. No text. No watermarks.",
  platformer:
    "Cute cartoon platformer character, rounded cheerful style, full body, facing " +
    "forward, arms relaxed at sides, happy neutral pose. Wearing ONLY a simple plain " +
    "colorful dress. Absolutely NO armor of any kind. NO helmet. NO shield. " +
    "NO weapon. NO accessories. NO equipment. Plain flat shoes only. " +
    "Light blue background. Centered in frame. Square format. No text. No watermarks.",
};

/**
 * Generate the base character image (full body, no armor) using DALL-E 3.
 * Generated once per child and cached at baseCharacterUrl.
 * Storage path: families/{familyId}/avatars/{childId}/base-character.png
 */
export const generateBaseCharacter = onCall(
  { secrets: [openaiApiKey, claudeApiKey], timeoutSeconds: 120, memory: "512MiB" },
  async (request): Promise<BaseCharacterResponse> => {
    const { uid } = requireApprovedUser(request);

    const { familyId, childId, themeStyle } = request.data as BaseCharacterRequest;

    if (!familyId || !childId || !themeStyle) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    const rawPrompt = BASE_CHARACTER_RAW_PROMPTS[themeStyle];

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

    // ── Generate with DALL-E 3 ───────────────────────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());
    let imageResponse;
    try {
      imageResponse = await provider.generateImage(
        `${safePrompt}. Safe for children, family-friendly.`,
        { model: "dall-e-3", size: "1024x1024", quality: "standard" },
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new HttpsError("internal", `Base character generation failed: ${errMsg.slice(0, 200)}`);
    }

    // ── Download image buffer ────────────────────────────────────
    let imageBuffer: Buffer;
    if (imageResponse.b64Data) {
      imageBuffer = Buffer.from(imageResponse.b64Data, "base64");
    } else if (imageResponse.url) {
      const resp = await fetch(imageResponse.url);
      if (!resp.ok) throw new HttpsError("internal", "Failed to download base character image.");
      imageBuffer = Buffer.from(await resp.arrayBuffer());
    } else {
      throw new HttpsError("internal", "Base character generation returned no data.");
    }

    // ── Save to Storage ──────────────────────────────────────────
    const storagePath = `families/${familyId}/avatars/${childId}/base-character.png`;
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
      taskType: "base-character-generation",
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
