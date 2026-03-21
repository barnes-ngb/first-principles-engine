import type {
  DadLabStatus,
  DadLabType,
  EngineStage,
  LabSessionStatus,
  ProjectPhase,
  SubjectBucket,
} from './enums'

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
