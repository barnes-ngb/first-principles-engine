import { describe, expect, it } from 'vitest'

import type { DayLog, WatchVideo } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import {
  appendWatchItemToDayLog,
  buildWatchChecklistItem,
  buildWatchDraftItem,
  watchItemTitle,
} from './watchDayItem'
import { retainChecklistForApply } from '../today/applyReset'

const video: WatchVideo = {
  id: 'vid-1',
  youtubeId: 'abcdefghijk',
  title: 'How volcanoes work',
  plannedMinutes: 12,
  subjectBucket: SubjectBucket.Science,
  childId: 'lincoln',
  addedBy: 'parent',
  vettedAt: '2026-07-27T10:00:00.000Z',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
}

const dayLog: DayLog = {
  childId: 'lincoln',
  date: '2026-07-27',
  blocks: [],
  checklist: [
    { label: 'Math workbook (20m)', completed: true, estimatedMinutes: 20, source: 'planner' },
  ],
}

describe('watchDayItem — shared watch-row shape (FEAT-132)', () => {
  it('titles a watch row from the parent-authored library title', () => {
    expect(watchItemTitle(video)).toBe('Watch: How volcanoes work')
  })

  it('builds the FEAT-104 planner draft item', () => {
    expect(buildWatchDraftItem(video, 'item-9')).toEqual({
      id: 'item-9',
      accepted: true,
      title: 'Watch: How volcanoes work',
      subjectBucket: SubjectBucket.Science,
      estimatedMinutes: 12,
      skillTags: [],
      category: 'choose',
      itemType: 'watch',
      watchVideoId: 'vid-1',
    })
  })

  it('builds a real watch checklist item — itemType AND watchVideoId, never a bare label', () => {
    const item = buildWatchChecklistItem(video)
    expect(item.itemType).toBe('watch')
    // The load-bearing field: without it the player has no video to resolve.
    expect(item.watchVideoId).toBe('vid-1')
    expect(item.label).toBe('Watch: How volcanoes work (12m)')
    expect(item.completed).toBe(false)
  })

  it('matches the apply mapping on every field hours + the kid view read', () => {
    const item = buildWatchChecklistItem(video)
    // Planned = actual (D3) — this is what `checklistItemCountedMinutes` reads.
    expect(item.estimatedMinutes).toBe(12)
    expect(item.subjectBucket).toBe(SubjectBucket.Science)
    // FEAT-104 shipped watch rows as 'choose' / not MVD-essential.
    expect(item.category).toBe('choose')
    expect(item.mvdEssential).toBe(false)
    // Non-curriculum: never a concept-graph input (C2/§6).
    expect(item.skillTags).toEqual([])
  })

  it("marks a live-day row 'manual' so a re-apply cannot silently delete it", () => {
    const item = buildWatchChecklistItem(video)
    expect(item.source).toBe('manual')
    // The reason: apply-reset drops incomplete planner residue but keeps manual.
    expect(retainChecklistForApply([item])).toEqual([item])
  })

  it('appends purely additively, preserving completed work', () => {
    const updated = appendWatchItemToDayLog(dayLog, video)
    expect(updated.checklist).toHaveLength(2)
    expect(updated.checklist?.[0]).toEqual(dayLog.checklist?.[0])
    expect(updated.checklist?.[1].watchVideoId).toBe('vid-1')
    // Never mutates the input.
    expect(dayLog.checklist).toHaveLength(1)
  })

  it('appends onto a day log with no checklist yet', () => {
    const empty: DayLog = { childId: 'lincoln', date: '2026-07-27', blocks: [] }
    expect(appendWatchItemToDayLog(empty, video).checklist).toHaveLength(1)
  })
})
