/**
 * The one-off "what should change?" note on a picture (FEAT-197 / UX-177).
 *
 * ## The two axes, and why this is not a style
 *
 * Every look in the sticker picker changes **how** a drawing is redrawn — the
 * palette, the line weight, the shading (`enhanceSketch.ts`'s recipes). None of
 * them can change **what is in** the picture, and that is by construction: FEAT-189
 * measured what happens when a style prefix names subject matter, and the model
 * split the canvas between the prefix's world and the page's own scene.
 *
 * The owner's report (2026-09-05) landed exactly on that gap. Two stickers of one
 * drawing in the `space` look: *"it seems to make everything just space-filled…
 * I was thinking put them in a space suit."* The `space` recipe says forms are
 * "defined by glow and bright edge light" with "fine star speckles", so on a
 * re-draw the girl is not *in* space, she is *made of* it. The recipe is doing
 * what it says. A space suit is a different axis, and the app had one control.
 *
 * So this note is a **subject** clause, never a style one: it says what is in the
 * picture, and the look the person tapped still owns how it is drawn. Free text
 * describing a LOOK stays unbuilt — that half of UX-177 is still open.
 *
 * ## Why the rule lives here
 *
 * Both sides enforce it and they must agree: the client caps as a courtesy so a
 * person sees the limit while typing, and the server clamps again because a
 * length only the client enforces is not a limit. FEAT-194 kept those as two
 * copies with a comment naming the mirror; ARCH-47 exists so a rule like this has
 * exactly one definition that both projects compile. This is that definition.
 *
 * Pure: no I/O, no React, no Firestore, nothing environment-specific.
 */

/**
 * The hard cap. Short on purpose: this is one change to one picture — "put her
 * in a space suit", "give him a cape" — not a design brief. Anything longer is
 * a second art direction arriving beside the look the person already picked.
 */
export const CUSTOM_PICTURE_NOTE_MAX_LENGTH = 160;

/**
 * Coerce a typed / transmitted value into a usable note.
 *
 * Three rails, in order:
 *
 * 1. **Words only.** Anything that is not a string is `''` — absent, a number,
 *    an object. A note is only ever what a person typed.
 * 2. **One sentence.** Everything up to the first `.`/`!`/`?` that actually ends
 *    a sentence (a terminator followed by whitespace or the end of the string,
 *    so "e.g." survives intact). Two sentences are two instructions, and the
 *    prompt clause below can only hold one. The trailing terminator is stripped
 *    because the clause supplies its own.
 * 3. **Whitespace collapsed, then capped** at {@link CUSTOM_PICTURE_NOTE_MAX_LENGTH},
 *    at a word boundary where there is one. A note goes into a sentence the
 *    image model reads, so half a word is worse than a shorter note.
 */
export function normalizeCustomPictureNote(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const firstSentence = collapsed.match(/^[^.!?]*[.!?](?=\s|$)/);
  const oneSentence = firstSentence ? firstSentence[0] : collapsed;

  let capped = oneSentence;
  if (capped.length > CUSTOM_PICTURE_NOTE_MAX_LENGTH) {
    capped = capped.slice(0, CUSTOM_PICTURE_NOTE_MAX_LENGTH);
    const lastSpace = capped.lastIndexOf(" ");
    // A single word longer than the cap has no boundary to fall back to; the
    // hard slice stands rather than returning nothing.
    if (lastSpace > 0) capped = capped.slice(0, lastSpace);
  }
  return capped.replace(/[.!?\s]+$/, "").trim();
}

/** Does this value carry a usable note? */
export function hasCustomPictureNote(raw: unknown): boolean {
  return normalizeCustomPictureNote(raw) !== "";
}
