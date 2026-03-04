import { describe, expect, it } from 'vitest'
import { DayBlockType, RoutineItemKey, SubjectBucket } from '../../core/types/enums'
import type { DayLog } from '../../core/types/domain'
import {
  autoFillBlockMinutes,
  createDefaultDayLog,
  DEFAULT_BLOCK_MINUTES,
  dayLogDocId,
  legacyDayLogDocId,
  parseDateFromDocId,
} from './daylog.model'

describe('dayLogDocId', () => {
  it('produces {date}_{childId} format', () => {
    expect(dayLogDocId('2026-02-09', 'abc123')).toBe('2026-02-09_abc123')
  })
})

describe('legacyDayLogDocId', () => {
  it('produces {childId}_{date} format', () => {
    expect(legacyDayLogDocId('abc123', '2026-02-09')).toBe('abc123_2026-02-09')
  })
})

describe('parseDateFromDocId', () => {
  it('extracts date from new format {date}_{childId}', () => {
    expect(parseDateFromDocId('2026-02-09_abc123')).toBe('2026-02-09')
  })

  it('extracts date from legacy format {childId}_{date}', () => {
    expect(parseDateFromDocId('abc123_2026-02-09')).toBe('2026-02-09')
  })

  it('handles bare date doc ID', () => {
    expect(parseDateFromDocId('2026-02-09')).toBe('2026-02-09')
  })

  it('handles long child IDs with underscores', () => {
    expect(parseDateFromDocId('2026-02-09_long_child_id')).toBe('2026-02-09')
  })

  it('returns full ID as fallback for unrecognized format', () => {
    expect(parseDateFromDocId('some-random-id')).toBe('some-random-id')
  })
})

describe('createDefaultDayLog', () => {
  it('includes createdAt timestamp', () => {
    const log = createDefaultDayLog('child-1', '2026-02-09')
    expect(log.createdAt).toBeDefined()
    expect(log.childId).toBe('child-1')
    expect(log.date).toBe('2026-02-09')
  })

  it('includes childId and date fields', () => {
    const log = createDefaultDayLog('child-1', '2026-02-09')
    expect(log.childId).toBe('child-1')
    expect(log.date).toBe('2026-02-09')
  })

  it('pre-populates subjectBucket for Reading, Math, and Speech blocks', () => {
    const log = createDefaultDayLog('child-1', '2026-02-09', [
      DayBlockType.Reading,
      DayBlockType.Math,
      DayBlockType.Speech,
    ])

    const reading = log.blocks.find((b) => b.type === DayBlockType.Reading)
    const math = log.blocks.find((b) => b.type === DayBlockType.Math)
    const speech = log.blocks.find((b) => b.type === DayBlockType.Speech)

    expect(reading?.subjectBucket).toBe(SubjectBucket.Reading)
    expect(math?.subjectBucket).toBe(SubjectBucket.Math)
    expect(speech?.subjectBucket).toBe(SubjectBucket.LanguageArts)
  })

  it('does not set subjectBucket for blocks without a natural mapping', () => {
    const log = createDefaultDayLog('child-1', '2026-02-09', [
      DayBlockType.Formation,
      DayBlockType.Together,
      DayBlockType.Movement,
      DayBlockType.Project,
      DayBlockType.FieldTrip,
      DayBlockType.Other,
    ])

    for (const block of log.blocks) {
      expect(block.subjectBucket).toBeUndefined()
    }
  })

  it('sets default plannedMinutes on blocks', () => {
    const log = createDefaultDayLog('child-1', '2026-02-09', [
      DayBlockType.Reading,
      DayBlockType.Math,
    ])

    expect(log.blocks[0].plannedMinutes).toBe(DEFAULT_BLOCK_MINUTES[DayBlockType.Reading])
    expect(log.blocks[1].plannedMinutes).toBe(DEFAULT_BLOCK_MINUTES[DayBlockType.Math])
  })
})

describe('autoFillBlockMinutes', () => {
  const baseDayLog: DayLog = {
    childId: 'child-1',
    date: '2026-02-09',
    blocks: [
      { type: DayBlockType.Math, plannedMinutes: 20 },
      { type: DayBlockType.Speech, plannedMinutes: 10 },
      { type: DayBlockType.Reading, plannedMinutes: 30 },
    ],
  }

  it('sets actualMinutes when math routine is done', () => {
    const log: DayLog = {
      ...baseDayLog,
      math: { done: true },
    }
    const result = autoFillBlockMinutes(log, [RoutineItemKey.Math])
    const mathBlock = result.blocks.find((b) => b.type === DayBlockType.Math)
    expect(mathBlock?.actualMinutes).toBe(20)
  })

  it('does not set actualMinutes when math routine is not done', () => {
    const log: DayLog = {
      ...baseDayLog,
      math: { done: false },
    }
    const result = autoFillBlockMinutes(log, [RoutineItemKey.Math])
    const mathBlock = result.blocks.find((b) => b.type === DayBlockType.Math)
    expect(mathBlock?.actualMinutes).toBeUndefined()
  })

  it('clears auto-populated actualMinutes when routine is un-done', () => {
    const log: DayLog = {
      ...baseDayLog,
      blocks: [
        { type: DayBlockType.Math, plannedMinutes: 20, actualMinutes: 20 },
      ],
      math: { done: false },
    }
    const result = autoFillBlockMinutes(log, [RoutineItemKey.Math])
    expect(result.blocks[0].actualMinutes).toBeUndefined()
  })

  it('does not overwrite manually-set actualMinutes', () => {
    const log: DayLog = {
      ...baseDayLog,
      blocks: [
        { type: DayBlockType.Math, plannedMinutes: 20, actualMinutes: 35 },
      ],
      math: { done: true },
    }
    const result = autoFillBlockMinutes(log, [RoutineItemKey.Math])
    expect(result.blocks[0].actualMinutes).toBe(35)
  })

  it('does not clear manually-set actualMinutes when routine is un-done', () => {
    const log: DayLog = {
      ...baseDayLog,
      blocks: [
        { type: DayBlockType.Math, plannedMinutes: 20, actualMinutes: 35 },
      ],
      math: { done: false },
    }
    const result = autoFillBlockMinutes(log, [RoutineItemKey.Math])
    expect(result.blocks[0].actualMinutes).toBe(35)
  })

  it('sets actualMinutes for reading when all reading items are done', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: true },
        spelling: { done: true },
        sightWords: { done: true },
        minecraft: { done: true },
        readingEggs: { done: true },
      },
    }
    const result = autoFillBlockMinutes(log, [
      RoutineItemKey.Handwriting,
      RoutineItemKey.Spelling,
      RoutineItemKey.SightWords,
      RoutineItemKey.MinecraftReading,
      RoutineItemKey.ReadingEggs,
    ])
    const readingBlock = result.blocks.find((b) => b.type === DayBlockType.Reading)
    expect(readingBlock?.actualMinutes).toBe(30)
  })

  it('does not set reading actualMinutes when only some items are done', () => {
    const log: DayLog = {
      ...baseDayLog,
      reading: {
        handwriting: { done: true },
        spelling: { done: false },
        sightWords: { done: false },
        minecraft: { done: false },
        readingEggs: { done: false },
      },
    }
    const result = autoFillBlockMinutes(log, [
      RoutineItemKey.Handwriting,
      RoutineItemKey.Spelling,
    ])
    const readingBlock = result.blocks.find((b) => b.type === DayBlockType.Reading)
    expect(readingBlock?.actualMinutes).toBeUndefined()
  })

  it('skips blocks that have checklist items', () => {
    const log: DayLog = {
      ...baseDayLog,
      blocks: [
        {
          type: DayBlockType.Math,
          plannedMinutes: 20,
          checklist: [{ label: 'Do problems', completed: true }],
        },
      ],
      math: { done: true },
    }
    const result = autoFillBlockMinutes(log, [RoutineItemKey.Math])
    expect(result.blocks[0].actualMinutes).toBeUndefined()
  })
})
