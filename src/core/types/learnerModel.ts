/**
 * Learner Model types (FEAT-48, slice 1).
 *
 * One stored object per child (`families/{familyId}/learnerModels/{childId}`,
 * D1 ADOPTED) that projects the foundations concept graph onto a child's derived
 * signals. Surfaces **read** this doc — it is never regenerated on page load.
 *
 * Slice 1 ships the **deterministic layer only** (D5 PARTIAL): `conceptStates` +
 * their evidence trails, and a deterministic `modalityCalibration` block. The
 * judgment-layer fields (`whatMattersNext`, `changeFeed`, `openQuestions`) exist
 * here so the shape is stable, but stay empty until the slice-3 LLM beat fills
 * them. See `docs/LEARNER_MODEL_DESIGN.md` §3–§4 / §9.
 */

/**
 * The fixed concept-state vocabulary. The words *behind / critical / gap /
 * failing* appear nowhere: `frontier` is the positive framing of "the edge we're
 * working at", and `not-yet` means "we haven't seen it", not "can't".
 */
export const ConceptStateKind = {
  Solid: 'solid',
  Forming: 'forming',
  Frontier: 'frontier',
  NotYet: 'not-yet',
} as const
export type ConceptStateKind =
  (typeof ConceptStateKind)[keyof typeof ConceptStateKind]

/**
 * The typed evidence trail — the trust mechanism. Tapping a concept shows exactly
 * why it is in its state. This slice emits `workingLevel`, `sightWordShare`,
 * `prioritySkill`, and `completedProgram` refs; the union also names the kinds
 * later slices add (`eval`, `quest`, `scan`, `attestation`) so consumers can
 * switch on the full set now.
 */
export const EvidenceKind = {
  WorkingLevel: 'workingLevel',
  SightWordShare: 'sightWordShare',
  PrioritySkill: 'prioritySkill',
  CompletedProgram: 'completedProgram',
  // Reserved for later slices (not emitted by the deterministic seeder):
  Eval: 'eval',
  Quest: 'quest',
  Scan: 'scan',
  Attestation: 'attestation',
} as const
export type EvidenceKind = (typeof EvidenceKind)[keyof typeof EvidenceKind]

/**
 * A single evidence ref. `note` is the human one-liner shown on tap; the optional
 * structured fields carry the machine values behind it (a working level, a
 * mastered sight-word share) so a later UI can render without re-deriving.
 */
export interface EvidenceRef {
  kind: EvidenceKind
  /** sessionId / snapshot ref / word list ref / program id / etc. */
  sourceId: string
  /** Human one-liner, e.g. "Below phonics working level 4 (band 1 < frontier)". */
  note: string
  observedAt: string
  /** Domain this ref speaks to, when it derives from a per-domain signal. */
  domain?: string
  /** The working level behind a `workingLevel` ref. */
  level?: number
  /** Mastered share (0–1) behind a `sightWordShare` ref. */
  masteredShare?: number
}

/**
 * A concept's state plus its evidence trail. Slice 1 keeps this minimal (state +
 * evidence per the run scope); `confidence`/`source`/`lastMovedAt` from the full
 * design (§3.1) arrive with the judgment layer.
 *
 * **Invariant:** every non-`not-yet` state carries at least one {@link EvidenceRef}.
 * A stated concept with no evidence is a bug — evidence trails are the trust
 * mechanism.
 */
export interface ConceptStateEntry {
  state: ConceptStateKind
  evidence: EvidenceRef[]
  /** ISO stamp of when the seeder last wrote this entry. */
  seededAt?: string
}

/**
 * Per-modality calibration — first-class, calibration-never-avoidance. Slice 1
 * populates this deterministically from the same `workingLevels` fields
 * `buildCalibrationParagraph` reads (it does not call that function). The prose
 * `note`s are short and template-derived; slice 3 replaces them with LLM prose.
 */
export interface ModalityCalibrationEntry {
  /** Working level for the modality, when a working-level field backs it. */
  level?: number
  note: string
}

export interface ModalityCalibration {
  reading: ModalityCalibrationEntry
  writing: ModalityCalibrationEntry
  math: ModalityCalibrationEntry
}

// ── Judgment-layer placeholders (slice 3 fills these) ───────────────

/** A concrete next move (slice 3 — LLM). Shape stubbed for stability. */
export interface NextMove {
  conceptId: string
  title: string
  why: string
  kind: 'introduce' | 'practice' | 'consolidate' | 'calibrate'
  suggestedSurface?: 'plan' | 'quest' | 'dadLab' | 'reading' | 'teachback'
}

/** A recent state delta (slice 3 — LLM narrative). Shape stubbed for stability. */
export interface ChangeEntry {
  conceptId: string
  from: ConceptStateKind
  to: ConceptStateKind
  cause: string
  at: string
}

/** A routed ask (slice 3 — LLM phrasing). Shape stubbed for stability. */
export interface OpenQuestion {
  conceptId: string
  question: string
  routedTo: 'quest' | 'eval' | 'scan'
  reason: string
}

/**
 * The per-child stored model.
 *
 * `status`:
 * - `seeded` — deterministic layer written (slice 1's terminal state).
 * - `no-data` — nothing to seed from (empty snapshot + no sight words).
 * - `synthesized` — the LLM judgment layer has run (slice 3).
 */
export interface LearnerModel {
  id?: string
  childId: string
  /** Which spine this was seeded against, e.g. "reading@1+math@1". */
  graphVersion: string
  status: 'seeded' | 'synthesized' | 'no-data'
  conceptStates: Record<string, ConceptStateEntry>
  modalityCalibration: ModalityCalibration
  /** Slice 3 (LLM) — empty in slice 1. */
  whatMattersNext: NextMove[]
  /** Slice 3 (LLM) — empty in slice 1. */
  changeFeed: ChangeEntry[]
  /** Slice 3 (LLM) — empty in slice 1. */
  openQuestions: OpenQuestion[]
  seededAt: string
  updatedAt: string
}
