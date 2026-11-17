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
// ── Idempotent, and never overwritten ───────────────────────────────────────
//
// The document id is derived from the child and the VERSION the note is about,
// so a retry lands on the same document. The transaction creates it or leaves
// the stored one exactly as it is: a note is a thing he said, and the second
// attempt of one save may not rewrite the first attempt's words.
//
// ── Provenance stays honest ─────────────────────────────────────────────────
//
// `help` is three-valued and the caller must say which. A caller that does not
// KNOW how much help was heard passes `unknown`, and `unknown` is stored —
// never quietly rendered as "no help", which would be the app asserting
// something about the child's work that it did not observe.

import { doc, runTransaction } from 'firebase/firestore'

import type { Artifact } from '../types'
import { EngineStage, EvidenceType, SubjectBucket } from '../types/enums'
import { artifactsCollection, db } from './firestore'

/** Thrown before anything is written. The message is child-readable. */
export class BuildStudioNoteRefused extends Error {}

/** The longest note this stores. Refused, never truncated — a sentence cut in
 * half is a sentence he did not say, stored as though he had. */
export const BUILD_STUDIO_NOTE_MAX = 600

export type BuildStudioNoteHelp = 'none-heard' | 'hints-heard' | 'unknown'
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
  /** The accepted text, as `VoiceInput` handed it over or as he typed it. */
  text: string
  capture: BuildStudioNoteCapture
  help: BuildStudioNoteHelp
  /** Rungs heard, only when `help` is `hints-heard`. Never a score. */
  hintsHeard?: number
  createdAt?: string
  /** The `transcriptionEvents` id, when the voice module gave one. */
  voiceEventId?: string
}

export interface SaveBuildStudioNoteResult {
  id: string
  note: Artifact
  /** True when this note was already stored and this call wrote nothing. */
  alreadySaved: boolean
}

/** The note for one version. Derived, so a retry is not a second note. */
export const buildStudioNoteDocId = (childId: string, versionId: string): string =>
  `bs-note-${childId}__${versionId}`

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
    args.help !== 'none-heard' &&
    args.help !== 'hints-heard' &&
    args.help !== 'unknown'
  ) {
    throw new BuildStudioNoteRefused('Could not tell how much help was heard.')
  }

  const createdAt = args.createdAt ?? new Date().toISOString()
  if (Number.isNaN(new Date(createdAt).getTime())) {
    throw new BuildStudioNoteRefused('Could not stamp the time, so nothing was saved.')
  }

  // Only recorded when it MEANS something. A rung count beside `unknown` or
  // `none-heard` would be a number the app cannot stand behind.
  const hintsHeard =
    args.help === 'hints-heard' && Number.isSafeInteger(args.hintsHeard ?? NaN)
      ? (args.hintsHeard as number)
      : undefined

  const id = buildStudioNoteDocId(childId, versionId)
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
      hintsHeard,
    },
    // The voice module's own event id, when there was one. It is the join back
    // to `transcriptionEvents`, which already holds the transcript and the
    // child's edit of it; this does not copy any of that.
    notes: args.voiceEventId ? `voiceEventId:${args.voiceEventId}` : undefined,
  }

  const ref = doc(artifactsCollection(familyId), id)
  return runTransaction(db, async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists()) {
      const stored = existing.data()
      return {
        id,
        note: stored ? { ...stored, id } : note,
        alreadySaved: true,
      }
    }
    tx.set(ref, note)
    return { id, note, alreadySaved: false }
  })
}
