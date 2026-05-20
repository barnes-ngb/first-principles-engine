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

export interface WorkingLevels {
  phonics?: WorkingLevel
  comprehension?: WorkingLevel
  math?: WorkingLevel
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
  createdAt?: string
  updatedAt?: string
}

// ── Evaluation Sessions (Diagnostic Assessment Chat) ────────

export interface EvaluationSession {
  id?: string
  childId: string
  domain: EvaluationDomain
  status: 'in-progress' | 'complete' | 'resumed' | 'abandoned'
  messages: ChatMessage[]
  findings: EvaluationFinding[]
  recommendations: EvaluationRecommendation[]
  summary?: string
  evaluatedAt: string
  nextEvalDate?: string
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
