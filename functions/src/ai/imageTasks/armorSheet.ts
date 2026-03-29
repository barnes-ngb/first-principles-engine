import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser } from "../authGuard.js";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";

// ── Request / Response types ────────────────────────────────────

export interface ArmorSheetRequest {
  familyId: string;
  childId: string;
  themeStyle: "minecraft" | "platformer";
  tier: string;  // stone | diamond | netherite | basic | powerup | champion
}

export interface ArmorSheetResponse {
  url: string;
  storagePath: string;
}

/**
 * Raw prompts for each theme+tier combination.
 * Each prompt describes a 3-column × 2-row reference sheet of all 6 pieces
 * in order: belt, breastplate, shoes, shield, helmet, sword.
 */
const ARMOR_SHEET_RAW_PROMPTS: Record<string, string> = {
  "minecraft-stone":
    "A flat-lay reference sheet of 6 matching armor pieces for a pixel art video game, " +
    "arranged in a 3-column 2-row grid with equal spacing. Each piece is isolated on a " +
    "dark slate background with a subtle stone texture. All pieces share the same pixel " +
    "art style, color palette (brown leather tones, iron grey accents), and lighting " +
    "direction (top-left). The 6 pieces in order left-to-right top-to-bottom are: " +
    "1. A wide leather belt with a plain iron buckle " +
    "2. A chest plate with a small carved cross " +
    "3. A pair of sturdy boots with iron sole plates " +
    "4. A round shield with a cross emblem " +
    "5. A closed-face helmet with an iron visor " +
    "6. A short sword with a plain iron crossguard " +
    "No text, no labels, no background outside the grid cells, transparent gutters " +
    "between pieces, square format 1024x1024",
  "minecraft-diamond":
    "A flat-lay reference sheet of 6 matching armor pieces for a pixel art video game, " +
    "arranged in a 3-column 2-row grid with equal spacing. Each piece is isolated on a " +
    "deep blue-black background with diamond crystal texture. All pieces share the same " +
    "pixel art style, color palette (blue diamond with gold trim), and lighting direction " +
    "(top-left with gem sparkle). The 6 pieces in order left-to-right top-to-bottom are: " +
    "1. A wide diamond-studded belt with a golden cross buckle " +
    "2. A shining diamond chest plate with a glowing golden cross " +
    "3. A pair of diamond-tipped boots with golden sole trim " +
    "4. A large diamond shield with a golden cross and light rays " +
    "5. A gleaming diamond helmet with a glowing golden visor " +
    "6. A diamond sword with a golden crossguard and glowing blade edge " +
    "No text, no labels, square format 1024x1024",
  "minecraft-netherite":
    "A flat-lay reference sheet of 6 matching armor pieces for a pixel art video game, " +
    "arranged in a 3-column 2-row grid with equal spacing. Each piece is isolated on a " +
    "near-black background with obsidian and purple rune texture. All pieces share the " +
    "same pixel art style, color palette (dark grey with deep purple glow), " +
    "and dramatic lighting (purple rim light). The 6 pieces in order left-to-right " +
    "top-to-bottom are: " +
    "1. A dark heavy belt with purple glowing rune buckle " +
    "2. A dark heavy chest plate with a purple glowing cross " +
    "3. A pair of dark heavy boots with glowing purple sole runes " +
    "4. A large dark heavy shield with a glowing purple cross " +
    "5. A dark heavy helmet with a glowing purple visor slit " +
    "6. A dark heavy sword with glowing purple runes on the blade " +
    "No text, no labels, square format 1024x1024",
  "platformer-basic":
    "A flat-lay reference sheet of 6 matching cute cartoon items for a platformer " +
    "video game, arranged in a 3-column 2-row grid with equal spacing. Each item " +
    "is isolated on a soft cream background. All items share the same rounded " +
    "cartoon style, bright saturated color palette (rainbow pastels with gold trim), " +
    "and cheerful lighting (soft top light). The 6 items in order left-to-right " +
    "top-to-bottom are: " +
    "1. A colorful ribbon belt with a small bow and star buckle " +
    "2. A heart-shaped chest piece in bright pink with gold trim " +
    "3. A pair of colorful sneakers with small bows on the laces " +
    "4. A small round shield with a rainbow heart " +
    "5. A rounded helmet with a small star on top " +
    "6. A short wand with a star tip and small sparkles " +
    "No text, no labels, square format 1024x1024",
  "platformer-powerup":
    "A flat-lay reference sheet of 6 matching glowing cartoon items for a platformer " +
    "video game, arranged in a 3-column 2-row grid with equal spacing. Each item " +
    "is isolated on a soft lavender background. All items share the same rounded " +
    "cartoon style, bright glowing color palette (neon pastels with silver trim), " +
    "and sparkling lighting (soft top light with sparkle accents). The 6 items in order " +
    "left-to-right top-to-bottom are: " +
    "1. A glowing sash belt with sparkles and a shining star buckle " +
    "2. A glowing chest piece with a radiant heart and silver trim " +
    "3. A pair of winged sneakers with a sparkle trail beneath them " +
    "4. A glowing round shield with a shining rainbow cross " +
    "5. A crown-helmet with sparkles and a glowing silver star " +
    "6. A glowing wand-sword with sparkles and a rainbow trail " +
    "No text, no labels, square format 1024x1024",
  "platformer-champion":
    "A flat-lay reference sheet of 6 matching golden champion cartoon items for a platformer " +
    "video game, arranged in a 3-column 2-row grid with equal spacing. Each item " +
    "is isolated on a soft golden background. All items share the same rounded " +
    "cartoon style, rich golden color palette (gold and rainbow gems), " +
    "and radiant lighting (warm top light with rainbow sparkles). The 6 items in order " +
    "left-to-right top-to-bottom are: " +
    "1. A shimmering golden belt with a rainbow bow and gem star buckle " +
    "2. A golden champion chest plate with rainbow heart and gem accents " +
    "3. A pair of golden winged boots with rainbow sparkle trail and gem laces " +
    "4. A golden champion shield with rainbow cross and star gems " +
    "5. A golden champion crown-helmet with rainbow star and gem accents " +
    "6. A golden champion wand-sword with rainbow sparkles and gem-studded handle " +
    "No text, no labels, square format 1024x1024",
};

/**
 * Generate a full 3×2 armor sheet (all 6 pieces) in one DALL-E 3 call.
 * Saves sheet to: families/{familyId}/avatars/{childId}/armor-sheet-{tier}.png
 * Writes the URL into avatarProfile.armorSheetUrls[tier] in Firestore.
 */
export const generateArmorSheet = onCall(
  { secrets: [openaiApiKey, claudeApiKey] },
  async (request): Promise<ArmorSheetResponse> => {
    const { uid } = requireApprovedUser(request);

    const { familyId, childId, themeStyle, tier } =
      request.data as ArmorSheetRequest;

    if (!familyId || !childId || !themeStyle || !tier) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }

    const promptKey = `${themeStyle}-${tier}`;
    const rawPrompt = ARMOR_SHEET_RAW_PROMPTS[promptKey];
    if (!rawPrompt) {
      throw new HttpsError("invalid-argument", `Unknown theme/tier combination: ${promptKey}`);
    }

    // ── Rewrite for copyright safety ────────────────────────────
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
- Preserve the grid layout instructions and piece descriptions exactly
- Keep structural formatting (numbered list, grid description) intact
- Output just the rewritten prompt, no preamble`,
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
      throw new HttpsError("internal", `Armor sheet generation failed: ${errMsg.slice(0, 200)}`);
    }

    // ── Download image buffer ────────────────────────────────────
    let imageBuffer: Buffer;
    if (imageResponse.b64Data) {
      imageBuffer = Buffer.from(imageResponse.b64Data, "base64");
    } else if (imageResponse.url) {
      const resp = await fetch(imageResponse.url);
      if (!resp.ok) throw new HttpsError("internal", "Failed to download armor sheet image.");
      imageBuffer = Buffer.from(await resp.arrayBuffer());
    } else {
      throw new HttpsError("internal", "Armor sheet generation returned no data.");
    }

    // ── Save to Storage ──────────────────────────────────────────
    const storagePath = `families/${familyId}/avatars/${childId}/armor-sheet-${tier}.png`;
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
          tier,
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // ── Write URL to Firestore profile ───────────────────────────
    const db = getFirestore();
    const profileRef = db.doc(`families/${familyId}/avatarProfiles/${childId}`);
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      const profileData = profileSnap.data() ?? {};
      const existingSheetUrls = (profileData.armorSheetUrls as Record<string, string> | undefined) ?? {};
      await profileRef.update({
        armorSheetUrls: { ...existingSheetUrls, [tier]: downloadUrl },
        updatedAt: new Date().toISOString(),
      });
    }

    // ── Log usage ────────────────────────────────────────────────
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "armor-sheet-generation",
      model: "dall-e-3",
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
