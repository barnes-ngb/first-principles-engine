import type {
  EvaluationDomain,
  MasteryGate,
  SkillLevel,
} from './enums'
import type { SkillTag } from './common'
import type { ChatMessage } from './planning'

export interface Evaluation {
  id?: string
  childId: string
  monthStart: string
  monthEnd: string
  wins: string[]
  struggles: string[]
  nextSteps: string[]
  sampleArtifactIds: string[]
  createdAt?: string
  updatedAt?: string
}

// ── Lincoln Evaluation — Skill Snapshot ────────────────────────

export interface PrioritySkill {
  tag: SkillTag
  label: string
  level: SkillLevel
  notes?: string
  /** Mastery gate level (0-3). Only Level 3 unlocks skip recommendations. */
  masteryGate?: MasteryGate
}

export interface SupportDefault {
  label: string
  description: string
}

export interface StopRule {
  label: string
  trigger: string
  action: string
}

export interface EvidenceDefinition {
  label: string
  description: string
}

export const ConceptualBlockStatus = {
  AddressNow: 'ADDRESS_NOW',
  Defer: 'DEFER',
  Resolving: 'RESOLVING',
  Resolved: 'RESOLVED',
} as const
export type ConceptualBlockStatus =
  (typeof ConceptualBlockStatus)[keyof typeof ConceptualBlockStatus]

export const ConceptualBlockSource = {
  Evaluation: 'evaluation',
  Quest: 'quest',
  Scan: 'scan',
  Parent: 'parent',
} as const
export type ConceptualBlockSource =
  (typeof ConceptualBlockSource)[keyof typeof ConceptualBlockSource]

export interface ConceptualBlock {
  name: string
  affectedSkills: string[]
  recommendation: 'ADDRESS_NOW' | 'DEFER'
  rationale: string
  strategies?: string[]
  deferNote?: string
  detectedAt: string
  /** Evaluation session ID that created this block. Empty string for non-eval sources. */
  evaluationSessionId: string

  // ── Phase 1: lifecycle + multi-writer fields (all optional for backward compat) ──

  /** Stable unique ID (slugified skill name). Enables merge-by-ID writes. */
  id?: string
  /** Extended lifecycle status. Takes precedence over `recommendation` when present. */
  status?: ConceptualBlockStatus
  /** Short single-source evidence string for this block. */
  evidence?: string
  /** ISO — when this block was first created. May differ from detectedAt if reinforced. */
  firstDetectedAt?: string
  /** ISO — most recent time new evidence was added. */
  lastReinforcedAt?: string
  /** How many sessions (quest, eval, scan, parent tap) have seen this block. */
  sessionCount?: number
  /** ISO — when this block was marked RESOLVED. */
  resolvedAt?: string
  /** What first detected this block. */
  source?: ConceptualBlockSource
  /** Most recent reinforcement source. */
  lastSource?: ConceptualBlockSource
  /** Concrete words the child struggles with (e.g. ['bed','bid','ten','tin']). */
  specificWords?: string[]
  /** Question IDs or short descriptions that triggered detection. */
  specificQuestions?: string[]
  /** Cumulative correct answers observed on this blocked skill across sessions. */
  correctAttempts?: number
  /** Cumulative total attempts observed on this blocked skill across sessions. */
  totalAttempts?: number
}

// ── Working Levels (per-domain quest progression) ──────────────

export const WorkingLevelSource = {
  Quest: 'quest',
  Evaluation: 'evaluation',
  Curriculum: 'curriculum',
  Manual: 'manual',
} as const
export type WorkingLevelSource = (typeof WorkingLevelSource)[keyof typeof WorkingLevelSource]

export interface WorkingLevel {
  level: number // 1-based, matches quest level scale
  updatedAt: string // ISO timestamp
  source: WorkingLevelSource // what kind of evidence set this
  evidence?: string // short human-readable note
}

/**
 * Outcome of a *sufficient* quest's effect on a domain's working level.
 * Visibility-only — describes what the (unchanged) conservative level did, never
 * drives it. `rose` = the working level climbed; `held` = it stayed where it was
 * (the conservative level often holds a notch below the session high-water mark).
 */
export const QuestOutcome = {
  Held: 'held',
  Rose: 'rose',
} as const
export type QuestOutcome = (typeof QuestOutcome)[keyof typeof QuestOutcome]

/**
 * Per-domain "last mined" activity marker. Records that a *sufficient* quest ran
 * in a domain so a counted session is visible even when the conservative level
 * holds. **Deliberately separate from {@link WorkingLevel}** — `WorkingLevel.updatedAt`
 * means "last level change" (the 48-hr manual-override gate relies on it), whereas
 * `lastQuestAt` means "last sufficient quest" and moves on every counted run. This
 * marker never touches the level value, never-downgrade, or manual logic.
 */
export interface QuestActivityMarker {
  /** When the last *sufficient* quest ran in this domain (ISO). Distinct from `WorkingLevel.updatedAt`. */
  lastQuestAt: string
  /** Whether that quest raised the working level ('rose') or held it ('held'). */
  outcome: QuestOutcome
  /** Session high-water mark — the highest level the child reached that quest. */
  levelReached: number
}

/**
 * Per-domain quest activity markers (visibility layer over {@link WorkingLevels}).
 * Scoped to the three Knowledge Mine quest modes shown on Working Levels.
 */
export interface QuestActivity {
  phonics?: QuestActivityMarker
  comprehension?: QuestActivityMarker
  math?: QuestActivityMarker
}

export interface WorkingLevels {
  phonics?: WorkingLevel
  comprehension?: WorkingLevel
  math?: WorkingLevel
  /**
   * FEAT-11 Phase 1 — the **spelling/encoding** signal ("spell-the-word"). Named
   * `writing` historically, but it is specifically the *spelling* level (sibling
   * fields below carry the other writing signals). Kept deliberately separate
   * from sentence-building and composition: spelling ("get the word right"),
   * sentence-building ("put words in order"), and composition ("say what you
   * mean") fail for different reasons and route by their own gap — never one
   * blurred number. Seeded by spell-the-word quest questions tagged
   * `writing.spelling.*`.
   */
  writing?: WorkingLevel
  /**
   * FEAT-11 Phase 2 — the **sentence-building** signal ("build-the-sentence").
   * Its own level, separate from spelling (`writing` above) and from future
   * composition — sentence results are NEVER poured into the spelling number.
   * Seeded by build-the-sentence quest questions tagged
   * `writing.composition.sentence` / `writing.sentence.*`.
   */
  sentence?: WorkingLevel
  // Note: composition ("say-it-write-it", Phase 3) will get its own field
  // (e.g. `composition?`) — never folded into spelling or sentence.
  // Note: fluency has no levels, not tracked here
  // Note: speech not yet built
}

export interface SkillSnapshot {
  id?: string
  childId: string
  prioritySkills: PrioritySkill[]
  supports: SupportDefault[]
  stopRules: StopRule[]
  evidenceDefinitions: EvidenceDefinition[]
  /** Conceptual blocks detected across evaluation, quest, scan, and parent observation. Blocks have a lifecycle (ADDRESS_NOW → RESOLVING → RESOLVED) and are merged by stable ID rather than overwritten. */
  conceptualBlocks?: ConceptualBlock[]
  blocksUpdatedAt?: string
  /** Completed curriculum programs (e.g., ['reading-eggs']) */
  completedPrograms?: string[]
  /** Per-domain working levels for Knowledge Mine progression */
  workingLevels?: WorkingLevels
  /**
   * Per-domain "last mined" markers (visibility-only). Records the last
   * *sufficient* quest per domain so a counted session is visible even when the
   * conservative {@link WorkingLevels} entry holds. Separate from `workingLevels`
   * on purpose — never repurposes `WorkingLevel.updatedAt`.
   */
  questActivity?: QuestActivity
  createdAt?: string
  updatedAt?: string
}

// ── Evaluation Sessions (Diagnostic Assessment Chat) ────────

export interface EvaluationSession {
  id?: string
  childId: string
  domain: EvaluationDomain
  // 'partial' = stopped-early quest that still counts: persists to history with
  // its per-answer diamonds + hours, but never moves working levels / the
  // snapshot (the conservative mastery gate). Stays resumable. ('in-progress' is
  // the legacy resumable state, kept for back-compat reads.)
  status: 'in-progress' | 'complete' | 'resumed' | 'abandoned' | 'partial'
  messages: ChatMessage[]
  findings: EvaluationFinding[]
  recommendations: EvaluationRecommendation[]
  summary?: string
  /**
   * The one-line "learning frontier" the completed evaluation named (FEAT-75) —
   * retained on the session record so the Evaluation History can surface it
   * read-only after the fact. Display only; not wired into any generator.
   */
  frontier?: string
  evaluatedAt: string
  nextEvalDate?: string
  /**
   * UX-492 — the {@link GuidedEvaluationSource} document that finalized **this
   * version** of the daily record.
   *
   * The daily document id is `{childId}_{domain}_{date}`, so two completed
   * guided attempts on the same day share it and the later one replaces the
   * earlier. That is kept (history, resume, the reward dedup key and every
   * existing reader depend on it); what is added is a way to tell the versions
   * apart. Written only by the completing save, in the same transaction as the
   * source document it names, so a record carrying this field is a record whose
   * finalized source exists. Absent on every pre-UX-492 record and on an
   * in-progress save — in which case the record cannot be read as proof of any
   * particular attempt.
   */
  finalizedSourceId?: string
}

/**
 * A finalized guided evaluation's **own** record — UX-492.
 *
 * The problem it solves: both same-day completed attempts write the same daily
 * `evaluationSessions` document, so a second attempt can replace the first even
 * when their projected evidence summaries are identical and their actual help
 * notes are opposite. The daily record stays exactly as it was for every
 * existing consumer; this is one additional, family-scoped document per
 * finalization, with a fresh Firestore id captured once at the completed reply.
 *
 * **Application-create-once.** The first commit of an id is the record; a retry
 * of the same payload is acknowledged rather than rewritten, and a same-id
 * mismatch fails closed (see `features/evaluate/guidedEvaluationSource.ts`).
 *
 * It carries only scoped metadata, the finalization stamp and the **exact
 * ordered findings** — evidence, notes and `testedAt` as recorded. No
 * transcript, no recommendations, no summary: this is the evidence a later
 * Apply must be able to point at, not a second copy of the session.
 */
export interface GuidedEvaluationSource {
  id?: string
  childId: string
  domain: EvaluationDomain
  /** The daily `evaluationSessions` document this finalization saved alongside. */
  sessionDocId: string
  /** ISO — when the completing save was admitted. */
  finalizedAt: string
  /**
   * The findings exactly as the completed reply recorded them, in order. The
   * order is load-bearing: a learner-model evidence ref stores the **index** of
   * the finding it came from, so the winner of a rank/first-on-tie selection
   * stays identifiable after the fact.
   *
   * Explicitly recorded help is preserved verbatim in `notes` / `evidence`;
   * absent help stays absent (unknown), never rewritten as "no help".
   */
  findings: EvaluationFinding[]
}

export interface EvaluationFinding {
  skill: string
  status: 'mastered' | 'emerging' | 'not-yet' | 'not-tested'
  evidence: string
  notes?: string
  testedAt: string
}

export interface EvaluationRecommendation {
  priority: number
  skill: string
  action: string
  duration: string
  materials?: string[]
  frequency: string
}

export const WordMasteryLevel = {
  NotYet: 'not-yet',
  Struggling: 'struggling',
  Emerging: 'emerging',
  Known: 'known',
} as const
export type WordMasteryLevel = (typeof WordMasteryLevel)[keyof typeof WordMasteryLevel]

export interface WordProgress {
  word: string
  pattern: string
  skill: string
  wrongCount: number
  skippedCount: number
  correctCount: number
  lastSeen: string
  firstSeen: string
  masteryLevel: WordMasteryLevel
  questSessions: string[]
}
