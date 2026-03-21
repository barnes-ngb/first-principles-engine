import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { claudeApiKey } from "../aiConfig.js";

// ── Feature Extraction (Photo → Character Features) ────────────────

export interface ExtractFeaturesRequest {
  familyId: string;
  childId: string;
  photoBase64: string;
  photoMimeType: string;
}

export interface CharacterFeatures {
  skinTone: string;
  hairColor: string;
  hairStyle: "short" | "medium" | "long" | "curly";
  hairLength: "above_ear" | "ear_length" | "shoulder" | "below_shoulder";
  eyeColor?: string;
  distinguishingFeatures?: string;
}

export interface ExtractFeaturesResponse {
  features: CharacterFeatures;
}

const DEFAULT_FEATURES: CharacterFeatures = {
  skinTone: "#D2A272",
  hairColor: "#4A3728",
  hairStyle: "short",
  hairLength: "above_ear",
};

const EXTRACTION_PROMPT = `Analyze this photo of a child and extract these visual features for building a 3D avatar. Respond ONLY in JSON format with no other text:

{
  "skinTone": "<hex color of skin>",
  "hairColor": "<hex color of hair>",
  "hairStyle": "short|medium|long|curly",
  "hairLength": "above_ear|ear_length|shoulder|below_shoulder",
  "eyeColor": "<hex color, optional>",
  "distinguishingFeatures": "<brief note, e.g. 'glasses', 'freckles', optional>"
}

Use accurate hex colors sampled from the actual photo. For skin tone, sample from the forehead or cheek. For hair, sample from the most prominent area.`;

/**
 * Extract character features from a child's photo using Claude's vision.
 * Returns structured features for the 3D voxel character builder.
 */
export const extractFeatures = onCall(
  { secrets: [claudeApiKey], timeoutSeconds: 60 },
  async (request): Promise<ExtractFeaturesResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { familyId, childId, photoBase64, photoMimeType } =
      request.data as ExtractFeaturesRequest;

    if (!familyId || !childId || !photoBase64 || !photoMimeType) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }
    if (request.auth.uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    let features: CharacterFeatures;

    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const claude = new Anthropic({ apiKey: claudeApiKey.value() });

      // Determine media type for Claude API
      const mediaType = photoMimeType.startsWith("image/")
        ? (photoMimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
        : "image/jpeg";

      const result = await claude.messages.create({
        model: "claude-sonnet-4-20250514",
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
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      });

      const textBlock = result.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }

      // Parse JSON from response (handle potential markdown fencing)
      let jsonStr = textBlock.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      // Validate and type-check the parsed result
      const validStyles = ["short", "medium", "long", "curly"];
      const validLengths = [
        "above_ear",
        "ear_length",
        "shoulder",
        "below_shoulder",
      ];

      features = {
        skinTone:
          typeof parsed.skinTone === "string" && parsed.skinTone.startsWith("#")
            ? parsed.skinTone
            : DEFAULT_FEATURES.skinTone,
        hairColor:
          typeof parsed.hairColor === "string" &&
          parsed.hairColor.startsWith("#")
            ? parsed.hairColor
            : DEFAULT_FEATURES.hairColor,
        hairStyle: validStyles.includes(parsed.hairStyle as string)
          ? (parsed.hairStyle as CharacterFeatures["hairStyle"])
          : DEFAULT_FEATURES.hairStyle,
        hairLength: validLengths.includes(parsed.hairLength as string)
          ? (parsed.hairLength as CharacterFeatures["hairLength"])
          : DEFAULT_FEATURES.hairLength,
        ...(typeof parsed.eyeColor === "string" &&
        parsed.eyeColor.startsWith("#")
          ? { eyeColor: parsed.eyeColor }
          : {}),
        ...(typeof parsed.distinguishingFeatures === "string"
          ? { distinguishingFeatures: parsed.distinguishingFeatures }
          : {}),
      };
    } catch (err) {
      // If extraction fails, return defaults
      console.warn("Feature extraction failed, using defaults:", err);
      features = DEFAULT_FEATURES;
    }

    // ── Save features to avatarProfile ────────────────────────────
    const db = getFirestore();
    const profileRef = db.doc(
      `families/${familyId}/avatarProfiles/${childId}`,
    );
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      await profileRef.update({
        characterFeatures: features,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await profileRef.set({
        childId,
        characterFeatures: features,
        totalXp: 0,
        pieces: [],
        themeStyle: "minecraft",
        currentTier: "stone",
        equippedPieces: [],
        unlockedPieces: [],
        updatedAt: new Date().toISOString(),
      });
    }

    // ── Log usage ─────────────────────────────────────────────────
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "feature-extraction",
      model: "claude-sonnet-4-20250514",
      childId,
      createdAt: new Date().toISOString(),
    });

    return { features };
  },
);
