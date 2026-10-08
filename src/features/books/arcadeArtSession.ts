/**
 * One game-art session on one saved sticker (FEAT-239) — identity, refusals and
 * copy.
 *
 * ## Why a module rather than state in the dialog
 *
 * The same reason `savedStickerEditSession.ts` exists: every decision here must
 * give the same answer twice — once when a session opens and again when an
 * export is about to be written to the person's disk or clipboard — so the
 * questions live in pure functions the dialog's tests can ask directly. *May
 * this door open on this picture*, *is this still the same session*, and *what
 * do we say when something fails*.
 *
 * ## What is deliberately NOT here
 *
 * - **No eligibility rule beyond having an image.** This is the one place the
 *   saved-sticker editor's `savedStickerEditSource` must NOT be reused: that
 *   gate refuses a group's original and refuses a picture with no AI look,
 *   because it is about redrawing a look. Converting a picture to game art is
 *   about the pixels that exist, so **an original and a plain legacy sticker are
 *   both first-class** — refusing them would be an unrelated rule's leftovers.
 * - **No quota, no budget, no spend.** The conversion is local arithmetic and
 *   the export is a file. `useStickerArtQuota` governs paid generation; reading
 *   it here would gate a free local act on a paid one's counter.
 * - **No write.** Nothing in this feature touches `stickerLibrary`, a sprite
 *   record, a schema, a portfolio, `hours`, `xpLedger` or a skill snapshot. The
 *   saved sticker is read and left exactly as it is.
 * - **No source path or URL in any message.** A failure sentence a person can
 *   act on, never an address they did not ask to see — which is also why this
 *   feature does not reuse `imageDataUri.fetchAsDataUri`, whose diagnostics log
 *   the storage path and a URL prefix.
 *
 * Pure: no React, no DOM, no Firestore, no I/O.
 */
import type { ArcadeArtFailure, ArcadeArtSize } from './arcadeArt'
import { ARCADE_PALETTE } from './arcadeArt'
import type { Sticker } from '../../core/types'

// ── The source a session is bound to ────────────────────────────────────────

/**
 * The exact saved picture a session converts, snapshotted when it opens.
 *
 * The picture that was actually tapped — a grouped drawing's specific version,
 * never its card's representative and never the group's original standing in
 * for it. The host hands over the big preview's own target; this only copies it.
 */
export interface ArcadeArtSource {
  id: string
  url: string
  storagePath: string
  /** The label as it read when the session opened. Used for the file name. */
  label: string
}

/**
 * The snapshot for a sticker, or `null` when there is no image to convert.
 *
 * One refusal and no fallbacks: a row with no id, no stored object path or no
 * URL cannot be read, and there is nothing else to read instead. Note what is
 * NOT refused — see the module header.
 */
export function arcadeArtSource(
  sticker: Sticker | null | undefined,
): ArcadeArtSource | null {
  const id = sticker?.id?.trim() ?? ''
  const url = sticker?.url?.trim() ?? ''
  const storagePath = sticker?.storagePath?.trim() ?? ''
  if (!id || !url || !storagePath) return null
  return { id, url, storagePath, label: sticker?.label ?? '' }
}

/**
 * The identity of one session: the actor's context, the family, the exact
 * picture, and WHICH opening this is.
 *
 * Not just the document id. A row can keep its id and be pointed at different
 * bytes, and then the grid on screen was made from a picture that is no longer
 * there — so `url` and `storagePath` are both in the key and a same-id change of
 * source replaces the session rather than re-pointing it.
 *
 * `nonce` is the host's open counter, and it is what makes **close-and-reopen a
 * new session even on the identical picture**: without it, React would reuse the
 * previous session's state and the second opening would start holding the first
 * one's converted grid, its error, and its "Copied" receipt.
 *
 * `label` is deliberately absent. A rename elsewhere changes no pixel, and
 * discarding a converted grid over it would be a loss with nothing behind it;
 * the label is pinned at open for the file name instead.
 *
 * `JSON.stringify` of an ordered tuple rather than joined strings, so no value
 * containing the separator can collide with another.
 */
export function arcadeArtSessionKey(args: {
  contextKey: string
  familyId: string
  source: ArcadeArtSource
  nonce: number
}): string {
  return JSON.stringify([
    args.contextKey,
    args.familyId,
    args.source.id,
    args.source.url,
    args.source.storagePath,
    args.nonce,
  ])
}

// ── Loading failures ────────────────────────────────────────────────────────

/**
 * Why the picture's pixels could not be read.
 *
 * Named here, beside their sentences, rather than inside the DOM boundary that
 * produces them: the loader's job is to decide WHICH of these happened, and this
 * module's job is to say what each one means to a person. Keeping them together
 * is what stops a new failure path reaching the screen as "something went wrong".
 */
export const ArcadeArtLoadFailure = {
  /** Neither the Storage SDK nor the browser could fetch the bytes. */
  Unavailable: 'unavailable',
  /** More bytes than we will decode. Refused BEFORE the decode. */
  TooLarge: 'too-large',
  /** Decoded, and bigger than we will integrate over. */
  TooManyPixels: 'too-many-pixels',
  /** The browser could not decode the image data at all. */
  Undecodable: 'undecodable',
  /** Decoded, but the pixels could not be read back (a canvas SecurityError). */
  Blocked: 'blocked',
  /** This browser gives us no 2D canvas, so there is nothing to read with. */
  Unsupported: 'unsupported',
  /**
   * A browser resource failed somewhere we do not otherwise model — a canvas
   * that could not be created, a `drawImage` that threw under memory pressure,
   * an object URL that could not be made.
   *
   * It exists so the loader can have ONE boundary `catch`: an unexpected
   * rejection used to escape the result union and leave the dialog on its
   * spinner with no error and no retry, which is the worst of the three
   * outcomes. Retryable, because nothing about the picture is wrong.
   */
  Unexpected: 'unexpected',
  /**
   * The session went away while the load was in flight. Never shown — it exists
   * so the loader can report "I stopped" distinctly from "it failed", and the
   * caller can drop it in silence.
   */
  Cancelled: 'cancelled',
} as const
export type ArcadeArtLoadFailure =
  (typeof ArcadeArtLoadFailure)[keyof typeof ArcadeArtLoadFailure]

// ── Copy ────────────────────────────────────────────────────────────────────
//
// Short, family-facing, one place. Every sentence below is written to be true
// of what actually happened and to say what to do next where there is anything
// to do — and none of them names a URL, a storage path or a file the person
// did not pick.

export const ARCADE_ART_TITLE = 'Make game art'
export const ARCADE_ART_DOOR_LABEL = 'Make game art'

/** What the door makes, said before it is tapped. */
export const ARCADE_ART_INTRO =
  'Turn this picture into a sprite for MakeCode Arcade. Your saved picture is not changed.'

export const ARCADE_ART_SIZE_LABEL = 'Sprite size'
export const ARCADE_ART_SIZE_HINT =
  'Arcade sprites are small. 16 × 16 is the usual size; 32 × 32 keeps more detail.'

export const ARCADE_ART_PREVIEW_HEADING = 'Big view'
export const ARCADE_ART_ACTUAL_HEADING = 'Actual size'
export const ARCADE_ART_ACTUAL_NOTE =
  'This is how big the sprite really is. The big view is the same picture, zoomed.'

/**
 * A sticker handed over with no stored image. Defensive: the host only offers
 * the door where {@link arcadeArtSource} answers, so this is the sentence for a
 * row that changed underneath it rather than a case a person should meet.
 */
export const ARCADE_ART_NO_IMAGE =
  'This one has no saved picture to turn into game art.'

/**
 * The preview could not be drawn, and the code still can.
 *
 * Both previews are the encoded PNG itself, so what is on screen is exactly
 * what downloads — which means a browser that cannot encode one shows neither.
 * The literal is made by arithmetic alone and is unaffected, so the honest
 * thing is to say the picture is missing rather than to hide a working export.
 */
export const ARCADE_ART_PREVIEW_UNAVAILABLE =
  'We could not draw the preview in this browser. The code below is still ready to use.'

export const ARCADE_ART_LOADING = 'Reading your picture…'
export const ARCADE_ART_CONVERTING = 'Making the sprite…'

export const ARCADE_ART_COPY_LABEL = 'Copy for MakeCode'
export const ARCADE_ART_COPIED = 'Copied. Paste it over an image in your game.'
export const ARCADE_ART_DOWNLOAD_LABEL = 'Download PNG'
export const ARCADE_ART_RETRY_LABEL = 'Try again'
export const ARCADE_ART_CLOSE_LABEL = 'Close'

/** The size the PNG really is, said where a person is about to download it. */
export function arcadeArtDownloadNote(size: ArcadeArtSize): string {
  return `The PNG is exactly ${size} × ${size} pixels — the sprite itself, not the zoomed view.`
}

/**
 * Why copying did not happen, with the way forward that replaces it.
 *
 * A clipboard write can be refused by the browser, by the page not being
 * focused, or by there being no clipboard at all, and none of those is worth
 * three different sentences — what matters is that it did NOT copy and the text
 * is right here to take by hand.
 */
export const ARCADE_ART_COPY_FAILED =
  'Your browser would not let us copy. The code is below — select it and copy it yourself, or save it as a text file.'

export const ARCADE_ART_COPY_FALLBACK_LABEL = 'Code for MakeCode'
export const ARCADE_ART_SAVE_TEXT_LABEL = 'Save as a text file'

/** A download that did not start. Nothing was written, so retrying is safe. */
export const ARCADE_ART_DOWNLOAD_FAILED =
  'The file could not be made just now. Nothing was saved — try again.'

/**
 * How to actually use it, which is the part a bare literal does not tell you.
 *
 * Deliberately a REPLACEMENT instruction rather than "paste this in". An image
 * literal is an expression: pasted at the top level of a program it is a syntax
 * error, and pasted into the Blocks view it is nothing at all. The one place it
 * belongs is over an existing `img` literal in the JavaScript view.
 */
export const ARCADE_ART_INSTRUCTIONS: readonly string[] = [
  'Open your game at arcade.makecode.com and switch to JavaScript.',
  'Find the picture you want to replace. It looks like img` … ` with rows of dots and numbers.',
  'Select that whole img` … ` block, back-ticks included, and paste this over it.',
  'Switch back to Blocks. The sprite now uses your picture.',
]

/**
 * The compatibility fact, stated rather than assumed.
 *
 * These sixteen characters are indices, not colours. A project that has changed
 * its palette draws the same literal in different colours — so a picture that
 * looks wrong in such a game is not a bad conversion, and the person should know
 * that before they go looking for one.
 */
export const ARCADE_ART_PALETTE_NOTE =
  `The ${ARCADE_PALETTE.length} colours are Arcade's default palette. In a game that has set its own palette, the same code draws different colours.`

// ── Failure sentences ───────────────────────────────────────────────────────

const CONVERT_MESSAGES: Record<ArcadeArtFailure, string> = {
  'invalid-size': 'That sprite size is not one we make. Pick 16 × 16 or 32 × 32.',
  'invalid-dimensions':
    "We could not read this picture's size, so there is nothing to convert.",
  'invalid-buffer':
    'This picture did not come through whole. Close this and open it again.',
  'too-large':
    'This picture is too big to convert here. Try a smaller version of it.',
  'empty-source':
    'This picture is completely see-through, so there is nothing to turn into a sprite.',
  // The one failure that is about the ART rather than about the machinery.
  'empty-result':
    'Everything in this picture is too faint or too thin to show up at this size. Try 32 × 32.',
}

const LOAD_MESSAGES: Record<ArcadeArtLoadFailure, string> = {
  unavailable:
    'We could not open your picture just now. Check your connection and try again.',
  'too-large': 'This picture is too big to open here. Try a smaller version of it.',
  'too-many-pixels':
    'This picture has too many pixels to convert here. Try a smaller version of it.',
  undecodable: 'This picture could not be opened. Try a different one.',
  blocked:
    'This browser would not let us read the picture. Try again, or open it in another browser.',
  unsupported: 'Making game art is not available in this browser.',
  unexpected: 'Something went wrong reading your picture. Please try again.',
  // Shown to nobody: a cancelled load is a session that is gone.
  cancelled: '',
} as const

/** What a person reads when a conversion refuses. */
export function arcadeArtFailureMessage(reason: ArcadeArtFailure): string {
  return CONVERT_MESSAGES[reason]
}

/** What a person reads when the picture could not be read. */
export function arcadeArtLoadFailureMessage(reason: ArcadeArtLoadFailure): string {
  return LOAD_MESSAGES[reason]
}

// ── File names ──────────────────────────────────────────────────────────────

/**
 * The name the exported file is offered under.
 *
 * Built from the label the session pinned, reduced to plain characters so it is
 * safe on every platform, and always carrying the size — a `16` and a `32` of
 * the same picture are two different sprites and must not land in a downloads
 * folder under one name. A label with nothing usable in it falls back to
 * `sticker` rather than producing a file called `-16x16.png`.
 */
export function arcadeArtFileName(
  label: string,
  size: ArcadeArtSize,
  extension: 'png' | 'txt',
): string {
  const stem =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'sticker'
  return `${stem}-arcade-${size}x${size}.${extension}`
}
