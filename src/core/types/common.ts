import type {
  EngineStage,
  EvidenceType,
  LabBeatId,
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
  /**
   * Links a watch-vehicle capture back to its `watchLibrary` entry (FEAT-139).
   *
   * Additive and **optional** — captures written before FEAT-139 carry only the
   * title-derived `planItem` string, and a library title is editable (FEAT-129),
   * so title-matching was never a reliable join. Every reader must treat this as
   * absent-able rather than assuming it on a `domain: 'watch-vehicle'` artifact.
   */
  watchVideoId?: string
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
  /**
   * Dad Lab capture beat this artifact belongs to (FEAT-56) — Predict / Try /
   * What we saw. Additive tag; shared Artifact consumers ignore it. Substrate for
   * the future "audio transcription of beat recordings as model evidence" follow-up.
   */
  labBeat?: LabBeatId
  /** Optional link to a project */
  projectId?: string
  /** Week key (YYYY-MM-DD) for the week this artifact belongs to */
  weekKey?: string
  /** Multiple media URLs (e.g. voice recordings) */
  mediaUrls?: string[]
  /**
   * FEAT-141: short (≤140 chars) plain-language description of what the image
   * shows, produced by the capture-time classification pass that already runs
   * on this path (no second AI call) and clamped at write. Parent-side metadata
   * for curation / portfolio / compliance — never rendered to a child. Optional
   * and never backfilled: absent stays absent.
   */
  contentNote?: string
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
