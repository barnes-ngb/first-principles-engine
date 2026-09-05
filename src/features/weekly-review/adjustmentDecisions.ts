import type { PaceAdjustment } from '../../core/types'
import { AdjustmentDecision } from '../../core/types/enums'

/**
 * The parent's un-applied accept/reject choices, held apart from the review
 * document they will eventually be written to (UX-214).
 *
 * **Why a separate draft.** The page used to record a choice by rewriting its
 * own copy of the review — which is a snapshot of whatever the `onSnapshot`
 * listener last delivered, and is replaced wholesale every time that listener
 * fires. So any write to the review document, including the parent saving their
 * answer to the week's question, silently threw away every accept/reject they
 * had ticked but not yet applied: the counter dropped to zero and the Apply
 * button greyed out with no explanation.
 *
 * Keeping the choices in their own map, keyed by adjustment id, makes an
 * incoming snapshot harmless — it refreshes the narrative underneath and leaves
 * the ticks alone — and lets Apply resolve the draft against whatever
 * adjustments the document *currently* holds rather than against a stale copy.
 *
 * Pure. No React, no Firestore.
 */
export type DecisionDraft = Record<string, AdjustmentDecision>

/** Record one choice. The caller passes the decision it wants, not a toggle. */
export function setDecision(
  draft: DecisionDraft,
  adjustmentId: string,
  decision: AdjustmentDecision,
): DecisionDraft {
  return { ...draft, [adjustmentId]: decision }
}

/**
 * Overlay the draft on a list of adjustments, by id.
 *
 * An id the draft does not mention keeps the decision stored on the document,
 * and an id in the draft that the list does not contain is **dropped** — that is
 * a choice about a suggestion which no longer exists (the review was
 * regenerated), and re-attaching it would resurrect an obsolete suggestion
 * beside a new narrative and mark it applied.
 */
export function applyDecisionDraft(
  adjustments: PaceAdjustment[],
  draft: DecisionDraft,
): PaceAdjustment[] {
  return adjustments.map((adjustment) => {
    const drafted = draft[adjustment.id]
    return drafted ? { ...adjustment, decision: drafted } : adjustment
  })
}

/** How many of these adjustments are accepted. */
export function countAccepted(adjustments: PaceAdjustment[]): number {
  return adjustments.filter((a) => a.decision === AdjustmentDecision.Accepted)
    .length
}
