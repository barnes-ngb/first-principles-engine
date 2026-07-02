import { describe, it, expect } from 'vitest'

import {
  buildQuickAddEntry,
  locationFor,
  QUICK_ACTIVITIES,
  DURATION_OPTIONS,
  GROUPS,
} from './QuickAddHours.logic'
import type { QuickActivity } from './QuickAddHours.logic'
import { LearningLocation } from '../../core/types/enums'

// ── locationFor ─────────────────────────────────────────────────────────────

describe('locationFor', () => {
  it('maps home to LearningLocation.Home', () => {
    expect(locationFor('home')).toBe(LearningLocation.Home)
  })

  it('maps away to LearningLocation.Community', () => {
    expect(locationFor('away')).toBe(LearningLocation.Community)
  })
})

// ── buildQuickAddEntry ──────────────────────────────────────────────────────

describe('buildQuickAddEntry', () => {
  const parkActivity: QuickActivity = QUICK_ACTIVITIES.find(
    (a) => a.label === 'Park / Playground',
  )!

  it('builds a valid HoursEntry with all required fields', () => {
    const entry = buildQuickAddEntry({
      childId: 'child-1',
      date: '2026-06-15',
      activity: parkActivity,
      minutes: 60,
      homeAway: 'away',
    })
    expect(entry.childId).toBe('child-1')
    expect(entry.date).toBe('2026-06-15')
    expect(entry.minutes).toBe(60)
    expect(entry.subjectBucket).toBe('PE')
    expect(entry.location).toBe(LearningLocation.Community)
    expect(entry.notes).toBe('Park / Playground')
    expect(entry.source).toBe('quick-add')
    expect(entry.quickCapture).toBe(true)
  })

  it('maps activity subject bucket correctly', () => {
    const cookingActivity: QuickActivity = QUICK_ACTIVITIES.find(
      (a) => a.label === 'Cooking / Baking',
    )!
    const entry = buildQuickAddEntry({
      childId: 'child-1',
      date: '2026-06-15',
      activity: cookingActivity,
      minutes: 30,
      homeAway: 'home',
    })
    expect(entry.subjectBucket).toBe('PracticalArts')
    expect(entry.location).toBe(LearningLocation.Home)
  })

  it('maps home location correctly', () => {
    const entry = buildQuickAddEntry({
      childId: 'child-1',
      date: '2026-06-15',
      activity: parkActivity,
      minutes: 30,
      homeAway: 'home',
    })
    expect(entry.location).toBe(LearningLocation.Home)
  })

  it('maps away location to Community', () => {
    const entry = buildQuickAddEntry({
      childId: 'child-1',
      date: '2026-06-15',
      activity: parkActivity,
      minutes: 30,
      homeAway: 'away',
    })
    expect(entry.location).toBe(LearningLocation.Community)
  })

  it('uses activity label as notes', () => {
    const legoActivity: QuickActivity = QUICK_ACTIVITIES.find(
      (a) => a.label === 'LEGO / Construction',
    )!
    const entry = buildQuickAddEntry({
      childId: 'child-1',
      date: '2026-06-15',
      activity: legoActivity,
      minutes: 45,
      homeAway: 'home',
    })
    expect(entry.notes).toBe('LEGO / Construction')
    expect(entry.subjectBucket).toBe('Art')
  })

  it('always includes childId for DATA-05 attribution guard', () => {
    const entry = buildQuickAddEntry({
      childId: 'lincoln-id',
      date: '2026-06-15',
      activity: parkActivity,
      minutes: 15,
      homeAway: 'home',
    })
    expect(entry.childId).toBe('lincoln-id')
  })
})

// ── Activity/group data integrity ───────────────────────────────────────────

describe('QUICK_ACTIVITIES data integrity', () => {
  it('has at least one activity per group', () => {
    for (const { key } of GROUPS) {
      const activitiesInGroup = QUICK_ACTIVITIES.filter((a) => a.group === key)
      expect(activitiesInGroup.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('every activity has a non-empty label, emoji, and subject', () => {
    for (const activity of QUICK_ACTIVITIES) {
      expect(activity.label.trim().length).toBeGreaterThan(0)
      expect(activity.emoji.length).toBeGreaterThan(0)
      expect(activity.subject.length).toBeGreaterThan(0)
    }
  })

  it('every activity group is represented in GROUPS', () => {
    const groupKeys = new Set(GROUPS.map((g) => g.key))
    for (const activity of QUICK_ACTIVITIES) {
      expect(groupKeys.has(activity.group)).toBe(true)
    }
  })
})

describe('DURATION_OPTIONS', () => {
  it('has entries sorted by ascending minutes', () => {
    for (let i = 1; i < DURATION_OPTIONS.length; i++) {
      expect(DURATION_OPTIONS[i].minutes).toBeGreaterThan(DURATION_OPTIONS[i - 1].minutes)
    }
  })

  it('all durations are positive', () => {
    for (const opt of DURATION_OPTIONS) {
      expect(opt.minutes).toBeGreaterThan(0)
    }
  })
})
