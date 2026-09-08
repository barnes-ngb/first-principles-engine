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

import type { ActivityConfig } from '../types'
import { EvidenceType } from '../types/enums'
import { mergeRecentTopic, readRecentTopics } from '../../features/progress/strand'
import {
  buildStrandArtifact,
  planStrandSession,
  type StrandSessionEvidence,
} from '../../features/progress/strandSession'
import { activityConfigsCollection, artifactsCollection, db } from './firestore'
import { generateFilename, uploadArtifactFile } from './upload'

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
  /** The topic as stored — hers, whitespace-normalized. */
  topic: string
}

/**
 * Thrown when a session is refused before anything is written. The message is
 * the parent-facing sentence from `STRAND_SESSION_REFUSALS`.
 */
export class StrandSessionRefused extends Error {}

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
export class StrandSessionPartiallySaved extends Error {}

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
  const { topic, kinds } = decision.plan

  const createdAt = new Date().toISOString()
  const base = {
    config: args.config,
    childId: args.childId,
    topic,
    createdAt,
    dayLogId: args.dayLogId,
    weekKey: args.weekKey,
  }
  const artifactIds: string[] = []

  // ── 1. Evidence ───────────────────────────────────────────────────────────
  // One artifact per kind, so a session that produced a photo AND a recording
  // reads as two pieces of evidence in the gallery rather than one with a
  // hidden attachment — which is how every other capture surface in the app
  // treats them.
  //
  // **The whole attempt rolls back on failure** (Codex round 1). Without it a
  // failed upload left real artifact documents behind while both callers said
  // *"Nothing was saved"* and offered a retry — so retrying duplicated the
  // evidence, or left a media-less artifact beside a complete one, while the
  // count moved once. The artifact-to-session relationship is the record this
  // feature exists to keep; a half-written one is worse than none.
  try {
    for (const type of kinds) {
      if (type === EvidenceType.Photo) {
        const files = args.evidence.photos ?? []
        const artifact = buildStrandArtifact({ ...base, type })
        const ref = await addDoc(artifactsCollection(args.familyId), artifact)
        artifactIds.push(ref.id)
        const urls: string[] = []
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const ext = file.name.split('.').pop() ?? 'jpg'
          // Index-prefixed so filenames stay distinct within the same millisecond.
          const filename = `${i}-${generateFilename(ext)}`
          const { downloadUrl } = await uploadArtifactFile(
            args.familyId,
            ref.id,
            file,
            filename,
          )
          urls.push(downloadUrl)
        }
        await updateDoc(doc(artifactsCollection(args.familyId), ref.id), {
          uri: urls[0],
          mediaUrls: urls,
        })
        continue
      }

      if (type === EvidenceType.Audio) {
        const blob = args.evidence.audio
        if (!blob) continue
        const artifact = buildStrandArtifact({ ...base, type })
        const ref = await addDoc(artifactsCollection(args.familyId), artifact)
        artifactIds.push(ref.id)
        const filename = generateFilename('webm')
        const { downloadUrl } = await uploadArtifactFile(
          args.familyId,
          ref.id,
          blob,
          filename,
        )
        await updateDoc(doc(artifactsCollection(args.familyId), ref.id), {
          uri: downloadUrl,
          mediaUrls: [downloadUrl],
        })
        continue
      }

      if (type === EvidenceType.Note) {
        const artifact = buildStrandArtifact({
          ...base,
          type,
          content: (args.evidence.note ?? '').trim(),
        })
        const ref = await addDoc(artifactsCollection(args.familyId), artifact)
        artifactIds.push(ref.id)
        continue
      }

      // Video — a link to what they watched. Written to `uri` AND `content`
      // (Codex round 1): `ArtifactCard` and the portfolio render `uri` only for
      // Photo and Audio, so a link-only session would have advanced the count
      // and produced an artifact whose URL could not be opened or even read.
      // `content` is the field a Note already renders as text, so the link is
      // legible everywhere before `ArtifactCard` grows its own Video case.
      const link = (args.evidence.videoUrl ?? '').trim()
      const artifact = buildStrandArtifact({
        ...base,
        type,
        uri: link,
        content: link,
      })
      const ref = await addDoc(artifactsCollection(args.familyId), artifact)
      artifactIds.push(ref.id)
    }
  } catch (err) {
    // Best-effort rollback, then report which of the two truths applies.
    const cleanup = await Promise.allSettled(
      artifactIds.map((id) =>
        deleteDoc(doc(artifactsCollection(args.familyId), id)),
      ),
    )
    if (cleanup.some((r) => r.status === 'rejected')) {
      throw new StrandSessionPartiallySaved(STRAND_SESSION_FAILED_PARTIAL)
    }
    throw err
  }

  // ── 2. The count, and the topic cache ─────────────────────────────────────
  // In a TRANSACTION (Codex round 1), because the two fields have different
  // concurrency needs and only one of them is safe as a blind write:
  //
  //   • `currentPosition` is an atomic `increment(1)` — still never a computed
  //     absolute, so the "the count only goes up" rail is untouched; and
  //   • `recentTopics` is an ordinary array, so two devices logging different
  //     topics from their own stale `args.config` would race last-write-wins
  //     and silently drop one topic from the suggestion cache — with the row's
  //     "Last topic" then naming the losing session.
  //
  // Reading the array inside the transaction makes the merge apply to whatever
  // is actually stored, and Firestore retries the whole unit on contention. The
  // increment sentinel is still what moves the count, so a retry cannot
  // double-count. A missing document is left alone rather than created: the
  // strand is being logged against, so it exists; inventing one here would
  // write a config with no name, type or owner.
  const configRef = doc(activityConfigsCollection(args.familyId), args.config.id)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(configRef)
    if (!snap.exists()) return
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

  return { artifactIds, topic }
}
