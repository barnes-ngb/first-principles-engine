/**
 * One editing session on one picture that is already saved
 * (SAVED-STICKER-EDITOR-003) — the client half of the rules the Cloud Function
 * already holds (`functions/src/shared/savedStickerEdit.ts`).
 *
 * ## Why a module rather than state in the dialog
 *
 * Everything here is a decision that must be the same answer twice: once when a
 * paid generation is about to be spent, and again when a row is about to be
 * written. So the three questions live in pure functions the dialog's tests can
 * ask directly — *may this picture be edited at all*, *is the row still the
 * picture the session was opened on*, and *what exactly is saved*.
 *
 * ## What is deliberately NOT here
 *
 * - **No look choice.** A saved version already has one, in its pixels; the look
 *   is read off the row and the shared table refuses an id it does not name,
 *   rather than falling back to the picker's default (which would redraw the
 *   picture in a look it was never made in).
 * - **No legacy fields.** The request carries `familyId`, the source path and
 *   `savedStickerEdit` and nothing else — `style`, `theme`, `transparent`,
 *   `caption` and `customNote` are refused by the server beside an edit.
 * - **No lineage invention.** The new row keeps the source's group and its
 *   stored metadata; it does not claim a parent field this slice does not have.
 * - **No instruction retention.** The words reach the request and nothing else:
 *   no sticker field, no log line, no error body.
 *
 * Pure: no React, no Firestore, no I/O.
 */
import {
  acceptEditInstruction,
  canonicalizeEditInstruction,
  savedStickerLook,
} from '../../../functions/src/shared/savedStickerEdit'
import { CUSTOM_PICTURE_NOTE_MAX_LENGTH } from './customPictureNote'
import type {
  EnhanceSketchRequest,
  EnhanceSketchResponse,
  ImageCallFailure,
} from '../../core/ai/useAI'
import { StickerCategory } from '../../core/types/enums'
import type { Sticker } from '../../core/types'

export { acceptEditInstruction, canonicalizeEditInstruction, savedStickerLook }

/**
 * The longest instruction the shared rule will accept unchanged.
 *
 * Reported, never enforced by the input: a field that stops at 160 characters
 * drops the tail of a pasted sentence silently, and "remove the hat but keep the
 * dog" truncated is a request to remove the dog as well. So the whole thing is
 * kept and the generation is refused with something to do about it.
 */
export const SAVED_STICKER_EDIT_MAX_LENGTH = CUSTOM_PICTURE_NOTE_MAX_LENGTH

/**
 * The exact saved version a session is bound to, snapshotted when it opens.
 *
 * Field types mirror {@link Sticker} rather than restating it, so the snapshot
 * and the stored shape cannot drift apart. The optional ones stay optional on
 * purpose: a default invented here would be this session's, not the picture's.
 */
export interface SavedStickerEditSource {
  id: string
  storagePath: string
  url: string
  /** The picker look id the row carries (`Sticker.theme`), e.g. `fantasy`. */
  lookId: string
  label: string
  childId: Sticker['childId']
  childProfile: Sticker['childProfile']
  tags: Sticker['tags']
  sourceDrawingId: Sticker['sourceDrawingId']
}

/** A usable preview: both halves of the receipt, neither of them empty. */
export interface SavedStickerEditPreview {
  url: string
  storagePath: string
}

// ── Copy ────────────────────────────────────────────────────────────
// Short, family-facing, and one place so the door and its refusals cannot drift.

export const SAVED_STICKER_EDIT_TITLE = 'Edit this version'
export const SAVED_STICKER_EDIT_DOOR_LABEL = 'Edit this version'
export const SAVED_STICKER_EDIT_FIELD_LABEL = 'What should change?'
export const SAVED_STICKER_EDIT_PLACEHOLDER = 'take the hat off'
export const SAVED_STICKER_EDIT_FIELD_HINT =
  'One short change, in your own words. It is not saved with the picture.'
export const SAVED_STICKER_EDIT_LOOK_NOTE =
  'Edit this saved picture in its current look.'
/** Neutral: what the tap makes, and that nothing is kept without a Save. */
export const SAVED_STICKER_EDIT_COST_NOTE =
  'Makes one new picture. Nothing is saved until you tap Save.'
export const SAVED_STICKER_EDIT_REDRAW_NOTE =
  'A redraw is never pixel-for-pixel, so other small details can move.'
export const SAVED_STICKER_EDIT_GENERATE_LABEL = 'Make the change'
export const SAVED_STICKER_EDIT_SAVE_LABEL = 'Save as new version'
export const SAVED_STICKER_EDIT_SAVED = 'Saved as a new version.'
export const SAVED_STICKER_EDIT_SOURCE_HEADING = 'Saved picture'
export const SAVED_STICKER_EDIT_CANCEL_LABEL = 'Cancel'
export const SAVED_STICKER_EDIT_CLOSE_LABEL = 'Close'

/**
 * What closing may not undo. Conditional on purpose: both buttons go busy at the
 * source check, which spends and writes nothing, so neither line may claim a
 * request went out — only that closing cannot call one back if it did.
 */
export const SAVED_STICKER_EDIT_PENDING_GENERATE =
  'If the picture request has already started, it may still finish and be counted after you close.'
export const SAVED_STICKER_EDIT_PENDING_SAVE =
  'If the save has already started, it may still finish after you close. Check your library before starting again.'

/** The two things an unacceptable instruction needs: the rule and a next step. */
export const SAVED_STICKER_EDIT_INSTRUCTION_HELP =
  'Say the change in one short sentence — what to add or take away.'

export const SAVED_STICKER_EDIT_INSTRUCTION_EMPTY =
  'Type what should change first.'

/**
 * Overlength says so plainly, and keeps every word on screen — the shortening
 * is the person's to make, because only they know which words matter.
 */
export const SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG =
  `That is too long to use exactly as written (over ${CUSTOM_PICTURE_NOTE_MAX_LENGTH} letters). Shorten it yourself to one short change — your words are still here.`

/** No look, an original, or a row with no image: this door is not for it. */
export const SAVED_STICKER_EDIT_INELIGIBLE =
  'This one cannot be edited this way. Only a version made in a look can.'

export const SAVED_STICKER_EDIT_SOURCE_GONE =
  'That picture is not in your library any more, so there is nothing to edit.'

export const SAVED_STICKER_EDIT_SOURCE_CHANGED =
  'This picture changed since you opened it. Close this and open it again.'

/**
 * What a failure that is NOT about the wording says. The same promise the
 * server's own sentence makes: the saved picture is untouched, and the typed
 * words are still on screen.
 */
export const SAVED_STICKER_EDIT_UNAVAILABLE =
  'That change could not be made just now. Your saved picture is unchanged — wait a moment and try again.'

/**
 * A save that did not come back. It may have landed, so the retry says what it
 * will do rather than claiming nothing was written.
 */
export const SAVED_STICKER_EDIT_SAVE_RETRY =
  'We did not hear back from the save. Tap Save again — it saves to the same place, so you cannot end up with two.'

/**
 * The snapshot for a sticker, or `null` when this door may not open on it.
 *
 * Four refusals, no fallbacks: a row with no id or no stored image cannot be
 * sent as a source, the group's cleaned original is the child's own drawing
 * (there is no AI look to preserve), and a look the shared table does not name
 * is refused here exactly as the server refuses it.
 */
export function savedStickerEditSource(
  sticker: Sticker | null | undefined,
): SavedStickerEditSource | null {
  if (!sticker?.id || !sticker.storagePath || !sticker.url) return null
  if (sticker.isOriginal === true) return null
  if (!sticker.theme || !savedStickerLook(sticker.theme)) return null
  return {
    id: sticker.id,
    storagePath: sticker.storagePath,
    url: sticker.url,
    lookId: sticker.theme,
    label: sticker.label,
    childId: sticker.childId,
    childProfile: sticker.childProfile,
    // Copied, not referenced: the library's row is live and this snapshot is
    // what a frozen save payload is built from.
    tags: sticker.tags ? [...sticker.tags] : undefined,
    sourceDrawingId: sticker.sourceDrawingId,
  }
}

/** An independent copy, tags included. Pinned for the life of one session. */
export function cloneSavedStickerEditSource(
  source: SavedStickerEditSource,
): SavedStickerEditSource {
  return { ...source, tags: source.tags ? [...source.tags] : undefined }
}

/**
 * The identity of one editing session: the family it writes in, plus every
 * field of the source the session depends on.
 *
 * Not just the document id. A row can keep its id and get a different image,
 * look, name, group or attribution — and then the preview on screen was made
 * from a picture that no longer exists, so it may not be saved as a version of
 * the new one. Any change here replaces the session instead.
 *
 * `JSON.stringify` of an ordered tuple rather than joined strings, so no value
 * containing the separator can collide with another.
 */
export function savedStickerEditSessionKey(
  familyId: string,
  source: SavedStickerEditSource,
): string {
  return JSON.stringify([
    familyId,
    source.id,
    source.storagePath,
    source.url,
    source.lookId,
    source.label,
    source.childId ?? null,
    source.childProfile ?? null,
    source.tags ?? null,
    source.sourceDrawingId ?? null,
  ])
}

/**
 * Why this instruction cannot be used as typed, or `null` when it can.
 *
 * The acceptance test is the shared rule's, unchanged; this only names which
 * way it failed, because "too long" and "that is two sentences" need different
 * corrections and neither is "try again".
 */
export function savedStickerEditInstructionProblem(raw: string): string | null {
  const canonical = canonicalizeEditInstruction(raw)
  if (!canonical) return SAVED_STICKER_EDIT_INSTRUCTION_EMPTY
  if (acceptEditInstruction(raw)) return null
  return canonical.length > SAVED_STICKER_EDIT_MAX_LENGTH
    ? SAVED_STICKER_EDIT_INSTRUCTION_TOO_LONG
    : SAVED_STICKER_EDIT_INSTRUCTION_HELP
}

/**
 * The request for one edit, or `null` when the instruction is not usable as
 * typed.
 *
 * The instruction is accepted by the SHARED rule, so what the client refuses and
 * what the server refuses are one function — and the canonical form is what gets
 * sent, which is the form the server will accept verbatim.
 */
export function savedStickerEditRequest(args: {
  familyId: string
  source: SavedStickerEditSource
  instruction: string
}): EnhanceSketchRequest | null {
  const accepted = acceptEditInstruction(args.instruction)
  if (!accepted) return null
  return {
    familyId: args.familyId,
    sketchStoragePath: args.source.storagePath,
    savedStickerEdit: {
      sourceStickerId: args.source.id,
      sourceLookId: args.source.lookId,
      instruction: accepted,
    },
  }
}

/**
 * The preview a response earns, or `null`.
 *
 * Both halves are required: the url is what is shown and the storage path is
 * what is saved, so a response carrying one of them is not a usable success and
 * must not be previewed, saved or counted.
 */
export function usableSavedStickerEdit(
  result: EnhanceSketchResponse | null | undefined,
): SavedStickerEditPreview | null {
  const url = typeof result?.url === 'string' ? result.url.trim() : ''
  const storagePath =
    typeof result?.storagePath === 'string' ? result.storagePath.trim() : ''
  if (!url || !storagePath) return null
  return { url, storagePath }
}

export type SavedStickerSourceCheck =
  | { ok: true }
  | { ok: false; message: string }

/**
 * Is the stored row still the picture this session opened on?
 *
 * Asked after every preflight read — before a generation is spent and before the
 * first save — and it refuses rather than reconciling: there is no
 * representative, no original and no group member to fall back to, because every
 * way of falling back ends in editing a different picture.
 *
 * `label` is compared because a drawing has one name across every version, so
 * writing this session's older name into a renamed group would split it. `tags`
 * are per-version and carry no such invariant, so the snapshot's tags are
 * retained as-is and a tag edit elsewhere does not refuse an edit in flight.
 */
export function checkSavedStickerSourceRow(
  row: unknown,
  source: SavedStickerEditSource,
): SavedStickerSourceCheck {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { ok: false, message: SAVED_STICKER_EDIT_SOURCE_GONE }
  }
  const stored = row as Record<string, unknown>
  if (stored.isOriginal === true) {
    return { ok: false, message: SAVED_STICKER_EDIT_INELIGIBLE }
  }
  const changed =
    stored.storagePath !== source.storagePath ||
    stored.theme !== source.lookId ||
    stored.label !== source.label ||
    (stored.childId ?? null) !== (source.childId ?? null) ||
    (stored.childProfile ?? 'both') !== (source.childProfile ?? 'both') ||
    (stored.sourceDrawingId ?? null) !== (source.sourceDrawingId ?? null)
  return changed
    ? { ok: false, message: SAVED_STICKER_EDIT_SOURCE_CHANGED }
    : { ok: true }
}

/**
 * The row a save writes — frozen once per usable preview, so a retry resends
 * exactly this.
 *
 * It is a NEW custom sticker that keeps the source's own metadata: the same
 * group (never adopted, never mutated — a standalone source stays standalone),
 * the same look, name, tags and attribution. It carries no `isOriginal` flag, no
 * prompt and no instruction.
 */
export function editedStickerPayload(args: {
  source: SavedStickerEditSource
  result: SavedStickerEditPreview
  createdAt: string
}): Omit<Sticker, 'id'> {
  const { source, result, createdAt } = args
  return {
    url: result.url,
    storagePath: result.storagePath,
    label: source.label,
    category: StickerCategory.Custom,
    childId: source.childId ?? null,
    createdAt,
    theme: source.lookId,
    // Only where the source HAS them — see the snapshot's note on defaults.
    ...(source.tags ? { tags: [...source.tags] } : {}),
    ...(source.childProfile ? { childProfile: source.childProfile } : {}),
    ...(source.sourceDrawingId ? { sourceDrawingId: source.sourceDrawingId } : {}),
  }
}

/**
 * What to show when no picture came back.
 *
 * The server's own sentence where it sent one: this mode writes its own, and they
 * are the honest ones — a wording it will not use, a backend that is unavailable,
 * a safety refusal. Deliberately NOT routed through the redraw retry card: that
 * card offers reworded prompts to generate again, and a changed or unavailable
 * instruction is not a refused subject to offer three variations of.
 */
export function savedStickerEditFailureMessage(
  failure: ImageCallFailure | null | undefined,
): string {
  const message = typeof failure?.message === 'string' ? failure.message.trim() : ''
  return message || SAVED_STICKER_EDIT_UNAVAILABLE
}
