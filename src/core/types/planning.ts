import type {
  ActivityFrequency,
  ActivityType,
  AdjustmentDecision,
  AssignmentAction,
  ChatMessageRole,
  DayBlockType,
  DayType,
  EnergyLevel,
  MasteryGate,
  PaceStatus,
  PlannerConversationStatus,
  PlanType,
  ReviewStatus,
  ScheduleBlock,
  SessionResult,
  StreamId,
  SubjectBucket,
  SupportTag,
  TrackType,
} from './enums'
import type { SkillTag } from './common'

export interface WeekPlan {
  id?: string
  startDate: string
  endDate?: string
  theme: string
  virtue: string
  scriptureRef: string
  scriptureText?: string
  heartQuestion: string
  formationPrompt?: string
  focusGeneratedAt?: string
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
  conundrum?: {
    title: string
    scenario: string          // Short punchy narrative (80-120 words)
    question: string
    /** 2-3 tappable quick-pick response options for kids */
    quickPicks?: string[]
    lincolnPrompt: string
    londonPrompt: string
    virtueConnection: string
    readingTieIn?: string
    mathContext?: string
    londonDrawingPrompt?: string
    dadLabSuggestion?: string
    // Evidence fields (set when family discusses)
    discussed?: boolean
    discussedAt?: string
  }
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
  minutes?: number
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
  workshop?: { done: boolean; gamesPlayed?: number; note?: string }
  xpTotal?: number
  retro?: string
  checklist?: ChecklistItem[]
  teachBackDone?: boolean
  chapterQuestion?: {
    book: string
    chapter: string
    questionType: string
    question: string
    /** Lincoln's audio response URL (set when he records) */
    responseUrl?: string
    /** Text summary of response (optional, Shelly can add) */
    responseNote?: string
    /** Whether Lincoln has responded */
    responded?: boolean
  }
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
  /** Mastery level observed by parent after completion */
  mastery?: 'got-it' | 'working' | 'stuck'
  /** Guidance note when an item is skipped. */
  skipGuidance?: string
  /** Whether this item was explicitly skipped by the child. */
  skipped?: boolean
  /** Item type: routine, workbook, evaluation (Knowledge Mine/Fluency), or activity. */
  itemType?: 'routine' | 'workbook' | 'evaluation' | 'activity'
  /** Evaluation mode when itemType is 'evaluation'. */
  evaluationMode?: 'phonics' | 'comprehension' | 'fluency' | 'math'
  /** Route to navigate to (e.g., '/quest') for in-app activities. */
  link?: string
  /** Actual minutes spent (set on auto-complete from quest/fluency). */
  actualMinutes?: number
  /** ISO timestamp when item was completed. */
  completedAt?: string
  /** Brief content guide for workbook items (what to cover today). */
  contentGuide?: string
  /** Whether this workbook item has been scanned after completion. */
  scanned?: boolean
  /** Which schedule block this item belongs to */
  block?: ScheduleBlock
  /** Activity ID this runs simultaneously with */
  pairedWith?: string
  /** Group ID for "pick your order" items */
  choiceGroup?: string
  /** Can be dropped on light days */
  droppableOnLightDay?: boolean
  /** Building toward this — don't nag if unchecked */
  aspirational?: boolean
}

export interface ChapterResponse {
  id?: string
  childId: string
  date: string
  bookTitle: string
  chapter: string
  questionType: string
  question: string
  audioUrl: string | null
  textResponse?: string
  weekTheme: string
  virtue: string
  scripture: string
  createdAt: string
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

// ── Shelly Planner ─────────────────────────────────────────────

export interface AppBlock {
  label: string
  defaultMinutes: number
  notes?: string
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
  /** AI-generated summary of what to skip if time is short. */
  weekSkipSummary?: string
}

export interface DraftDayPlan {
  day: string
  timeBudgetMinutes: number
  items: DraftPlanItem[]
  chapterQuestion?: {
    book: string
    chapter: string
    questionType: string
    question: string
  }
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
  /** Guidance note when an item is skipped (from AI). */
  skipGuidance?: string
  /** Item type: routine, workbook, evaluation (Knowledge Mine/Fluency), or activity. */
  itemType?: 'routine' | 'workbook' | 'evaluation' | 'activity'
  /** Evaluation mode when itemType is 'evaluation'. */
  evaluationMode?: 'phonics' | 'comprehension' | 'fluency' | 'math'
  /** Route to navigate to (e.g., '/quest') for in-app activities. */
  link?: string
  /** Which schedule block this item belongs to */
  block?: ScheduleBlock
  /** Activity ID this runs simultaneously with */
  pairedWith?: string
  /** Group ID for "pick your order" items */
  choiceGroup?: string
  /** Can be dropped on light days */
  droppableOnLightDay?: boolean
  /** Building toward this — don't nag if unchecked */
  aspirational?: boolean
  /** Brief content guide for workbook items (what to cover today). */
  contentGuide?: string
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

/** Curriculum-specific metadata for a workbook */
export interface CurriculumMeta {
  /** Curriculum provider: 'gatb' | 'reading-eggs' | 'other' */
  provider: string
  /** Provider's level designation (e.g., 'Level 1', 'Level 4') */
  level?: string
  /** Most recent milestone achieved (e.g., 'Map 13 complete', 'Lesson 47') */
  lastMilestone?: string
  /** Date of last milestone (YYYY-MM-DD) */
  milestoneDate?: string
  /** Whether the program is fully completed */
  completed?: boolean
  /** Skills confirmed mastered by this curriculum */
  masteredSkills?: string[]
  /** Skills currently being worked on */
  activeSkills?: string[]
}

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
  /** Default minutes per day for this workbook/subject (used by AI planner as baseline) */
  defaultMinutes?: number
  /** Curriculum-specific metadata */
  curriculum?: CurriculumMeta
  /** Whether this workbook has been marked as complete (preserves record unlike delete) */
  completed?: boolean
  /** ISO date when workbook was marked complete */
  completedDate?: string
  createdAt?: string
  updatedAt?: string
}

/** Default minutes per subject for AI plan generation. Stored on family settings per child. */
export interface SubjectTimeDefaults {
  [subjectBucket: string]: number
}

/** Sensible defaults when no per-subject time has been configured. */
export const DEFAULT_SUBJECT_MINUTES: Record<string, number> = {
  Other: 10,       // Formation/Prayer
  Reading: 30,
  LanguageArts: 30,
  Math: 30,
  Science: 20,
  SocialStudies: 20,
}

export interface PaceGaugeResult {
  workbookName: string
  /** Current position in the workbook */
  currentPosition: number
  /** Total units in the workbook */
  totalUnits: number
  /** Unit label (lesson, page, chapter) */
  unitLabel: string
  status: PaceStatus
  /** Human-readable coverage summary */
  coverageText: string
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

// ── Curriculum Scan ──────────────────────────────────────────

/** Detected curriculum info from a scanned workbook page */
export interface CurriculumDetected {
  provider: 'gatb' | 'reading-eggs' | 'other' | null
  name: string | null
  lessonNumber: number | null
  pageNumber: number | null
  levelDesignation: string | null
}

export interface ScanSkillResult {
  skill: string
  level: 'introductory' | 'practice' | 'mastery' | 'review'
  alignsWithSnapshot: 'ahead' | 'at-level' | 'behind' | 'unknown'
}

export interface WorksheetScanResult {
  pageType: 'worksheet' | 'textbook' | 'test' | 'activity' | 'other'
  subject: string
  specificTopic: string
  skillsTargeted: ScanSkillResult[]
  estimatedDifficulty: 'easy' | 'appropriate' | 'challenging' | 'too-hard'
  recommendation: 'do' | 'skip' | 'quick-review' | 'modify'
  recommendationReason: string
  estimatedMinutes: number
  teacherNotes: string
  curriculumDetected?: CurriculumDetected
}

export interface CertificateScanResult {
  pageType: 'certificate'
  curriculum: 'reading-eggs' | 'gatb' | 'other'
  curriculumName: string
  level: string
  milestone: string
  lessonRange: string
  skillsCovered: string[]
  wordsRead: string[]
  date: string
  childName: string
  suggestedSnapshotUpdate: {
    masteredSkills: string[]
    recommendedStartLevel: number | null
    notes: string
  }
  curriculumDetected?: CurriculumDetected
}

export type ScanResult = WorksheetScanResult | CertificateScanResult

/** Type guard for certificate scan results */
export function isCertificateScan(result: ScanResult): result is CertificateScanResult {
  return result.pageType === 'certificate'
}

/** Type guard for worksheet scan results */
export function isWorksheetScan(result: ScanResult): result is WorksheetScanResult {
  return result.pageType !== 'certificate'
}

export interface ScanRecord {
  id?: string
  childId: string
  imageUrl: string
  storagePath: string
  results: ScanResult | null
  action: 'added' | 'skipped' | 'pending'
  error?: string
  createdAt?: string
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

// ── Activity Configs (structured routine + workbook replacement) ──

export interface ActivityConfig {
  id: string
  /** Activity display name (e.g., "Good and the Beautiful Reading") */
  name: string
  /** Activity category */
  type: ActivityType
  /** Subject for color-coding and grouping */
  subjectBucket: SubjectBucket
  /** Default duration in minutes */
  defaultMinutes: number
  /** How often this activity appears in a weekly plan */
  frequency: ActivityFrequency
  /** Which child, or 'both' for shared activities */
  childId: string | 'both'
  /** Explicit ordering (lower = earlier in day) */
  sortOrder: number

  // Workbook-specific fields (optional)
  /** Curriculum provider (e.g., "GATB", "Explode the Code") */
  curriculum?: string
  /** Total lessons/chapters/units */
  totalUnits?: number
  /** Current position (lesson/page number) */
  currentPosition?: number
  /** Unit label: "lesson", "chapter", "unit" */
  unitLabel?: string

  // Completion tracking
  /** Whether this program is finished */
  completed: boolean
  /** ISO date when marked complete */
  completedDate?: string

  // Scan/map connection
  /** Whether Shelly can scan pages from this activity */
  scannable: boolean
  /** Curriculum map node IDs this feeds */
  linkedCurriculumNodes?: string[]

  // Block-based schedule grouping
  /** Which schedule block this activity belongs to */
  block?: ScheduleBlock
  /** Activity ID this runs simultaneously with (e.g., handwriting during read-aloud) */
  pairedWith?: string
  /** Group ID for "pick your order" items (e.g., Lincoln's choice block) */
  choiceGroup?: string
  /** Can be dropped when energy is low / light day */
  droppableOnLightDay?: boolean
  /** Building toward this — don't count as missed if unchecked */
  aspirational?: boolean

  // Metadata
  /** Shelly's notes */
  notes?: string
  createdAt: string
  updatedAt: string
}
