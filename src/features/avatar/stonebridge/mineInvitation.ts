/**
 * WHICH Mine mode the town may invite a child into — one pure decision.
 *
 * ── What it decides, and what it deliberately cannot ─────────────────────────
 *
 * The town's invitation names a quest MODE ("a reading dig", "a math dig"), not
 * a question and not a level. So this answers exactly one thing: given a child's
 * learner model and which Mine domains their snapshot is calibrated for, is
 * there a known next move that an EXISTING, calibrated Mine mode can carry?
 *
 * Pure: no Firestore, no clock, no React, no writes. It generates no synthesis,
 * compares no timestamps and selects no child — a caller hands it data it has
 * already read inside its own scope, and gets back one offer or nothing.
 *
 * ── The order, which is the whole design ─────────────────────────────────────
 *
 *   1. **The queue wins.** An unresolved `routedTo:'quest'` ask in a calibrated
 *      domain is the authoritative "this is what we are waiting to see", so it
 *      is read FIRST through `selectQuestTargets` — the same selector the Mine's
 *      own session targeting uses, so "which asks are eligible, and in what
 *      order" has one definition (unresolved, a real graph concept, queue order,
 *      deduped). Today asks and parent-origin (Review Chat) asks are the same
 *      entries and are not told apart here.
 *   2. **A first eligible ask whose mode is not supported SUPPRESSES.** The two
 *      supported modes are a starting set, and the queue is the authority: an
 *      invitation into some other mode would contradict what the model is
 *      actually waiting for, so the town stays quiet instead. It does not fall
 *      through to synthesis.
 *   3. **Only with nothing eligible queued** is `synthesis.whatMattersNext`
 *      read, and only when a synthesis exists and `synthesisStaleAt` is falsy —
 *      the stored staleness MARK, never a timestamp comparison of our own. The
 *      first compatible (known, calibrated, supported) `quest`-vehicle move
 *      supplies the offer; an incompatible move is skipped rather than being
 *      treated as a suppression, because synthesis is advice and the queue is
 *      not.
 *
 * Missing, failed, uncalibrated and unsupported data all land on `null`, which
 * is the ordinary town with no invitation on it.
 */
import { FOUNDATION_NODE_MAP } from '../../../core/foundations'
import { selectQuestTargets } from '../../../core/foundations/questTargeting'
import { EvaluationDomain } from '../../../core/types/enums'
import type { LearnerModel } from '../../../core/types/learnerModel'
import { SynthesisVehicle } from '../../../core/types/learnerModel'
import { MINE_MATH_DIG_LABEL, MINE_READING_DIG_LABEL } from './libraryReturnCopy'

/** The Mine quest modes an invitation may name. Existing modes only. */
export type MineInvitationMode = 'phonics' | 'math'

/** One supported concept → one existing, calibrated Mine mode. */
export interface MineInvitationTarget {
  domain: EvaluationDomain
  questMode: MineInvitationMode
  /** The action's words, held to the kid readability bar in `libraryReturnCopy`. */
  label: string
}

/**
 * The starting set: two concepts, two modes a child already has.
 *
 * Deliberately a short explicit table rather than a rule over the graph. A mode
 * is a thing the Mine really mounts and is calibrated for; deriving one from a
 * concept id would invent modes for the other fifty-odd nodes.
 */
export const MINE_INVITATION_TARGETS: Readonly<Record<string, MineInvitationTarget>> = {
  'reading.phonics.cvc': {
    domain: EvaluationDomain.Reading,
    questMode: 'phonics',
    label: MINE_READING_DIG_LABEL,
  },
  'math.operations.addWithin20': {
    domain: EvaluationDomain.Math,
    questMode: 'math',
    label: MINE_MATH_DIG_LABEL,
  },
}

/** Where an offer came from — for the arrival's revalidation, not for display. */
export const MineInvitationSource = {
  /** A queued, unresolved quest ask. */
  Ask: 'ask',
  /** A fresh synthesis move. */
  Synthesis: 'synthesis',
} as const
export type MineInvitationSource =
  (typeof MineInvitationSource)[keyof typeof MineInvitationSource]

/** One offer: a concept, the existing mode that carries it, and its words. */
export interface MineInvitation extends MineInvitationTarget {
  conceptId: string
  source: MineInvitationSource
  /**
   * WHICH synthesis said so — the stored `synthesis.generatedAt` (UX-495).
   *
   * Present only on a `synthesis` offer, and only when the stored value is a
   * usable, non-blank string whose model document is this child's. Absent on
   * every queued (`ask`) offer, because a queued ask is not advice and has no
   * generation of its own.
   *
   * The offer itself is still only ever a MODE. This field exists so a surface
   * that needs to know the offer is the SAME piece of advice — rather than the
   * same mode — can compare generations end to end instead of re-deriving one.
   * Nothing in the ordinary mode decision reads it.
   */
  synthesisGeneratedAt?: string
}

export interface MineInvitationInput {
  /** The child's own model, as read inside the asking scope. */
  model:
    | Pick<LearnerModel, 'openQuestions' | 'synthesis' | 'synthesisStaleAt'>
    | (Pick<LearnerModel, 'openQuestions' | 'synthesis' | 'synthesisStaleAt'> &
        Partial<Pick<LearnerModel, 'childId'>>)
    | null
    | undefined
  /** `hasReadingCalibration(snapshot)` — the existing predicate, not a guess. */
  readingCalibrated: boolean
  /** `hasMathCalibration(snapshot)` — likewise. */
  mathCalibrated: boolean
  /**
   * The child this read was made FOR, when the caller knows it (UX-495).
   *
   * Used for one thing only: a model document whose own `childId` disagrees
   * with it cannot contribute a synthesis GENERATION, because both hooks behind
   * these surfaces keep their previous answer while the next read is in flight.
   * The mode decision is deliberately unchanged — it was already mount-scoped —
   * so an omitted value behaves exactly as before.
   */
  expectedChildId?: string
}

/** Is the domain this concept belongs to one the child is calibrated for? */
function domainCalibrated(conceptId: string, input: MineInvitationInput): boolean {
  const domain = FOUNDATION_NODE_MAP[conceptId]?.domain
  if (domain === EvaluationDomain.Reading) return input.readingCalibrated
  if (domain === EvaluationDomain.Math) return input.mathCalibrated
  return false
}

function offerFor(
  conceptId: string,
  source: MineInvitationSource,
  synthesisGeneratedAt?: string,
): MineInvitation | null {
  const target = MINE_INVITATION_TARGETS[conceptId]
  if (!target) return null
  return {
    conceptId,
    source,
    ...target,
    ...(synthesisGeneratedAt ? { synthesisGeneratedAt } : {}),
  }
}

/**
 * The stored synthesis generation this read may carry, or `''` for none.
 *
 * Fails closed on every shape that is not an affirmative answer: no synthesis,
 * a missing or non-string or blank `generatedAt`, and a model document stamped
 * for another child than the one this read was made for.
 */
function usableSynthesisGeneration(input: MineInvitationInput): string {
  const model = input.model
  if (!model) return ''
  const stamped = (model as Partial<Pick<LearnerModel, 'childId'>>).childId
  if (input.expectedChildId && stamped && stamped !== input.expectedChildId) return ''
  const generatedAt = model.synthesis?.generatedAt
  if (typeof generatedAt !== 'string') return ''
  return generatedAt.trim()
}

/**
 * The eligible queued asks, in queue order — `selectQuestTargets`' own
 * semantics, narrowed to calibrated domains.
 *
 * `max` is the number of entries rather than the selector's default 3, because
 * the default exists to season a 10-question session and this is asking a
 * different question: the selector caps BEFORE the domain filter, so a default
 * cap would hide a calibrated ask behind three uncalibrated ones.
 */
function eligibleAsks(input: MineInvitationInput): string[] {
  const openQuestions = input.model?.openQuestions ?? []
  if (openQuestions.length === 0) return []
  return selectQuestTargets({ openQuestions }, { max: openQuestions.length })
    .map((target) => target.conceptId)
    .filter((conceptId) => domainCalibrated(conceptId, input))
}

/** The one offer this child's data supports, or `null` for an ordinary town. */
export function selectMineInvitation(input: MineInvitationInput): MineInvitation | null {
  if (!input.model) return null

  const asks = eligibleAsks(input)
  // The queue is the authority: its first eligible ask either supplies the
  // invitation or silences it. Never a fall-through to synthesis.
  if (asks.length > 0) return offerFor(asks[0], MineInvitationSource.Ask)

  const synthesis = input.model.synthesis
  if (!synthesis || input.model.synthesisStaleAt) return null
  // WHICH synthesis this is, decided once for the whole branch: a generation
  // is a property of the stored synthesis, not of the move that was picked.
  const generation = usableSynthesisGeneration(input)
  for (const move of synthesis.whatMattersNext ?? []) {
    if (move.suggestedVehicle !== SynthesisVehicle.Quest) continue
    if (!FOUNDATION_NODE_MAP[move.conceptId]) continue
    if (!domainCalibrated(move.conceptId, input)) continue
    const offer = offerFor(move.conceptId, MineInvitationSource.Synthesis, generation)
    if (offer) return offer
  }
  return null
}
