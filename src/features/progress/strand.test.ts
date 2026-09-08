import { describe, expect, it } from 'vitest'

import type { ActivityConfig } from '../../core/types'
import { ActivityFrequency, ActivityType, SubjectBucket } from '../../core/types/enums'
import {
  isSameTopic,
  isStrand,
  MAX_RECENT_TOPICS,
  mergeRecentTopic,
  mostRecentTopic,
  normalizeTopic,
  readRecentTopics,
  strandProgressLabel,
  strandRowSummary,
  strandSessionCount,
  STRAND_UNIT_LABEL,
  topicSuggestions,
} from './strand'

function strand(overrides: Partial<ActivityConfig> = {}): ActivityConfig {
  return {
    id: 's1',
    name: 'History',
    type: ActivityType.Strand,
    subjectBucket: SubjectBucket.SocialStudies,
    defaultMinutes: 30,
    frequency: ActivityFrequency.TwoPerWeek,
    childId: 'c1',
    sortOrder: 0,
    completed: false,
    scannable: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as ActivityConfig
}

describe('isStrand', () => {
  it('is true only for the strand type', () => {
    expect(isStrand(strand())).toBe(true)
    expect(isStrand({ type: ActivityType.Workbook })).toBe(false)
    expect(isStrand({ type: ActivityType.Routine })).toBe(false)
  })
})

describe('the count, and what it never claims', () => {
  it('reads the session count off currentPosition', () => {
    expect(strandSessionCount(strand({ currentPosition: 14 }))).toBe(14)
  })

  it('reports an unreadable stored count as none rather than coercing it', () => {
    // The same rule `normalizeCurriculumSnapshot` holds: an unknown position
    // must read as unknown, never as a claim.
    expect(strandSessionCount(strand({ currentPosition: Number.NaN }))).toBe(0)
    expect(strandSessionCount(strand({ currentPosition: -3 }))).toBe(0)
    expect(strandSessionCount(strand({ currentPosition: undefined }))).toBe(0)
  })

  it('says "No sessions yet" rather than "0 sessions"', () => {
    expect(strandProgressLabel(strand())).toBe('No sessions yet')
  })

  it('pluralises, and never prints a total or a percentage', () => {
    expect(strandProgressLabel(strand({ currentPosition: 1 }))).toBe('1 session')
    expect(strandProgressLabel(strand({ currentPosition: 14 }))).toBe('14 sessions')
    for (const n of [0, 1, 14, 999]) {
      const label = strandProgressLabel(strand({ currentPosition: n }))
      expect(label).not.toMatch(/of\s|%|\//)
    }
  })

  it('ignores a totalUnits that somehow got written onto a strand', () => {
    // Nothing writes one, but a stored document can hold anything. The label
    // must still not print a denominator — that is the invariant, not the
    // absence of the field.
    const withTotal = strand({ currentPosition: 4, totalUnits: 60 } as Partial<ActivityConfig>)
    expect(strandProgressLabel(withTotal)).toBe('4 sessions')
  })

  it('summarises the row as count then frequency, with no minutes', () => {
    expect(strandRowSummary(strand({ currentPosition: 3 }), '2x / week')).toBe(
      '3 sessions · 2x / week',
    )
  })
})

describe('topics', () => {
  it('normalizes whitespace and never re-cases what she typed', () => {
    expect(normalizeTopic('  Ancient   Egypt  ')).toBe('Ancient Egypt')
    expect(normalizeTopic('the pilgrims')).toBe('the pilgrims')
  })

  it('drops non-string and empty entries from a stored list', () => {
    const config = strand({
      recentTopics: ['Ancient Egypt', '', '   ', 7, null, 'The Pilgrims'],
    } as unknown as Partial<ActivityConfig>)
    expect(readRecentTopics(config)).toEqual(['Ancient Egypt', 'The Pilgrims'])
  })

  it('returns an empty list for an absent or off-shape field', () => {
    expect(readRecentTopics(strand())).toEqual([])
    expect(readRecentTopics({ recentTopics: 'Egypt' } as unknown as ActivityConfig)).toEqual([])
  })

  it('offers back the name she used before rather than creating a second', () => {
    // The third Ancient Egypt session. `nameKey` matching is the whole of it.
    const merged = mergeRecentTopic(['Ancient Egypt', 'The Pilgrims'], 'ancient egypt')
    expect(merged).toEqual(['ancient egypt', 'The Pilgrims'])
    expect(merged.filter((t) => isSameTopic(t, 'Ancient Egypt'))).toHaveLength(1)
  })

  it('moves a returning topic to the front — most-recent-first', () => {
    expect(mergeRecentTopic(['A', 'B', 'C'], 'C')).toEqual(['C', 'A', 'B'])
  })

  it('caps the list and trims from the OLDEST end', () => {
    const many = Array.from({ length: MAX_RECENT_TOPICS }, (_, i) => `Topic ${i}`)
    const merged = mergeRecentTopic(many, 'Newest')
    expect(merged).toHaveLength(MAX_RECENT_TOPICS)
    expect(merged[0]).toBe('Newest')
    expect(merged).not.toContain(`Topic ${MAX_RECENT_TOPICS - 1}`)
  })

  it('leaves the list alone when the typed topic is blank', () => {
    expect(mergeRecentTopic(['A'], '   ')).toEqual(['A'])
  })

  it('is deliberately exact — a shorter name is a different topic (UX-207)', () => {
    expect(isSameTopic('Ancient Egypt', 'Egypt')).toBe(false)
    expect(isSameTopic('Ancient Egypt!', 'ancient egypt')).toBe(true)
    expect(isSameTopic('', '')).toBe(false)
  })

  it('has no most-recent topic before the first session', () => {
    expect(mostRecentTopic(strand())).toBeNull()
    expect(topicSuggestions(strand())).toEqual([])
  })

  it('names the most recent topic once there is one', () => {
    expect(mostRecentTopic(strand({ recentTopics: ['The Pilgrims', 'Ancient Egypt'] }))).toBe(
      'The Pilgrims',
    )
  })
})

describe('the unit label', () => {
  it('is "session" — the word the parent-only coverage line reads', () => {
    // `computeObservedCoverage` resolves `unitLabel || 'lesson'`, so a strand
    // that stored nothing would be described as covering "lessons".
    expect(STRAND_UNIT_LABEL).toBe('session')
  })
})
