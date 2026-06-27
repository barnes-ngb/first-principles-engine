import type {
  DayBlockType,
  EvidenceType,
  RoutineItemKey,
} from './enums'
import type { HomeschoolState } from '../compliance/stateCompliance'

export interface FamilySettings {
  id?: string
  timeZone?: string
  weekStartDay?: string
  preferredEvidence?: EvidenceType[]
  /**
   * Which state's homeschool compliance rules apply (DATA-12). Drives the
   * compliance dashboard targets, required subjects, and export citation via
   * `getStateConfig`. Optional + defaults to `'MO'` everywhere it is read, so
   * existing family docs keep working with no migration. TX is defined but not
   * activated — there is no switch UI yet; see docs/review/STATE_COMPLIANCE_DESIGN.md.
   */
  homeschoolState?: HomeschoolState
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
  /**
   * Whisper-backed voice input (vs Web Speech). Opt-in per child;
   * see docs/DESIGN_VOICE_INPUT_MODULE.md §5. Lincoln defaults to true.
   */
  voiceInputEnhanced?: boolean
  /**
   * Human-owned "soft profile" — stable identity the Shelly portal's Tier B
   * will eventually edit (propose → confirm → write). Per the FUNC-01 ruling
   * these are stable identity owned by `children` (not `skillSnapshots`).
   * Plain freeform text (matches the `grade` convention), optional so existing
   * `children` docs keep working with no migration. Surfaced to AI prompts via
   * the `childProfile` context slice. See docs/barnes-shelly-chat-portal-design.md §3.
   * NOTE: `supports` is deliberately NOT here — it lives on `skillSnapshots` (Tier C).
   */
  /** What motivates this child (e.g. "Minecraft, Lego, Art"). */
  motivators?: string
  /** What this child is interested in / drawn to (e.g. "stories, dinosaurs"). */
  interests?: string
  /** This child's strengths (e.g. "persistence, visual memory"). */
  strengths?: string
}
