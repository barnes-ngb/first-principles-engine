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
  findStrandConfigId,
  strandSessionCount,
  unitLabelForNewActivity,
  strandSessionStandingLine,
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

describe('the standing line the capture dialog shows', () => {
  it('does not read "No sessions yet so far" on the first session', () => {
    // The obvious composition of `strandProgressLabel` reads exactly that, on
    // the one session where the sentence matters most.
    expect(strandSessionStandingLine(strand())).toBe('This will be the first session.')
  })

  it('names the count, with no total, once there is one', () => {
    expect(strandSessionStandingLine(strand({ currentPosition: 14 }))).toBe(
      '14 sessions so far. This will be one more.',
    )
  })
})

describe('the unit label', () => {
  it('is "session" — the word the parent-only coverage line reads', () => {
    // `computeObservedCoverage` resolves `unitLabel || 'lesson'`, so a strand
    // that stored nothing would be described as covering "lessons".
    expect(STRAND_UNIT_LABEL).toBe('session')
  })

  // Both creation doors wrote `scannable ? 'lesson' : undefined`. A strand is
  // not scannable, so it would have been created with NO label and the
  // parent's coverage line would have read "History — lesson 14" about a
  // subject with no lessons. The lie would have come from the code that
  // CREATES a strand, not the code that reads one.
  it('stamps "session" on a new strand, which is never scannable', () => {
    expect(unitLabelForNewActivity(ActivityType.Strand, false)).toBe('session')
    expect(unitLabelForNewActivity(ActivityType.Strand, true)).toBe('session')
  })

  it('leaves every other type exactly as both doors had it', () => {
    expect(unitLabelForNewActivity(ActivityType.Workbook, true)).toBe('lesson')
    expect(unitLabelForNewActivity(ActivityType.Workbook, false)).toBeUndefined()
    expect(unitLabelForNewActivity(ActivityType.Routine, false)).toBeUndefined()
  })
})

// ── Finding the strand a planned day row belongs to (UX-283) ─────────────────
describe('findStrandConfigId', () => {
  const history = strand({ id: 's1', name: 'History' })
  const nature = strand({ id: 's2', name: 'Nature Study' })
  const workbook = strand({ id: 'w1', name: 'Math', type: ActivityType.Workbook })

  it('matches a planned row to its strand', () => {
    expect(findStrandConfigId({ label: 'History' }, [history, nature])).toBe('s1')
  })

  it('matches through nameKey, so punctuation and case do not break it', () => {
    expect(findStrandConfigId({ label: 'history' }, [history])).toBe('s1')
    expect(findStrandConfigId({ label: 'History!' }, [history])).toBe('s1')
  })

  it('keeps matching after a rename, via the alternates (UX-280)', () => {
    // Without reading aliases, renaming a strand would silently switch off its
    // capture door with no error and no log line.
    const renamed = strand({ id: 's1', name: 'History', aliases: ['World History'] })
    expect(findStrandConfigId({ label: 'World History' }, [renamed])).toBe('s1')
  })

  it('never matches a row that is not a strand', () => {
    expect(findStrandConfigId({ label: 'Math' }, [workbook])).toBeUndefined()
  })

  it('skips a finished strand — its record is closed', () => {
    expect(
      findStrandConfigId({ label: 'History' }, [strand({ id: 's1', completed: true })]),
    ).toBeUndefined()
  })

  // The bug this feature shipped with, until Codex found it: `buildApplyChecklist`
  // stores `${title} (${estimatedMinutes}m)`, so an ordinary applied plan's row
  // reads "History (30m)" and `nameKey` gave `history30m` against `history` —
  // the Today button rendered for NO real plan. The run's own tests used a
  // duration-free label and never saw it.
  it('matches a real applied row, which carries the rendered duration', () => {
    expect(findStrandConfigId({ label: 'History (30m)' }, [history])).toBe('s1')
    expect(findStrandConfigId({ label: 'History (5m)' }, [history])).toBe('s1')
    expect(findStrandConfigId({ label: 'History (120m)' }, [history])).toBe('s1')
  })

  it('still matches a bare label, which a manually added row carries', () => {
    expect(findStrandConfigId({ label: 'History' }, [history])).toBe('s1')
  })

  it('matches a strand genuinely named with a duration, when it is the only reading', () => {
    const oddlyNamed = strand({ id: 's9', name: 'History (30m)' })
    expect(findStrandConfigId({ label: 'History (30m)' }, [oddlyNamed])).toBe('s9')
  })

  it('does not strip anything that is not the duration suffix', () => {
    // "(Ancient)" is part of a name, not a rendered minute count.
    expect(findStrandConfigId({ label: 'History (Ancient)' }, [history])).toBeUndefined()
    expect(findStrandConfigId({ label: 'History (30 minutes)' }, [history])).toBeUndefined()
  })

  // ── The stamped join, and refusing an ambiguous name (Codex) ─────────────
  it('prefers the stamped id over any name matching', () => {
    const other = strand({ id: 's2', name: 'History' })
    expect(
      findStrandConfigId({ label: 'History (30m)', strandConfigId: 's2' }, [history, other]),
    ).toBe('s2')
  })

  it('falls back to the name when the stamped id names nothing live', () => {
    // A row stamped against a strand since deleted, or since finished.
    expect(
      findStrandConfigId({ label: 'History (30m)', strandConfigId: 'gone' }, [history]),
    ).toBe('s1')
  })

  it('ignores a stamp pointing at a finished strand', () => {
    const done = strand({ id: 's3', name: 'Rome', completed: true })
    expect(
      findStrandConfigId({ label: 'Rome (30m)', strandConfigId: 's3' }, [done]),
    ).toBeUndefined()
  })

  it('refuses an ambiguous label rather than recording the wrong afternoon', () => {
    // One strand genuinely named "History (30m)", another named "History": the
    // rendered label reads as both, and the count an increment moves cannot be
    // taken back. The row offers no button; Curriculum's own is one screen away.
    const oddlyNamed = strand({ id: 's9', name: 'History (30m)' })
    const plain = strand({ id: 's1', name: 'History' })
    expect(findStrandConfigId({ label: 'History (30m)' }, [plain, oddlyNamed])).toBeUndefined()
    // Order must not decide it either.
    expect(findStrandConfigId({ label: 'History (30m)' }, [oddlyNamed, plain])).toBeUndefined()
    // ...and the stamp resolves exactly that case.
    expect(
      findStrandConfigId({ label: 'History (30m)', strandConfigId: 's1' }, [plain, oddlyNamed]),
    ).toBe('s1')
  })

  it('refuses two strands answering to the same bare name', () => {
    const a = strand({ id: 'a', name: 'History' })
    const b = strand({ id: 'b', name: 'History' })
    expect(findStrandConfigId({ label: 'History' }, [a, b])).toBeUndefined()
  })

  it('is exact — a different name is a different row (UX-207)', () => {
    expect(findStrandConfigId({ label: 'History of Rome' }, [history])).toBeUndefined()
  })

  it('says nothing for an empty or missing label', () => {
    expect(findStrandConfigId({ label: '' }, [history])).toBeUndefined()
    expect(findStrandConfigId({}, [history])).toBeUndefined()
  })

  it('ignores a config with no type at all', () => {
    expect(
      findStrandConfigId({ label: 'History' }, [{ id: 'x', name: 'History' }]),
    ).toBeUndefined()
  })
})
