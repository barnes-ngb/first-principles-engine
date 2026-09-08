// ── What a strand session IS, decided before anything is written (UX-282) ────
//
// A session is **one increment plus one topic**, and it leaves evidence.
//
// Pure: no React, no Firestore, no clock, no upload. The writer
// (`core/firebase/strandSessionWrites.ts`) applies what this module decides, so
// every rule below is testable without a network.
//
// ── The three rules ─────────────────────────────────────────────────────────
//
// **1. The count only goes up.** `currentPosition` moves by exactly +1 per
// session and never down — not when an artifact is deleted, not when a session
// is edited, not when a topic is corrected. The count is of afternoons that
// happened; deleting a photo does not un-happen the afternoon. The writer
// enforces this structurally with an atomic Firestore `increment(1)` rather
// than a read-modify-write, so two captures racing on a phone cannot land on
// the same number and no code path anywhere can pass a smaller value.
//
// **2. A topic is required.** The count says how much; the topic says what.
// A session with no topic is a number with nothing attached, which is the pile
// of captures this feature exists to turn into a thread.
//
// **3. Evidence is required, and that is what keeps the topic honest.**
// `ActivityConfig.recentTopics` is a capped, most-recent-first suggestion cache
// — it is trimmed from the oldest end and is therefore lossy by design. It may
// never be the only record of a topic. Requiring evidence is what makes that
// true rather than merely hoped: every session writes its topic onto the
// `Artifact` it captured, which is never trimmed, so the cache stays *derived*.
// A note counts as evidence, so the bar is one typed or spoken sentence — and
// the prompt's own definition of a strand is "each return has a topic and
// leaves evidence".

import type { Artifact, ArtifactTags } from '../../core/types'
import { EngineStage, EvidenceType, LearningLocation } from '../../core/types/enums'
import type { ActivityConfig } from '../../core/types'
import { isStrand, mergeRecentTopic, normalizeTopic, readRecentTopics } from './strand'

/** What a parent captured for one session. Any one of these satisfies rule 3. */
export interface StrandSessionEvidence {
  /** Photos — one artifact for the batch, as every other capture surface does. */
  photos?: File[]
  /** A recording. */
  audio?: Blob | null
  /** A typed or spoken line. */
  note?: string
  /** A link — "the video we watched". */
  videoUrl?: string
}

export const STRAND_SESSION_REFUSALS = {
  notAStrand: 'That activity is not a strand, so it has no sessions to log.',
  noTopic: 'Give this session a topic first — what was it about?',
  noEvidence:
    'Add a photo, a recording, a note or a link. A session records what actually happened, and that record is what keeps the topic.',
} as const

export type StrandSessionRefusal =
  (typeof STRAND_SESSION_REFUSALS)[keyof typeof STRAND_SESSION_REFUSALS]

export interface StrandSessionPlan {
  /** The topic exactly as it will be stored — hers, whitespace-normalized. */
  topic: string
  /** `recentTopics` after this session. */
  recentTopics: string[]
  /** Which evidence kinds this session actually carries. */
  kinds: EvidenceType[]
}

export type StrandSessionDecision =
  | { ok: true; plan: StrandSessionPlan }
  | { ok: false; reason: StrandSessionRefusal }

/** Does this evidence carry anything at all? */
export function hasEvidence(evidence: StrandSessionEvidence): boolean {
  return evidenceKinds(evidence).length > 0
}

/**
 * The evidence kinds present, in a fixed order.
 *
 * Fixed rather than insertion-ordered so a session's artifacts are written in a
 * predictable order and the tests do not depend on which control she tapped
 * first. A blank note or a whitespace-only link is not evidence.
 */
export function evidenceKinds(evidence: StrandSessionEvidence): EvidenceType[] {
  const kinds: EvidenceType[] = []
  if (evidence.photos && evidence.photos.length > 0) kinds.push(EvidenceType.Photo)
  if (evidence.audio) kinds.push(EvidenceType.Audio)
  if (evidence.note && evidence.note.trim()) kinds.push(EvidenceType.Note)
  if (evidence.videoUrl && evidence.videoUrl.trim()) kinds.push(EvidenceType.Video)
  return kinds
}

/**
 * Decide whether this is a session, and what it would store.
 *
 * Refuses rather than half-writing: a session that cannot keep its own topic is
 * not logged at all, because a count that rose with nothing attached to it is
 * exactly the record this feature was built to replace.
 */
export function planStrandSession(
  config: Pick<ActivityConfig, 'type' | 'recentTopics'>,
  rawTopic: string,
  evidence: StrandSessionEvidence,
): StrandSessionDecision {
  if (!isStrand(config)) {
    return { ok: false, reason: STRAND_SESSION_REFUSALS.notAStrand }
  }
  const topic = normalizeTopic(rawTopic)
  if (!topic) return { ok: false, reason: STRAND_SESSION_REFUSALS.noTopic }

  const kinds = evidenceKinds(evidence)
  if (kinds.length === 0) {
    return { ok: false, reason: STRAND_SESSION_REFUSALS.noEvidence }
  }

  return {
    ok: true,
    plan: {
      topic,
      recentTopics: mergeRecentTopic(readRecentTopics(config), topic),
      kinds,
    },
  }
}

/**
 * The artifact one session's evidence is written as.
 *
 * `activityConfigId` + `topic` are the join and the durable record (UX-282).
 * Everything else is the ordinary artifact shape every other capture surface
 * writes — deliberately, so a strand artifact renders in `ArtifactGallery`, is
 * scored for the portfolio and reaches the compliance pack with no special
 * case anywhere.
 *
 * The title is the topic, not the strand's name: "Ancient Egypt" is what a
 * person looking at a gallery of a year's evidence needs to read. The strand it
 * belongs to is on the join, and the row is one tap away.
 */
export function buildStrandArtifact(args: {
  config: Pick<ActivityConfig, 'id' | 'name' | 'subjectBucket'>
  childId: string
  topic: string
  type: EvidenceType
  createdAt: string
  dayLogId?: string
  weekKey?: string
  content?: string
  uri?: string
}): Omit<Artifact, 'id'> {
  const tags: ArtifactTags = {
    engineStage: EngineStage.Build,
    domain: '',
    subjectBucket: args.config.subjectBucket,
    location: LearningLocation.Home,
    // The strand's name, so an artifact reads as belonging to a program even
    // where the join is not resolved — the same job `planItem` does elsewhere.
    planItem: args.config.name,
  }
  const artifact: Omit<Artifact, 'id'> = {
    childId: args.childId,
    title: args.topic,
    type: args.type,
    createdAt: args.createdAt,
    tags,
    activityConfigId: args.config.id,
    topic: args.topic,
  }
  if (args.dayLogId) artifact.dayLogId = args.dayLogId
  if (args.weekKey) artifact.weekKey = args.weekKey
  if (args.content) artifact.content = args.content
  if (args.uri) artifact.uri = args.uri
  return artifact
}
