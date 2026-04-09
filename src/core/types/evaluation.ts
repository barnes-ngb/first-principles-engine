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

export interface ConceptualBlock {
  name: string
  affectedSkills: string[]
  recommendation: 'ADDRESS_NOW' | 'DEFER'
  rationale: string
  strategies?: string[]
  deferNote?: string
  detectedAt: string
  evaluationSessionId: string
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
  /** Conceptual blocks detected by pattern analysis (most recent evaluation only) */
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
