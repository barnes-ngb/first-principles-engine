import type {
  DayBlockType,
  EnergyLevel,
  EngineStage,
  EvidenceType,
  LabSessionStatus,
  ProjectPhase,
  RoutineItemKey,
  SessionResult,
  SessionSymbol,
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
}

export interface ChecklistItem {
  id?: string
  label: string
  completed: boolean
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
}

export interface LabSession {
  id?: string
  childId: string
  weekKey: string
  status: LabSessionStatus
  stage: EngineStage
  mission?: string
  constraints?: string
  roles?: string
  stageNotes?: Partial<Record<EngineStage, string>>
  createdAt?: string
  updatedAt?: string
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
