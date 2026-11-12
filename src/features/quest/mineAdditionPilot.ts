// ── WHETHER a Start may carry the addition probe (UX-495) ──────────────────
//
// One pure decision, taken inside the Mine's own Start after its reads have
// landed. The town's invitation is an offer; the suggestion card's tap is a
// request; neither authorises anything. This is where the request is checked
// against the child's own data as it stands NOW.
//
// What must all hold, and why each one is here:
//
//   • the request is for THIS family and child, and for the Math quest at the
//     level the template was checked for — never an ordinary/direct start
//     (which sends no request at all), another mode, or another level;
//   • the TRIP is still the exact journey the card was drawn for, re-read from
//     the store rather than trusted from the closure;
//   • the OFFER is still the offer: the same concept, and still sourced from a
//     fresh synthesis. `selectMineInvitation` — the same pure selector the town
//     and the suggestion card run — is re-run on the model this Start read, so
//     the QUEUE still takes precedence: an eligible queued ask that arrived
//     between the card's commit and this asynchronous read makes the selector
//     answer `ask`, and the pilot falls away to ordinary calibrated Math;
//   • the calibration predicates are the existing ones, applied to the owner
//     snapshot this Start re-read, so an uncalibrated child is refused here as
//     well as on the card;
//   • the staleness MARK is respected, because the selector respects it — a
//     stale synthesis offers nothing;
//   • the synthesis GENERATION agrees THREE ways — the town's, carried on the
//     trip; the Mine card's own committed read; and this Start's re-read, which
//     is the comparison made here. A same-concept synthesis B that replaced A
//     while the child walked over leaves the concept, the mode and the source
//     unchanged, so the generation is the only thing that can tell them apart.
//     It is the synthesis's existing `generatedAt`, and a missing, blank or
//     non-string value is not a usable generation;
//   • the loaded model and snapshot are stamped for THIS child — both reads
//     keep their previous answer while the next one is in flight.
//
// Anything short of all of that returns `null`, which is the ordinary
// calibrated Math Start the suggestion has always been.

import {
  selectMineInvitation,
  MineInvitationSource,
} from '../avatar/stonebridge/mineInvitation'
import type { EvaluationDomain } from '../../core/types/enums'
import type { LearnerModel } from '../../core/types/learnerModel'
import {
  MINE_ADDITION_PROBE_CONCEPT,
  MINE_ADDITION_PROBE_LEVEL,
  MINE_ADDITION_PROBE_TEMPLATE_ID,
} from './mineAdditionProbe'
import {
  MINE_ADDITION_PROBE_KIND,
  type MineAdditionPilotTarget,
  type QuestMode,
} from './questTypes'

/**
 * What the suggestion card OFFERED, as the card committed it — the half of the
 * request only the card can know.
 *
 * It carries no prose and no advice, only the offer's identity.
 */
export interface MineAdditionPilotOffer {
  conceptId: string
  domain: EvaluationDomain
  questMode: QuestMode
  /** Where the offer came from. Only a fresh synthesis authorises the pilot. */
  offerSource: string
  /** The offer's synthesis generation — `synthesis.generatedAt`, as committed. */
  synthesisGeneratedAt: string
}

/**
 * The request a suggested Start carries: the committed offer, plus the scope
 * and journey the host owns.
 */
export interface MineAdditionPilotRequest extends MineAdditionPilotOffer {
  familyId: string
  childId: string
  /** The Mine trip generation the card was rendered for. */
  tripGeneration: number
  /**
   * Is that exact trip still live, read from the store at the moment the Start
   * asks? Supplied by the host, which owns the journey — the hook owns the
   * model. A request without it is refused, so a caller that cannot answer the
   * question gets ordinary Math rather than an unverified probe.
   */
  tripStillLive: () => boolean
}

export interface ResolveMineAdditionPilotInput {
  request: MineAdditionPilotRequest | null | undefined
  /** The scope the Start froze — family, child, domain, mode and start level. */
  familyId: string
  childId: string
  domain: EvaluationDomain
  questMode: QuestMode | undefined
  startLevel: number
  /**
   * The owner model this Start re-read. Missing or failed reads refuse, and so
   * does a document stamped for another child (UX-495 correction): both reads
   * behind this decision keep their previous answer while the next one is in
   * flight, so the stamp is the one thing that can say the document is this
   * child's own.
   */
  model:
    | (Pick<LearnerModel, 'openQuestions' | 'synthesis' | 'synthesisStaleAt'> &
        Partial<Pick<LearnerModel, 'childId'>>)
    | null
    | undefined
  /** The owner snapshot's own `childId`, when the document carries one. */
  snapshotChildId?: string
  /** `hasReadingCalibration(snapshot)` — the existing predicate. */
  readingCalibrated: boolean
  /** `hasMathCalibration(snapshot)` — likewise. */
  mathCalibrated: boolean
}

/** The accepted pilot target for this Start, or `null` for ordinary Math. */
export function resolveMineAdditionPilot(
  input: ResolveMineAdditionPilotInput,
): MineAdditionPilotTarget | null {
  const request = input.request
  if (!request) return null
  if (typeof request.tripStillLive !== 'function') return null

  // ── The scope the run was frozen with ──────────────────────
  if (!input.familyId || !input.childId) return null
  if (request.familyId !== input.familyId) return null
  if (request.childId !== input.childId) return null

  // ── The one mode, domain and level this pilot is for ───────
  if (input.domain !== 'math' || input.questMode !== 'math') return null
  if (request.domain !== input.domain || request.questMode !== input.questMode) return null
  if (input.startLevel !== MINE_ADDITION_PROBE_LEVEL) return null

  // ── The offer's own identity ───────────────────────────────
  if (request.conceptId !== MINE_ADDITION_PROBE_CONCEPT) return null
  if (request.offerSource !== MineInvitationSource.Synthesis) return null
  if (typeof request.synthesisGeneratedAt !== 'string') return null
  const requestedGeneration = request.synthesisGeneratedAt.trim()
  if (requestedGeneration === '') return null

  // ── The journey, re-read rather than trusted ───────────────
  if (!Number.isInteger(request.tripGeneration) || request.tripGeneration <= 0) return null
  if (!request.tripStillLive()) return null

  // ── The offer, re-derived from this Start's own read ───────
  const model = input.model
  if (!model) return null
  // A document stamped for someone else cannot authorise this child's probe.
  if (model.childId && model.childId !== input.childId) return null
  if (input.snapshotChildId && input.snapshotChildId !== input.childId) return null
  const live = selectMineInvitation({
    model,
    readingCalibrated: input.readingCalibrated,
    mathCalibrated: input.mathCalibrated,
    expectedChildId: input.childId,
  })
  if (!live) return null
  // The queue takes precedence: a selector answering `ask` means the model is
  // waiting for something else, and no probe is attached.
  if (live.source !== MineInvitationSource.Synthesis) return null
  if (live.conceptId !== request.conceptId) return null
  if (live.domain !== input.domain) return null
  if (live.questMode !== 'math') return null
  /**
   * The THIRD generation: the one the selector just read off this Start's own
   * model document. It must be a usable value and it must be the one the card
   * committed and the trip carried — otherwise the synthesis moved between the
   * tap and this read, and this is no longer the same piece of advice.
   */
  const generation =
    typeof live.synthesisGeneratedAt === 'string' ? live.synthesisGeneratedAt.trim() : ''
  if (generation === '' || generation !== requestedGeneration) return null

  return {
    kind: MINE_ADDITION_PROBE_KIND,
    templateId: MINE_ADDITION_PROBE_TEMPLATE_ID,
    conceptId: MINE_ADDITION_PROBE_CONCEPT,
    offerSource: 'synthesis',
    synthesisGeneratedAt: generation,
    level: MINE_ADDITION_PROBE_LEVEL,
  }
}
