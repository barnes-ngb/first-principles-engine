// ── The one write that stores a Build Studio reflection (LOCAL-BUILD-001) ────
//
// `artifacts`, through the collection the whole app already uses for a piece of
// evidence, and nothing else. It is deliberately SEPARATE from
// `buildStudioVersionWrites.ts`, in its own transaction and its own call:
//
//   • a failed note can never take a saved version down with it, and
//   • a saved version can never imply a note was given.
//
// Those are two different things a child did, and this slice's rule is that the
// observations sit BESIDE the versions rather than inside them.
//
// ── What it does not touch ──────────────────────────────────────────────────
//
// No `hours`, `hoursAdjustments` or `days` — nothing here is time taught, and
// this slice adds no hours writer. No `xpLedger`, no `dailyArmorSessions` —
// saying what you expected earns nothing. No `skillSnapshots`,
// `childSkillMaps`, `learnerModels` or `evaluations` — a sentence about a game
// is not an assessment, and an evidence ref that is not derived would currently
// suppress the working-level projection, which is why a build-evidence
// contributor is separately designed rather than slipped in here.
//
// ── Idempotent per TAP, and never silently dropped ──────────────────────────
//
// The document id is `{child}__{version}__{noteActionId}`, and the action id is
// minted when the child taps *Save my words*. So:
//
//   • the same tap retried after a lost acknowledgment finds its own document
//     with its own words and reports `alreadySaved` — safe;
//   • the same tap arriving with DIFFERENT words is refused, not reported as
//     saved;
//   • a second, genuinely new note about the same version is a different tap,
//     a different id and a different document. The first draft keyed on the
//     version alone and therefore answered "Saved" to any later note while
//     writing nothing, which is the one failure worse than an error.
//
// The referenced version is read in the SAME transaction and must agree about
// the child, the project and the version id. A note's whole value is what it
// is about.
//
// ── Provenance stays honest ─────────────────────────────────────────────────
//
// `help` is three-valued and says *offered*, not *heard*: the app knows it
// asked for speech, not that a child listened. A caller that does not know the
// visit's hint history passes `unknown`, and `unknown` is stored — never
// quietly rendered as "no help".

import { doc, runTransaction } from 'firebase/firestore'

import type { Artifact } from '../types'
import { EngineStage, EvidenceType, SubjectBucket } from '../types/enums'
import { artifactsCollection, buildStudioVersionsCollection, db } from './firestore'

/** Thrown before anything is written. The message is child-readable. */
export class BuildStudioNoteRefused extends Error {}

/** The longest note this stores. Refused, never truncated — a sentence cut in
 * half is a sentence he did not say, stored as though he had. */
export const BUILD_STUDIO_NOTE_MAX = 600

/**
 * How much authored help was OFFERED before he said this.
 *
 * Deliberately *offered*, not *heard*. The app knows it asked the browser to
 * speak a hint; it does not know a child listened, and the device may have been
 * muted. Three values, and `unknown` is a real answer rather than a stand-in
 * for zero — a note saved in a visit whose hint history the app did not observe
 * stays unknown.
 */
export type BuildStudioNoteHelp = 'none-offered' | 'hints-offered' | 'unknown'
export type BuildStudioNoteCapture = 'voice' | 'typed'

export interface SaveBuildStudioNoteArgs {
  familyId: string
  /** The child who said it — the one the visit was FOR, never the live one. */
  childId: string
  projectId: string
  /** The save this note is about. Part of the note's identity. */
  versionId: string
  /** That version's stored document id, so the reference is exact. */
  versionDocId: string
  /**
   * ONE id per CONFIRMED note — minted when the child taps *Save my words* and
   * reused verbatim by that tap's retry.
   *
   * This is what the first draft got wrong. The document id was derived from
   * the version alone, so the transaction reported `alreadySaved` for ANY
   * existing note on that version: a second, different note was silently
   * dropped while the UI cleared the draft and said "Saved". With a per-action
   * id, a lost-ACK retry of the same tap is idempotent and a genuinely new note
   * is a new document.
   */
  noteActionId: string
  /** The accepted text, as `VoiceInput` handed it over or as he typed it. */
  text: string
  capture: BuildStudioNoteCapture
  help: BuildStudioNoteHelp
  /** Rungs offered, only when `help` is `hints-offered`. Never a score. */
  hintsOffered?: number
  createdAt?: string
  /** The `transcriptionEvents` id, when the voice module gave one. */
  voiceEventId?: string
}

export interface SaveBuildStudioNoteResult {
  id: string
  note: Artifact
  /**
   * True when THIS note — the same action id and the same words — was already
   * stored and this call wrote nothing. A lost-ACK retry, which is safe.
   *
   * It is never true for a different note, which is the whole repair: a
   * different payload under the same action id is REFUSED, and a different note
   * on the same version is a different action id and a different document.
   */
  alreadySaved: boolean
}

/** Narrow: this becomes part of a document path. */
const NOTE_ACTION_ID = /^[A-Za-z0-9_-]{4,64}$/

export const BUILD_STUDIO_NOTE_CONFLICT =
  'Those words are already saved under that name. Nothing was changed.'

export const BUILD_STUDIO_NOTE_NO_VERSION =
  'That saved game could not be found, so your words were not saved.'

/**
 * The note for one CONFIRMED tap. The version is in the id so a console listing
 * groups a version's notes together; the action id is what makes a retry land
 * on the same document.
 */
export const buildStudioNoteDocId = (
  childId: string,
  versionId: string,
  noteActionId: string,
): string => `bs-note-${childId}__${versionId}__${noteActionId}`

/**
 * Store one reflection. Resolves only once the write is durable — the caller
 * may not say "Saved" before that.
 */
export async function saveBuildStudioNote(
  args: SaveBuildStudioNoteArgs,
): Promise<SaveBuildStudioNoteResult> {
  const { familyId, childId, projectId, versionId, versionDocId } = args

  if (!familyId) throw new BuildStudioNoteRefused('No family is signed in.')
  if (!childId || /[/\s]/.test(childId)) {
    throw new BuildStudioNoteRefused('No child is picked for this note.')
  }
  if (!projectId || !versionId || !versionDocId) {
    throw new BuildStudioNoteRefused(
      'Save your game first, then your words can go with it.',
    )
  }
  if (!NOTE_ACTION_ID.test(args.noteActionId ?? '')) {
    throw new BuildStudioNoteRefused(
      'Those words could not be identified. Try Save my words again.',
    )
  }

  const text = args.text.trim()
  if (!text) throw new BuildStudioNoteRefused('There were no words to save.')
  if (text.length > BUILD_STUDIO_NOTE_MAX) {
    throw new BuildStudioNoteRefused(
      `That is longer than this can store — keep it under ${BUILD_STUDIO_NOTE_MAX} letters.`,
    )
  }

  if (args.capture !== 'voice' && args.capture !== 'typed') {
    throw new BuildStudioNoteRefused('Could not tell how those words were given.')
  }
  if (
    args.help !== 'none-offered' &&
    args.help !== 'hints-offered' &&
    args.help !== 'unknown'
  ) {
    throw new BuildStudioNoteRefused('Could not tell how much help was offered.')
  }

  const createdAt = args.createdAt ?? new Date().toISOString()
  if (Number.isNaN(new Date(createdAt).getTime())) {
    throw new BuildStudioNoteRefused('Could not stamp the time, so nothing was saved.')
  }

  // Only recorded when it MEANS something. A rung count beside `unknown` or
  // `none-offered` would be a number the app cannot stand behind.
  const hintsOffered =
    args.help === 'hints-offered' && Number.isSafeInteger(args.hintsOffered ?? NaN)
      ? (args.hintsOffered as number)
      : undefined

  const id = buildStudioNoteDocId(childId, versionId, args.noteActionId)
  const note: Artifact = {
    id,
    childId,
    title: 'What I was trying in my game',
    type: EvidenceType.Note,
    content: text,
    createdAt,
    // The existing optional join, set as well as the structured reference
    // below, because readers that already understand `projectId` should see it.
    projectId,
    tags: {
      engineStage: EngineStage.Reflect,
      domain: 'build-studio',
      subjectBucket: SubjectBucket.PracticalArts,
      location: 'home',
    },
    buildStudio: {
      projectId,
      versionId,
      versionDocId,
      capture: args.capture,
      help: args.help,
      hintsOffered,
      noteActionId: args.noteActionId,
    },
    // The voice module's own event id, when there was one. It is the join back
    // to `transcriptionEvents`, which already holds the transcript and the
    // child's edit of it; this does not copy any of that.
    notes: args.voiceEventId ? `voiceEventId:${args.voiceEventId}` : undefined,
  }

  const ref = doc(artifactsCollection(familyId), id)
  // The version this note CLAIMS to be about, read inside the transaction by
  // its own id — so a note cannot be filed against a version that does not
  // exist, or against another child's or another project's row. Reading it
  // beforehand would leave a window in which the row changed underneath.
  const versionRef = doc(buildStudioVersionsCollection(familyId), versionDocId)

  return runTransaction(db, async (tx) => {
    const target = await tx.get(versionRef)
    if (!target.exists()) {
      throw new BuildStudioNoteRefused(BUILD_STUDIO_NOTE_NO_VERSION)
    }
    const stored = target.data()
    if (
      stored?.childId !== childId ||
      stored?.projectId !== projectId ||
      stored?.versionId !== versionId
    ) {
      // The reference is the whole value of the note. A disagreement here means
      // the caller's captured target and the record do not describe the same
      // save, and attaching his words to the wrong one is worse than refusing.
      throw new BuildStudioNoteRefused(BUILD_STUDIO_NOTE_NO_VERSION)
    }

    const existing = await tx.get(ref)
    if (existing.exists()) {
      const already = existing.data()
      // Same tap, same words — a lost-ACK retry, which is safe and is the one
      // case that may report success without writing.
      if (already?.content === text) {
        return { id, note: { ...already, id }, alreadySaved: true }
      }
      // Same tap, DIFFERENT words. Refused rather than reported as saved: the
      // first attempt's words are the record, and the caller keeps its draft.
      throw new BuildStudioNoteRefused(BUILD_STUDIO_NOTE_CONFLICT)
    }
    tx.set(ref, note)
    return { id, note, alreadySaved: false }
  })
}
