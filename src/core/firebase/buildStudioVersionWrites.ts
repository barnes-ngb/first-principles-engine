// ── The one write that saves a Build Studio version (LOCAL-BUILD-001) ────────
//
// `buildStudioVersions` and nothing else. The list of what this module
// deliberately cannot reach is the point of the feature, and it is enforced by
// its own test rather than described: the `./firestore` mock in
// `buildStudioVersionWrites.test.ts` exports exactly the two helpers below, and
// vitest throws on access to any other export of a mocked module. So a future
// edit that reached for one of these would fail at that line:
//
//   • no `hours`, `hoursAdjustments` or `days` — building a game is not time
//     logged here, and this slice adds no hours writer of its own;
//   • no `xpLedger`, no `dailyArmorSessions` — a saved version earns nothing;
//   • no `skillSnapshots`, `childSkillMaps`, `learnerModels` or `evaluations` —
//     a child changing a 3 to a 4 is not an assessment, and an evidence ref
//     that is not derived would currently suppress the working-level
//     projection. A build-evidence contributor is separately designed;
//   • no `activityConfigs` — no position moves;
//   • no `artifacts` and no Storage from HERE. The optional spoken reflection
//     is a separate, separately-confirmed write (`buildStudioNoteWrites.ts`),
//     so a failed note can never take a saved version with it and a saved
//     version can never imply a note.
//
// Those are `CLAUDE.md`'s propose-and-confirm rails. An isolated collection is
// what makes this a small change rather than a proposal against all of them.
//
// ── Immutable, and idempotent on retry ──────────────────────────────────────
//
// One document per Save ACTION, at an id built from the action's own
// `versionId`, inside a transaction that **creates, or confirms the identical
// payload is already there, or refuses**. Three outcomes rather than two,
// because the interesting case on a phone is the middle one: the first attempt
// may well have committed and lost its answer.
//
//   created      — this call wrote the version.
//   alreadySaved — the document is there and its archive is character-for-
//                  character the one being sent. The child's work is on the
//                  record; the receipt is for the STORED row.
//   refused      — the document is there and holds DIFFERENT bytes. That is
//                  never written over: a version is the record of a moment, and
//                  silently replacing it would destroy the thing this feature
//                  exists to keep. The caller is told, and offers a new save.
//
// The identity check is an exact string comparison of the canonical archive,
// not a hash comparison. A digest is stored for people to read; the rule reads
// the bytes.

import { doc, runTransaction } from 'firebase/firestore'

import {
  BUILD_STUDIO_MAX_ARCHIVE_CHARS,
  BUILD_STUDIO_MAX_FILES,
  BUILD_STUDIO_MAX_FILE_CHARS,
  buildStudioSourceDigest,
  buildStudioSourceKeys,
  buildStudioVersionDocId,
  serializeBuildStudioSource,
  type BuildStudioSourceFiles,
  type BuildStudioVersion,
} from '../types/buildStudio'
import { buildStudioVersionsCollection, db } from './firestore'

/** Thrown before anything is written. The message is child-readable. */
export class BuildStudioRefused extends Error {}

/**
 * Narrow on purpose: both of these become part of a document path, so a value
 * carrying a slash would address a different collection entirely.
 */
const PATH_SAFE = /^[A-Za-z0-9_-]{4,64}$/

export const BUILD_STUDIO_VERSION_CONFLICT =
  'A different save is already stored under that name. Saving again as a new version.'

export interface SaveBuildStudioVersionArgs {
  /** The family the Save was started under, pinned by the caller. */
  familyId: string
  /** The child the Save was started FOR — never the live active child. */
  childId: string
  /** The project the Save was started on. */
  projectId: string
  /** ONE deterministic id per Save action, reused verbatim by its retry. */
  versionId: string
  /** The exact files the editor handed over. */
  files: BuildStudioSourceFiles
  /** What to call this version. Trimmed; a blank one gets the fallback. */
  label?: string
  /** ISO stamp. Injected so a test pins it rather than reading the clock. */
  createdAt?: string
  /** What the editor said it is, recorded rather than assumed. */
  editorTarget?: string
  editorTargetVersion?: string
  /** The authored goal in play, when there was one. */
  goalId?: string
  /** The visit that produced this save — diagnostic. */
  visitId?: string
}

export type SaveBuildStudioVersionOutcome = 'created' | 'alreadySaved'

export interface SaveBuildStudioVersionResult {
  /** The version on the record — the one just written, or the one there. */
  version: BuildStudioVersion
  /**
   * Which of the two non-refusal outcomes this was. `alreadySaved` is a retry
   * whose first attempt landed; it is not an error, and the caller may say
   * "Saved" for it, because the bytes on the record are the bytes it sent.
   */
  outcome: SaveBuildStudioVersionOutcome
}

const DEFAULT_LABEL = 'My version'
/** The longest label this will store. Refused, never truncated. */
export const BUILD_STUDIO_LABEL_MAX = 60

/**
 * Save one version. Returns the version on the record and whether this call is
 * the one that put it there.
 *
 * Throws {@link BuildStudioRefused} for anything it will not store, with the
 * sentence the caller renders. Nothing partial is ever left behind: there is
 * exactly one write, and every check runs before the transaction opens.
 *
 * **It says nothing about having saved.** The caller may only tell a child
 * "Saved" once this promise resolves — an editor save event is not a durable
 * app save, and this function returning is the only thing that is.
 */
export async function saveBuildStudioVersion(
  args: SaveBuildStudioVersionArgs,
): Promise<SaveBuildStudioVersionResult> {
  const { familyId, childId, projectId, versionId, files } = args

  if (!familyId) throw new BuildStudioRefused('No family is signed in.')
  // An empty child id would silently write to `__{projectId}__…` — a version
  // belonging to nobody, in a collection whose whole access rule is the child.
  if (!childId || /[/\s]/.test(childId)) {
    throw new BuildStudioRefused('No child is picked for this save.')
  }
  if (!PATH_SAFE.test(projectId)) {
    throw new BuildStudioRefused('That game could not be identified. Open it again.')
  }
  if (!PATH_SAFE.test(versionId)) {
    throw new BuildStudioRefused('That save could not be identified. Try saving again.')
  }

  const label = (args.label ?? '').trim() || DEFAULT_LABEL
  if (label.length > BUILD_STUDIO_LABEL_MAX) {
    throw new BuildStudioRefused(
      `Keep the name under ${BUILD_STUDIO_LABEL_MAX} letters.`,
    )
  }

  const createdAt = args.createdAt ?? new Date().toISOString()
  if (Number.isNaN(new Date(createdAt).getTime())) {
    throw new BuildStudioRefused('Could not stamp the time of this save, so nothing was saved.')
  }

  // ── The source itself ────────────────────────────────────────────────
  //
  // Checked here as well as at the bridge, for the reason the native-progress
  // writer re-validates its form's numbers: the bridge decides what to TELL a
  // child, and this decides what may be STORED. A caller arriving with an
  // empty file map is a bug, and a writer that trusted it would record the bug
  // as the child's game.
  if (!files || typeof files !== 'object') {
    throw new BuildStudioRefused('There was no game source to save.')
  }
  const keys = buildStudioSourceKeys(files)
  if (keys.length === 0) {
    throw new BuildStudioRefused('There was no game source to save.')
  }
  if (keys.length > BUILD_STUDIO_MAX_FILES) {
    throw new BuildStudioRefused(
      `That game has ${keys.length} files, which is more than this can store.`,
    )
  }
  // A blocks project with no `main.ts` is not a playable program, and a project
  // with no manifest cannot be reopened by any editor. Both are refused rather
  // than stored as a version that would fail to restore later — "a read failure
  // is not an empty shelf", and neither is an unrestorable save.
  for (const required of ['pxt.json', 'main.ts']) {
    if (typeof files[required] !== 'string' || files[required].trim() === '') {
      throw new BuildStudioRefused(
        "The editor didn't hand over the whole game. Nothing was saved — try Save again.",
      )
    }
  }
  for (const key of keys) {
    if (files[key].length > BUILD_STUDIO_MAX_FILE_CHARS) {
      throw new BuildStudioRefused(`"${key}" is too big to store.`)
    }
  }

  const sourceArchive = serializeBuildStudioSource(files)
  if (sourceArchive.length > BUILD_STUDIO_MAX_ARCHIVE_CHARS) {
    throw new BuildStudioRefused(
      'This game got too big to save here. Use Download a copy so nothing is lost.',
    )
  }

  const id = buildStudioVersionDocId(childId, projectId, versionId)
  const version: BuildStudioVersion = {
    id,
    childId,
    projectId,
    versionId,
    label,
    createdAt,
    sourceArchive,
    byteSize: sourceArchive.length,
    fileCount: keys.length,
    sourceDigest: buildStudioSourceDigest(sourceArchive),
    editorTarget: args.editorTarget,
    editorTargetVersion: args.editorTargetVersion,
    goalId: args.goalId,
    visitId: args.visitId,
  }

  const ref = doc(buildStudioVersionsCollection(familyId), id)

  return runTransaction(db, async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists()) {
      const stored = existing.data()
      // The exact bytes, not a digest of them. A retry sending the same source
      // resolves; a DIFFERENT source under the same action id is a bug in the
      // caller's id discipline and must not overwrite a record.
      if (stored?.sourceArchive === sourceArchive) {
        return {
          version: { ...stored, id },
          outcome: 'alreadySaved' as const,
        }
      }
      throw new BuildStudioRefused(BUILD_STUDIO_VERSION_CONFLICT)
    }
    tx.set(ref, version)
    return { version, outcome: 'created' as const }
  })
}
