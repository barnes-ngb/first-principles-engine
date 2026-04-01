import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser, checkRateLimit } from "../authGuard.js";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";
import type { ImageOptions } from "../aiService.js";

// ── Request / Response types ────────────────────────────────────

export interface ImageGenRequest {
  familyId: string;
  prompt: string;
  style?: "schedule-card" | "reward-chart" | "theme-illustration" | "book-illustration-minecraft" | "book-illustration-storybook" | "book-illustration-comic" | "book-illustration-realistic" | "book-illustration-garden-warfare" | "book-illustration-platformer" | "book-sticker" | "general";
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
    "A blocky pixel art voxel world scene for a children's book page. Environment only, no characters or people. Colorful blocks, dramatic terrain, bright sky. ",
  "book-illustration-storybook":
    "A warm hand-painted watercolor scene for a children's picture book page. Background environment only, no characters. Soft colors, gentle shapes, inviting landscape. ",
  "book-illustration-comic":
    "A bold comic book background panel for a children's story. Dynamic environment, no characters. Bright colors, dramatic perspective, action lines. ",
  "book-illustration-realistic":
    "A gentle realistic background scene for a children's book page. Environment only, no people or characters. Warm lighting, friendly atmosphere. ",
  "book-illustration-garden-warfare":
    "A fun cartoon garden battle scene for a children's book page. Bright green garden with sunflowers, pea shooters, walnuts as barriers, silly cartoon zombies in the background. Colorful, humorous, family-friendly. Environment only, no specific characters. ",
  "book-illustration-platformer":
    "A colorful side-scrolling platformer video game world for a children's book page. Bright blue sky, floating brick platforms, green pipes, golden coins, fluffy clouds with eyes, mushrooms, starry power-ups. Cheerful and inviting. Environment only, no characters. ",
  "book-sticker":
    "A single cute cartoon character or object, sticker style. Bold clean outline, colorful flat fill, simple shapes, fun and expressive. Child-friendly, no text, no background elements. ",
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

// ── Fallback copyright name strip (used when Haiku rewriter fails) ──

const COPYRIGHT_NAMES =
  /\b(mario|luigi|princess peach|peach|bowser|toad|yoshi|donkey kong|link|zelda|ganon|kirby|samus|pikachu|pokemon|charizard|bulbasaur|squirtle|eevee|mewtwo|jigglypuff|snorlax|gengar|raichu|disney|mickey mouse|mickey|minnie|goofy|donald duck|elsa|anna|olaf|moana|rapunzel|ariel|mulan|simba|woody|buzz lightyear|nemo|dory|baymax|wall-e|spider-?man|spiderman|batman|superman|iron man|hulk|thor|captain america|wonder woman|wolverine|deadpool|thanos|joker|minecraft|creeper|enderman|steve|herobrine|fortnite|roblox|sonic|tails|knuckles|shadow|amy rose|among us|hello kitty|spongebob|patrick star|squidward|peppa pig|paw patrol|bluey|cocomelon|ryan|mr\.? beast|mrbeast)\b/gi;

/** Regex-based fallback to strip copyrighted names when the AI rewriter is unavailable. */
function fallbackCopyrightStrip(prompt: string): string {
  return prompt.replace(COPYRIGHT_NAMES, "character").replace(/\s{2,}/g, " ").trim();
}

// ── Callable Cloud Function ─────────────────────────────────────

export const generateImage = onCall(
  { secrets: [openaiApiKey, claudeApiKey], timeoutSeconds: 120 },
  async (request): Promise<ImageGenResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    const { uid } = requireApprovedUser(request);

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
      "book-illustration-garden-warfare",
      "book-illustration-platformer",
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
    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    // ── Rate limiting ─────────────────────────────────────────
    await checkRateLimit(uid, "image-generation", 20, 60);

    // ── Rewrite prompt for DALL-E safety via Claude ─────────────
    let safePrompt = prompt;
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const claude = new Anthropic({ apiKey: claudeApiKey.value() });

      const rewriteSystemPrompt =
        style === "book-sticker"
          ? `You rewrite children's sticker descriptions to avoid copyright issues.

CRITICAL RULES:
- NEVER output any character names, franchise names, game names, or brand names
- Replace ALL named characters with visual descriptions of how they look
- Replace ALL franchise/game names with genre descriptions
- If the input is ONLY a character name with no other context, describe that character's iconic visual appearance without naming them
- Keep it cute, simple, child-friendly
- Under 50 words

EXAMPLES:
- "Mario" → "a cheerful stocky cartoon man wearing red overalls, a red cap, brown shoes, and a big bushy mustache"
- "Pikachu" → "a small round yellow cartoon creature with long pointy ears tipped in black, rosy red cheeks, and a lightning-bolt shaped tail"
- "a Minecraft creeper" → "a tall green blocky pixelated creature with a frowning face"
- "Elsa from Frozen" → "a graceful young woman with platinum blonde hair in a long braid, wearing a sparkling ice-blue gown"
- "Spider-Man swinging" → "a superhero in a red and blue full-body suit with web patterns, swinging through the air"
- "Lincoln's Minecraft skin" → "a blocky pixel-art video game character"
- "Sonic" → "a speedy blue cartoon hedgehog with red shoes and white gloves"
- "a cute puppy" → "a cute puppy"

OUTPUT: Just the rewritten description. No preamble, no quotes, no explanation.
If the input has no copyright concerns (like "a cute puppy"), output it unchanged.`
          : `You rewrite children's image generation prompts to avoid copyright issues while preserving the creative intent.

RULES:
- NEVER include character names (Mario, Luigi, Pikachu, Elsa, Spider-Man, Steve, etc.)
- NEVER include franchise names (Minecraft, Pokemon, Mario Bros, Disney, Marvel, etc.)
- Instead, describe the VISUAL STYLE and WORLD without naming the IP:
  - "Minecraft" → "blocky pixel art voxel world"
  - "Mario" → "colorful platformer video game world with brick blocks, green pipes, golden coins"
  - "Pokemon" → "cute cartoon creatures in a grassy meadow"
  - "Frozen/Elsa" → "magical ice palace with snowflakes and northern lights"
  - "Spider-Man" → "comic book city rooftop scene at sunset"
- ALWAYS describe a SCENE or ENVIRONMENT, not a character doing something
- If the kid describes a character action ("Mario jumps over a pit"), convert to a scene ("a deep pit with lava below in a colorful platformer world, brick platforms floating above")
- Keep the output under 100 words
- Maintain the kid's creative intent — just make it about the WORLD not the CHARACTER
- The output should start directly with the scene description, no preamble

IMPORTANT: The child will overlay their own characters on top of this scene. So generate a BACKGROUND, not a character portrait.`;

      const rewriteResult = await claude.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: rewriteSystemPrompt,
        messages: [{ role: "user", content: prompt }],
      });

      const firstBlock = rewriteResult.content[0];
      if (firstBlock?.type === "text" && firstBlock.text.trim()) {
        safePrompt = firstBlock.text;
      } else {
        // Empty response from rewriter — use fallback
        safePrompt = fallbackCopyrightStrip(prompt);
      }
    } catch (rewriteErr) {
      // If rewrite fails, use regex fallback instead of raw prompt
      console.warn("Prompt rewrite failed, using fallback strip:", rewriteErr);
      safePrompt = fallbackCopyrightStrip(prompt);
    }

    // ── Generate image ──────────────────────────────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());
    const dallePrompt = buildImagePrompt(safePrompt, style);

    // Use gpt-image-1 for stickers (native transparent bg), DALL-E 3 for everything else
    const isSticker = style === "book-sticker";
    const imageOpts: ImageOptions = {
      model: isSticker ? "gpt-image-1" : "dall-e-3",
      size: isSticker ? "1024x1024" : (size ?? "1024x1024"),
      quality: isSticker ? undefined : "standard",
      background: isSticker ? "transparent" : undefined,
      outputFormat: isSticker ? "png" : undefined,
    };

    let imageResponse;
    try {
      imageResponse = await provider.generateImage(dallePrompt, imageOpts);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Image generation failed:", {
        prompt: prompt.slice(0, 100),
        style,
        model: imageOpts.model,
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

    // ── Get image buffer ──────────────────────────────────────
    let processedBuffer: Buffer;
    const contentType = "image/png";

    if (imageResponse.b64Data) {
      // gpt-image-1 returns base64 — decode directly (already has transparency)
      processedBuffer = Buffer.from(imageResponse.b64Data, "base64");
    } else if (imageResponse.url) {
      // DALL-E 3 returns a URL — download it
      try {
        const response = await fetch(imageResponse.url);
        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status}`);
        }
        processedBuffer = Buffer.from(await response.arrayBuffer());
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new HttpsError(
          "internal",
          `Failed to download generated image: ${errMsg}`,
        );
      }
    } else {
      throw new HttpsError("internal", "Image generation returned no data.");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}.png`;
    const storagePath = `families/${familyId}/generated-images/${filename}`;

    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await file.save(processedBuffer, {
      metadata: {
        contentType,
        metadata: {
          generatedBy: imageOpts.model ?? "dall-e-3",
          originalPrompt: prompt,
          style: style ?? "general",
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // ── Log usage to Firestore ─────────────────────────────────
    const db = getFirestore();
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "image-generation",
      model: imageOpts.model ?? "dall-e-3",
      inputTokens: 0,
      outputTokens: 0,
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
