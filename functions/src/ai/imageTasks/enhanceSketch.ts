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
  imageFailureDetails,
  imageFailureDetailsFor,
  readProviderError,
} from "./imageFailure.js";
import { recipeDetail, type VisualRecipe } from "./visualRecipe.js";
import { normalizeCustomPictureNote } from "../../shared/customPictureNote.js";
import {
  acceptEditInstruction,
  rewrittenInstructionSurvives,
  savedStickerLook,
  type SavedStickerEdit,
  type SavedStickerLook,
} from "../../shared/savedStickerEdit.js";

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
  /**
   * Edit a picture that is already SAVED, rather than redraw a sketch
   * (SAVED-STICKER-EDIT-CONTRACT-002).
   *
   * Absent — the overwhelmingly common case — and every byte of this handler's
   * behaviour is what it was: same prompt, same recipes, same usage row. Present
   * and it is a different request: the look is derived from the stored sticker
   * rather than sent, `transparent` is implied, and the legacy free-text fields
   * have no meaning beside it, so sending one is refused rather than ignored.
   * Malformed is refused too — never silently treated as a legacy redraw, which
   * would hand back a brand-new picture when an edit was asked for.
   */
  savedStickerEdit?: SavedStickerEdit;
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

// ── Source-image family boundary (FIX-258) ──────────────────────

/** Control characters, by code point, so this file needs no regex lint exemption. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * A dot segment, with any `%` stripped first so a half-written escape cannot
 * hide one: `%2e%2e%` decodes to `..%`, which is `..` wearing a hat.
 */
function isDotSegment(value: string): boolean {
  const bare = value.split("%").join("");
  return bare === "." || bare === "..";
}

function isHexPair(value: string): boolean {
  return /^[0-9a-fA-F]{2}$/.test(value);
}

/**
 * One `%XX` decoding pass. Byte-wise and total: it never throws, and a
 * malformed escape (`100%.png`, `%zz`) is copied through exactly as written,
 * which is what keeps an ordinary percent in a child's filename ordinary.
 */
function decodePercentOnce(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "%" && i + 3 <= value.length && isHexPair(value.slice(i + 1, i + 3))) {
      out += String.fromCharCode(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    out += value[i];
  }
  return out;
}

/**
 * How many decoding passes a name may need before it settles. Eight is far
 * past any real filename and bounds the work on a hostile one; a segment still
 * changing after that is refused rather than chased.
 */
const MAX_DECODE_ROUNDS = 8;

/** A segment as written: present, not a dot segment, no backslash, no control character. */
function isPlainNameSegment(value: string): boolean {
  if (!value) return false;
  if (isDotSegment(value)) return false;
  if (value.includes("\\")) return false;
  if (hasControlCharacter(value)) return false;
  return true;
}

/**
 * Is one segment a name rather than path structure, encoded or not?
 *
 * The segment is checked as written, and then **on a validation-only copy**
 * decoded repeatedly — `%252e` hides one more layer than `%2e` — with every
 * stage checked for a dot segment, a slash, a backslash or a control
 * character. The path handed to Storage is never decoded or normalized; only
 * this copy is.
 *
 * The compatibility boundary is deliberate: **ambiguous encoded structure is
 * refused, an ordinary percent is preserved.** `100%.png`, `50%off.png`,
 * `my%20drawing.png` and `v%2e1.png` are names and pass; `%2e%2e`, `%252e%252e`,
 * `a%2fb.png` and `%2e%2e%` could each be read as structure by something that
 * decodes once more, so they do not.
 */
function isAcceptableSegment(segment: string): boolean {
  if (!isPlainNameSegment(segment)) return false;
  let current = segment;
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    const next = decodePercentOnce(current);
    if (next === current) return true;
    if (next.includes("/") || !isPlainNameSegment(next)) return false;
    current = next;
  }
  return false;
}

/**
 * `"malformed"` and `"outside-family"` are separated only so the callable can
 * answer `invalid-argument` for a shape and `permission-denied` for a boundary.
 */
export type SketchSourceVerdict = "ok" | "outside-family" | "malformed";

/**
 * Is `sourcePath` an object inside THIS family's Storage subtree (FIX-258)?
 *
 * `enhanceSketch` reads its source with the **admin SDK**, which no storage rule
 * applies to, and the path is a client-supplied string. The identity gate in the
 * callable only establishes that the caller owns `familyId`; without this check
 * an approved parent could name `families/<someone else>/sketches/x.png` and get
 * a redraw of another family's child's drawing back under a URL of their own. So
 * the boundary is restated here, in the one place that does the privileged read.
 *
 * The boundary is the **family subtree and nothing else**: any nested object
 * under `families/<familyId>/` is allowed, because which folder holds a picture
 * is not this gate's business — `sketches/`, `stickers/`, `generated-images/`,
 * `books/{bookId}/` and anything a later feature adds all pass. What it refuses
 * is a path that leaves the subtree.
 *
 * The family match is an **exact segment**, not a string prefix:
 * `families/fam-1-evil/…` and `families/fam-10/…` both begin with
 * `families/fam-1` and are both somebody else's.
 *
 * Pure and exported so the rule can be read on its own; the callable below is
 * what the tests actually drive.
 */
export function checkSketchSourcePath(
  familyId: string,
  sourcePath: string,
): SketchSourceVerdict {
  if (!isAcceptableSegment(familyId) || familyId.includes("/")) return "malformed";
  if (!sourcePath) return "malformed";

  const segments = sourcePath.split("/");
  // Shape first: traversal or a URL is malformed whichever family it names, and
  // calling it "another family's" would read meaning into a string without any.
  if (!segments.every(isAcceptableSegment)) return "malformed";
  // `families/<familyId>/` plus at least one object segment.
  if (segments.length < 3) return "malformed";
  if (segments[0] !== "families" || segments[1] !== familyId) return "outside-family";
  return "ok";
}

/**
 * The cutout rail, in one place because the saved-picture edit prompt needs the
 * same sentences. Extracted, not rewritten: `buildEnhancePrompt`'s output is
 * pinned byte-for-byte against the previous committed implementation in
 * `enhanceSketch.savedStickerEdit.test.ts`.
 */
const TRANSPARENT_CLAUSE =
  "IMPORTANT: Render only the character/object on a fully TRANSPARENT background. " +
  "No background scene, no ground, no shadows on the ground, no environment, no border. " +
  "The result must be a clean cutout suitable for use as a sticker. ";

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
  const transparentClause = transparent ? TRANSPARENT_CLAUSE : "";
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

// ── Editing a saved picture (SAVED-STICKER-EDIT-CONTRACT-002) ───

/**
 * Is this value usable as ONE Firestore document id?
 *
 * Reuses the FIX-258 segment rule above rather than inventing a second one: a
 * document id is concatenated into `families/<familyId>/stickerLibrary/<id>`, so
 * a slash, a dot segment, a backslash, a control character or an encoded form of
 * any of them would address a different document — or a different collection.
 * Checked before the reference is built, not after the read.
 */
export function isSafeDocumentId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.includes("/")) return false;
  return isAcceptableSegment(value);
}

/** What the usage row records instead of the prompt, in saved-edit mode. */
export const SAVED_STICKER_EDIT_USAGE_PROMPT = "saved-picture edit (instruction not stored)";

/** The correction a refused instruction gets: something to do, and no false claim. */
const EDIT_INSTRUCTION_REFUSAL =
  "That change needs different wording. Describe it in one short sentence — what to " +
  "add or take away, in plain words, without naming a character — and try again.";

/**
 * What a saved-picture edit says when something OTHER than the wording failed.
 *
 * Static, and the only thing this mode ever says about a downstream failure.
 * Every error body on this path is a hazard the legacy path does not have: a
 * provider, a rewriter and a Firestore read all quote what they were given, and
 * on this mode that is a child's own sentence about their own picture. The
 * legacy redraw's prompt is assembled from fixed recipes, so it keeps passing
 * the provider's message through — the words are the difference, not the care.
 *
 * It does not say the wording was wrong (it was not) and promises nothing about
 * billing, which this path cannot know.
 */
const EDIT_UNAVAILABLE =
  "That edit could not be made just now. Nothing about your picture was changed — wait a moment and try again.";

/**
 * The prompt for editing a picture that already exists.
 *
 * Three things make it a different prompt rather than `buildEnhancePrompt` with
 * another clause, which is why the legacy builder is untouched:
 *
 * - **The source is a finished illustration, not a sketch.** Every sentence of
 *   the legacy prompt is written around "inspired by this child's hand-drawn
 *   sketch", which on a saved sticker would ask the model to redraw a drawing it
 *   is not looking at.
 * - **Removal has to be allowed.** The legacy prompt ends on "keep the same
 *   composition, characters, and scene layout" — a sentence that contradicts
 *   "take the hat off", and the model is left to pick which instruction wins. So
 *   the preserve-everything-else sentence here scopes itself to what the
 *   instruction does not name.
 * - **The look is already in the pixels.** It is restated so the edit cannot
 *   drift the style, not to choose one.
 *
 * Returns `null` for a look that resolves to no recipe, so there is no silent
 * fallback to the house watercolor. Unreachable through the callable, which
 * refuses an unknown look before this is called.
 */
export function buildSavedStickerEditPrompt(
  look: SavedStickerLook,
  instruction: string,
): string | null {
  const baseRecipe = look.style ? STYLE_RECIPES[look.style] : undefined;
  const themed = getThemeRecipe(look.theme);
  const lead = baseRecipe ?? themed;
  if (!lead || !instruction) return null;
  // The one look that is both a style and a theme (minecraft) keeps the legacy
  // shape: one full recipe, the theme subordinate by its brevity (FEAT-159).
  const themeClause = baseRecipe && themed ? `Visual theme: ${themed.summary} ` : "";
  return (
    `Edit this existing picture. It is already a finished illustration ` +
    `${lead.hint} — it is NOT a hand-drawn sketch, so do not redraw it as one and ` +
    `do not start a new picture. ` +
    `Make exactly this one change to it: ${instruction}. ` +
    `If that change asks for something to be taken away, take it away completely and ` +
    `fill the space it leaves with whatever naturally surrounds it — no hole, no ` +
    `outline, no faded copy of it left behind. If it asks for something to be added, ` +
    `add only that. ` +
    `Everything the change does not mention stays as it already is — the same subject, ` +
    `the same pose, the same expression, the same colors. ` +
    `${recipeDetail(lead, { transparent: true })}` +
    `${themeClause}` +
    `That is the look this picture is already drawn in: match it, and ignore any part ` +
    `of the change that names an art style, a medium, or a look. ` +
    `${TRANSPARENT_CLAUSE}` +
    `This is a redraw, so it will not be pixel-for-pixel identical; what matters is ` +
    `that the one requested change is made and nothing else about the picture is. ` +
    `Safe for children, family-friendly, no text overlays.`
  );
}

/** The legacy fields that have no meaning beside a saved-picture edit (contract 1). */
const EDIT_CONFLICT_FIELDS = [
  "style",
  "caption",
  "theme",
  "transparent",
  "customNote",
] as const;

/**
 * The request's edit field, shape-checked. Anything else — `null`, a string, an
 * array, a missing or non-string member — is refused rather than read past.
 */
function requireSavedStickerEdit(raw: unknown): SavedStickerEdit {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", "savedStickerEdit must be an object.");
  }
  const edit = raw as Record<string, unknown>;
  if (
    typeof edit.sourceStickerId !== "string" ||
    typeof edit.sourceLookId !== "string" ||
    typeof edit.instruction !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "savedStickerEdit needs sourceStickerId, sourceLookId and instruction.",
    );
  }
  if (!isSafeDocumentId(edit.sourceStickerId)) {
    throw new HttpsError("invalid-argument", "sourceStickerId is not a valid sticker id.");
  }
  return {
    sourceStickerId: edit.sourceStickerId,
    sourceLookId: edit.sourceLookId,
    instruction: edit.instruction,
  };
}

/**
 * Does the stored sticker agree, in every particular, with the request?
 *
 * Reads the ONE document named and nothing else — no group query, no
 * representative, no original to fall back to. The row has to BE the object the
 * caller said it was: its own `storagePath` is the source being edited, and its
 * own `theme` is the look being preserved. A row that disagrees is refused
 * rather than reconciled, because every way of reconciling it ends in editing a
 * different picture or editing it in a look it was not made in.
 *
 * Point-in-time, and claims nothing more: the sticker could be deleted a
 * millisecond later. What this rules out is editing something that was never the
 * caller's to edit.
 */
async function requireSavedSource(
  familyId: string,
  sketchStoragePath: string,
  edit: SavedStickerEdit,
): Promise<void> {
  let row: unknown;
  try {
    const snapshot = await getFirestore()
      .doc(`families/${familyId}/stickerLibrary/${edit.sourceStickerId}`)
      .get();
    row = snapshot.exists ? (snapshot.data() as unknown) : undefined;
  } catch {
    // A failed read is not an affirmative empty one, so it cannot fall through
    // to "not found" — and its error names the document it failed on. Caught
    // without a binding: there is nothing safe to do with it, and the one unsafe
    // thing, logging it, is what this exists to prevent.
    throw new HttpsError("unavailable", EDIT_UNAVAILABLE);
  }
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new HttpsError("not-found", "That saved picture was not found.");
  }
  const sticker = row as Record<string, unknown>;
  // The cleaned original is the child's own drawing and anchors its group; it is
  // not an AI version of a known look, so there is nothing to preserve a look of.
  if (sticker.isOriginal === true) {
    throw new HttpsError(
      "failed-precondition",
      "The original drawing cannot be edited this way.",
    );
  }
  if (sticker.storagePath !== sketchStoragePath) {
    throw new HttpsError(
      "failed-precondition",
      "That saved picture does not match the image being edited.",
    );
  }
  if (sticker.theme !== edit.sourceLookId) {
    throw new HttpsError(
      "failed-precondition",
      "That saved picture was not made in the look being edited.",
    );
  }
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
      savedStickerEdit,
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

    // ── Source-image family boundary (FIX-258) ─────────────────
    // After the identity gate above (which is what makes `familyId` mean
    // "this caller's family"), and before anything is spent or read: the
    // copyright rewriter is a paid Claude call, and `getStorage()`/`exists()`/
    // `download()` below run as the admin SDK, which no storage rule constrains.
    const sourceVerdict = checkSketchSourcePath(familyId, sketchStoragePath);
    if (sourceVerdict !== "ok") {
      throw sourceVerdict === "outside-family"
        ? new HttpsError(
            "permission-denied",
            "The source image must be in this family's storage.",
          )
        : new HttpsError(
            "invalid-argument",
            "sketchStoragePath is not a valid source image path.",
          );
    }

    // ── Saved-picture edit mode (SAVED-STICKER-EDIT-CONTRACT-002) ─
    // After the identity and source-path gates, which are unchanged and still
    // own the family boundary — this mode narrows what may be edited, it does
    // not widen what may be read. Every refusal below lands before the copyright
    // rewriter (a paid Claude call), before Storage and before any image call.
    let editLook: SavedStickerLook | null = null;
    let editPrompt: string | null = null;
    if (savedStickerEdit !== undefined) {
      const edit = requireSavedStickerEdit(savedStickerEdit);
      const conflict = EDIT_CONFLICT_FIELDS.find(
        (field) => (request.data as Record<string, unknown>)[field] !== undefined,
      );
      if (conflict) {
        throw new HttpsError(
          "invalid-argument",
          `${conflict} cannot be sent with savedStickerEdit — the look comes from the saved picture.`,
        );
      }
      editLook = savedStickerLook(edit.sourceLookId);
      if (!editLook) {
        throw new HttpsError("invalid-argument", "sourceLookId is not a known look.");
      }
      const accepted = acceptEditInstruction(edit.instruction);
      if (!accepted) {
        throw new HttpsError("invalid-argument", EDIT_INSTRUCTION_REFUSAL);
      }
      await requireSavedSource(familyId, sketchStoragePath, edit);
      // The same rewriter every other prompt goes through, on the same terms —
      // what differs is that its answer must still say what the person said. A
      // changed or empty answer is a refusal with something to do about it, not
      // a fallback to the unfiltered words and not a generic image failure.
      //
      // Two things are asked of it that no other caller asks. `staticDiagnostics`
      // because the helper's own failure log would otherwise carry the caught
      // SDK error, which quotes the prompt it was sent — handler-side redaction
      // cannot reach a line already written. And the `catch`, because the helper
      // is documented never to throw rather than built not to, and the whole
      // point here is that this mode does not pass an error body on.
      let rewritten: string;
      try {
        rewritten = await rewriteForCopyright(
          accepted,
          "sketch",
          claudeApiKey.value(),
          { staticDiagnostics: true },
        );
      } catch {
        throw new HttpsError("unavailable", EDIT_UNAVAILABLE);
      }
      if (!rewrittenInstructionSurvives(accepted, rewritten)) {
        throw new HttpsError("failed-precondition", EDIT_INSTRUCTION_REFUSAL);
      }
      // Built here rather than beside the legacy prompt below, so a look that
      // somehow resolves to no recipe costs no Storage read either.
      editPrompt = buildSavedStickerEditPrompt(editLook, accepted);
      if (!editPrompt) {
        throw new HttpsError("invalid-argument", "sourceLookId is not a known look.");
      }
    }

    // What the look resolves to. In legacy mode these ARE the request's own
    // fields, so everything downstream is byte-identical to what it was.
    const effectiveStyle = editLook ? editLook.style : style;
    const effectiveTransparent = editLook ? true : transparent;

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
    const prompt =
      editPrompt ??
      buildEnhancePrompt(style, safeCaption, theme, transparent, safeNote);

    // No instruction, no sticker id: the saved-edit mode logs that it ran and
    // nothing about what was asked for.
    console.log("enhanceSketch: starting API call", {
      sketchStoragePath,
      style: effectiveStyle ?? "storybook",
      transparent: effectiveTransparent ?? false,
      savedEdit: !!editLook,
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
          background: effectiveTransparent ? "transparent" : "auto",
        },
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const reason = readProviderError(errMsg);
      console.error("Sketch enhancement failed:", {
        sketchStoragePath,
        style,
        // The edit path logs the READING of the error — one of five fixed words
        // — and never the error. A provider quotes the prompt it refused, and on
        // this mode the prompt contains the person's own instruction.
        ...(editLook ? { savedEdit: true, reason } : { error: errMsg }),
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
      //
      // A saved-picture edit buys no suggestions. There is nothing to reword —
      // the legacy fields it would have reworded are refused on this mode, so
      // the suggester would be handed the empty string anyway — and an edit
      // instruction is not a subject to offer three variations of. Declaring the
      // kind and stopping also keeps the words out of one more call.
      const details = editLook
        ? imageFailureDetails(PROVIDER_ERROR_KIND[reason])
        : await imageFailureDetailsFor(PROVIDER_ERROR_KIND[reason], () =>
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
          // The one branch whose message was the provider's own text. Legacy
          // keeps it — a book reimagine's prompt holds no private words and the
          // text is the only clue to an unclassified failure. The edit mode gets
          // the static sentence instead.
          throw new HttpsError(
            "internal",
            editLook
              ? EDIT_UNAVAILABLE
              : `Sketch enhancement failed: ${errMsg.slice(0, 200)}`,
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
          style: effectiveStyle ?? "storybook",
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
      // A saved-picture edit's prompt CONTAINS the person's instruction, so the
      // usage row gets a static descriptor instead of a slice of it. Accounting
      // is otherwise unchanged: same collection, same fields, same numbers.
      prompt: editLook ? SAVED_STICKER_EDIT_USAGE_PROMPT : prompt.slice(0, 200),
      style: effectiveStyle ?? "storybook",
      transparent: effectiveTransparent ?? false,
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
