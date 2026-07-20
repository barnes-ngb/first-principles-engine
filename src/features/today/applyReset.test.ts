import { describe, expect, it } from 'vitest'

import type { ChecklistItem, DayBlock } from '../../core/types'
import { retainBlocksForApply, retainChecklistForApply } from './applyReset'

const item = (over: Partial<ChecklistItem>): ChecklistItem => ({
  label: 'Item',
  completed: false,
  ...over,
})

const block = (over: Partial<DayBlock>): DayBlock => ({
  type: 'Reading',
  ...over,
})

describe('retainChecklistForApply', () => {
  it('drops incomplete pre-apply rolled-over residue', () => {
    const existing = [
      item({ label: 'Rolled math (10m)', source: 'planner', rolledOverFrom: '2026-07-17' }),
      item({ label: 'Planned reading (15m)', source: 'planner' }),
    ]
    expect(retainChecklistForApply(existing)).toEqual([])
  })

  it('keeps completed items and preserves their minutes/evidence — HARD CONSTRAINT', () => {
    const completed = item({
      label: 'Reading (20m)',
      completed: true,
      source: 'planner',
      actualMinutes: 22,
      completedAt: '2026-07-20T15:00:00.000Z',
      evidenceArtifactId: 'art-1',
      evidenceCollection: 'artifacts',
      estimatedMinutes: 20,
    })
    const retained = retainChecklistForApply([completed])
    expect(retained).toHaveLength(1)
    // Object identity preserved — nothing altered.
    expect(retained[0]).toBe(completed)
    expect(retained[0].actualMinutes).toBe(22)
    expect(retained[0].evidenceArtifactId).toBe('art-1')
  })

  it('keeps a completed item even when it was itself rolled over', () => {
    const completedRolled = item({
      label: 'Math (10m)',
      completed: true,
      source: 'planner',
      rolledOverFrom: '2026-07-17',
      actualMinutes: 12,
    })
    expect(retainChecklistForApply([completedRolled])).toEqual([completedRolled])
  })

  it('keeps manually-added incomplete items', () => {
    const manual = item({ label: 'Field trip note', source: 'manual' })
    expect(retainChecklistForApply([manual])).toEqual([manual])
  })

  it('drops incomplete non-rolled planner items (replaced by the fresh plan)', () => {
    const planner = item({ label: 'Stale planned item (15m)', source: 'planner' })
    expect(retainChecklistForApply([planner])).toEqual([])
  })

  it('the partly-completed day: keeps completed + manual, drops rolled residue', () => {
    const completed = item({ label: 'Reading (20m)', completed: true, source: 'planner', actualMinutes: 20 })
    const rolledResidue = item({ label: 'Old math (10m)', source: 'planner', rolledOverFrom: '2026-07-17' })
    const manual = item({ label: 'Library trip', source: 'manual' })
    const stalePlanner = item({ label: 'Yesterday plan (15m)', source: 'planner' })

    const retained = retainChecklistForApply([completed, rolledResidue, manual, stalePlanner])
    expect(retained).toEqual([completed, manual])
  })
})

describe('retainBlocksForApply', () => {
  it('keeps blocks with logged actualMinutes regardless of source — HARD CONSTRAINT', () => {
    const tracked = block({ source: 'planner', actualMinutes: 30, subjectBucket: undefined })
    expect(retainBlocksForApply([tracked])).toEqual([tracked])
  })

  it('keeps manual blocks', () => {
    const manual = block({ source: 'manual' })
    expect(retainBlocksForApply([manual])).toEqual([manual])
  })

  it('drops planner blocks with no tracked time', () => {
    const untracked = block({ source: 'planner', plannedMinutes: 20 })
    expect(retainBlocksForApply([untracked])).toEqual([])
  })
})
