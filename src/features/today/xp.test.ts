import { describe, expect, it } from 'vitest'
import type { DayLog } from '../../core/types/domain'
import { RoutineItemKey } from '../../core/types/enums'
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

  it('includes readAloud XP when done (unscoped)', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: false },
        spelling: { done: false },
        sightWords: { done: false },
        minecraft: { done: false },
        readingEggs: { done: false },
        readAloud: { done: true, minutes: 10 },
      },
    }
    expect(calculateXp(log)).toBe(1)
  })

  describe('template-scoped XP', () => {
    const fullLog: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: true },
        spelling: { done: true },
        sightWords: { done: true },
        minecraft: { done: true },
        readingEggs: { done: true },
        readAloud: { done: true },
      },
      math: { done: true },
      speech: { done: true },
    }

    it('scopes XP to Lincoln template items only', () => {
      const lincolnItems = [
        RoutineItemKey.Handwriting,
        RoutineItemKey.Spelling,
        RoutineItemKey.SightWords,
        RoutineItemKey.MinecraftReading,
        RoutineItemKey.ReadingEggs,
        RoutineItemKey.Math,
        RoutineItemKey.Speech,
      ]
      // handwriting(1) + spelling(1) + sightWords(1) + minecraft(2) + readingEggs(1) + math(2) + speech(1) = 9
      expect(calculateXp(fullLog, lincolnItems)).toBe(9)
    })

    it('scopes XP to London template items only', () => {
      const londonItems = [
        RoutineItemKey.ReadAloud,
        RoutineItemKey.SightWords,
        RoutineItemKey.Math,
        RoutineItemKey.Speech,
      ]
      // readAloud(1) + sightWords(1) + math(2) + speech(1) = 5
      expect(calculateXp(fullLog, londonItems)).toBe(5)
    })

    it('excludes Lincoln items from London XP', () => {
      const londonItems = [
        RoutineItemKey.ReadAloud,
        RoutineItemKey.SightWords,
        RoutineItemKey.Math,
        RoutineItemKey.Speech,
      ]
      // Even though handwriting/spelling/minecraft/readingEggs are done,
      // they should not contribute to London's XP
      const londonXp = calculateXp(fullLog, londonItems)
      const unscopedXp = calculateXp(fullLog)
      expect(londonXp).toBeLessThan(unscopedXp)
    })

    it('returns 0 when scoped items are all not done', () => {
      const log: DayLog = {
        ...baseDayLog,
        reading: {
          handwriting: { done: true },
          spelling: { done: true },
          sightWords: { done: false },
          minecraft: { done: false },
          readingEggs: { done: false },
          readAloud: { done: false },
        },
        math: { done: false },
      }
      const londonItems = [
        RoutineItemKey.ReadAloud,
        RoutineItemKey.SightWords,
        RoutineItemKey.Math,
        RoutineItemKey.Speech,
      ]
      // readAloud(false) + sightWords(false) + math(false) + speech(n/a) = 0
      expect(calculateXp(log, londonItems)).toBe(0)
    })

    it('unscoped calculation is backward-compatible', () => {
      // Without routineItems parameter, all items are counted
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
      expect(calculateXp(log)).toBe(8)
      expect(calculateXp(log, undefined)).toBe(8)
    })
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

  it('counts readAloud as contributing to reading category', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: false },
        spelling: { done: false },
        sightWords: { done: false },
        minecraft: { done: false },
        readingEggs: { done: false },
        readAloud: { done: true },
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
