import { describe, expect, it } from 'vitest'

import type { ChecklistItem } from '../../core/types'
import { buildWatchHistory, summarizeWatchEntry, type WatchHistoryDayLog } from './watchHistory'

const watchRow = (videoId: string, completed: boolean): ChecklistItem =>
  ({
    label: `Watch: something`,
    completed,
    itemType: 'watch',
    watchVideoId: videoId,
  }) as ChecklistItem

const otherRow = (): ChecklistItem =>
  ({ label: 'Math page 12', completed: true, itemType: 'workbook' }) as ChecklistItem

const day = (childId: string, date: string, checklist: ChecklistItem[]): WatchHistoryDayLog => ({
  childId,
  date,
  checklist,
})

const names: Record<string, string> = { lincoln: 'Lincoln', london: 'London' }
const childName = (id: string) => names[id] ?? id

describe('buildWatchHistory', () => {
  it('surfaces a completed watch row for the right child on the right date', () => {
    const history = buildWatchHistory([day('lincoln', '2026-08-04', [watchRow('v1', true)])])
    expect(history.v1).toEqual({
      videoId: 'v1',
      lastWatchedOn: '2026-08-04',
      childIds: ['lincoln'],
      times: 1,
    })
  })

  it('does NOT count an incomplete watch row — planned is not watched', () => {
    const history = buildWatchHistory([day('lincoln', '2026-08-04', [watchRow('v1', false)])])
    expect(history.v1).toBeUndefined()
  })

  it('leaves a never-watched video absent from the index', () => {
    const history = buildWatchHistory([day('lincoln', '2026-08-04', [watchRow('v1', true)])])
    expect(history.v2).toBeUndefined()
  })

  it('ignores non-watch rows entirely', () => {
    const history = buildWatchHistory([day('lincoln', '2026-08-04', [otherRow()])])
    expect(Object.keys(history)).toEqual([])
  })

  it('takes the LATEST date regardless of the order days arrive in', () => {
    const history = buildWatchHistory([
      day('lincoln', '2026-08-09', [watchRow('v1', true)]),
      day('lincoln', '2026-07-02', [watchRow('v1', true)]),
    ])
    expect(history.v1.lastWatchedOn).toBe('2026-08-09')
    expect(history.v1.times).toBe(2)
  })

  it('records both boys for a shared video, de-duplicated and stably ordered', () => {
    const history = buildWatchHistory([
      day('london', '2026-08-01', [watchRow('v1', true)]),
      day('lincoln', '2026-08-02', [watchRow('v1', true)]),
      day('lincoln', '2026-08-03', [watchRow('v1', true)]),
    ])
    expect(history.v1.childIds).toEqual(['lincoln', 'london'])
    expect(history.v1.times).toBe(3)
  })

  it('keeps videos separate within one day', () => {
    const history = buildWatchHistory([
      day('lincoln', '2026-08-04', [watchRow('v1', true), watchRow('v2', false)]),
    ])
    expect(history.v1).toBeDefined()
    expect(history.v2).toBeUndefined()
  })

  it('counts a row that carries a watchVideoId but lost its itemType tag', () => {
    const untagged = { label: 'Watch: x', completed: true, watchVideoId: 'v9' } as ChecklistItem
    expect(buildWatchHistory([day('lincoln', '2026-08-04', [untagged])]).v9).toBeDefined()
  })

  it('handles a day with no checklist at all', () => {
    expect(buildWatchHistory([{ childId: 'lincoln', date: '2026-08-04' }])).toEqual({})
  })

  it('returns an empty index for no days', () => {
    expect(buildWatchHistory([])).toEqual({})
  })
})

describe('summarizeWatchEntry', () => {
  it('returns null for a video with no history — the caller words the window', () => {
    expect(summarizeWatchEntry(undefined, childName)).toBeNull()
  })

  it('names who watched it and when', () => {
    const history = buildWatchHistory([day('lincoln', '2026-08-04', [watchRow('v1', true)])])
    expect(summarizeWatchEntry(history.v1, childName)).toBe('Watched by Lincoln · 2026-08-04')
  })

  it('names both boys and the repeat count', () => {
    const history = buildWatchHistory([
      day('lincoln', '2026-08-01', [watchRow('v1', true)]),
      day('london', '2026-08-05', [watchRow('v1', true)]),
    ])
    expect(summarizeWatchEntry(history.v1, childName)).toBe(
      'Watched by Lincoln & London · 2026-08-05 · 2×',
    )
  })
})
