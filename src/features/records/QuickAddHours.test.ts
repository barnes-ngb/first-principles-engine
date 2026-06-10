import { describe, it, expect } from 'vitest'

import { buildQuickAddEntry, QUICK_ACTIVITIES } from './QuickAddHours.logic'
import { LearningLocation } from '../../core/types/enums'

const activity = (label: string) => {
  const found = QUICK_ACTIVITIES.find(a => a.label === label)
  if (!found) throw new Error(`activity not found: ${label}`)
  return found
}

describe('buildQuickAddEntry (FEAT-24 normal HoursEntry write)', () => {
  it('maps to a normal HoursEntry with subjectBucket, notes, source, quickCapture', () => {
    const entry = buildQuickAddEntry({
      childId: 'lincoln',
      date: '2026-06-10',
      activity: activity('Cooking / Baking'),
      minutes: 30,
      homeAway: 'home',
    })
    expect(entry).toEqual({
      childId: 'lincoln',
      date: '2026-06-10',
      minutes: 30,
      subjectBucket: 'PracticalArts',
      location: LearningLocation.Home,
      notes: 'Cooking / Baking',
      source: 'quick-add',
      quickCapture: true,
    })
    // No `reason` (that was the adjustment shape) and no `createdAt` (not on HoursEntry).
    expect('reason' in entry).toBe(false)
    expect('createdAt' in entry).toBe(false)
  })

  it('Away maps to a non-Home location (counts as away in the at-home split)', () => {
    const entry = buildQuickAddEntry({
      childId: 'london',
      date: '2026-06-10',
      activity: activity('Field Trip'),
      minutes: 90,
      homeAway: 'away',
    })
    expect(entry.location).toBe(LearningLocation.Community)
    expect(entry.location).not.toBe(LearningLocation.Home)
  })
})

describe('QUICK_ACTIVITIES category cleanup + additions (FEAT-24)', () => {
  it('remaps life-skills activities to PracticalArts', () => {
    for (const label of ['Cooking / Baking', 'Chores with Teaching', 'Grocery / Shopping', 'Gardening']) {
      expect(activity(label).subject).toBe('PracticalArts')
    }
  })

  it('remaps Museum/Zoo and Library to SocialStudies', () => {
    expect(activity('Museum / Zoo').subject).toBe('SocialStudies')
    expect(activity('Library Visit').subject).toBe('SocialStudies')
  })

  it('adds the new activities with correct subjects', () => {
    expect(activity('Field Trip').subject).toBe('SocialStudies')
    expect(activity('Service / Volunteering').subject).toBe('PracticalArts')
    expect(activity('Martial Arts').subject).toBe('PE')
    expect(activity('Acting').subject).toBe('Art')
  })
})
