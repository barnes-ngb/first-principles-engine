// ── The one write that logs a strand session (UX-282) ────────────────────────
//
// Applies what `features/progress/strandSession.ts` decided. There is one
// entry point, and it is the only thing in the repo that moves a strand's
// count.
//
// ── Why the count can never go down ─────────────────────────────────────────
//
// `currentPosition` moves by an atomic Firestore `increment(1)`, never by a
// computed absolute value. That is the difference between a rule and a rail:
//
//   • no caller can pass a smaller number, because no caller passes a number;
//   • two captures racing on a phone (or a phone and a tablet) both land,
//     rather than the second overwriting the first with a stale read + 1; and
//   • deleting an artifact touches nothing here, so the count survives it —
//     the count is of afternoons that happened, and deleting a photo does not
//     un-happen the afternoon.
//
// This is deliberately NOT `setActivityConfigPosition`, whose documented
// contract is last-writer-wins on an absolute value ("he's on lesson 107 now").
// That is right for a bookmark a parent corrects and wrong for a tally.
//
// ── Order: evidence first, then the count ───────────────────────────────────
//
// The artifact is written and its media uploaded BEFORE the increment. Both
// orders can be interrupted, so the question is which leftover is honest:
//
//   • evidence with no count  → a session that happened, visible in the
//     gallery, whose tally is one short. Recoverable, and nothing claims
//     anything false.
//   • count with no evidence  → the strand says it did something it has no
//     record of, and `recentTopics` becomes the only trace of the topic — the
//     precise thing the evidence rule exists to prevent.
//
// So evidence first. A failed upload throws before the count moves.
//
// ── What this does NOT do ───────────────────────────────────────────────────
//
// **No hours.** A strand session logs minutes exactly as any other activity
// does — through its checklist item on the day, the ordinary
// `collectHoursContributions` path. There is no hours write here and there must
// never be one: a second route to a compliance figure is how two numbers start
// disagreeing.
//
// No XP, no skillSnapshots, no learnerModels, no day-log write.

import {
  addDoc,
  deleteDoc,
  doc,
  increment,
  runTransaction,
  updateDoc,
} from 'firebase/firestore'

import type { ActivityConfig, Artifact } from '../types'
import { EvidenceType } from '../types/enums'
import { mergeRecentTopic, readRecentTopics } from '../../features/progress/strand'
import {
  buildStrandArtifact,
  planStrandSession,
  type StrandSessionEvidence,
} from '../../features/progress/strandSession'
import { deleteObject, ref as storageRef } from 'firebase/storage'

import { activityConfigsCollection, artifactsCollection, db } from './firestore'
import { storage } from './storage'
import { artifactStoragePath, generateFilename, uploadArtifactFile } from './upload'

export interface LogStrandSessionArgs {
  familyId: string
  /** The strand being logged. Refused if it is not one. */
  config: ActivityConfig
  /** The child this session is recorded for. */
  childId: string
  topic: string
  evidence: StrandSessionEvidence
  /** `YYYY-MM-DD` of the day, when logged from a day surface. */
  dayLogId?: string
  weekKey?: string
}

export interface LogStrandSessionResult {
  artifactIds: string[]
  /**
   * The artifacts written, each carrying its id (Codex round 2).
   *
   * Returned so a caller holding a local evidence list can append them.
   * `TodayPage`'s `todayArtifacts` is filled by a one-shot `getDocs` that
   * reruns only on a family / child / date change, exactly as every other
   * capture path on that page already accounts for.
   */
  artifacts: Artifact[]
  /** The topic as stored — hers, whitespace-normalized. */
  topic: string
}

/**
 * Thrown when a session is refused before anything is written. The message is
 * the parent-facing sentence from `STRAND_SESSION_REFUSALS`.
 */
export class StrandSessionRefused extends Error {}

/**
 * Base for a failure that carries its own parent-facing sentence.
 *
 * Callers render `err.message` for anything under this and for
 * {@link StrandSessionRefused}; everything else gets the generic clean-failure
 * line. One base rather than a growing `instanceof` list at every call site.
 */
export class StrandSessionFailure extends Error {}

/**
 * Thrown when the strand was deleted while the dialog was open (Codex round 2).
 *
 * The transaction used to return quietly on a missing document, so the count
 * never moved, the topic was never filed — and `logStrandSession` reported
 * success, closing the dialog on *"Session recorded."* over artifacts belonging
 * to a row that no longer exists. A session that did not happen must not be
 * reported as one.
 */
export class StrandSessionGone extends StrandSessionFailure {}

/** What a caller renders when the strand vanished under the session. */
export const STRAND_SESSION_GONE_MESSAGE =
  'That activity was removed while this was open, so the session was not recorded.'

/**
 * Thrown when a session FAILED partway and its evidence could not be cleaned up
 * (Codex round 1).
 *
 * The ordinary failure path rolls the attempt back, so *"nothing was saved"* is
 * true and a retry starts clean. When the rollback itself fails — offline, a
 * permission error — some artifacts remain and the honest sentence is a
 * different one: telling her nothing was saved would send her to retry and
 * silently duplicate the evidence she can already see in the gallery.
 */
export class StrandSessionPartiallySaved extends StrandSessionFailure {}

/**
 * Was this delete rejected because there was nothing there?
 *
 * A storage path is registered BEFORE its upload is awaited (so an upload that
 * lands its bytes and then fails to return a URL is still cleaned up), which
 * means a rollback can legitimately ask Storage to delete an object that was
 * never created — the upload failed at `uploadBytes` itself. Storage answers
 * `storage/object-not-found`, and counting that as a failed cleanup told the
 * parent evidence may remain when nothing does, sending her to look for a file
 * that does not exist (Codex). Nothing there IS cleaned up. Every other
 * rejection still counts.
 */
const isAlreadyGone = (reason: unknown): boolean =>
  typeof reason === 'object' &&
  reason !== null &&
  (reason as { code?: unknown }).code === 'storage/object-not-found'

/** What a caller renders for a failure whose evidence WAS cleaned up. */
export const STRAND_SESSION_FAILED_CLEAN =
  'That session was not recorded. Nothing was saved — try again.'

/** ...and when it was not. Never invites a blind retry. */
export const STRAND_SESSION_FAILED_PARTIAL =
  'That session was not fully recorded. Some of what you captured was saved but the session was not counted — check the gallery before adding it again.'

/**
 * Log one strand session: evidence, then +1, then the topic cache.
 *
 * Returns the artifact ids written. Throws `StrandSessionRefused` for a session
 * that is not one (no topic, no evidence, not a strand) — the caller renders
 * the message rather than composing a second, softer wording of the same rule.
 */
export async function logStrandSession(
  args: LogStrandSessionArgs,
): Promise<LogStrandSessionResult> {
  const decision = planStrandSession(args.config, args.topic, args.evidence)
  if (!decision.ok) throw new StrandSessionRefused(decision.reason)
  // `recentTopics` from the plan is deliberately NOT used: the merge is redone
  // inside the transaction against whatever is actually stored, so a second
  // device's topic cannot be overwritten by this one's stale read.
  const { topic, kinds, link: sessionLink } = decision.plan

  const createdAt = new Date().toISOString()
  const base = {
    config: args.config,
    childId: args.childId,
    topic,
    createdAt,
    dayLogId: args.dayLogId,
    weekKey: args.weekKey,
  }

  // Everything this attempt created, so a failure can undo ALL of it.
  const artifacts: Artifact[] = []
  const artifactIds: string[] = []
  // Storage objects too (Codex round 2): deleting only the Firestore documents
  // left the uploaded files behind under `families/{id}/artifacts/{id}/…` while
  // the caller said "Nothing was saved" — private evidence retained after a
  // failure, and another orphaned copy on every retry.
  const storagePaths: string[] = []

  const record = (id: string, artifact: Omit<Artifact, 'id'>) => {
    artifactIds.push(id)
    artifacts.push({ ...artifact, id })
  }

  /**
   * Patch the returned copy with the media fields the follow-up write adds
   * (Codex round 3).
   *
   * `record` copies the artifact BEFORE `uri`/`mediaUrls` exist, and
   * `TodayPage` prepends these objects straight into `todayArtifacts`, whose
   * renderer and the checklist's photo resolver both key on those fields. An
   * unpatched copy meant the photo just captured stayed invisible until a
   * reload fetched the Firestore version — the very gap returning the artifacts
   * was meant to close.
   */
  const attachMedia = (id: string, urls: string[]) => {
    const stored = artifacts.find((a) => a.id === id)
    if (!stored || urls.length === 0) return
    stored.uri = urls[0]
    stored.mediaUrls = urls
  }

  /**
   * Undo the attempt, best effort. Returns false when anything survived, which
   * is a different sentence to the parent — never a blind "try again".
   */
  const rollback = async (): Promise<boolean> => {
    const docDeletes = await Promise.allSettled(
      artifactIds.map((id) =>
        deleteDoc(doc(artifactsCollection(args.familyId), id)),
      ),
    )
    const objectDeletes = await Promise.allSettled(
      storagePaths.map((path) => deleteObject(storageRef(storage, path))),
    )
    return (
      docDeletes.every((r) => r.status === 'fulfilled') &&
      objectDeletes.every(
        (r) => r.status === 'fulfilled' || isAlreadyGone(r.reason),
      )
    )
  }

  try {
    // ── 1. Evidence ─────────────────────────────────────────────────────────
    // One artifact per kind, so a session that produced a photo AND a recording
    // reads as two pieces of evidence in the gallery rather than one with a
    // hidden attachment — which is how every other capture surface in the app
    // treats them.
    for (const type of kinds) {
      if (type === EvidenceType.Photo) {
        const files = args.evidence.photos ?? []
        const artifact = buildStrandArtifact({ ...base, type })
        const ref = await addDoc(artifactsCollection(args.familyId), artifact)
        record(ref.id, artifact)
        const urls: string[] = []
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const ext = file.name.split('.').pop() ?? 'jpg'
          // Index-prefixed so filenames stay distinct within the same millisecond.
          const filename = `${i}-${generateFilename(ext)}`
          // Registered BEFORE the await (Codex round 3): `uploadArtifactFile`
          // uploads and then fetches the download URL, so a failure in the
          // second step leaves an object at this exact path with nothing handed
          // back to clean up.
          storagePaths.push(artifactStoragePath(args.familyId, ref.id, filename))
          const uploaded = await uploadArtifactFile(
            args.familyId,
            ref.id,
            file,
            filename,
          )
          urls.push(uploaded.downloadUrl)
        }
        await updateDoc(doc(artifactsCollection(args.familyId), ref.id), {
          uri: urls[0],
          mediaUrls: urls,
        })
        attachMedia(ref.id, urls)
        continue
      }

      if (type === EvidenceType.Audio) {
        const blob = args.evidence.audio
        if (!blob) continue
        const artifact = buildStrandArtifact({ ...base, type })
        const ref = await addDoc(artifactsCollection(args.familyId), artifact)
        record(ref.id, artifact)
        const filename = generateFilename('webm')
        storagePaths.push(artifactStoragePath(args.familyId, ref.id, filename))
        const uploaded = await uploadArtifactFile(
          args.familyId,
          ref.id,
          blob,
          filename,
        )
        await updateDoc(doc(artifactsCollection(args.familyId), ref.id), {
          uri: uploaded.downloadUrl,
          mediaUrls: [uploaded.downloadUrl],
        })
        attachMedia(ref.id, [uploaded.downloadUrl])
        continue
      }

      if (type === EvidenceType.Note) {
        const artifact = buildStrandArtifact({
          ...base,
          type,
          content: (args.evidence.note ?? '').trim(),
        })
        const ref = await addDoc(artifactsCollection(args.familyId), artifact)
        record(ref.id, artifact)
        continue
      }

      // Video — a link to what they watched, already normalized to an http(s)
      // URL by `planStrandSession` (a bare "youtube.com/…" would otherwise
      // reach an href as an app-relative path).
      //
      // Written to `uri` AND `content`. `content` is the load-bearing half: the
      // mounted renderers draw `uri` only for Photo and Audio, so `content` is
      // what makes the link READABLE in the Portfolio at all. It is not yet
      // CLICKABLE anywhere mounted — `ArtifactCard` gained a Video case but a
      // repo-wide search finds no import of that component (Codex round 3), so
      // that case renders to nobody today. Stated rather than implied, and
      // outstanding on the PR: the link is stored durably and can be read and
      // copied; a clickable renderer in the mounted surfaces plus the archive's
      // handling of a non-Storage URI is its own change.
      const link = sessionLink ?? ''
      const artifact = buildStrandArtifact({
        ...base,
        type,
        uri: link,
        content: link,
      })
      const ref = await addDoc(artifactsCollection(args.familyId), artifact)
      record(ref.id, artifact)
    }

    // ── 2. The count, and the topic cache ───────────────────────────────────
    // INSIDE the rollback's try (Codex round 2): this transaction was outside
    // it, so a failure here left every artifact in place while the caller
    // classified it as a clean failure and invited a retry that would duplicate
    // them all.
    //
    // A transaction because the two fields have different concurrency needs and
    // only one is safe as a blind write:
    //
    //   • `currentPosition` is an atomic `increment(1)` — still never a
    //     computed absolute, so the "the count only goes up" rail is untouched
    //     and a transaction retry cannot double-count; and
    //   • `recentTopics` is an ordinary array, so two devices logging different
    //     topics from their own stale `args.config` would race last-write-wins
    //     and silently drop one topic, with the row's "Last topic" then naming
    //     the losing session.
    const configRef = doc(activityConfigsCollection(args.familyId), args.config.id)
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(configRef)
      // The strand was deleted while the dialog was open. Returning quietly
      // here reported a session that never happened; the attempt is failed and
      // rolled back instead.
      if (!snap.exists()) throw new StrandSessionGone(STRAND_SESSION_GONE_MESSAGE)
      // The stored document is unvalidated Firestore data; `readRecentTopics`
      // does the structural narrowing, so the cast only gets it through the door.
      const stored = readRecentTopics(
        (snap.data() ?? {}) as Pick<ActivityConfig, 'recentTopics'>,
      )
      tx.update(configRef, {
        currentPosition: increment(1),
        recentTopics: mergeRecentTopic(stored, topic),
        updatedAt: new Date().toISOString(),
      })
    })
  } catch (err) {
    const clean = await rollback()
    if (!clean) throw new StrandSessionPartiallySaved(STRAND_SESSION_FAILED_PARTIAL)
    throw err
  }

  return { artifactIds, artifacts, topic }
}
