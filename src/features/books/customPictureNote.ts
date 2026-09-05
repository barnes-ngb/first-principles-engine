/**
 * The "+ My own look" card — what a person types when the look they want is not
 * a look at all (FEAT-197 / UX-177).
 *
 * ## The finding this card exists for
 *
 * The owner sent two stickers of one drawing in the `space` look (2026-09-05):
 * *"it seems to make everything just space-filled. Which is cool, but I was
 * thinking put them in a space suit."* The `space` recipe asks for forms
 * "defined by glow and bright edge light" over "fine star speckles", so on a
 * re-draw of a child's own drawing the girl is not *in* space — she is made of
 * it. The recipe is doing exactly what it says.
 *
 * **No look could have done it.** Every option in the picker changes HOW the
 * drawing is redrawn; a space suit is WHAT is in the picture. That is two axes,
 * and the app had one control. FEAT-189 is the reason the style picker can never
 * be the second one: a style prefix that names subject matter arrives beside the
 * picture's own scene and the model splits the canvas.
 *
 * So this note is a **subject** clause. The look the person tapped still owns
 * the palette, line and shading; the note says what changes in the picture. The
 * prompt says so in as many words (`enhanceSketch.ts` `noteClauseFor`).
 *
 * ## Rails
 *
 * - **One-off.** No collection, no saved list — the same call FEAT-194 settled
 *   for story themes. The want is per picture.
 * - **Capped and normalized by the shared rule**, so the client's courtesy limit
 *   and the server's actual one are one function, not two that drift.
 * - **It reaches the picture only.** The mirror of FEAT-194's rail, which keeps
 *   story text out of pictures; this keeps picture text out of stories. Nothing
 *   here is written to a book, a story config, or any child record.
 * - **Kid-reachable**, so the kid copy is held to the shared readability bar in
 *   `src/test/kidReadability.ts`. A kid typing "give her a cape" is the feature
 *   working.
 *
 * Copy + a re-export. No I/O, no React, no Firestore.
 */
import {
  CUSTOM_PICTURE_NOTE_MAX_LENGTH,
  hasCustomPictureNote,
  normalizeCustomPictureNote,
} from '../../../functions/src/shared/customPictureNote'
import type { ArtHelpAudience } from './artHelpContent'

export {
  CUSTOM_PICTURE_NOTE_MAX_LENGTH,
  hasCustomPictureNote,
  normalizeCustomPictureNote,
}

// ── Copy ────────────────────────────────────────────────────────────
// One place, so the chip, the field and the hint cannot drift. Two audiences on
// capability (`useActiveChild().isChildProfile`), never a name.

/** The chip that opens the card, at the end of the look row. */
export const CUSTOM_PICTURE_NOTE_CHIP_LABEL = '➕ My own look'

/** The chip once a note is set — it says so without repeating the note. */
export const CUSTOM_PICTURE_NOTE_CHIP_LABEL_SET = '✏️ My own look'

/** What the chip should read, given the note currently held. */
export function customPictureNoteChipLabel(raw: unknown): string {
  return hasCustomPictureNote(raw)
    ? CUSTOM_PICTURE_NOTE_CHIP_LABEL_SET
    : CUSTOM_PICTURE_NOTE_CHIP_LABEL
}

/** The field's one question — the owner's words, in each audience's voice. */
export const CUSTOM_PICTURE_NOTE_PROMPT: Readonly<Record<ArtHelpAudience, string>> = {
  parent: 'What should change?',
  kid: 'What should change?',
}

export const CUSTOM_PICTURE_NOTE_PLACEHOLDER: Readonly<
  Record<ArtHelpAudience, string>
> = {
  parent: 'put her in a space suit',
  kid: 'give her a cape',
}

/**
 * The hint under the field. Says the two things that make the card honest and no
 * third: it changes **what is in** the picture (not how it is drawn), and the
 * look stays whatever was tapped. Getting this wrong is the whole failure mode —
 * a card that reads like a style field is a second art direction.
 */
export const CUSTOM_PICTURE_NOTE_HINT: Readonly<Record<ArtHelpAudience, string>> = {
  parent:
    'Your words change what is in the picture. The look you picked still decides how it is drawn.',
  kid: 'It changes what is in the picture.',
}

/** Said beside the hint, so nobody looks for a saved list later. */
export const CUSTOM_PICTURE_NOTE_ONE_OFF: Readonly<
  Record<ArtHelpAudience, string>
> = {
  parent: 'Just this picture — it is not saved.',
  kid: 'It is just for this picture.',
}

/** Clears the note without closing the card. */
export const CUSTOM_PICTURE_NOTE_CLEAR_LABEL = 'Clear'
