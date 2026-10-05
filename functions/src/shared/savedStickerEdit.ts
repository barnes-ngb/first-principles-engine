/**
 * Editing a picture that is already saved (SAVED-STICKER-EDIT-CONTRACT-002).
 *
 * The existing sticker doors make a NEW picture from a drawing: pick a look, and
 * `enhanceSketch` redraws. This is the other verb — "take the hat off the one I
 * already have" — and it is a different request, not a longer note. Three things
 * live here because both sides need the same answer:
 *
 * 1. **The request shape.** Mirrored by `src/core/ai/useAI.ts` by importing it,
 *    so client and server cannot drift (ARCH-47, this directory's whole point).
 * 2. **Which look a saved version is in.** `Sticker.theme` holds a *picker* id
 *    (`FANCY_STYLE_OPTIONS`), not the server's `style`/`theme` pair, so the pair
 *    has to be derived — and derived strictly: an unknown id is refused, never
 *    defaulted to watercolor, because redrawing a saved picture in a look it was
 *    not made in silently replaces it with a different picture.
 * 3. **When an instruction is safe to use verbatim.** The one rule below.
 *
 * Pure: no I/O, no Firestore, nothing environment-specific.
 */

import { normalizeCustomPictureNote } from "./customPictureNote.js";

/** One edit of one saved picture. */
export interface SavedStickerEdit {
  /**
   * The saved version's document id in `families/<familyId>/stickerLibrary`.
   * One segment — it is concatenated into a document path, so the server checks
   * it the same way it checks a Storage path segment.
   */
  sourceStickerId: string;
  /**
   * The look the saved version was made in — a picker id, which is what
   * `Sticker.theme` stores (`cartoon`, `fantasy`, `minecraft`, …). Sent so the
   * server can refuse a request whose idea of the picture disagrees with the
   * stored row rather than quietly redraw it in another look.
   */
  sourceLookId: string;
  /** What to change about it, in the person's own words. */
  instruction: string;
}

/** The server-side `style`/`theme` pair a picker look resolves to. */
export interface SavedStickerLook {
  style?: "storybook" | "comic" | "realistic" | "minecraft";
  theme?: string;
}

/**
 * Picker look id → the pair `enhanceSketch` was called with when the saved
 * version was made.
 *
 * Taken from `FANCY_STYLE_OPTIONS` / `resolveFancyEnhanceParams` in
 * `src/features/books/drawingStickerStyles.ts`, which `functions/` cannot import
 * (the dependency arrow runs app → functions). So it is pinned instead, by
 * `src/features/books/savedStickerEditContract.test.ts`, which compiles both
 * sides and fails if the picker gains, loses or re-points a look.
 */
export const SAVED_STICKER_LOOKS: Record<string, SavedStickerLook> = {
  // The two looks that are a style and no theme.
  cartoon: { style: "storybook" },
  comic: { style: "comic" },
  // Theme-only looks: the theme owns the whole look.
  fantasy: { theme: "fantasy" },
  animals: { theme: "animals" },
  adventure: { theme: "adventure" },
  space: { theme: "space" },
  science: { theme: "science" },
  faith: { theme: "faith" },
  family: { theme: "family" },
  // The one look that is both.
  minecraft: { style: "minecraft", theme: "minecraft" },
};

/**
 * The look a saved version is in, or `null` for anything this table does not
 * name. `hasOwnProperty` so an inherited key (`constructor`, `toString`) is not
 * a look.
 */
export function savedStickerLook(lookId: unknown): SavedStickerLook | null {
  if (typeof lookId !== "string" || !lookId) return null;
  return Object.prototype.hasOwnProperty.call(SAVED_STICKER_LOOKS, lookId)
    ? SAVED_STICKER_LOOKS[lookId]
    : null;
}

/**
 * The only changes an instruction may undergo on its way to the model:
 * whitespace collapsed and trimmed, and a terminal `.`/`!`/`?` dropped because
 * the prompt supplies its own.
 *
 * Deliberately narrow. Everything else about an edit instruction is load-bearing
 * in a way a caption is not: "remove the hat but keep the dog" and "remove the
 * hat" ask for different pictures, and so do "add a cape" and "don't add a
 * cape". So this is the yardstick two gates measure against, not a cleaner.
 */
export function canonicalizeEditInstruction(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().replace(/[.!?\s]+$/, "").trim();
}

/**
 * The instruction to use, or `null` to refuse.
 *
 * The test is that {@link normalizeCustomPictureNote} — the shared rule every
 * other free-text picture field already goes through, unchanged by this work —
 * loses **nothing**. That normalizer caps at 160 characters and keeps only the
 * first sentence, both of which are right for a one-off note and wrong for an
 * instruction: a silently truncated "remove the hat but keep the dog" is a
 * request to remove the dog as well. So where the two disagree the request is
 * refused and the person is asked to shorten it themselves.
 */
export function acceptEditInstruction(raw: unknown): string | null {
  const canonical = canonicalizeEditInstruction(raw);
  if (!canonical) return null;
  return normalizeCustomPictureNote(raw) === canonical ? canonical : null;
}

/**
 * Did the copyright rewriter give back the same instruction?
 *
 * The rewriter runs on this text exactly as it runs on every other prompt — this
 * gate does not bypass or soften it. What it refuses is *using* an answer that
 * says something else: a rewrite is a paraphrase, and a paraphrase of "remove
 * the hat but keep the dog" that drops four words changes the picture. Strict on
 * purpose, so even a harmless-looking reword is refused and the person corrects
 * their own wording; only whitespace and a terminal full stop are allowed to
 * differ.
 */
export function rewrittenInstructionSurvives(
  accepted: string,
  rewritten: unknown,
): boolean {
  const canonical = canonicalizeEditInstruction(rewritten);
  return canonical !== "" && canonical === accepted;
}
