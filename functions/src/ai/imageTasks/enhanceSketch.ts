import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireApprovedUser } from "../authGuard.js";
import { claudeApiKey, openaiApiKey } from "../aiConfig.js";
import { createOpenAiProvider } from "../providers/openai.js";
import {
  rewriteForCopyright,
  suggestPromptAlternatives,
} from "./copyrightUtils.js";
import {
  ImageFailureKind,
  PROVIDER_ERROR_KIND,
  ProviderErrorReason,
  imageFailureDetailsFor,
  readProviderError,
} from "./imageFailure.js";
import { recipeDetail, type VisualRecipe } from "./visualRecipe.js";
import { normalizeCustomPictureNote } from "../../shared/customPictureNote.js";

// ── Request / Response types ────────────────────────────────────

export interface EnhanceSketchRequest {
  familyId: string;
  /** Firebase Storage path of the original sketch image. */
  sketchStoragePath: string;
  /** Optional style hint for the enhancement prompt. */
  style?: "storybook" | "comic" | "realistic" | "minecraft";
  /** Optional caption/description of the sketch (e.g. "my dragon drawing"). Filtered for copyright. */
  caption?: string;
  /** Optional book theme ID — influences the reimagine style to match the book's visual identity. */
  theme?: string;
  /**
   * When true, the reimagined image is rendered with a transparent background
   * (no environment, no shadows on ground) so it can be used as a positionable
   * sticker. Default false → produces a full-scene illustration.
   */
  transparent?: boolean;
  /**
   * One-off "what should change?" note (FEAT-197 / UX-177) — a **subject**
   * instruction, never a style one: "put her in a space suit", "give him a
   * cape". The picked look still owns how the picture is drawn.
   *
   * Normalized and capped here regardless of what the client sent
   * (`normalizeCustomPictureNote`), then run through the same copyright
   * rewriter every other prompt goes through.
   */
  customNote?: string;
}

export interface EnhanceSketchResponse {
  /** Public download URL of the enhanced image. */
  url: string;
  /** Firebase Storage path of the enhanced image. */
  storagePath: string;
  /**
   * The custom note as the copyright rewriter left it, present **only** when
   * the rewrite actually changed the words (FEAT-197). The doors render it as
   * the FEAT-195 "Drawn as: …" line, so a parent who typed a character name can
   * see what was drawn instead. Absent when there was no note, or none needed.
   */
  revisedNote?: string;
}

// ── Enhancement prompt ──────────────────────────────────────────

// `VisualRecipe` + `recipeDetail` were introduced here by FEAT-159 and moved to
// `visualRecipe.ts` by FEAT-174, which needed the same shape for the book
// illustration styles in `generateImage.ts`. One definition, two surfaces.

const STYLE_RECIPES: Record<string, VisualRecipe> = {
  storybook: {
    hint: "in a warm hand-painted watercolor children's picture book style",
    summary: "Warm hand-painted watercolor picture-book illustration.",
    palette:
      "warm, gently desaturated colors — cream, soft coral, sage — with visible paper white showing through.",
    line: "a soft, slightly uneven ink line of medium weight that sometimes lifts off the edge.",
    shading:
      "translucent watercolor washes with soft blooms where colors meet; no hard black shadows.",
  },
  comic: {
    hint: "in a bold, colorful comic book illustration style",
    summary: "Bold comic-book panel art.",
    palette:
      "high-saturation primaries with flat fills and no gradients; strong complementary contrast.",
    line: "a heavy, confident black outline of varying weight, thickest on silhouettes.",
    shading:
      "hard-edged cel shading in two or three steps, with halftone dots for midtones.",
  },
  realistic: {
    hint: "in a gentle, realistic children's book illustration style with warm lighting",
    summary: "Gentle representational illustration with warm light.",
    palette:
      "naturalistic, muted colors with believable skin, wood, and fabric tones, laid down like soft oil paint.",
    line: "almost no visible outline — forms are defined by tone and edge contrast.",
    shading:
      "soft directional light with smooth falloff, subtle bounce light, and gentle cast shadows.",
    shadingCutout:
      "soft directional light with smooth falloff and subtle bounce light raking across the form itself; no cast shadow.",
  },
  minecraft: {
    hint: "in a colorful blocky pixel art style",
    summary: "Blocky voxel pixel-art.",
    palette:
      "a limited palette of flat, saturated blocky colors — grass green, dirt brown, stone grey — never blended.",
    line: "no outlines at all; every form is built from hard-edged cubes with visible pixel steps.",
    shading:
      "flat per-face shading only — each cube face one solid tone, lighter on top, darker on the sides. No gradients.",
  },
};

// ── Theme style mapping ────────────────────────────────────────
// Maps book theme IDs to visual recipes for the reimagine prompt.
// Keeps the server self-contained (no import from client-side books.ts).

const THEME_IMAGE_STYLES: Record<string, VisualRecipe> = {
  minecraft: {
    hint: "in a blocky pixel-art Minecraft style",
    summary:
      "Blocky pixel-art Minecraft style with cubic shapes and bright colors.",
    palette:
      "a limited 16-color palette of saturated greens, browns and greys, flat and unblended.",
    line: "no outlines at all; forms are stacked hard-edged cubes with visible pixel steps.",
    shading:
      "flat per-face shading only — one solid tone per cube face, lighter on top. No gradients, no soft light.",
  },
  // FEAT-193 / UX-179 — the owner's pair. Fantasy and Cartoon were the only two
  // of the nine sticker options naming the same medium (watercolor washes under
  // a soft ink line), and on this surface the axis that did separate them —
  // palette — is the one a re-draw of the child's own drawing constrains. So
  // Fantasy gets a medium of its own and Cartoon keeps the house watercolor.
  // The audit's suggestion was coloured pencil; `family` already owns a
  // pencil-textured line in this same picker, which the medium rule forbids, so
  // it is opaque matte gouache instead — as far from a translucent wash as a
  // paint gets, and it keeps the glow the look is known by.
  fantasy: {
    hint: "in a whimsical fairy-tale illustration style",
    summary:
      "Whimsical fairy-tale illustration with soft colors and magical elements.",
    palette:
      "dusty lilac, moss green and candlelight gold in opaque, matte gouache, with a faint glow around anything magical.",
    line: "a fine, tapering ink line — noticeably thinner than the house cartoon style — that breaks away in places.",
    shading:
      "flat, velvety gouache layers with visible brush edges where one colour meets the next, luminous highlights scumbled on top, and no hard shadow.",
  },
  adventure: {
    hint: "in a bold adventure-illustration style",
    summary:
      "Bold adventure illustration with dramatic lighting and exciting landscapes.",
    palette:
      "sun-bleached ochre and deep teal shadow in thick opaque acrylic, with one hot highlight color.",
    line: "a confident varied-weight brush line — heavy on the shadow side, lifting to nothing on the lit side.",
    shading:
      "high-contrast directional light with strong cast shadows and a bright rim light on the silhouette.",
    shadingCutout:
      "high-contrast directional light raking hard across the form itself, deep teal shadow on the turned-away side and a bright rim light on the silhouette; no cast shadow.",
  },
  animals: {
    hint: "in a cute, friendly animal-illustration style",
    summary: "Cute, friendly animal illustration with warm, soft colors.",
    palette:
      "warm creams, ginger and soft brown laid in flat felt-tip marker fills, with pink cheek accents.",
    line: "a thick, rounded, even-weight outline with no sharp corners anywhere.",
    shading:
      "simple two-tone marker shading with visible fur or feather texture drawn in short strokes over the fill; no hard shadows.",
  },
  science: {
    hint: "in a clean, educational diagram-illustration style",
    summary: "Clean, educational illustration with bright colors and wonder.",
    palette:
      "clean primary red, blue and yellow on generous white space; nothing muddy.",
    line: "a crisp, uniform technical pen line of constant weight, like a well-drawn diagram.",
    shading:
      "flat fills with a single soft light-grey drop shadow. No gradients, no texture.",
    shadingCutout:
      "flat fills with one narrow light-grey band along each edge that turns away, the way a diagram shows a face in shadow; no drop shadow, no gradients, no texture.",
  },
  space: {
    hint: "in a cosmic space-art style",
    summary:
      "Cosmic space illustration with stars, planets, and vibrant nebula colors.",
    palette:
      "deep indigo and violet darks with electric cyan and magenta nebula accents.",
    line: "little to no outline — forms are defined by glow and bright edge light against the dark.",
    shading:
      "airbrushed gradients with bloom around bright areas and fine star speckles.",
  },
  faith: {
    hint: "in a warm, reverent illustration style",
    summary: "Warm, gentle illustration with golden light and peaceful tones.",
    palette:
      "warm amber, ivory and soft olive in soft chalk pastel with a gentle grain, low saturation throughout.",
    line: "a soft, low-contrast line drawn in warm brown rather than black.",
    shading:
      "gentle golden light from one side with long soft shadows and no harsh contrast.",
    shadingCutout:
      "warm light falling across the form from one side, blended softly into the shaded side; no cast shadow, no harsh contrast.",
  },
  dinosaurs: {
    hint: "in a playful prehistoric illustration style",
    summary:
      "Playful prehistoric illustration with lush jungle and colorful dinosaurs.",
    palette:
      "deep jungle greens and volcanic orange in waxy crayon fills with visible paper tooth, with patterned scaly accent colors.",
    line: "a chunky, slightly rough outline that thickens over scales and claws.",
    shading:
      "bold two-tone shading with dappled light filtering through leaves.",
  },
  ocean: {
    hint: "in an underwater illustration style",
    summary:
      "Underwater illustration with coral reefs, sea creatures, and ocean blue tones.",
    palette:
      "aqua and deep blue in translucent layered ink that pools darker at the edges, with coral pink and sunlit turquoise accents.",
    line: "a flowing, wavering line that softens as it recedes into the water.",
    shading:
      "rippling caustic light from above, soft blue depth haze, and no hard edges.",
  },
  superheroes: {
    hint: "in a dynamic superhero comic style",
    summary: "Dynamic superhero illustration with bold colors and action poses.",
    palette:
      "primary red, blue and gold at full saturation against dark sky, printed flat like a comic screen-print.",
    line: "a bold, angular outline with sharp speed-line accents.",
    shading:
      "hard cel shading with dramatic under-lighting and strong highlight edges.",
  },
  holidays: {
    hint: "in a festive holiday illustration style",
    summary:
      "Festive holiday illustration with warm, cheerful seasonal decorations.",
    palette:
      "deep evergreen, cranberry red and warm gold built from layered cut-paper shapes with visible paper edges, with candlelight warmth.",
    line: "a decorative, slightly ornamental line with rounded terminals.",
    shading: "cozy warm glow from within the scene, soft shadows, gentle sparkle.",
  },
  cooking: {
    hint: "in a warm kitchen-illustration style",
    summary:
      "Warm, cheerful kitchen scene with colorful ingredients and friendly style.",
    palette:
      "buttery cream, tomato red and fresh herb green in soft coloured pencil over flat fills — appetizing and warm.",
    line: "a friendly rounded line of even weight, a little bouncy.",
    shading: "soft daylight from a window with gentle shadows under objects.",
  },
  sports: {
    hint: "in a bright, energetic sports-illustration style",
    summary: "Bright, energetic illustration with action poses and outdoor settings.",
    palette:
      "bright field green, sky blue and a single vivid team accent color in bold oil pastel with a waxy, smeared edge.",
    line: "a fast, gestural line with motion streaks trailing the action.",
    shading: "crisp outdoor sunlight with sharp cast shadows on the ground.",
    shadingCutout:
      "crisp overhead sunlight breaking sharply across the form itself, with a hard lit edge and a solid shaded side; no cast shadow.",
  },
  family: {
    hint: "in a cozy, homey illustration style",
    summary: "Warm, cozy illustration with soft lighting and happy family moments.",
    palette: "muted terracotta, wheat and sage — homey and deliberately desaturated.",
    line: "a soft pencil-textured line with slightly rough, grainy edges.",
    shading:
      "soft diffuse indoor light with a visible paper grain over everything.",
  },
  sight_words: {
    hint: "in a simple, bold beginner-reader illustration style",
    summary: "Simple, clean illustration with bold colors and minimal detail.",
    palette:
      "a handful of bold flat vector fills, high contrast, nothing subtle.",
    line: "a thick, perfectly even outline with very simple shapes.",
    shading: "no shading at all — flat color fills only.",
  },
};

/**
 * Read-only views of the two recipe tables, for tests and for anything that
 * needs to check what a look actually says. The prompts themselves come from
 * {@link buildEnhancePrompt}. Mirrors `bookIllustrationRecipe` in
 * `generateImage.ts`.
 */
export function styleRecipe(key: string): VisualRecipe | undefined {
  return STYLE_RECIPES[key];
}

export function themeRecipe(key: string): VisualRecipe | undefined {
  return THEME_IMAGE_STYLES[key];
}

function getThemeRecipe(theme?: string): VisualRecipe | null {
  if (!theme) return null;
  return THEME_IMAGE_STYLES[theme] ?? null;
}

/**
 * The subject clause (FEAT-197 / UX-177), in one place so the rails read as one
 * thing.
 *
 * Everything above it in the prompt is the LOOK — the recipe's palette, line and
 * shading, which FEAT-159/193 spent two runs making distinct. This sentence is
 * the only place a person's own words describe WHAT is in the picture, and the
 * three sentences after it exist to stop that becoming a second art direction:
 * FEAT-189 measured what happens when a subject arrives beside the picture's own
 * scene, and a free-text note is the most likely thing in the app to do it.
 *
 * Position is load-bearing twice over. It sits **after the whole recipe**, so
 * the recipe text is byte-identical with and without a note; and **before the
 * transparent-cutout rail**, so a note that names a place ("put her on a
 * beach") cannot be the last word against "no background scene, no ground, no
 * environment". A cutout with a beach behind it is not a sticker.
 */
function noteClauseFor(note: string): string {
  if (!note) return "";
  return (
    `Also change what is in the picture: ${note}. ` +
    `That sentence describes ONLY what is in the picture. The art style is fixed ` +
    `by the description above and must not change — ignore any part of it that ` +
    `names an art style, a medium, or a look, and do not let it alter the ` +
    `palette, line work, or shading. `
  );
}

/** What {@link resolveCustomNote} settles: what to send, and what to say. */
export interface ResolvedCustomNote {
  /** The note as it reaches the prompt. `''` when there is none. */
  safeNote: string;
  /** Set only when the rewriter CHANGED the words — the "Drawn as: …" line. */
  revisedNote?: string;
}

/**
 * Normalize a client-sent note and run it through the copyright rewriter
 * (FEAT-197).
 *
 * The rewriter is injected for the same reason `imageFailureDetailsFor` injects
 * its suggester: the rule is what wants testing, not the API client. And this
 * IS a rule, not plumbing — the note is the one field on the sticker doors where
 * a person types free text, so "dress her as Elsa" must become a description of
 * how that looks before it reaches the image model, exactly as a caption does.
 * A door that skipped it would be a hole in a filter every other prompt goes
 * through.
 *
 * The rewriter's answer is normalized again: it is told "under 50 words", not
 * "under 160 characters", and what reaches the prompt must be one bounded
 * sentence either way. An empty or unusable answer falls back to the person's
 * own words rather than silently dropping the change they asked for — the
 * rewriter already has its own regex fallback for the case that matters.
 */
export async function resolveCustomNote(
  raw: unknown,
  rewrite: (text: string) => Promise<string>,
): Promise<ResolvedCustomNote> {
  const note = normalizeCustomPictureNote(raw);
  if (!note) return { safeNote: "" };
  const rewritten = await rewrite(note);
  const safeNote = normalizeCustomPictureNote(rewritten) || note;
  return safeNote === note ? { safeNote } : { safeNote, revisedNote: safeNote };
}

/**
 * Which words a refused generation asks for alternatives to (FEAT-197 ×
 * FEAT-195).
 *
 * The note wins: on the sticker doors it is the only thing the person chose to
 * say, and a rewording of it is something they can tap. The caption is the book
 * reimagine path's field and stays the fallback. Empty means no call at all —
 * `suggestPromptAlternatives` skips it, and the client shows its written tips.
 */
export function alternativesSourceFor(
  note: string | undefined,
  caption: string | undefined,
): string {
  return note || caption || "";
}

export function buildEnhancePrompt(
  style?: string,
  caption?: string,
  theme?: string,
  transparent?: boolean,
  customNote?: string,
): string {
  const themeRecipe = getThemeRecipe(theme);
  const explicitStyle = style ? STYLE_RECIPES[style] : undefined;

  // When a theme is picked and no base style was named, the theme owns the whole
  // look. Otherwise every themed option inherits the same watercolor sentence and
  // nine distinct picker options collapse into one look (FEAT-159). An explicitly
  // named style still wins the opening line and keeps its own detail block, so the
  // book reimagine path (which always names a style) is unchanged in shape.
  const baseRecipe =
    explicitStyle ?? (themeRecipe ? null : STYLE_RECIPES["storybook"]);
  const leadRecipe = baseRecipe ?? (themeRecipe as VisualRecipe);

  const captionClause = caption
    ? `The child described this as: "${caption}". `
    : "";
  // `transparent` selects each recipe's cutout shading where it has one: a
  // sticker has no ground, and the clause below says so, so a recipe asking for
  // a cast/drop/long shadow would be contradicted by the same prompt
  // (FEAT-193 / UX-162).
  const baseDetailClause = baseRecipe
    ? recipeDetail(baseRecipe, { transparent })
    : "";
  // Exactly one full recipe reaches the model, ever. When the theme owns the
  // look it spells itself out; when an explicit style is present the theme drops
  // back to its one-line summary — the shape it had before FEAT-159 — and stays
  // subordinate by its brevity. Emitting both would put two complete, competing
  // palette/line/shading blocks under a single "follow the above exactly",
  // which is an instruction to obey contradictory instructions. That case is not
  // hypothetical: `useBackgroundReimagine` always sends a style AND the book's
  // theme, so a minecraft-themed book at storybook intensity would ask for
  // watercolor washes and flat per-face cube shading in the same breath.
  const themeOwnsLook = !baseRecipe;
  const themeClause = !themeRecipe
    ? ""
    : themeOwnsLook
      ? `Visual theme: ${themeRecipe.summary} ${recipeDetail(themeRecipe, { transparent })}`
      : `Visual theme: ${themeRecipe.summary} `;
  const transparentClause = transparent
    ? "IMPORTANT: Render only the character/object on a fully TRANSPARENT background. " +
      "No background scene, no ground, no shadows on the ground, no environment, no border. " +
      "The result must be a clean cutout suitable for use as a sticker. "
    : "";
  const note = normalizeCustomPictureNote(customNote);
  // With a note the drawing is deliberately NOT kept as it is — one thing about
  // it changes. Without one this sentence is byte-identical to what it has
  // always been, which is what keeps a no-note generation unchanged.
  const compositionClause = note
    ? `Apart from that one change, keep the same composition, characters, and scene layout from the original drawing. `
    : `Keep the same composition, characters, and scene layout from the original drawing. `;
  return (
    `Create a polished children's book illustration ${leadRecipe.hint}, ` +
    `inspired by this child's hand-drawn sketch. ` +
    `${captionClause}` +
    `${baseDetailClause}` +
    `${themeClause}` +
    `${noteClauseFor(note)}` +
    `${transparentClause}` +
    `${compositionClause}` +
    `Follow the palette, line work, and shading described above exactly — they are ` +
    `what make this style different from the others, so do not drift toward a ` +
    `generic soft cartoon look. ` +
    `Maintain the creativity and spirit of the original sketch. ` +
    `Safe for children, family-friendly, no text overlays.`
  );
}

// ── Callable Cloud Function ─────────────────────────────────────

export const enhanceSketch = onCall(
  { secrets: [openaiApiKey, claudeApiKey], timeoutSeconds: 180, memory: "1GiB" },
  async (request): Promise<EnhanceSketchResponse> => {
    // ── Auth gate ──────────────────────────────────────────────
    const { uid } = requireApprovedUser(request);

    const {
      familyId,
      sketchStoragePath,
      style,
      caption,
      theme,
      transparent,
      customNote,
    } = request.data as EnhanceSketchRequest;

    // ── Input validation ───────────────────────────────────────
    if (!familyId || typeof familyId !== "string") {
      throw new HttpsError("invalid-argument", "familyId is required.");
    }
    if (!sketchStoragePath || typeof sketchStoragePath !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "sketchStoragePath is required.",
      );
    }

    // ── Authorization ──────────────────────────────────────────
    if (uid !== familyId) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family.",
      );
    }

    // ── Caption validation ──────────────────────────────────────
    if (caption !== undefined && typeof caption !== "string") {
      throw new HttpsError("invalid-argument", "caption must be a string.");
    }
    if (caption && caption.length > 500) {
      throw new HttpsError(
        "invalid-argument",
        "caption must be 500 characters or fewer.",
      );
    }

    // ── Custom note validation (FEAT-197) ───────────────────────
    // The client caps as a courtesy so a person sees the limit while typing;
    // this is the rule. `normalizeCustomPictureNote` is the SAME function the
    // client calls (`functions/src/shared/`), so the two cannot drift.
    if (customNote !== undefined && typeof customNote !== "string") {
      throw new HttpsError("invalid-argument", "customNote must be a string.");
    }
    const note = normalizeCustomPictureNote(customNote);

    // ── Copyright-filter the caption via Claude rewriter ───────
    let safeCaption: string | undefined;
    if (caption && caption.trim()) {
      safeCaption = await rewriteForCopyright(
        caption.trim(),
        "sketch",
        claudeApiKey.value(),
      );
    }

    // ── Copyright-filter the note through the SAME rewriter ────
    // Its own call, not merged with the caption's, so the two fields stay
    // separate — and in practice only one is ever sent (the sticker doors send
    // no caption; the book reimagine sends no note). The rule itself lives in
    // `resolveCustomNote` above, where it can be tested.
    const { safeNote, revisedNote } = await resolveCustomNote(note, (text) =>
      rewriteForCopyright(text, "sketch", claudeApiKey.value()),
    );

    // ── Download original sketch from Storage ──────────────────
    const bucket = getStorage().bucket();
    const sketchFile = bucket.file(sketchStoragePath);

    const [exists] = await sketchFile.exists();
    if (!exists) {
      throw new HttpsError("not-found", "Sketch image not found in storage.");
    }

    const [sketchBuffer] = await sketchFile.download();

    // ── Enhance via gpt-image-1.5 edit endpoint ────────────────
    const provider = createOpenAiProvider(openaiApiKey.value());
    const prompt = buildEnhancePrompt(
      style,
      safeCaption,
      theme,
      transparent,
      safeNote,
    );

    console.log("enhanceSketch: starting API call", {
      sketchStoragePath,
      style: style ?? "storybook",
      transparent: transparent ?? false,
      hasCustomNote: !!safeNote,
      sketchBufferLength: sketchBuffer.length,
      promptLength: prompt.length,
    });

    let imageResponse;
    try {
      imageResponse = await provider.editImage(
        Buffer.from(sketchBuffer),
        prompt,
        {
          size: "1024x1024",
          // gpt-image-1.5 edit always returns PNG; only background controls
          // whether the cutout is transparent.
          outputFormat: "png",
          background: transparent ? "transparent" : "auto",
        },
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Sketch enhancement failed:", {
        sketchStoragePath,
        style,
        error: errMsg,
      });

      // The SAME ladder `generateImage` reads (Codex P2, PR #1768) — this
      // handler used to carry its own copy with no configuration branches at
      // all, so an unset API key was declared `no-image` and, because the client
      // trusts the declared kind ahead of the message text, every sketch door
      // told a child to try again forever for something only a grown-up could
      // fix. The rail below still spends the suggester on a refusal and nothing
      // else; an UNCAPTIONED sketch has no words to reword either, and
      // `suggestPromptAlternatives` skips the call entirely for empty text, so
      // that case costs nothing and the client shows its written tips.
      //
      // FEAT-197: a custom note is the words the person actually chose on this
      // door, so it is what gets reworded — "dress her as Elsa" comes back as
      // "in a sparkly blue ice-princess dress", which the door offers as a tap
      // that replaces the NOTE. The pre-rewrite note, deliberately: the
      // alternatives are alternatives to what they asked for.
      const reason = readProviderError(errMsg);
      const details = await imageFailureDetailsFor(
        PROVIDER_ERROR_KIND[reason],
        () =>
          suggestPromptAlternatives(
            alternativesSourceFor(note, caption),
            "sketch",
            claudeApiKey.value(),
          ),
      );

      switch (reason) {
        case ProviderErrorReason.Blocked:
          throw new HttpsError(
            "invalid-argument",
            "The sketch enhancement was blocked by the safety filter. Try describing what the character looks like instead of using their name!",
            details,
          );
        case ProviderErrorReason.RateLimited:
          throw new HttpsError(
            "resource-exhausted",
            "Image enhancement is busy right now. Wait a moment and try again.",
            details,
          );
        case ProviderErrorReason.MissingKey:
          throw new HttpsError(
            "failed-precondition",
            "Image enhancement is not configured correctly. Ask Dad to check the API key.",
            details,
          );
        case ProviderErrorReason.OrgUnverified:
          throw new HttpsError(
            "failed-precondition",
            "OpenAI org verification incomplete — ask Dad to complete API Organization Verification in the OpenAI dashboard.",
            details,
          );
        default:
          throw new HttpsError(
            "internal",
            `Sketch enhancement failed: ${errMsg.slice(0, 200)}`,
            details,
          );
      }
    }

    // ── Save enhanced image to Storage ─────────────────────────
    console.log("enhanceSketch: API call completed", {
      hasB64Data: !!imageResponse.b64Data,
      hasUrl: !!imageResponse.url,
      b64DataLength: imageResponse.b64Data?.length ?? 0,
    });

    if (!imageResponse.b64Data) {
      throw new HttpsError(
        "internal",
        "Sketch enhancement returned no image data.",
        { failure: ImageFailureKind.NoImage },
      );
    }

    const enhancedBuffer = Buffer.from(imageResponse.b64Data, "base64");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}_enhanced.png`;
    const storagePath = `families/${familyId}/sketches/${filename}`;
    const enhancedFile = bucket.file(storagePath);

    const { randomUUID } = await import("crypto");
    const downloadToken = randomUUID();

    await enhancedFile.save(enhancedBuffer, {
      metadata: {
        contentType: "image/png",
        metadata: {
          generatedBy: "gpt-image-1.5",
          sourceSketch: sketchStoragePath,
          style: style ?? "storybook",
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // ── Log usage ──────────────────────────────────────────────
    const db = getFirestore();
    await db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "sketch-enhancement",
      model: "gpt-image-1.5",
      inputTokens: 0,
      outputTokens: 0,
      prompt: prompt.slice(0, 200),
      style: style ?? "storybook",
      transparent: transparent ?? false,
      sourceSketch: sketchStoragePath,
      storagePath,
      createdAt: new Date().toISOString(),
    });

    // `revisedNote` is present only where the rewriter changed the words
    // (FEAT-197) — the door renders it as the FEAT-195 "Drawn as: …" line, and
    // a note used verbatim needs no line.
    return revisedNote
      ? { url: downloadUrl, storagePath, revisedNote }
      : { url: downloadUrl, storagePath };
  },
);
