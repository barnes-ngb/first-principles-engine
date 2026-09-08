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

import { addDoc, doc, increment, updateDoc } from 'firebase/firestore'

import type { ActivityConfig } from '../types'
import { EvidenceType } from '../types/enums'
import {
  buildStrandArtifact,
  planStrandSession,
  type StrandSessionEvidence,
} from '../../features/progress/strandSession'
import { activityConfigsCollection, artifactsCollection } from './firestore'
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
  const { topic, recentTopics, kinds } = decision.plan

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
  for (const type of kinds) {
    if (type === EvidenceType.Photo) {
      const files = args.evidence.photos ?? []
      const artifact = buildStrandArtifact({ ...base, type })
      const ref = await addDoc(artifactsCollection(args.familyId), artifact)
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
      artifactIds.push(ref.id)
      continue
    }

    if (type === EvidenceType.Audio) {
      const blob = args.evidence.audio
      if (!blob) continue
      const artifact = buildStrandArtifact({ ...base, type })
      const ref = await addDoc(artifactsCollection(args.familyId), artifact)
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
      artifactIds.push(ref.id)
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

    // Video — a link to what they watched. Stored as the artifact's `uri`, the
    // same field a hosted file's download URL uses, so `ArtifactCard` and the
    // portfolio need no new case.
    const artifact = buildStrandArtifact({
      ...base,
      type,
      uri: (args.evidence.videoUrl ?? '').trim(),
    })
    const ref = await addDoc(artifactsCollection(args.familyId), artifact)
    artifactIds.push(ref.id)
  }

  // ── 2. The count, and the topic cache ─────────────────────────────────────
  // One update: `increment(1)` (never a computed absolute), plus the suggestion
  // list this session's topic moves to the front of.
  await updateDoc(doc(activityConfigsCollection(args.familyId), args.config.id), {
    currentPosition: increment(1),
    recentTopics,
    updatedAt: new Date().toISOString(),
  })

  return { artifactIds, topic }
}
