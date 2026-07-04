import type {
  ArcOrigin,
  ArcStepStatus,
  DadLabStatus,
  DadLabType,
  EngineStage,
  LabBeatId,
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
  /** The ConceptArc this project belongs to. forward-compat, no consumers (see FEAT-41 design §2). */
  arcId?: string
  /** Which ArcStep this project realizes. forward-compat, no consumers (see FEAT-41 design §2). */
  arcStepIndex?: number
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

// ── Dad Lab Reports ─────────────────────────────────────────────

export interface ChildLabReport {
  prediction?: string
  explanation?: string
  observation?: string
  creation?: string
  artifacts: string[]
  notes?: string
}

// ── Three-beat capture (FEAT-56) ────────────────────────────────
// Additive layer over ChildLabReport. The default lab capture is three beats in
// kid words — Predict / Try / What we saw — replacing the up-front five-step
// framework (now behind an "expand full framework" control). One set of beats per
// lab, with per-item kid attribution (not duplicated per child). Absent on
// pre-FEAT-56 reports; those render via the legacy per-child fields untouched.

/** Attribution for a beat item or its writing line: a childId, or 'both'. */
export const BEAT_BOTH = 'both'

/** One captured photo/audio artifact within a beat, with its own kid attribution. */
export interface LabBeatItem {
  /** Artifact doc ID (photo or audio) in the `artifacts` collection. */
  artifactId: string
  /** `'both'` (default) or a specific childId (ARCH-40 — no name logic). */
  child: string
}

/** One beat's captured content: an optional writing line + captured items. */
export interface LabBeat {
  /** The optional single-line writing stretch — inviting, never required. */
  text?: string
  /** Attribution for the writing line (`'both'` | childId). */
  textChild?: string
  /** Captured photo/audio items, each with per-item attribution. */
  items: LabBeatItem[]
}

/** The three beats of a lab capture. Keyed by {@link LabBeatId}. */
export type LabBeats = Record<LabBeatId, LabBeat>

/** An empty beat (no writing line, no items). */
export function emptyLabBeat(): LabBeat {
  return { items: [] }
}

/** An empty three-beat set. */
export function emptyLabBeats(): LabBeats {
  return { predict: emptyLabBeat(), try: emptyLabBeat(), saw: emptyLabBeat() }
}

/** True when any beat carries a writing line or a captured item. */
export function labBeatsHaveContent(beats: LabBeats | undefined): boolean {
  if (!beats) return false
  return (Object.values(beats) as LabBeat[]).some(
    (b) => (b.text?.trim().length ?? 0) > 0 || b.items.length > 0,
  )
}

/** Framework steps for each lab type */
export const LAB_FRAMEWORKS: Record<string, { label: string; steps: string[] }> = {
  science: {
    label: 'Scientific Method',
    steps: ['Question', 'Hypothesis', 'Test', 'Observe', 'Conclude'],
  },
  engineering: {
    label: 'Engineering Design',
    steps: ['Problem', 'Design', 'Build', 'Test', 'Improve'],
  },
  adventure: {
    label: 'Discovery',
    steps: ['Wonder', 'Observe', 'Document', 'Research', 'Share'],
  },
  heart: {
    label: 'Creative / Character',
    steps: ['Inspiration', 'Plan', 'Make', 'Reflect', 'Display'],
  },
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
  /**
   * Per-child role description (set during planning), keyed by childId.
   * The name-agnostic replacement for `lincolnRole`/`londonRole` (ARCH-40).
   * Read via `normalizeChildRoles`, which also maps legacy docs forward.
   */
  childRoles?: Record<string, string>
  /** @deprecated legacy read-only — normalized via normalizeChildRoles; do not write */
  lincolnRole?: string
  /** @deprecated legacy read-only — normalized via normalizeChildRoles; do not write */
  londonRole?: string
  childReports: Record<string, ChildLabReport>
  /**
   * Three-beat capture (FEAT-56) — Predict / Try / What we saw. Additive and
   * optional: absent on pre-FEAT-56 reports, which render via the legacy
   * per-child fields in `childReports`. One set of beats, per-item attribution.
   */
  beats?: LabBeats
  subjectTags: SubjectBucket[]
  skillTags?: string[]
  virtueTag?: string
  dadReflection?: string
  bestMoment?: string
  nextTime?: string
  totalMinutes?: number
  createdAt: string
  updatedAt: string
  /** The ConceptArc this lab belongs to (absent = one-off lab, today's behavior). */
  arcId?: string
  /** Which ArcStep (by index into ConceptArc.steps) this lab realizes. */
  arcStepIndex?: number
}

// ── Concept Arcs (FEAT-44 / builds FEAT-41 design) ──────────────
// Additive planning/narrative layer above the live DadLabReport object. Introduces
// no change to how a single lab is planned, run, credited, or reported. See
// docs/DAD_LAB_CONCEPT_ARCS_DESIGN.md.

/** One ordered concept beat within a ConceptArc. */
export interface ArcStep {
  /** Short beat name, e.g. "Make a bulb light up". */
  title: string
  /** The idea this step teaches, one line. */
  conceptBeat: string
  /** upcoming | active | done — the step's own coverage record (design D1 Option C). */
  status: ArcStepStatus
  /** Optional owner/AI sketch of the lab that realizes this beat (type + driving question). */
  suggestedLabShape?: string
  /** Set when a DadLabReport is completed for this step. */
  completedReportId?: string
  /** Date (YYYY-MM-DD) the step was marked done. */
  completedDateKey?: string
}

/**
 * A designed sequence of labs that builds a concept progression across Saturdays
 * (e.g. electricity: static → circuit → switch → motor). An arc is a lightweight
 * ordered container; an arc's `steps[].status` is its own coverage record (no
 * concept map — design D1 Option C).
 */
export interface ConceptArc {
  id?: string
  /** Arc name, e.g. "The Electricity Arc". */
  title: string
  /** Free-text domain label (NOT a Learning-Map reference), e.g. "Electricity". */
  domainLabel?: string
  /** Children this arc is for. Defaults to both children (DATA-04). */
  childIds: string[]
  /** Ordered concept beats. */
  steps: ArcStep[]
  /** How the arc was authored. Slice 1 only writes `'owner-authored'`. */
  createdFrom: ArcOrigin
  /** Optional Stonebridge / narrative tie-in (design D5 — evaluate, don't force). */
  narrativeHook?: string
  createdAt: string
  updatedAt: string
  /** Soft-archive timestamp (ISO). Archived arcs are hidden from the active list. */
  archivedAt?: string
}
