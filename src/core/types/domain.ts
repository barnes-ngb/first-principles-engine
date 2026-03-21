import type {
  AdjustmentDecision,
  AssignmentAction,
  ChatMessageRole,
  DadLabStatus,
  DadLabType,
  DayBlockType,
  DayType,
  EnergyLevel,
  EngineStage,
  EvaluationDomain,
  EvidenceType,
  LabSessionStatus,
  MasteryGate,
  PaceStatus,
  PlannerConversationStatus,
  PlannerSessionStatus,
  PlanType,
  ProjectPhase,
  ReviewStatus,
  RoutineItemKey,
  SessionResult,
  SessionSymbol,
  SkillLevel,
  StickerCategory,
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
  /** Source of this block: 'planner' for AI/planner-generated, 'manual' for user-added. */
  source?: 'planner' | 'manual'
}

export interface ChecklistItem {
  id?: string
  label: string
  completed: boolean
  /** Planned duration in minutes for this item. */
  plannedMinutes?: number
  /** Subject bucket for color-coding. */
  subjectBucket?: SubjectBucket
  /** Skill tags for engine/ladder alignment */
  skillTags?: SkillTag[]
  /** Optional ladder rung reference */
  ladderRef?: { ladderId: string; rungId: string }
  /** When true, this item is part of the Minimum Viable Day (MVD) set. */
  mvdEssential?: boolean
  /** Source of this item: 'planner' for AI/planner-generated, 'manual' for user-added. */
  source?: 'planner' | 'manual'
  /** Category for kid-facing view: must-do, choose, or routine. */
  category?: 'must-do' | 'choose' | 'routine'
  /** Estimated duration in minutes (kid-facing display). */
  estimatedMinutes?: number
  /** Linked lesson card document ID (auto-generated on plan apply). */
  lessonCardId?: string
  /** Linked book ID (for "Make a Book" plan items). */
  bookId?: string
  /** Engagement feedback: how the activity went */
  engagement?: 'engaged' | 'okay' | 'struggled' | 'refused'
  /** Linked evidence artifact document ID (from per-item capture). */
  evidenceArtifactId?: string
  /** Manual or AI-generated review result for the captured work. */
  gradeResult?: string
  /** Guidance note when an item is skipped. */
  skipGuidance?: string
}

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
  source?: string
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
  planType: PlanType
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

// ── Dad Lab Reports ─────────────────────────────────────────────

export interface ChildLabReport {
  prediction?: string
  explanation?: string
  observation?: string
  creation?: string
  artifacts: string[]
  notes?: string
}

export interface DadLabReport {
  id?: string
  date: string
  weekKey: string
  title: string
  labType: DadLabType
  question: string
  description: string
  /** Lifecycle status: planned → active → complete */
  status: DadLabStatus
  /** Materials list (set during planning) */
  materials?: string[]
  /** Lincoln's role description (set during planning) */
  lincolnRole?: string
  /** London's role description (set during planning) */
  londonRole?: string
  childReports: Record<string, ChildLabReport>
  subjectTags: SubjectBucket[]
  skillTags?: string[]
  virtueTag?: string
  dadReflection?: string
  bestMoment?: string
  nextTime?: string
  totalMinutes?: number
  createdAt: string
  updatedAt: string
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
  /** Extracted content details from AI or workbook config matching */
  extractedContent?: PhotoContentExtraction
}

export interface PhotoContentExtraction {
  subject: string
  lessonNumber: string
  topic: string
  estimatedMinutes: number
  difficulty: string
  modifications: string
  rawDescription: string
  /** Workbook config match, if found */
  workbookMatch?: {
    workbookName: string
    totalUnits: number
    currentPosition: number
    unitLabel: string
  }
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
  /** When true, this item is part of the Minimum Viable Day (MVD) set. */
  mvdEssential?: boolean
  /** Category for kid-facing view: must-do or choose. */
  category?: 'must-do' | 'choose'
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

// ── Weekly Review (AI Adaptive Loop) ──────────────────────────

export interface PlanModification {
  area: string
  modification: string
  reason: string
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

// ── Weekly Review (AI-generated adaptive review) ──────────────

export interface PaceAdjustment {
  id: string
  subjectBucket?: SubjectBucket
  area: string
  currentPace: string
  suggestedPace: string
  rationale: string
  decision: AdjustmentDecision
}

export interface WeeklyReview {
  id?: string
  childId: string
  weekKey: string
  status: ReviewStatus
  /** Celebration / affirmation highlight */
  celebration: string
  /** Narrative summary of the week */
  summary: string
  /** Specific wins observed */
  wins: string[]
  /** Areas that need attention */
  growthAreas: string[]
  /** Pace adjustments with accept/reject per item */
  paceAdjustments: PaceAdjustment[]
  /** Structured plan modifications */
  planModifications?: PlanModification[]
  /** Recommendations for next week */
  recommendations: string[]
  /** Observed energy pattern for the week */
  energyPattern?: string
  reviewedAt?: string
  createdAt?: string
  updatedAt?: string
}

// ── Evaluation Sessions (Diagnostic Assessment Chat) ────────

export interface EvaluationSession {
  id?: string
  childId: string
  domain: EvaluationDomain
  status: 'in-progress' | 'complete'
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

// ── XP Ledger (cumulative XP tracking) ────────────────────────

export interface XpLedgerSources {
  routines: number
  quests: number
  books: number
}

export interface XpLedger {
  childId: string
  totalXp: number
  sources: XpLedgerSources
  lastUpdatedAt: string
}

// ── Book Builder ──────────────────────────────────────────────

export type BookTheme =
  | 'adventure'
  | 'animals'
  | 'family'
  | 'fantasy'
  | 'minecraft'
  | 'science'
  | 'sight_words'
  | 'faith'
  | 'other'

export const BOOK_THEMES: { id: BookTheme; label: string; emoji: string }[] = [
  { id: 'adventure',   label: 'Adventure',   emoji: '⚔️' },
  { id: 'animals',     label: 'Animals',     emoji: '🐾' },
  { id: 'family',      label: 'Family',      emoji: '👨‍👩‍👦' },
  { id: 'fantasy',     label: 'Fantasy',     emoji: '✨' },
  { id: 'minecraft',   label: 'Minecraft',   emoji: '⛏️' },
  { id: 'science',     label: 'Science',     emoji: '🔬' },
  { id: 'sight_words', label: 'Sight Words', emoji: '📖' },
  { id: 'faith',       label: 'Faith',       emoji: '✝️' },
  { id: 'other',       label: 'Other',       emoji: '📚' },
]

export type StickerTag =
  | 'animal'
  | 'nature'
  | 'minecraft'
  | 'fantasy'
  | 'character'
  | 'object'
  | 'vehicle'
  | 'food'
  | 'faith'
  | 'other'

export interface Book {
  id?: string
  childId: string
  title: string
  coverImageUrl?: string
  coverStyle?: 'minecraft' | 'storybook' | 'comic' | 'photo' | 'realistic' | 'garden-warfare' | 'platformer'
  pages: BookPage[]
  status: 'draft' | 'complete'
  createdAt: string
  updatedAt: string
  /** Subject tags for compliance hours logging */
  subjectBuckets: SubjectBucket[]
  /** Total editing time in minutes (accumulated across sessions) */
  totalMinutes?: number
  /** When true, this is a Together Time book for both kids */
  isTogetherBook?: boolean
  /** All contributing children (used for Together Books) */
  contributorIds?: string[]
  /** Book type: 'creative' for kid-made books, 'sight-word' for reading practice, 'generated' for AI-generated stories */
  bookType?: 'creative' | 'sight-word' | 'generated'
  /** How this book was created */
  source?: 'manual' | 'ai-generated'
  /** Target sight words for this book (sight-word type only) */
  sightWords?: string[]
  /** Theme tag for this book */
  theme?: BookTheme
  /** The prompt/parameters used to generate this story */
  generationConfig?: {
    storyIdea?: string
    words: string[]
    style?: string
    /** Freeform theme/style prompt used during generation */
    theme?: string
    difficulty?: 'simple' | 'moderate'
    pageCount: number
  }
}

export interface BookPage {
  id: string
  pageNumber: number
  /** Story text for this page */
  text?: string
  /** Voice narration audio URL (Firebase Storage) */
  audioUrl?: string
  audioStoragePath?: string
  /** Images on this page (photos, AI scenes, stickers) */
  images: PageImage[]
  /** Page layout */
  layout: 'image-top' | 'image-left' | 'full-image' | 'text-only'
  createdAt: string
  updatedAt: string
  /** Which child contributed this page (for Together Books) */
  contributorId?: string
  /** Text display size */
  textSize?: 'big' | 'medium' | 'small'
  /** Text font family */
  textFont?: 'handwriting' | 'print' | 'pixel'
  /** Which sight words appear on this page (sight-word books only) */
  sightWordsOnPage?: string[]
}

export interface PageImage {
  id: string
  url: string
  storagePath?: string
  type: 'photo' | 'ai-generated' | 'sticker'
  /** AI prompt used to generate this image */
  prompt?: string
  /** Label for accessibility and display */
  label?: string
  /** Position and size within the page image container (percentage-based).
   *  x, y, width, height: 0–100, percentage of container dimensions.
   *  rotation: degrees (0–359). zIndex: stacking order integer. */
  position?: { x: number; y: number; width: number; height: number; rotation?: number; zIndex?: number }
}

export interface Sticker {
  id?: string
  url: string
  storagePath: string
  label: string
  category: StickerCategory
  /** null = shared between kids, childId = personal */
  childId?: string | null
  prompt?: string
  createdAt: string
  /** Tag classification for filtering */
  tags?: StickerTag[]
  /** Which child this sticker is relevant for */
  childProfile?: 'lincoln' | 'london' | 'both'
}

// ── Avatar + Armor of God ─────────────────────────────────────────

export type ArmorPiece =
  | 'belt_of_truth'
  | 'breastplate_of_righteousness'
  | 'shoes_of_peace'
  | 'shield_of_faith'
  | 'helmet_of_salvation'
  | 'sword_of_the_spirit'

export type ArmorTier = 'stone' | 'diamond' | 'netherite'       // Lincoln
export type PlatformerTier = 'basic' | 'powerup' | 'champion'  // London

export const ARMOR_PIECES: {
  id: ArmorPiece
  name: string
  scripture: string
  verseText: string
  xpToUnlockStone: number
  xpToUnlockDiamond: number   // 0 = unlocked by tier upgrade, not XP
  xpToUnlockNetherite: number // 0 = unlocked by tier upgrade, not XP
  lincolnStonePrompt: string
  lincolnDiamondPrompt: string
  lincolnNetheritePrompt: string
  londonBasicPrompt: string
  londonPowerupPrompt: string
  londonChampionPrompt: string
}[] = [
  {
    id: 'belt_of_truth',
    name: 'Belt of Truth',
    scripture: 'Ephesians 6:14',
    verseText: 'Stand firm then, with the belt of truth buckled around your waist.',
    xpToUnlockStone: 50,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone-textured belt with a plain iron buckle, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a glowing diamond-encrusted belt with a golden cross buckle, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian belt with glowing purple runes and dark-metal buckle, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a simple colorful ribbon belt with a small bow, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a bright glowing sash belt with sparkles, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a shimmering rainbow belt with a star buckle and golden trim, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'breastplate_of_righteousness',
    name: 'Breastplate of Righteousness',
    scripture: 'Ephesians 6:14',
    verseText: 'With the breastplate of righteousness in place.',
    xpToUnlockStone: 150,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone chest plate with a carved cross, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a shining diamond chest plate with a glowing cross emblem, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian chest plate with glowing purple cross and dark-metal trim, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a simple colorful heart-shaped chest piece, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a bright shining chest piece with a heart and sparkles, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a golden champion chest plate with rainbow heart and star accents, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'shoes_of_peace',
    name: 'Shoes of Peace',
    scripture: 'Ephesians 6:15',
    verseText: 'And with your feet fitted with the readiness that comes from the gospel of peace.',
    xpToUnlockStone: 300,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'simple stone boots with iron soles, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'diamond-tipped boots with a soft glowing trail beneath them, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'dark obsidian boots with glowing purple soles and dark metal spikes, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'simple colorful sneakers with a small bow, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'winged sneakers with a sparkle trail, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'golden winged boots with rainbow sparkle trail and star laces, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'shield_of_faith',
    name: 'Shield of Faith',
    scripture: 'Ephesians 6:16',
    verseText: 'Take up the shield of faith, with which you can extinguish all the flaming arrows of the evil one.',
    xpToUnlockStone: 500,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone shield with a carved cross, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a large diamond shield with a glowing cross and rays of light, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian shield with glowing purple cross and dark-metal border, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a small round colorful shield with a heart, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a bright rainbow round shield with a shining cross, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a golden champion shield with rainbow cross and star accents, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'helmet_of_salvation',
    name: 'Helmet of Salvation',
    scripture: 'Ephesians 6:17',
    verseText: 'Take the helmet of salvation.',
    xpToUnlockStone: 750,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone helmet with iron visor, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a gleaming diamond helmet with glowing visor, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian helmet with glowing purple visor and dark-metal crown, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a simple colorful round helmet with a small star on top, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a bright crown-helmet with sparkles and a glowing star, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a golden champion crown-helmet with rainbow star and gem accents, cute cartoon style, no background, transparent PNG, item only',
  },
  {
    id: 'sword_of_the_spirit',
    name: 'Sword of the Spirit',
    scripture: 'Ephesians 6:17',
    verseText: 'And the sword of the Spirit, which is the word of God.',
    xpToUnlockStone: 1000,
    xpToUnlockDiamond: 0,
    xpToUnlockNetherite: 0,
    lincolnStonePrompt: 'a simple stone sword with a plain iron hilt, pixel art style, no background, transparent PNG, item only',
    lincolnDiamondPrompt: 'a glowing diamond sword with scripture etched on the blade, pixel art style, no background, transparent PNG, item only',
    lincolnNetheritePrompt: 'a dark obsidian sword glowing purple with scripture runes on the blade, pixel art style, no background, transparent PNG, item only',
    londonBasicPrompt: 'a small colorful magic wand with a star tip, cute cartoon style, no background, transparent PNG, item only',
    londonPowerupPrompt: 'a glowing magic wand-sword with sparkles and a rainbow trail, cute cartoon platformer style, no background, transparent PNG, item only',
    londonChampionPrompt: 'a golden champion wand-sword with rainbow sparkles and gem-studded hilt, cute cartoon style, no background, transparent PNG, item only',
  },
]

export const XP_EVENTS = {
  QUEST_DIAMOND: 2,             // already wired in quest system
  CHECKLIST_DAY_COMPLETE: 10,   // all must-do items checked off
  BOOK_READ: 15,                // reading session logged on book close
  EVALUATION_COMPLETE: 25,      // full evaluation chat completed
  ARMOR_DAILY_COMPLETE: 5,      // all earned pieces applied today
} as const

export interface ArmorPieceProgress {
  pieceId: ArmorPiece
  /** Lincoln/Minecraft tiers unlocked */
  unlockedTiers: ArmorTier[]
  /** London/Platformer tiers unlocked */
  unlockedTiersPlatformer?: PlatformerTier[]
  generatedImageUrls: {
    stone?: string
    diamond?: string
    netherite?: string
    basic?: string
    powerup?: string
    champion?: string
  }
}

export interface AvatarProfile {
  childId: string
  themeStyle: 'minecraft' | 'platformer'
  /** One entry per piece, grows as pieces are unlocked */
  pieces: ArmorPieceProgress[]
  currentTier: ArmorTier | PlatformerTier
  /** DALL-E base character (full body, no armor), generated once */
  baseCharacterUrl?: string
  /** Phase 2: photo → character transform result */
  photoTransformUrl?: string
  /** Cohesive set sheets: tier → sheet URL (3×2 grid, all 6 pieces) */
  armorSheetUrls?: Partial<Record<string, string>>
  totalXp: number   // cached from xpLedger for quick reads
  updatedAt: string
}

/**
 * Maps each armor piece to its 0-indexed position in the 3×2 sheet image.
 * Order (left-to-right, top-to-bottom): belt, breastplate, shoes, shield, helmet, sword.
 */
export const ARMOR_PIECE_SHEET_INDEX: Record<ArmorPiece, number> = {
  belt_of_truth: 0,
  breastplate_of_righteousness: 1,
  shoes_of_peace: 2,
  shield_of_faith: 3,
  helmet_of_salvation: 4,
  sword_of_the_spirit: 5,
}

export interface DailyArmorSession {
  familyId: string
  childId: string
  date: string          // YYYY-MM-DD
  appliedPieces: ArmorPiece[]
  completedAt?: string  // ISO string — set when all earned pieces applied
}

/** Pixel-percentage positions for overlaying each piece on the base character image. */
export const PIECE_POSITIONS: Record<
  ArmorPiece,
  { topPct: number; leftPct: number; widthPct: number; heightPct: number }
> = {
  helmet_of_salvation:           { topPct: 2,  leftPct: 28, widthPct: 44, heightPct: 22 },
  breastplate_of_righteousness:  { topPct: 24, leftPct: 18, widthPct: 64, heightPct: 28 },
  belt_of_truth:                 { topPct: 50, leftPct: 22, widthPct: 56, heightPct: 12 },
  shoes_of_peace:                { topPct: 78, leftPct: 8,  widthPct: 84, heightPct: 20 },
  shield_of_faith:               { topPct: 28, leftPct: 2,  widthPct: 34, heightPct: 38 },
  sword_of_the_spirit:           { topPct: 28, leftPct: 64, widthPct: 34, heightPct: 42 },
}

/** Append-only log for XP dedup. Doc ID: {childId}_{dedupKey} */
export interface XpEventLogEntry {
  childId: string
  type: string
  amount: number
  dedupKey: string
  meta?: Record<string, string>
  awardedAt: string
}

// ── Sight Word Progress ──────────────────────────────────────

export interface SightWordProgress {
  word: string
  /** Total times seen across all stories */
  encounters: number
  /** Times child tapped "I know this" */
  selfReportedKnown: number
  /** Times child tapped for pronunciation help */
  helpRequested: number
  /** Parent confirmed mastery */
  shellyConfirmed: boolean
  /** Computed mastery level */
  masteryLevel: 'new' | 'practicing' | 'familiar' | 'mastered'
  firstSeen: string
  lastSeen: string
  lastLevelChange: string
}

export interface SightWordList {
  id?: string
  childId: string
  name: string
  words: string[]
  source: 'manual' | 'evaluation' | 'curriculum'
  createdAt: string
}
