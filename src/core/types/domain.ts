import type {
  DayBlockType,
  EngineStage,
  EvidenceType,
  SubjectBucket,
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
  buildLab: string
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
  ladderRef?: string
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
  title: string
  description?: string
  rungs: Rung[]
}

export interface Rung {
  id?: string
  title: string
  description?: string
  order: number
  milestones?: MilestoneProgress[]
}

export interface MilestoneProgress {
  id?: string
  label: string
  achieved: boolean
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
  date: string
  summary: string
  strengths?: string[]
  nextSteps?: string[]
}
