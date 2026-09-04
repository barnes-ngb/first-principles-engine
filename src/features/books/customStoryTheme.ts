/**
 * The one-off "what should this story feel like?" note (FEAT-194).
 *
 * ## What it replaced
 *
 * A saved-theme library. `CreateThemeDialog` asked a parent for four fields and
 * wrote them to `families/{id}/bookThemes/{autoId}`, and nothing could ever use
 * them: `bookThemesCollection` had exactly one caller in the whole client and it
 * was that `addDoc`, and `book.theme` is only ever written with PRESET ids — by
 * `inferBookTheme`, `autoSuggestTheme`, or the Finish dialog's chips. The
 * server's custom lookups were therefore unreachable, and the shelf's filter
 * rendered nothing for an id it did not know. It was dead machinery.
 *
 * The want behind it was real, and it is **per book, not reusable** (owner,
 * 2026-09-04): one story should feel a particular way. So this is a string on
 * the book — `generationConfig.customTheme`, beside `words`, `pageCount` and
 * `levelStretch` — and no collection.
 *
 * ## Where the words may land
 *
 * The STORY, never the picture. The note is threaded into `buildStoryPrompt`'s
 * THEME GUIDANCE and is not used as an image prefix under any condition. This is
 * FEAT-189's lesson one table over: a theme that names subject matter arrives at
 * the image model *alongside* the page's own scene, and the model splits the
 * canvas. Free text from a parent is the most likely thing in the app to name a
 * subject ("a spooky forest with a kind witch"), so it must never reach
 * `buildImagePrompt`. The picture's look stays owned by the picked illustration
 * style (FEAT-174's precedence, unchanged).
 *
 * The old dialog's fourth field — *"What style should pictures be?"* — has no
 * replacement here, deliberately: describing a look in free text is **UX-177**,
 * a separate design with a copyright-rewriter cost. Nothing in this module's
 * copy may imply the note changes the pictures.
 *
 * Pure: no I/O, no React, no Firestore.
 */

/**
 * The cap. Mirrors the server's `CUSTOM_STORY_THEME_MAX_LENGTH`
 * (`functions/src/ai/tasks/generateStory.ts`), which clamps again — a length
 * only the client enforces is not a limit. Short on purpose: this is a note
 * about how one book feels, not a design brief.
 */
export const CUSTOM_STORY_THEME_MAX_LENGTH = 200

/**
 * Coerce a stored / typed value into a usable note: a string, whitespace
 * collapsed, trimmed, capped. Anything else is `''` — absent, a number, an
 * object — because a note is only ever words a parent typed.
 */
export function normalizeCustomStoryTheme(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CUSTOM_STORY_THEME_MAX_LENGTH)
    .trim()
}

/** Does this book carry a note? */
export function hasCustomStoryTheme(raw: unknown): boolean {
  return normalizeCustomStoryTheme(raw) !== ''
}

/**
 * What a book's theme is, as one value. A book has a preset id **or** a note,
 * never both, so that there is exactly one source of theme guidance.
 */
export interface StoryThemeSelection {
  /** The preset theme id, or `undefined`. */
  theme: string | undefined
  /** The parent's one-off note, or `''`. */
  customTheme: string
}

export type StoryThemePick =
  | { kind: 'preset'; id: string }
  | { kind: 'custom'; note: string }

/**
 * The one-or-the-other rule, as a pure decision.
 *
 * - Picking a preset clears the note.
 * - Picking the preset that is already selected clears it (the chips toggle).
 * - Saving a note clears the preset.
 * - Saving an empty note clears the note and leaves the preset alone — which is
 *   what "Clear" on the card means, and it must not silently re-select a preset
 *   the parent replaced earlier.
 */
export function chooseStoryTheme(
  current: StoryThemeSelection,
  pick: StoryThemePick,
): StoryThemeSelection {
  if (pick.kind === 'preset') {
    const same = current.theme === pick.id
    return { theme: same ? undefined : pick.id, customTheme: '' }
  }
  const note = normalizeCustomStoryTheme(pick.note)
  if (!note) return { theme: current.theme, customTheme: '' }
  return { theme: undefined, customTheme: note }
}

// ── Copy ────────────────────────────────────────────────────────────
// One place, so the chip, the card and the hint cannot drift. Parent-facing
// only: this control is gated on capability and a kid never sees it, so it is
// not held to the kid readability bar.

/** The chip that opens the card, at the end of the preset row. */
export const CUSTOM_STORY_THEME_CHIP_LABEL = '✏️ Custom…'

/** The chip once a note is set — it says so without repeating the note. */
export const CUSTOM_STORY_THEME_CHIP_LABEL_SET = '✏️ Custom'

export const CUSTOM_STORY_THEME_TITLE = 'Custom feel for this book'

/** The field's one question — the owner's words. */
export const CUSTOM_STORY_THEME_PROMPT = 'What should this story feel like?'

export const CUSTOM_STORY_THEME_PLACEHOLDER =
  'A spooky forest with a kind witch who bakes bread'

/**
 * The one-line hint. Says two things and no third: it is one-off, and it does
 * not touch the pictures. The second half is load-bearing — the field it
 * replaced asked for a picture style, and implying this one does that is the
 * gap UX-177 files, not a promise this makes.
 */
export const CUSTOM_STORY_THEME_HINT =
  'Just this book — it shapes the story, not the pictures.'

/** Under the preset chips, so a parent knows the two choices are exclusive. */
export const CUSTOM_STORY_THEME_EXCLUSIVE_HINT =
  'A book has one or the other: a theme, or your own note.'

/**
 * What the chip should read, given the note the book carries.
 */
export function customStoryThemeChipLabel(raw: unknown): string {
  return hasCustomStoryTheme(raw)
    ? CUSTOM_STORY_THEME_CHIP_LABEL_SET
    : CUSTOM_STORY_THEME_CHIP_LABEL
}
