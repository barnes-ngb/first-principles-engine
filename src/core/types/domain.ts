import type {
  AssignmentAction,
  ChatMessageRole,
  DayBlockType,
  DayType,
  EnergyLevel,
  EngineStage,
  EvidenceType,
  LabSessionStatus,
  MasteryGate,
  PaceStatus,
  PlannerConversationStatus,
  PlannerSessionStatus,
  ProjectPhase,
  RoutineItemKey,
  SessionResult,
  SessionSymbol,
  SkillLevel,
  StreamKey,
  StreamId,
  SubjectBucket,
  SupportLevel,
  SupportTag,
  TrackType,
} from './enums'

export interface FamilySettings {
  id?: string
  timeZone?: string
  weekStartDay?: string
  preferredEvidence?: EvidenceType[]
}

export interface Child {
  id: string
  name: string
  birthdate?: string
  grade?: string
  settings?: FamilySettings
  /** Ordered list of day-block types this child uses (priority order). */
  dayBlocks?: DayBlockType[]
  /** Ordered list of routine items this child logs (priority order). */
  routineItems?: RoutineItemKey[]
}

export interface WeekPlan {
  id?: string
  startDate: string
  endDate?: string
  theme: string
  virtue: string
  scriptureRef: string
  heartQuestion: string
  tracks: TrackType[]
  flywheelPlan: string
  buildLab: {
    title: string
    materials: string[]
    steps: string[]
  }
  childGoals: Array<{
    childId: string
    goals: string[]
  }>
}

export interface RoutineItem {
  done: boolean
  note?: string
}

export interface HandwritingLog extends RoutineItem {
  minutes?: number
  lines?: number
}

export interface SpellingLog extends RoutineItem {
  words?: string
}

export interface SightWordsLog extends RoutineItem {
  count?: number
}

export interface MinecraftReadingLog extends RoutineItem {
  pages?: number
  points?: number
}

export interface ReadingEggsLog extends RoutineItem {
  minutes?: number
  lessons?: number
}

export interface PhonemicAwarenessLog extends RoutineItem {
  minutes?: number
}

export interface PhonicsLessonLog extends RoutineItem {
  minutes?: number
}

export interface DecodableReadingLog extends RoutineItem {
  minutes?: number
  rereadDone?: boolean
}

export interface SpellingDictationLog extends RoutineItem {
  lines?: number
}

export interface ReadAloudLog extends RoutineItem {
  minutes?: number
}

export interface NumberSenseLog extends RoutineItem {
  minutes?: number
}

export interface WordProblemsLog extends RoutineItem {
  minutes?: number
  count?: number
}

export interface NarrationRepsLog extends RoutineItem {
  minutes?: number
}

export interface ReadingRoutine {
  handwriting: HandwritingLog
  spelling: SpellingLog
  sightWords: SightWordsLog
  minecraft: MinecraftReadingLog
  readingEggs: ReadingEggsLog
  readAloud?: ReadAloudLog
  phonemicAwareness?: PhonemicAwarenessLog
  phonicsLesson?: PhonicsLessonLog
  decodableReading?: DecodableReadingLog
  spellingDictation?: SpellingDictationLog
}

export interface MathRoutine {
  done: boolean
  problems?: number
  pages?: number
  note?: string
  numberSense?: NumberSenseLog
  wordProblems?: WordProblemsLog
}

export interface SpeechRoutine {
  done: boolean
  routine?: string
  note?: string
  narrationReps?: NarrationRepsLog
}

export interface DayLog {
  childId: string
  date: string
  blocks: DayBlock[]
  reading?: ReadingRoutine
  math?: MathRoutine
  speech?: SpeechRoutine
  formation?: { done: boolean; gratitude?: string; verse?: string; note?: string }
  together?: { done: boolean; note?: string; mediaUrl?: string }
  movement?: { done: boolean; note?: string }
  project?: { done: boolean; note?: string; mediaUrl?: string }
  xpTotal?: number
  retro?: string
  checklist?: ChecklistItem[]
  createdAt?: string
  updatedAt?: string
}

export interface DayBlock {
  id?: string
  type: DayBlockType
  title?: string
  subjectBucket?: SubjectBucket
  location?: string
  plannedMinutes?: number
  actualMinutes?: number
  startTime?: string
  endTime?: string
  notes?: string
  quickCapture?: boolean
  checklist?: ChecklistItem[]
  sessionIds?: string[]
  artifactIds?: string[]
  /** Skill tags for engine/ladder alignment */
  skillTags?: SkillTag[]
  /** Optional ladder rung reference */
  ladderRef?: { ladderId: string; rungId: string }
}

export interface ChecklistItem {
  id?: string
  label: string
  completed: boolean
  /** Skill tags for engine/ladder alignment */
  skillTags?: SkillTag[]
  /** Optional ladder rung reference */
  ladderRef?: { ladderId: string; rungId: string }
}

export interface ArtifactTags {
  engineStage: EngineStage
  domain: string
  subjectBucket: SubjectBucket
  location: string
  ladderRef?: { ladderId: string; rungId: string }
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

export interface HoursEntry {
  id?: string
  childId?: string
  date: string
  hours?: number
  minutes: number
  blockType?: DayBlockType
  subjectBucket?: SubjectBucket
  location?: string
  quickCapture?: boolean
  notes?: string
  dayLogId?: string
  blockId?: string
}

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

export interface HoursAdjustment {
  id?: string
  childId?: string
  date: string
  minutes: number
  reason: string
  subjectBucket?: SubjectBucket
  location?: string
  createdAt?: string
}

export interface Session {
  id?: string
  childId: string
  date: string
  streamId: StreamId
  ladderId: string
  targetRungOrder: number
  result: SessionResult
  durationSeconds?: number
  notes?: string
  supports?: SupportTag[]
  createdAt?: string
}

export interface PlannedSession {
  streamId: StreamId
  ladderId: string
  targetRungOrder: number
  plannedMinutes?: number
  label?: string
}

export interface DailyPlan {
  id?: string
  childId: string
  date: string
  energy: EnergyLevel
  planType: 'A' | 'B'
  sessions: PlannedSession[]
  completedSessionIds?: string[]
}

/** An append-only entry added each time a session is completed for a project. */
export interface SessionLogEntry {
  /** The lab session doc ID. */
  sessionId: string
  /** Date the session was completed (YYYY-MM-DD). */
  dateKey: string
  /** Short summary of what happened. */
  summary: string
  /** Number of artifacts (photos/notes/audio) captured. */
  artifactCount: number
  /** "What changed for next time?" response. */
  whatChanged?: string
}

export interface Project {
  id?: string
  childId: string
  title: string
  phase: ProjectPhase
  planNotes?: string
  buildNotes?: string
  testNotes?: string
  improveNotes?: string
  whatChanged?: string
  teachBack?: string
  photoUrls?: string[]
  createdAt?: string
  updatedAt?: string
  completed?: boolean
  /** Timestamp of the most recent lab session for this project. */
  lastSessionAt?: string
  /** Soft-delete timestamp (ISO string). Filtered out of lists when set. */
  deletedAt?: string
  /** UID of the parent who deleted the project. */
  deletedBy?: string
  /** Archive timestamp (ISO string). Archived projects are hidden from the active list. */
  archivedAt?: string
  /** Append-only log of completed sessions. */
  sessionLog?: SessionLogEntry[]
}

export interface LabSession {
  id?: string
  childId: string
  weekKey: string
  /** The specific date of this session (YYYY-MM-DD). */
  dateKey?: string
  /** The project this session belongs to (required for new sessions). */
  projectId?: string
  status: LabSessionStatus
  stage: EngineStage
  mission?: string
  constraints?: string
  roles?: string
  stageNotes?: Partial<Record<EngineStage, string>>
  /** Per-stage done toggles. */
  stageDone?: Partial<Record<EngineStage, boolean>>
  createdAt?: string
  updatedAt?: string
  /** "What changed for next time?" — captured on finish. */
  finishWhatChanged?: string
  /** "Next step (Plan)?" — captured on finish. */
  finishNextStep?: string
  /** Short summary captured on finish. */
  finishSummary?: string
}

export interface LabStageCapture {
  stage: EngineStage
  notes?: string
  artifactIds?: string[]
  completedAt?: string
}

export interface GoalResult {
  goal: string
  result: SessionResult | 'na'
}

export interface WeeklyScore {
  id?: string
  childId: string
  weekStart: string
  metrics: ScoreMetric[]
  goalResults?: GoalResult[]
  reflectionWorked?: string
  reflectionFriction?: string
  reflectionTweak?: string
  createdAt?: string
}

export interface ScoreMetric {
  label: string
  result: SessionResult | 'na'
}

export interface WeeklyExperiment {
  id?: string
  childId: string
  weekKey: string
  hypothesis: string
  intervention: string
  measurement: string
  startDate?: string
  endDate?: string
  result?: string
  createdAt?: string
  updatedAt?: string
}

export interface DadDailyReport {
  win: string
  hardThing: string
  whatHeTried: string
  energy: 'high' | 'medium' | 'low'
  adjustmentForTomorrow: string
}

export interface DadLabWeek {
  id?: string
  childId: string
  weekKey: string
  experiment?: WeeklyExperiment
  dailyReports: Record<string, DadDailyReport>
  createdAt?: string
  updatedAt?: string
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

// ── Skill Tagging ──────────────────────────────────────────────

/** Dot-delimited skill tag: domain.area.skill.level */
export type SkillTag = string

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

export interface SkillSnapshot {
  id?: string
  childId: string
  prioritySkills: PrioritySkill[]
  supports: SupportDefault[]
  stopRules: StopRule[]
  evidenceDefinitions: EvidenceDefinition[]
  createdAt?: string
  updatedAt?: string
}

// ── Shelly Planner ─────────────────────────────────────────────

export interface AppBlock {
  label: string
  defaultMinutes: number
  notes?: string
}

export interface PlannerSession {
  id?: string
  childId: string
  weekKey: string
  status: PlannerSessionStatus
  availableHoursPerDay: number
  appBlocks: AppBlock[]
  /** Photo artifact IDs uploaded for extraction */
  photoIds: string[]
  assignments: AssignmentCandidate[]
  /** The generated draft weekly plan items */
  draftPlan: WeeklyPlanItem[]
  createdAt?: string
  updatedAt?: string
}

export interface AssignmentCandidate {
  id: string
  subjectBucket: SubjectBucket
  workbookName: string
  lessonName: string
  pageRange?: string
  estimatedMinutes: number
  difficultyCues: string[]
  /** Photo artifact ID this was extracted from */
  sourcePhotoId?: string
  /** Action decided by planner/user */
  action: AssignmentAction
  /** Skip/modify suggestion, if any */
  skipSuggestion?: SkipSuggestion
}

export interface SkipSuggestion {
  action: 'skip' | 'modify'
  reason: string
  replacement: string
  evidence: string
}

export interface WeeklyPlanItem {
  id: string
  day: string
  title: string
  subjectBucket: SubjectBucket
  estimatedMinutes: number
  /** Source assignment candidate ID */
  assignmentId?: string
  /** Whether this is an app block */
  isAppBlock?: boolean
  skillTags: SkillTag[]
  ladderRef?: { ladderId: string; rungId: string }
  skipSuggestion?: SkipSuggestion
  accepted: boolean
}

// ── Planner Chat (Conversational Planner) ─────────────────────

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  text?: string
  artifactIds?: string[]
  /** Labels attached to uploaded photos */
  photoLabels?: PhotoLabel[]
  /** Draft plan snapshot attached to this message */
  draftPlan?: DraftWeeklyPlan
  createdAt: string
}

export interface PhotoLabel {
  artifactId: string
  subjectBucket: SubjectBucket
  lessonOrPages: string
  estimatedMinutes: number
}

export interface DraftWeeklyPlan {
  days: DraftDayPlan[]
  skipSuggestions: SkipSuggestion[]
  minimumWin: string
}

export interface DraftDayPlan {
  day: string
  timeBudgetMinutes: number
  items: DraftPlanItem[]
}

export interface DraftPlanItem {
  id: string
  title: string
  subjectBucket: SubjectBucket
  estimatedMinutes: number
  skillTags: SkillTag[]
  ladderRef?: { ladderId: string; rungId: string }
  isAppBlock?: boolean
  skipSuggestion?: SkipSuggestion
  accepted: boolean
  assignmentId?: string
}

export interface PlannerConversation {
  id?: string
  childId: string
  weekKey: string
  status: PlannerConversationStatus
  messages: ChatMessage[]
  /** Current draft plan (updated with each regeneration) */
  currentDraft?: DraftWeeklyPlan
  /** Context for plan generation */
  availableHoursPerDay: number
  appBlocks: AppBlock[]
  assignments: AssignmentCandidate[]
  createdAt?: string
  updatedAt?: string
}

// ── Lesson Cards ───────────────────────────────────────────────

export interface LessonCard {
  id?: string
  childId: string
  planItemId?: string
  title: string
  durationMinutes: number
  objective: string
  materials: string[]
  steps: string[]
  supports: string[]
  evidenceChecks: string[]
  skillTags: SkillTag[]
  ladderRef?: { ladderId: string; rungId: string }
  createdAt?: string
}

// ── Workbook Config (Pace Gauge) ──────────────────────────────

export interface WorkbookConfig {
  id?: string
  childId: string
  /** Workbook/curriculum name */
  name: string
  subjectBucket: SubjectBucket
  /** Total number of lessons or pages */
  totalUnits: number
  /** Current position (lesson/page number) */
  currentPosition: number
  /** Unit label: "lesson", "page", "chapter" */
  unitLabel: string
  /** Target finish date (YYYY-MM-DD) */
  targetFinishDate: string
  /** Typical school days per week */
  schoolDaysPerWeek: number
  createdAt?: string
  updatedAt?: string
}

export interface PaceGaugeResult {
  workbookName: string
  /** Units required per week to stay on target */
  requiredPerWeek: number
  /** Units currently planned per week */
  plannedPerWeek: number
  /** Positive = ahead, negative = behind */
  delta: number
  status: PaceStatus
  /** Human-readable suggestion */
  suggestion: string
  /** Projected completion date at current pace */
  projectedFinishDate: string
  /** Number of buffer days available */
  bufferDays: number
}

// ── Light Day Template (Appointment Resilience) ───────────────

export interface LightDayTemplate {
  /** Items on a light day */
  items: LightDayItem[]
  /** Total estimated minutes */
  totalMinutes: number
}

export interface LightDayItem {
  title: string
  subjectBucket: SubjectBucket
  estimatedMinutes: number
  skillTags: SkillTag[]
  isAppBlock?: boolean
}

// ── Day Type Config (per day in weekly plan) ──────────────────

export interface DayTypeConfig {
  day: string
  dayType: DayType
  /** Optional note (e.g. "Dr. appointment at 2pm") */
  note?: string
}

// ── Start-Anyway Protocol (Motivation) ────────────────────────

export interface StartAnywayScript {
  /** The trigger situation (e.g. "Refusal/complaining > 60s") */
  trigger: string
  /** Two modality choices for the same skill */
  choices: ModalityChoice[]
  /** Timer duration in minutes */
  timerMinutes: number
  /** Whether to do the first rep together */
  firstRepTogether: boolean
  /** Immediate reward description */
  winReward: string
  /** Related skill tags */
  skillTags: SkillTag[]
}

export interface ModalityChoice {
  label: string
  description: string
}

// ── Skip Advisor Result ───────────────────────────────────────

export interface SkipAdvisorResult {
  action: 'keep' | 'modify' | 'skip'
  rationale: string
  /** The mastery gate level that triggered this recommendation */
  evidenceLevel?: MasteryGate
  /** Related skill tag */
  skillTag?: SkillTag
}
