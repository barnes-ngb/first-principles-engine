import { describe, expect, it } from 'vitest'

import type { PaceAdjustment } from '../../core/types'
import { AdjustmentDecision } from '../../core/types/enums'
import {
  applyDecisionDraft,
  countAccepted,
  setDecision,
} from './adjustmentDecisions'

const adjustment = (
  id: string,
  decision: AdjustmentDecision = AdjustmentDecision.Pending,
) =>
  ({
    id,
    area: `Area ${id}`,
    currentPace: 'x',
    suggestedPace: 'y',
    rationale: 'because',
    decision,
  }) as PaceAdjustment

describe('the accept/reject draft (UX-214)', () => {
  it('records a choice without touching the review it came from', () => {
    const source = [adjustment('a'), adjustment('b')]
    const draft = setDecision({}, 'a', AdjustmentDecision.Accepted)

    expect(applyDecisionDraft(source, draft).map((x) => x.decision)).toEqual([
      'accepted',
      'pending',
    ])
    // The source list is untouched — an incoming snapshot can replace it freely.
    expect(source.map((x) => x.decision)).toEqual(['pending', 'pending'])
  })

  it('survives the review object being replaced underneath it', () => {
    // This is the whole point: saving an answer to the week's question fires the
    // page's onSnapshot listener, which replaces `review` with the document's
    // still-pending adjustments. The ticks must not go with it.
    const draft = setDecision({}, 'a', AdjustmentDecision.Accepted)
    const fromServer = [adjustment('a'), adjustment('b')]

    expect(countAccepted(applyDecisionDraft(fromServer, draft))).toBe(1)
  })

  it('keeps a decision already stored on the document', () => {
    const stored = [adjustment('a', AdjustmentDecision.Rejected)]
    expect(applyDecisionDraft(stored, {})[0].decision).toBe('rejected')
  })

  it('drops a tick whose suggestion no longer exists', () => {
    // The review was regenerated in another tab. Re-attaching the choice would
    // resurrect an obsolete suggestion beside a new narrative and mark it
    // applied.
    const draft = setDecision({}, 'old-id', AdjustmentDecision.Accepted)
    const regenerated = [adjustment('new-id')]

    const result = applyDecisionDraft(regenerated, draft)
    expect(result.map((x) => x.id)).toEqual(['new-id'])
    expect(countAccepted(result)).toBe(0)
  })

  it('lets a choice be changed and taken back', () => {
    let draft = setDecision({}, 'a', AdjustmentDecision.Accepted)
    draft = setDecision(draft, 'a', AdjustmentDecision.Pending)
    expect(countAccepted(applyDecisionDraft([adjustment('a')], draft))).toBe(0)
  })
})
