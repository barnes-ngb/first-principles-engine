import { describe, it, expect } from 'vitest'
import { inferRoutineKeys, syncChecklistToRoutine, applyRoutineToggle } from './checklistRoutineSync'
import type { ChecklistItem, DayLog } from '../../core/types'
import { RoutineItemKey, SubjectBucket } from '../../core/types/enums'

const makeItem = (label: string, subjectBucket?: string): ChecklistItem => ({
  label,
  completed: false,
  ...(subjectBucket ? { subjectBucket: subjectBucket as SubjectBucket } : {}),
})

describe('inferRoutineKeys', () => {
  it('maps "Handwriting" label to handwriting key', () => {
    expect(inferRoutineKeys(makeItem('Handwriting (10m)'))).toEqual([RoutineItemKey.Handwriting])
  })

  it('maps "Spelling Practice" to spelling key', () => {
    expect(inferRoutineKeys(makeItem('Spelling Practice (15m)'))).toEqual([RoutineItemKey.Spelling])
  })

  it('maps "Spelling Dictation" to spellingDictation key', () => {
    expect(inferRoutineKeys(makeItem('Spelling Dictation (10m)'))).toEqual([RoutineItemKey.SpellingDictation])
  })

  it('maps "Sight Words" to sightWords key', () => {
    expect(inferRoutineKeys(makeItem('Sight Words (10m)'))).toEqual([RoutineItemKey.SightWords])
  })

  it('maps "Minecraft Reading" to minecraft key', () => {
    expect(inferRoutineKeys(makeItem('Minecraft Reading (20m)'))).toEqual([RoutineItemKey.MinecraftReading])
  })

  it('maps "Reading Eggs" to readingEggs key', () => {
    expect(inferRoutineKeys(makeItem('Reading Eggs (45m)'))).toEqual([RoutineItemKey.ReadingEggs])
  })

  it('maps "Read Aloud" to readAloud key', () => {
    expect(inferRoutineKeys(makeItem('Read Aloud (15m)'))).toEqual([RoutineItemKey.ReadAloud])
  })

  it('maps "Math Practice" via label to math key', () => {
    expect(inferRoutineKeys(makeItem('Math Practice (20m)'))).toEqual([RoutineItemKey.Math])
  })

  it('maps "Speech" label to speech key', () => {
    expect(inferRoutineKeys(makeItem('Speech Routine (10m)'))).toEqual([RoutineItemKey.Speech])
  })

  it('maps "Number Sense" to numberSenseOrFacts', () => {
    expect(inferRoutineKeys(makeItem('Number Sense Practice'))).toEqual([RoutineItemKey.NumberSenseOrFacts])
  })

  it('maps "Word Problems" to wordProblemsModeled', () => {
    expect(inferRoutineKeys(makeItem('Word Problems (15m)'))).toEqual([RoutineItemKey.WordProblemsModeled])
  })

  it('maps "Phonics Lesson" to phonicsLesson', () => {
    expect(inferRoutineKeys(makeItem('Phonics Lesson (15m)'))).toEqual([RoutineItemKey.PhonicsLesson])
  })

  it('maps "Phonemic Awareness" to phonemicAwareness', () => {
    expect(inferRoutineKeys(makeItem('Phonemic Awareness (10m)'))).toEqual([RoutineItemKey.PhonemicAwareness])
  })

  it('maps workshop label to workshopGame', () => {
    expect(inferRoutineKeys(makeItem('Workshop Game (20m)'))).toEqual([RoutineItemKey.WorkshopGame])
  })

  it('falls back to Math subjectBucket', () => {
    expect(inferRoutineKeys(makeItem('Counting Practice', SubjectBucket.Math))).toEqual([RoutineItemKey.Math])
  })

  it('falls back to LanguageArts subjectBucket → speech', () => {
    expect(inferRoutineKeys(makeItem('Grammar Exercise', SubjectBucket.LanguageArts))).toEqual([RoutineItemKey.Speech])
  })

  it('returns empty for unrecognized items', () => {
    expect(inferRoutineKeys(makeItem('Art Project (30m)', SubjectBucket.Art))).toEqual([])
  })

  it('respects activeRoutineItems filter', () => {
    // Lincoln doesn't have readAloud, so it should not match
    const lincolnItems = [
      RoutineItemKey.Handwriting, RoutineItemKey.Spelling, RoutineItemKey.SightWords,
      RoutineItemKey.MinecraftReading, RoutineItemKey.ReadingEggs,
      RoutineItemKey.Math, RoutineItemKey.Speech,
    ]
    expect(inferRoutineKeys(makeItem('Read Aloud (15m)'), lincolnItems)).toEqual([])
  })
})

describe('applyRoutineToggle', () => {
  const baseDayLog: DayLog = {
    childId: 'child1',
    date: '2026-03-23',
    blocks: [],
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

  it('toggles a reading sub-item', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.Handwriting, true)
    expect(result.reading?.handwriting?.done).toBe(true)
    expect(result.reading?.spelling?.done).toBe(false)
  })

  it('toggles math.done', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.Math, true)
    expect(result.math?.done).toBe(true)
  })

  it('toggles speech.done', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.Speech, true)
    expect(result.speech?.done).toBe(true)
  })

  it('toggles math.numberSense sub-item', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.NumberSenseOrFacts, true)
    expect(result.math?.numberSense?.done).toBe(true)
    expect(result.math?.done).toBe(false) // top-level math unchanged
  })

  it('toggles workshop', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.WorkshopGame, true)
    expect(result.workshop?.done).toBe(true)
  })

  it('initializes reading if missing', () => {
    const noReading: DayLog = { childId: 'c', date: 'd', blocks: [] }
    const result = applyRoutineToggle(noReading, RoutineItemKey.Spelling, true)
    expect(result.reading?.spelling?.done).toBe(true)
  })
})

describe('syncChecklistToRoutine', () => {
  const baseDayLog: DayLog = {
    childId: 'child1',
    date: '2026-03-23',
    blocks: [],
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

  it('syncs a Reading Eggs checklist completion to routine', () => {
    const item = makeItem('Reading Eggs (45m)', SubjectBucket.Reading)
    const result = syncChecklistToRoutine(baseDayLog, item, true)
    expect(result.reading?.readingEggs?.done).toBe(true)
  })

  it('syncs a Math checklist completion to routine', () => {
    const item = makeItem('Math Practice (20m)', SubjectBucket.Math)
    const result = syncChecklistToRoutine(baseDayLog, item, true)
    expect(result.math?.done).toBe(true)
  })

  it('un-syncs when unchecking', () => {
    const withMath: DayLog = { ...baseDayLog, math: { done: true } }
    const item = makeItem('Math Practice (20m)', SubjectBucket.Math)
    const result = syncChecklistToRoutine(withMath, item, false)
    expect(result.math?.done).toBe(false)
  })

  it('does not modify dayLog for unrecognized items', () => {
    const item = makeItem('Art Project (30m)', SubjectBucket.Art)
    const result = syncChecklistToRoutine(baseDayLog, item, true)
    expect(result).toEqual(baseDayLog)
  })
})
