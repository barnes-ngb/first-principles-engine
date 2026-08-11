import { describe, expect, it } from 'vitest'

import type { WatchVideo } from '../../core/types'
import {
  ANY_FILTER,
  EMPTY_WATCH_FILTERS,
  describeActiveFilters,
  filterWatchVideos,
  groupBySubject,
  hasActiveFilters,
  matchesChild,
  matchesSearch,
} from './watchLibraryFilter'

const video = (over: Partial<WatchVideo> & Pick<WatchVideo, 'id' | 'title'>): WatchVideo => ({
  youtubeId: 'dQw4w9WgXcQ',
  plannedMinutes: 12,
  subjectBucket: 'SocialStudies',
  childId: 'both',
  addedBy: 'parent',
  vettedAt: '2026-07-18T00:00:00.000Z',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
  ...over,
})

const names: Record<string, string> = { lincoln: 'Lincoln', london: 'London' }
const childName = (id: string) => names[id] ?? id

describe('matchesSearch', () => {
  const v = video({ id: 'a', title: 'Ancient cities', why: 'Ties into the pyramids unit' })

  it('matches on title, case-insensitively', () => {
    expect(matchesSearch(v, 'ANCIENT')).toBe(true)
    expect(matchesSearch(v, 'citi')).toBe(true)
  })

  it('matches on the “why” line too', () => {
    expect(matchesSearch(v, 'pyramids')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(matchesSearch(v, 'volcano')).toBe(false)
  })

  it('treats an empty or whitespace query as no filter at all', () => {
    expect(matchesSearch(v, '')).toBe(true)
    expect(matchesSearch(v, '   ')).toBe(true)
  })

  it('does not crash on a video with no “why”', () => {
    expect(matchesSearch(video({ id: 'b', title: 'Volcanoes' }), 'volcano')).toBe(true)
  })
})

describe('matchesChild — the “both” rule', () => {
  const shared = video({ id: 's', title: 'Shared', childId: 'both' })
  const lincolnOnly = video({ id: 'l', title: 'Lincoln only', childId: 'lincoln' })

  it('shows a “both” video when filtering to EITHER boy (not a third bucket)', () => {
    expect(matchesChild(shared, 'lincoln')).toBe(true)
    expect(matchesChild(shared, 'london')).toBe(true)
  })

  it('hides a single-child video from the sibling', () => {
    expect(matchesChild(lincolnOnly, 'lincoln')).toBe(true)
    expect(matchesChild(lincolnOnly, 'london')).toBe(false)
  })

  it('shows everything when unfiltered', () => {
    expect(matchesChild(lincolnOnly, ANY_FILTER)).toBe(true)
    expect(matchesChild(shared, ANY_FILTER)).toBe(true)
  })
})

describe('filterWatchVideos — the axes compose', () => {
  const list = [
    video({ id: 'a', title: 'Ancient cities', subjectBucket: 'SocialStudies', childId: 'both' }),
    video({ id: 'b', title: 'The water cycle', subjectBucket: 'Science', childId: 'lincoln' }),
    video({ id: 'c', title: 'Ancient volcanoes', subjectBucket: 'Science', childId: 'london' }),
  ]

  it('returns everything with empty filters', () => {
    expect(filterWatchVideos(list, EMPTY_WATCH_FILTERS)).toHaveLength(3)
  })

  it('narrows by subject', () => {
    const out = filterWatchVideos(list, { ...EMPTY_WATCH_FILTERS, subjectBucket: 'Science' })
    expect(out.map((v) => v.id)).toEqual(['b', 'c'])
  })

  it('narrows by child, keeping shared videos', () => {
    const out = filterWatchVideos(list, { ...EMPTY_WATCH_FILTERS, childId: 'lincoln' })
    expect(out.map((v) => v.id)).toEqual(['a', 'b'])
  })

  it('search + subject + child narrow together', () => {
    const out = filterWatchVideos(list, {
      search: 'ancient',
      subjectBucket: 'Science',
      childId: 'london',
    })
    expect(out.map((v) => v.id)).toEqual(['c'])
  })

  it('composing to nothing is a real, empty result (not a fallback to everything)', () => {
    const out = filterWatchVideos(list, {
      search: 'ancient',
      subjectBucket: 'Science',
      childId: 'lincoln',
    })
    expect(out).toEqual([])
  })
})

describe('groupBySubject', () => {
  const list = [
    video({ id: 'a', title: 'Ancient cities', subjectBucket: 'SocialStudies' }),
    video({ id: 'b', title: 'The water cycle', subjectBucket: 'Science' }),
    video({ id: 'c', title: 'Volcanoes', subjectBucket: 'Science' }),
  ]

  it('groups with correct counts and shared display labels', () => {
    const groups = groupBySubject(list)
    expect(groups.map((g) => [g.bucket, g.count])).toEqual([
      ['Science', 2],
      ['SocialStudies', 1],
    ])
    expect(groups.find((g) => g.bucket === 'SocialStudies')?.label).toBe('Social Studies')
  })

  it('count always mirrors the rendered list', () => {
    for (const g of groupBySubject(list)) expect(g.count).toBe(g.videos.length)
  })

  it('drops empty buckets entirely', () => {
    expect(groupBySubject(list).map((g) => g.bucket)).not.toContain('Math')
  })

  it('is stable in the shared enum order regardless of input order', () => {
    const reversed = groupBySubject([...list].reverse()).map((g) => g.bucket)
    expect(reversed).toEqual(['Science', 'SocialStudies'])
  })

  it('returns nothing for an empty list', () => {
    expect(groupBySubject([])).toEqual([])
  })
})

describe('hasActiveFilters / describeActiveFilters', () => {
  it('reports no filter for the empty state', () => {
    expect(hasActiveFilters(EMPTY_WATCH_FILTERS)).toBe(false)
    expect(describeActiveFilters(EMPTY_WATCH_FILTERS, childName)).toBeNull()
  })

  it('does not count a whitespace-only search as a filter', () => {
    expect(hasActiveFilters({ ...EMPTY_WATCH_FILTERS, search: '  ' })).toBe(false)
  })

  it('names every axis that is hiding rows', () => {
    const desc = describeActiveFilters(
      { search: 'rome', subjectBucket: 'SocialStudies', childId: 'lincoln' },
      childName,
    )
    expect(desc).toContain('“rome”')
    expect(desc).toContain('Social Studies')
    expect(desc).toContain('Lincoln')
  })
})
