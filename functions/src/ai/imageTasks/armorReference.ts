import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";

// ── Armor Reference Generation (full-body armored character) ────

export interface ArmorReferenceRequest {
  familyId: string;
  childId: string;
  baseCharacterUrl: string;
  tier: string; // stone | diamond | netherite | basic | powerup | champion
  themeStyle: "minecraft" | "platformer";
}

export interface ArmorReferenceResponse {
  url: string;
  storagePath: string;
}

const ARMOR_REFERENCE_RAW_PROMPTS: Record<string, string> = {
  "minecraft-stone":
    "Keep this exact pixel art character in the exact same pose and position. " +
    "Add the following armor pieces to the character, each clearly visible: " +
    "1. HEAD: a stone helmet covering the top and sides of the head " +
    "2. CHEST: a stone chest plate covering the torso " +
    "3. WAIST: a leather belt with iron buckle at the waist " +
    "4. FEET: stone boots covering both feet and lower legs " +
    "5. LEFT ARM: a round stone shield held in the left hand/forearm " +
    "6. RIGHT HAND: a stone sword held in the right hand " +
    "All armor must be in the same blocky pixel art 8-bit style as the character. " +
    "Stone tier: grey/brown stone texture with iron accents. " +
    "Keep the same background. Same character proportions. Same pose. " +
    "Only ADD the armor — do not change anything else about the character. " +
    "Square format 1024x1024.",
  "minecraft-diamond":
    "Keep this exact pixel art character in the exact same pose and position. " +
    "Add the following armor pieces to the character, each clearly visible: " +
    "1. HEAD: a diamond helmet covering the top and sides of the head " +
    "2. CHEST: a diamond chest plate covering the torso " +
    "3. WAIST: a diamond-studded belt with golden buckle at the waist " +
    "4. FEET: diamond boots covering both feet and lower legs " +
    "5. LEFT ARM: a large diamond shield held in the left hand/forearm " +
    "6. RIGHT HAND: a diamond sword held in the right hand " +
    "All armor must be in the same blocky pixel art 8-bit style as the character. " +
    "Diamond tier: blue diamond texture with gold accents, glowing edges. " +
    "Keep the same background. Same character proportions. Same pose. " +
    "Only ADD the armor — do not change anything else about the character. " +
    "Square format 1024x1024.",
  "minecraft-netherite":
    "Keep this exact pixel art character in the exact same pose and position. " +
    "Add the following armor pieces to the character, each clearly visible: " +
    "1. HEAD: a dark heavy helmet covering the top and sides of the head " +
    "2. CHEST: a dark heavy chest plate covering the torso " +
    "3. WAIST: a dark heavy belt with glowing purple rune buckle at the waist " +
    "4. FEET: dark heavy boots covering both feet and lower legs " +
    "5. LEFT ARM: a large dark heavy shield held in the left hand/forearm " +
    "6. RIGHT HAND: a dark heavy sword with glowing purple runes held in the right hand " +
    "All armor must be in the same blocky pixel art 8-bit style as the character. " +
    "Dark netherite with purple glowing runes. " +
    "Keep the same background. Same character proportions. Same pose. " +
    "Only ADD the armor — do not change anything else about the character. " +
    "Square format 1024x1024.",
  "platformer-basic":
    "Keep this exact cartoon character in the exact same pose and position. " +
    "Add colorful cartoon armor: ribbon belt with star buckle, heart chest piece, " +
    "colorful sneakers, round rainbow shield, rounded helmet with star, magic wand. " +
    "Same style and background. Only ADD the items. Square format 1024x1024.",
  "platformer-powerup":
    "Keep this exact cartoon character in the exact same pose and position. " +
    "Add glowing cartoon armor: sparkle sash belt, glowing heart chest piece, " +
    "winged sneakers, glowing rainbow shield, crown-helmet with sparkles, glowing wand. " +
    "Same style and background. Only ADD the items. Square format 1024x1024.",
  "platformer-champion":
    "Keep this exact cartoon character in the exact same pose and position. " +
    "Add golden champion cartoon armor: golden belt, golden chest plate with rainbow heart, " +
    "golden winged boots, golden champion shield, golden crown, golden wand-sword. " +
    "Same style and background. Only ADD the items. Square format 1024x1024.",
};

/**
 * Generate a fully-armored version of the bare character using gpt-image-1 edit.
 * Takes the bare character image as input and overlays armor onto it.
 * Storage path: families/{familyId}/avatars/{childId}/armor-reference-{tier}.png
 */
export const generateArmorReference = onCall(
  { secrets: [openaiApiKey, claudeApiKey], timeoutSeconds: 120 },
  async (request): Promise<ArmorReferenceResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, baseCharacterUrl, tier, themeStyle } =
      request.data as ArmorReferenceRequest;

    if (!familyId || !childId || !baseCharacterUrl || !tier || !themeStyle) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (request.auth.uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    const promptKey = `${themeStyle}-${tier}`;
    const rawPrompt = ARMOR_REFERENCE_RAW_PROMPTS[promptKey];
    if (!rawPrompt) {
      throw new HttpsError("invalid-argument", `Unknown theme/tier combination: ${promptKey}`);
    }

    // ── Download the base character image ──────────────────────
    let baseImageBuffer: Buffer;
    try {
      const resp = await fetch(baseCharacterUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      baseImageBuffer = Buffer.from(await resp.arrayBuffer());
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new HttpsError("internal", `Failed to download base character: ${errMsg.slice(0, 200)}`);
    }

    // ── Rewrite for copyright safety ──────────────────────────
    let safePrompt = rawPrompt;
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const claude = new Anthropic({ apiKey: claudeApiKey.value() });
      const rewriteResult = await claude.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: `You rewrite children's image generation prompts to avoid copyright issues while preserving creative intent.
RULES:
- NEVER include character names or franchise names (no Minecraft, Mario, Nintendo, etc.)
- Describe the visual style and items without naming copyrighted IP
- Preserve the armor piece descriptions and pose instructions exactly
- Keep structural formatting intact
- Output just the rewritten prompt, no preamble`,
        messages: [{ role: "user", content: rawPrompt }],
      });
      const firstBlock = rewriteResult.content[0];
      if (firstBlock?.type === "text") safePrompt = firstBlock.text;
    } catch {
      // Proceed with original on rewrite failure
    }

    // ── Call gpt-image-1 edit endpoint ────────────────────────
    let resultBase64: string;
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiApiKey.value() });

      const { Blob } = await import("buffer");
      const imageBlob = new Blob([new Uint8Array(baseImageBuffer)], { type: "image/png" });
      const imageFile = new File([imageBlob], "base-character.png", { type: "image/png" });

      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: imageFile,
        prompt: `${safePrompt}. Safe for children, family-friendly.`,
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
          "The armor reference image was blocked by content policy. Try regenerating the base character.",
        );
      }
      throw new HttpsError("internal", `Armor reference generation failed: ${errMsg.slice(0, 200)}`);
    }

    // ── Save to Storage ───────────────────────────────────────
    const resultBuffer = Buffer.from(resultBase64, "base64");
    const storagePath = `families/${familyId}/avatars/${childId}/armor-reference-${tier}.png`;
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
          tier,
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // ── Write URL to Firestore profile ────────────────────────
    const db = getFirestore();
    const profileRef = db.doc(`families/${familyId}/avatarProfiles/${childId}`);
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      const profileData = profileSnap.data() ?? {};
      const existingUrls = (profileData.armorReferenceUrls as Record<string, string> | undefined) ?? {};
      await profileRef.update({
        armorReferenceUrls: { ...existingUrls, [tier]: downloadUrl },
        updatedAt: new Date().toISOString(),
      });
    }

    // ── Log usage ─────────────────────────────────────────────
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "armor-reference-generation",
      model: "gpt-image-1",
      inputTokens: 0,
      outputTokens: 0,
      childId,
      themeStyle,
      tier,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    return { url: downloadUrl, storagePath };
  },
);
