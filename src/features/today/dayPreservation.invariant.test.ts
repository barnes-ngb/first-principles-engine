import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayBlock } from '../../core/types'
import { retainBlocksForApply, retainChecklistForApply } from './applyReset'
import { findDayPreservationViolations } from './dayWriteGuard'

/**
 * Pure-logic invariant (FEAT-113, Part 2): the day-reshaping transforms that
 * run on apply/redo — `retainChecklistForApply` / `retainBlocksForApply` — can
 * NEVER produce a `before → after` that drops a completed item or drops a block
 * carrying logged minutes. These are the only reachable automated transforms in
 * the days write path (rollover only appends prev-day incompletes; manual edits
 * are the parent's authority and keep entity identity), so proving them here
 * proves "no reachable transform reduces a day's actualMinutes or drops a
 * completed item" — the property the guard enforces at runtime.
 */

const item = (over: Partial<ChecklistItem>): ChecklistItem => ({
  label: 'Item',
  completed: false,
  ...over,
})
const block = (over: Partial<DayBlock>): DayBlock => ({ type: 'Reading', ...over })

// A deliberately adversarial pre-transform day: completed work (with minutes +
// evidence), manual items, rolled-over residue, incomplete planner items, and
// blocks both with and without logged minutes.
const before = {
  checklist: [
    item({ label: 'Reading done', completed: true, source: 'planner', actualMinutes: 20 }),
    item({
      label: 'Workbook done',
      completed: true,
      source: 'planner',
      evidenceArtifactId: 'scan_1',
      evidenceCollection: 'scans' as const,
    }),
    item({ label: 'Manual chore', completed: false, source: 'manual' }),
    item({ label: 'Stale rolled math', completed: false, source: 'planner', rolledOverFrom: '2026-07-17' }),
    item({ label: 'Fresh planner item', completed: false, source: 'planner' }),
  ],
  blocks: [
    block({ title: 'Reading', actualMinutes: 20, source: 'planner' }),
    block({ title: 'Manual block', source: 'manual' }),
    block({ title: 'Empty planner block', source: 'planner' }),
  ],
}

describe('day-preservation transform invariant', () => {
  it('retainChecklistForApply never drops a completed item', () => {
    const after = retainChecklistForApply(before.checklist)
    const completedBefore = before.checklist.filter((i) => i.completed).map((i) => i.label)
    const labelsAfter = after.map((i) => i.label)
    for (const label of completedBefore) expect(labelsAfter).toContain(label)
  })

  it('retainBlocksForApply never drops a block carrying logged minutes', () => {
    const after = retainBlocksForApply(before.blocks)
    const withMinutes = before.blocks.filter((b) => (b.actualMinutes ?? 0) > 0).map((b) => b.title)
    const titlesAfter = after.map((b) => b.title)
    for (const t of withMinutes) expect(titlesAfter).toContain(t)
  })

  it('the full apply/redo retain transform passes the runtime guard (no violations)', () => {
    // Model the apply path: retained existing + fresh planned items appended.
    const fresh = [item({ label: 'New planned reading', completed: false, source: 'planner' })]
    const after = {
      checklist: [...retainChecklistForApply(before.checklist), ...fresh],
      blocks: [...retainBlocksForApply(before.blocks), block({ title: 'New', source: 'planner' })],
    }
    expect(findDayPreservationViolations(before, after)).toEqual([])
  })

  it('preserves evidence on retained completed items', () => {
    const after = { checklist: retainChecklistForApply(before.checklist), blocks: [] }
    expect(findDayPreservationViolations({ ...before, blocks: [] }, after)).toEqual([])
  })

  it('a hand-written "manual-only" filter (the old redo bug) DOES violate — proving the guard would catch it', () => {
    // The exact filter the P0 hotfix removed: keep only manual, drop completed.
    const buggyChecklist = before.checklist.filter((i) => i.source === 'manual')
    const buggyBlocks = before.blocks.filter((b) => b.source === 'manual')
    const violations = findDayPreservationViolations(before, {
      checklist: buggyChecklist,
      blocks: buggyBlocks,
    })
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join(' ')).toMatch(/completed item/)
  })
})
