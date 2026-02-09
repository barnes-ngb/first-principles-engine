import { describe, expect, it } from 'vitest'
import type { DayLog } from '../../core/types/domain'
import { calculateXp, countLoggedCategories } from './xp'

const baseDayLog: DayLog = {
  childId: 'child-1',
  date: '2026-02-09',
  blocks: [],
}

describe('calculateXp', () => {
  it('returns 0 for a fresh DayLog with no routine data', () => {
    expect(calculateXp(baseDayLog)).toBe(0)
  })

  it('returns 0 when all routine items are not done', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: false },
        spelling: { done: false },
        sightWords: { done: false },
        minecraft: { done: false },
        readingEggs: { done: false },
      },
      math: { done: false },
    }
    expect(calculateXp(log)).toBe(0)
  })

  it('calculates XP correctly for individual items', () => {
    // Handwriting only = 1 XP
    expect(
      calculateXp({
        ...baseDayLog,
        reading: {
          handwriting: { done: true },
          spelling: { done: false },
          sightWords: { done: false },
          minecraft: { done: false },
          readingEggs: { done: false },
        },
      }),
    ).toBe(1)

    // Minecraft reading = 2 XP
    expect(
      calculateXp({
        ...baseDayLog,
        reading: {
          handwriting: { done: false },
          spelling: { done: false },
          sightWords: { done: false },
          minecraft: { done: true },
          readingEggs: { done: false },
        },
      }),
    ).toBe(2)

    // Math = 2 XP
    expect(
      calculateXp({
        ...baseDayLog,
        math: { done: true },
      }),
    ).toBe(2)
  })

  it('calculates max XP when all routine items are done', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: true },
        spelling: { done: true },
        sightWords: { done: true },
        minecraft: { done: true },
        readingEggs: { done: true },
      },
      math: { done: true },
    }
    // 1 + 1 + 1 + 2 + 1 + 2 = 8
    expect(calculateXp(log)).toBe(8)
  })

  it('handles partial completion', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: true },
        spelling: { done: true },
        sightWords: { done: false },
        minecraft: { done: true },
        readingEggs: { done: false },
      },
      math: { done: false },
    }
    // 1 + 1 + 2 = 4
    expect(calculateXp(log)).toBe(4)
  })
})

describe('countLoggedCategories', () => {
  it('returns 0 for a fresh DayLog', () => {
    expect(countLoggedCategories(baseDayLog)).toBe(0)
  })

  it('counts reading as 1 category even with multiple reading items done', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: true },
        spelling: { done: true },
        sightWords: { done: true },
        minecraft: { done: false },
        readingEggs: { done: false },
      },
    }
    expect(countLoggedCategories(log)).toBe(1)
  })

  it('counts all categories correctly', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: true },
        spelling: { done: false },
        sightWords: { done: false },
        minecraft: { done: false },
        readingEggs: { done: false },
      },
      math: { done: true },
      speech: { done: true },
      formation: { done: true },
      together: { done: true },
      movement: { done: true },
      project: { done: true },
    }
    expect(countLoggedCategories(log)).toBe(7)
  })

  it('does not count categories where done is false', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: false },
        spelling: { done: false },
        sightWords: { done: false },
        minecraft: { done: false },
        readingEggs: { done: false },
      },
      math: { done: false },
      speech: { done: false },
    }
    expect(countLoggedCategories(log)).toBe(0)
  })
})
