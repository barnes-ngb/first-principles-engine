import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayBlock } from '../../core/types'
import { retainBlocksForApply, retainChecklistForApply } from '../today/applyReset'
import { isPlanningWeekPast } from './chatPlanner.logic'

/**
 * P0 regression: "Start Over / Redo Plan" (`handleRedoPlan` in PlannerChatPage)
 * used to clear a day log with a raw `source === 'manual'` filter, which dropped
 * every completed planner item — and its logged `actualMinutes` / evidence — and
 * every planner block carrying tracked minutes. That silently erased completed
 * work and compliance hours (the identical loss path FEAT-111 fixed in
 * `handleApplyPlan`, still live in its sibling and user-triggerable).
 *
 * The fix reuses the SAME already-tested guards as apply
 * (`retainChecklistForApply` / `retainBlocksForApply`), so redo keeps completed
 * work + manual items + tracked blocks and clears only un-started planner
 * residue. These tests mirror `applyReset.test.ts` against the redo transform
 * the component now performs per day log, plus the FEAT-112 past-week backstop
 * the redo path previously lacked.
 */

const item = (over: Partial<ChecklistItem>): ChecklistItem => ({
  label: 'Item',
  completed: false,
  ...over,
})

const block = (over: Partial<DayBlock>): DayBlock => ({
  type: 'Reading',
  ...over,
})

// The exact day-log transform `handleRedoPlan` applies to an existing day log:
// keep what the shared guards retain, drop the rest. (Redo does not append fresh
// planned items — that is apply's job.)
function redoDayLog(existing: { checklist?: ChecklistItem[]; blocks?: DayBlock[] }) {
  return {
    checklist: retainChecklistForApply(existing.checklist ?? []),
    blocks: retainBlocksForApply(existing.blocks ?? []),
  }
}

describe('handleRedoPlan day-log reset', () => {
  it('the P0 case: a completed planner item + a tracked planner block + a manual item all survive Redo', () => {
    const completed = item({
      label: 'Reading (20m)',
      completed: true,
      source: 'planner',
      actualMinutes: 22,
      completedAt: '2026-07-20T15:00:00.000Z',
      evidenceArtifactId: 'art-1',
      evidenceCollection: 'artifacts',
    })
    const manual = item({ label: 'Field trip note', source: 'manual' })
    const stalePlanner = item({ label: 'Un-started reading (15m)', source: 'planner' })

    const trackedBlock = block({ source: 'planner', actualMinutes: 30 })
    const untrackedBlock = block({ source: 'planner', plannedMinutes: 20 })

    const result = redoDayLog({
      checklist: [completed, manual, stalePlanner],
      blocks: [trackedBlock, untrackedBlock],
    })

    // Completions (+ their minutes/evidence) and manual items are kept intact.
    expect(result.checklist).toEqual([completed, manual])
    expect(result.checklist[0].actualMinutes).toBe(22)
    expect(result.checklist[0].evidenceArtifactId).toBe('art-1')
    // The block carrying logged minutes stays; the un-started one is cleared.
    expect(result.blocks).toEqual([trackedBlock])
  })

  it('still clears un-started planner residue — the feature\'s actual purpose', () => {
    const result = redoDayLog({
      checklist: [item({ label: 'Un-started (15m)', source: 'planner' })],
      blocks: [block({ source: 'planner', plannedMinutes: 25 })],
    })
    expect(result.checklist).toEqual([])
    expect(result.blocks).toEqual([])
  })
})

describe('handleRedoPlan past-week backstop', () => {
  it('refuses when the whole planning week has already passed', () => {
    // Week of Sun 2026-07-05 → Fri 2026-07-10; today is 2026-07-20 → passed.
    expect(isPlanningWeekPast('2026-07-05', '2026-07-20')).toBe(true)
  })

  it('allows an in-progress or upcoming week (Friday today-or-future)', () => {
    // Week of Sun 2026-07-19 → Fri 2026-07-24; today is 2026-07-20 → not past.
    expect(isPlanningWeekPast('2026-07-19', '2026-07-20')).toBe(false)
  })
})
