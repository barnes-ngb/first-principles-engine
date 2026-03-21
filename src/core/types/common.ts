import type {
  EngineStage,
  EvidenceType,
  SessionSymbol,
  StreamKey,
  SubjectBucket,
  SupportLevel,
} from './enums'

// ── Skill Tagging ──────────────────────────────────────────────

/** Dot-delimited skill tag: domain.area.skill.level */
export type SkillTag = string

// ── Artifacts ──────────────────────────────────────────────────

export interface ArtifactTags {
  engineStage: EngineStage
  domain: string
  subjectBucket: SubjectBucket
  location: string
  ladderRef?: { ladderId: string; rungId: string }
  planItem?: string
  note?: string
}

export interface Artifact {
  id?: string
  childId: string
  dayLogId?: string
  weekPlanId?: string
  title: string
  type: EvidenceType
  uri?: string
  storagePath?: string
  createdAt: string
  content?: string
  tags: ArtifactTags
  notes?: string
  /** Optional link to a lab session */
  labSessionId?: string
  /** Lab stage when this artifact was captured */
  labStage?: EngineStage
  /** Optional link to a project */
  projectId?: string
  /** Week key (YYYY-MM-DD) for the week this artifact belongs to */
  weekKey?: string
}

// ── Ladders ────────────────────────────────────────────────────

export interface Ladder {
  id?: string
  childId?: string
  title: string
  description?: string
  domain?: string
  rungs: Rung[]
}

export interface Rung {
  id?: string
  title: string
  description?: string
  order: number
  proofExamples?: string[]
  milestones?: MilestoneProgress[]
}

export interface MilestoneProgress {
  id?: string
  childId: string
  ladderId: string
  rungId: string
  label: string
  status: 'locked' | 'active' | 'achieved'
  achievedAt?: string
  notes?: string
  attemptsToAchieve?: number
}

// ── Lincoln's Ladders (card-based) ──────────────────────────────

export interface LadderRungDefinition {
  rungId: string
  name: string
  evidenceText: string
  supportsText: string
}

export interface LadderCardDefinition {
  ladderKey: string
  title: string
  streamKey?: StreamKey
  intent: string
  workItems: string[]
  metricLabel: string
  globalRuleText: string
  rungs: LadderRungDefinition[]
  /** Optional group label for grouping sub-ladders under a heading */
  group?: string
}

export interface LadderSessionEntry {
  dateKey: string
  rungId: string
  supportLevel: SupportLevel
  result: SessionSymbol
  note?: string
}

export interface LadderProgress {
  childId: string
  ladderKey: string
  currentRungId: string
  streakCount: number
  lastSupportLevel: SupportLevel
  history: LadderSessionEntry[]
}

// ── AI Usage Tracking ─────────────────────────────────────────

export interface AIUsageEntry {
  id?: string
  childId: string
  taskType: string
  model: string
  inputTokens: number
  outputTokens: number
  createdAt: string
}
