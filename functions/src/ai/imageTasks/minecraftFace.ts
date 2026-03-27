import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey } from "../aiConfig.js";

// ── Minecraft Pixel Face Generation (Claude Vision → 64-color grid) ──

export interface MinecraftFaceRequest {
  familyId: string;
  childId: string;
  /** Base64-encoded photo of the child */
  photoBase64: string;
  photoMimeType: string;
}

export interface MinecraftFaceResponse {
  faceGrid: string[];
}

const FACE_GRID_PROMPT = `Look at this child's photo. Create an 8×8 pixel art face grid for a Minecraft-style character skin.

Layout (each row is 8 pixels, left to right):
Row 1: ALL hair color
Row 2: ALL hair color
Row 3: hair, skin, skin, skin, skin, skin, skin, hair
Row 4: skin, WHITE, eyeColor, skin, skin, WHITE, eyeColor, skin
Row 5: skin, cheek, skin, noseShadow, noseShadow, skin, cheek, skin
Row 6: skin, skin, mouthCorner, mouth, mouth, mouthCorner, skin, skin
Row 7: skin, skin, skin, skin, skin, skin, skin, skin
Row 8: skin, skin, skin, chinShadow, chinShadow, skin, skin, skin

Rules:
- SKIN: sample from child's cheek/forehead. Use ONE flat hex color.
- HAIR: sample from child's hair. Use ONE flat hex color.
- WHITE: #FFFFFF for eye whites
- eyeColor: dark version of their actual eye color
- cheek: skin mixed 15% with #FFAAAA
- mouth: skin darkened 15%
- mouthCorner: skin darkened 5%
- noseShadow: skin darkened 8%
- chinShadow: skin darkened 6%

Return ONLY a JSON array of exactly 64 hex color strings, row by row from top-left to bottom-right. No explanation, no markdown fencing.
Example start: ["#6B4C32","#6B4C32",...]`;

/**
 * Generate an 8×8 pixel face color grid from a child's photo using Claude vision.
 * Returns a 64-element hex color array that can be rendered client-side.
 * The grid is also cached to the child's avatarProfile.faceGrid in Firestore.
 */
export const generateMinecraftFace = onCall(
  { secrets: [claudeApiKey], timeoutSeconds: 60 },
  async (request): Promise<MinecraftFaceResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, photoBase64, photoMimeType } =
      request.data as MinecraftFaceRequest;

    if (!familyId || !childId || !photoBase64 || !photoMimeType) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (request.auth.uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    let faceGrid: string[];

    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const claude = new Anthropic({ apiKey: claudeApiKey.value() });

      const mediaType = photoMimeType.startsWith("image/")
        ? (photoMimeType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp")
        : "image/jpeg";

      const result = await claude.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: photoBase64,
                },
              },
              {
                type: "text",
                text: FACE_GRID_PROMPT,
              },
            ],
          },
        ],
      });

      const textBlock = result.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }

      // Parse JSON — handle potential markdown fencing
      let jsonStr = textBlock.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed) || parsed.length !== 64) {
        throw new Error(`Expected 64 colors, got ${Array.isArray(parsed) ? parsed.length : "non-array"}`);
      }

      // Validate each entry is a hex color string
      faceGrid = parsed.map((c: unknown) => {
        if (typeof c === "string" && /^#[0-9A-Fa-f]{6}$/.test(c)) return c;
        return "#F5D6B8"; // fallback to skin-ish color for invalid entries
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new HttpsError(
        "internal",
        `Minecraft face generation failed: ${errMsg.slice(0, 200)}`,
      );
    }

    // ── Cache faceGrid to avatarProfile ────────────────────────────
    const db = getFirestore();
    const profileRef = db.doc(
      `families/${familyId}/avatarProfiles/${childId}`,
    );
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      await profileRef.update({
        faceGrid,
        updatedAt: new Date().toISOString(),
      });
    }

    // ── Log usage ──────────────────────────────────────────────────
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "minecraft-face",
      model: "claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      childId,
      createdAt: new Date().toISOString(),
    });

    return { faceGrid };
  },
);
