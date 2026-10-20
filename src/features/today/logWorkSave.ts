/**
 * *Log work* — one logical save, and a retry that cannot save it twice
 * (FIX-267).
 *
 * ── The problem this shape exists for ──────────────────────────────────────
 *
 * A parent log can touch three records: an `artifacts` document, its files in
 * Storage, and one `hours` row. The old card ran each pathway as a single
 * `addDoc`-then-upload-then-`addDoc` chain with no memory, so a failure in the
 * middle left the parent with an error, no statement of what HAD landed, and
 * one route forward: tap Save again. Tapping again called `addDoc` again — a
 * second artifact, or a second `hours` row for the same minutes. The
 * alternative, giving up, left an artifact with no file behind — `UX-432`'s
 * `artifact-media-missing`.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * **The document identity is decided BEFORE the first write.** A submission
 * carries ids generated client-side (`newLogWorkIds`) and the filenames its
 * uploads will use, frozen at the tap. Every write is therefore addressed to a
 * known document — `setDoc(…, { merge: true })` rather than `addDoc` — so the
 * SAME submission retried writes the SAME document with the same values. That
 * is what makes an ambiguous network failure safe: the honest answer to *"did
 * that commit?"* is *"it does not matter"*.
 *
 * **Progress is carried, so a retry only does what is left.** `LogWorkProgress`
 * records which stages landed and which files already uploaded; a retry
 * resumes from there. It is in-session memory only — state in the card, not a
 * document, not a collection, not a schema change — so the guarantee is
 * precisely this: **while the submission is held on this page, retrying it
 * writes the same documents.** A reload drops the identity, and a fresh save of
 * the same words afterwards is a new record; nothing here claims otherwise.
 *
 * **Nothing is ever deleted or rolled back.** A half-finished log leaves real
 * records that are real evidence; the outcome names them and the retry
 * finishes the rest.
 *
 * ── What it does not change ────────────────────────────────────────────────
 *
 * The payloads. The artifact keeps its existing fields (`FEAT-238`'s
 * `dayLogId`, the `tags` block, `content` for the parent's own words) and a
 * photo batch stays **one** artifact with `mediaUrls` and `uri` as its cover.
 * The `hours` row is the row this card has always written — same fields, same
 * `source`, same minutes — gated on `minutes > 0` and nowhere rounded,
 * inferred or re-derived. A log with no minutes writes no row at all.
 */
import { doc, setDoc, updateDoc } from 'firebase/firestore'

import { artifactsCollection, hoursCollection } from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import type { Artifact } from '../../core/types'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  type SubjectBucket,
} from '../../core/types/enums'

/** A file staged in the form, with the name it will always upload under. */
export interface LogWorkFile {
  file: Blob | File
  /** Frozen at submission, so a retry overwrites rather than orphaning. */
  filename: string
}

/**
 * The frozen snapshot of one tap of *Save work*.
 *
 * Everything a write needs is in here, so no write reads the form — the form
 * can be edited, the child can change and the day can move while a save is in
 * flight, and the record still belongs to what was submitted.
 */
export interface LogWorkSubmission {
  familyId: string
  /** The document identity, decided before the first write. */
  artifactId: string | null
  hoursId: string | null
  childId: string
  /** For the receipt and the bound retry card — never part of a payload. */
  childName: string
  day: string
  weekPlanId: string | undefined
  subjectBucket: SubjectBucket
  activityName: string
  note: string
  minutes: number
  /** `null` when the log files no evidence (a time-only log). */
  evidenceType: EvidenceType | null
  files: LogWorkFile[]
  /** Frozen, so a retry does not re-date the record. */
  createdAt: string
  /** What a receipt calls this evidence — *"your note and 2 photos"*. */
  evidenceWord: string | null
}

/** Which parts of a submission have landed. In-session only. */
export interface LogWorkProgress {
  artifactWritten: boolean
  /** Download URLs, index-aligned with the leading files of the submission. */
  uploadedUrls: string[]
  /** The artifact document carries its media addresses. */
  mediaLinked: boolean
  hoursWritten: boolean
}

export const NO_LOG_WORK_PROGRESS: LogWorkProgress = {
  artifactWritten: false,
  uploadedUrls: [],
  mediaLinked: false,
  hoursWritten: false,
}

/** The three things a log can be in the middle of. */
export type LogWorkStage = 'evidence' | 'upload' | 'hours'

export interface LogWorkOutcome {
  /** Everything that landed, including on the attempt that failed. */
  progress: LogWorkProgress
  /** `complete` — the whole submission is written. */
  status: 'complete' | 'partial'
  /** Where it stopped, or `null` when nothing stopped. */
  failedStage: LogWorkStage | null
  /**
   * The artifact as stored, for the evidence list's optimistic append — only
   * once its media is linked, so the list never shows a record as complete
   * while its files are still missing.
   */
  artifact: Artifact | null
}

/** Is every part of this submission accounted for? */
export function logWorkComplete(
  submission: LogWorkSubmission,
  progress: LogWorkProgress,
): boolean {
  if (submission.artifactId && !progress.artifactWritten) return false
  if (progress.uploadedUrls.length < submission.files.length) return false
  if (submission.files.length > 0 && !progress.mediaLinked) return false
  if (submission.hoursId && !progress.hoursWritten) return false
  return true
}

/**
 * Document ids for one submission, generated client-side.
 *
 * `doc(collection)` is Firestore's own id generator, which is why no new schema
 * or counter is needed to make a retry idempotent: the id exists before the
 * first attempt and belongs to this submission alone.
 */
export function newLogWorkIds(
  familyId: string,
  needs: { evidence: boolean; hours: boolean },
): { artifactId: string | null; hoursId: string | null } {
  return {
    artifactId: needs.evidence ? doc(artifactsCollection(familyId)).id : null,
    hoursId: needs.hours ? doc(hoursCollection(familyId)).id : null,
  }
}

/** The upload names for a staged set of files, frozen once per submission. */
export function logWorkFilenames(files: readonly (Blob | File)[]): LogWorkFile[] {
  return files.map((file, index) => {
    const name = file instanceof File ? file.name : ''
    const ext = name.includes('.') ? (name.split('.').pop() || 'bin') : defaultExt(file)
    // Index-prefixed so two files of one batch stay distinct inside one
    // millisecond — the existing batch rule, kept.
    return { file, filename: `${index}-${generateFilename(ext)}` }
  })
}

function defaultExt(file: Blob | File): string {
  if (file.type.startsWith('image/')) return file.type.slice('image/'.length) || 'jpg'
  if (file.type.startsWith('audio/')) return 'webm'
  return 'bin'
}

/**
 * The `hours` row this card writes. One row, the existing shape, the minutes as
 * submitted.
 *
 * Exported so a test can pin it against the row the card wrote before this run
 * without re-deriving it here.
 */
export function buildLogWorkHoursRow(submission: LogWorkSubmission) {
  const activity = submission.activityName.trim()
  const note = submission.note.trim()
  const notes = activity ? (note ? `${activity}: ${note}` : activity) : note
  return {
    childId: submission.childId,
    date: submission.day,
    minutes: submission.minutes,
    subjectBucket: submission.subjectBucket,
    location: LearningLocation.Home,
    source: 'unified-capture',
    quickCapture: true,
    notes: notes || 'Capture',
  }
}

/**
 * The artifact this card writes.
 *
 * **The parent's typed note rides with the media.** It lands in `content`,
 * which `todayEvidence.evidenceDetails` already renders for every type — so a
 * photo saved with a note shows the note on *Today's evidence* and in the
 * Portfolio instead of the note being dropped, which is the reported defect.
 */
export function buildLogWorkArtifact(submission: LogWorkSubmission) {
  const activity = submission.activityName.trim()
  const type = submission.evidenceType ?? EvidenceType.Note
  // The titles this card has always written, unchanged — a record's title is
  // what the Portfolio and the day's evidence list show, so a rename here
  // would silently re-caption every log a family has.
  const fallback =
    type === EvidenceType.Photo
      ? `Photo ${submission.day}`
      : type === EvidenceType.Audio
        ? `Audio ${submission.day}`
        : `Capture ${submission.day}`
  const title =
    activity ||
    (type === EvidenceType.Note ? submission.note.trim().slice(0, 60) : '') ||
    fallback
  return {
    title,
    type,
    createdAt: submission.createdAt,
    childId: submission.childId,
    dayLogId: submission.day,
    weekPlanId: submission.weekPlanId,
    tags: {
      engineStage: EngineStage.Build,
      domain: '',
      subjectBucket: submission.subjectBucket,
      location: LearningLocation.Home,
    },
    notes: '',
    // The parent's own words, in the field every reader already renders — and
    // ABSENT rather than empty when there are none, so a photo logged without a
    // note stores exactly what it stored before.
    ...(submission.note.trim() ? { content: submission.note } : {}),
    activityName: activity || undefined,
  }
}

/**
 * Run (or resume) one submission.
 *
 * Stages in order, each skipped when `progress` already says it landed:
 *
 *   1. **evidence** — the artifact document, at its own id;
 *   2. **upload** — the files that have not uploaded yet, then ONE `updateDoc`
 *      linking every address onto that document;
 *   3. **hours** — the single row, at its own id.
 *
 * It never throws: a failure comes back as a `partial` outcome naming the stage
 * and carrying everything that DID land, because the caller's job is to tell
 * the parent exactly that.
 */
export async function executeLogWorkSave(
  submission: LogWorkSubmission,
  progress: LogWorkProgress,
): Promise<LogWorkOutcome> {
  const state: LogWorkProgress = {
    artifactWritten: progress.artifactWritten,
    uploadedUrls: [...progress.uploadedUrls],
    mediaLinked: progress.mediaLinked,
    hoursWritten: progress.hoursWritten,
  }
  const { familyId, artifactId } = submission
  const stored = buildLogWorkArtifact(submission)

  /**
   * The stored record, WHENEVER the evidence half is known complete — even if a
   * later stage then failed.
   *
   * A note that saved is on the day; the day's list must show it rather than
   * reading *"Nothing captured yet today"* while the receipt says it saved. So
   * the artifact rides on the partial outcome too, and only once its media is
   * linked, so the list never shows a record as whole while its files are not.
   */
  const publishable = (): Artifact | null => {
    if (!artifactId || !state.artifactWritten) return null
    if (submission.files.length > 0 && !state.mediaLinked) return null
    return {
      ...stored,
      id: artifactId,
      ...(state.uploadedUrls.length
        ? { uri: state.uploadedUrls[0], mediaUrls: state.uploadedUrls }
        : {}),
    } as Artifact
  }

  if (artifactId && !state.artifactWritten) {
    try {
      // `merge: true` at a known id: the retry of an ambiguous failure rewrites
      // the same values rather than creating a second record, and cannot take
      // away a field another stage has already added.
      //
      // The day stamp is restated HERE as well as in the builder, deliberately:
      // `todayArtifactWriters.source.test` asks each write whether IT stamps
      // the day, and a stamp that lives behind a function call is a stamp the
      // guard cannot see. Same value, at the write, where the rule is.
      const artifact = { ...stored, dayLogId: submission.day }
      await setDoc(doc(artifactsCollection(familyId), artifactId), artifact, { merge: true })
      state.artifactWritten = true
    } catch (err) {
      console.error('[logWorkSave] evidence write failed', err)
      return { progress: state, status: 'partial', failedStage: 'evidence', artifact: null }
    }
  }

  if (artifactId && submission.files.length > 0) {
    for (let i = state.uploadedUrls.length; i < submission.files.length; i += 1) {
      const { file, filename } = submission.files[i]
      try {
        const { downloadUrl } = await uploadArtifactFile(familyId, artifactId, file, filename)
        state.uploadedUrls.push(downloadUrl)
      } catch (err) {
        console.error('[logWorkSave] upload failed', err)
        return { progress: state, status: 'partial', failedStage: 'upload', artifact: null }
      }
    }
    if (!state.mediaLinked) {
      try {
        await updateDoc(doc(artifactsCollection(familyId), artifactId), {
          uri: state.uploadedUrls[0],
          mediaUrls: state.uploadedUrls,
        })
        state.mediaLinked = true
      } catch (err) {
        console.error('[logWorkSave] linking media failed', err)
        return { progress: state, status: 'partial', failedStage: 'upload', artifact: null }
      }
    }
  }

  if (submission.hoursId && !state.hoursWritten) {
    try {
      const row = buildLogWorkHoursRow(submission)
      await setDoc(doc(hoursCollection(familyId), submission.hoursId), row, { merge: true })
      state.hoursWritten = true
    } catch (err) {
      console.error('[logWorkSave] hours write failed', err)
      // The evidence is whole and is the day's record now, whatever the hours
      // row did — so it is published rather than held back until the retry.
      return {
        progress: state,
        status: 'partial',
        failedStage: 'hours',
        artifact: publishable(),
      }
    }
  }

  return {
    progress: state,
    status: 'complete',
    failedStage: null,
    artifact: publishable(),
  }
}

/** What landed, and what is unconfirmed, as a parent reads it. */
export interface LogWorkPartialReport {
  /** What is KNOWN saved — *"Your note saved."* — or `null` when nothing is. */
  saved: string | null
  /** What is not confirmed. Never a claim that it did not happen. */
  unsaved: string
  /** The words on the retry button. */
  retryLabel: string
}

/**
 * The honest account of a partial save.
 *
 * **A failed write is an unanswered one.** The client learns that a write threw;
 * it does not learn whether the server took it. A dropped acknowledgement is
 * the common case on a phone, and *"did not save"* over a row that did save is
 * a false statement in a records app — so anything unconfirmed is said as
 * unconfirmed. The retry is what makes that wording safe to use: it writes the
 * same document id, so an unanswered write and a refused one are finished the
 * same way.
 *
 * Only `saved` asserts, and only where the write was acknowledged.
 */
export function describeLogWorkPartial(
  submission: LogWorkSubmission,
  outcome: LogWorkOutcome,
): LogWorkPartialReport {
  const minutes = submission.minutes
  const evidence = submission.evidenceWord ?? 'the entry'
  if (outcome.failedStage === 'evidence') {
    return {
      saved: null,
      unsaved: `Couldn’t confirm ${evidence} saved.`,
      retryLabel: 'Try again',
    }
  }
  if (outcome.failedStage === 'upload') {
    const landed = outcome.progress.uploadedUrls.length
    const total = submission.files.length
    // All the bytes are up and only the document's link to them is unanswered:
    // a different fact from a file that never uploaded, and the one the
    // `artifact-media-missing` flag is about.
    const linkOnly = landed === total && !outcome.progress.mediaLinked
    return {
      saved: landed > 0 ? `The entry and ${landed} of ${total} files saved.` : 'The entry saved.',
      unsaved: linkOnly
        ? 'Couldn’t confirm the entry is linked to them.'
        : `Couldn’t confirm ${total - landed} of ${total} uploaded.`,
      retryLabel: 'Finish uploading',
    }
  }
  // 'hours' — the evidence is acknowledged; only the minutes are unanswered.
  return {
    saved: submission.artifactId ? `${capitalise(evidence)} saved.` : null,
    unsaved: `Couldn’t confirm the ${minutes} minutes saved.`,
    retryLabel: `Retry ${minutes} min`,
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * The receipt for a RETRY, which always names the child and day it finished
 * for.
 *
 * Not `captureDraftOwnership`'s wording, deliberately: those three forms answer
 * *"is the draft on screen still the one that was submitted?"*, and a retry is
 * not about the draft on screen at all — it is a bound card finishing a log
 * that was submitted earlier. Naming the identity unconditionally is the one
 * thing that cannot be read as a claim about whoever the page is showing now.
 */
export function logWorkRetryReceipt(
  submission: LogWorkSubmission,
  base: string,
): string {
  return `${base} — finished for ${submission.childName} on ${submission.day}`
}

/**
 * The receipt base for a partial save — never wording that claims the save
 * finished.
 *
 * A whole sentence ending in a full stop, because it is read through
 * `captureErrorText`: that is the one of the three receipt forms whose suffix
 * follows a finished sentence, and a partial save IS a failure that happens to
 * have landed something. `captureSuccessText`'s *"that earlier capture saved"*
 * would be a claim this outcome does not support.
 */
export function logWorkPartialBase(report: LogWorkPartialReport): string {
  return report.saved ? `${report.saved} ${report.unsaved}` : report.unsaved
}
