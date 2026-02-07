import type {
  DayBlockType,
  EnergyLevel,
  EngineStage,
  EvidenceType,
  ProjectPhase,
  SessionResult,
  StreamId,
  SubjectBucket,
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
  days?: DayLog[]
}

export interface DayLog {
  date: string
  blocks: DayBlock[]
  retro?: string
  checklist?: ChecklistItem[]
  artifacts?: Artifact[]
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
  childId?: string
  dayLogId?: string
  weekPlanId?: string
  title: string
  type: EvidenceType
  uri?: string
  createdAt?: string
  content?: string
  tags: ArtifactTags
  notes?: string
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
  achieved: boolean
  status: 'locked' | 'active' | 'achieved'
  achievedAt?: string
  notes?: string
}

export interface HoursEntry {
  id?: string
  date: string
  hours?: number
  minutes: number
  blockType?: DayBlockType
  subjectBucket?: SubjectBucket
  location?: string
  quickCapture?: boolean
  notes?: string
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

export interface WeeklyScore {
  id?: string
  childId: string
  weekStart: string
  metrics: ScoreMetric[]
  reflectionWorked?: string
  reflectionFriction?: string
  reflectionTweak?: string
  createdAt?: string
}

export interface ScoreMetric {
  label: string
  result: SessionResult | 'na'
}
