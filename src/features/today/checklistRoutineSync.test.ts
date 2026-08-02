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

  it('un-syncs reading sub-item back to false', () => {
    const withReading: DayLog = {
      ...baseDayLog,
      reading: {
        ...baseDayLog.reading!,
        readingEggs: { done: true },
      },
    }
    const item = makeItem('Reading Eggs (45m)', SubjectBucket.Reading)
    const result = syncChecklistToRoutine(withReading, item, false)
    expect(result.reading?.readingEggs?.done).toBe(false)
  })

  it('un-syncs speech back to false', () => {
    const withSpeech: DayLog = { ...baseDayLog, speech: { done: true } }
    const item = makeItem('Speech Routine (10m)', SubjectBucket.LanguageArts)
    const result = syncChecklistToRoutine(withSpeech, item, false)
    expect(result.speech?.done).toBe(false)
  })

  it('un-syncs workshop back to false', () => {
    const withWorkshop: DayLog = { ...baseDayLog, workshop: { done: true } }
    const item = makeItem('Workshop Game (20m)')
    const result = syncChecklistToRoutine(withWorkshop, item, false)
    expect(result.workshop?.done).toBe(false)
  })

  it('passes activeRoutineItems through to inferRoutineKeys', () => {
    const activeItems = [RoutineItemKey.Math, RoutineItemKey.Speech]
    const item = makeItem('Read Aloud (15m)', SubjectBucket.Reading)
    const result = syncChecklistToRoutine(baseDayLog, item, true, activeItems)
    expect(result).toEqual(baseDayLog)
  })

  it('does not modify for Science items', () => {
    const item = makeItem('Science experiment (30m)', SubjectBucket.Science)
    const result = syncChecklistToRoutine(baseDayLog, item, true)
    expect(result).toEqual(baseDayLog)
  })

  it('does not modify for SocialStudies items', () => {
    const item = makeItem('History reading (20m)', SubjectBucket.SocialStudies)
    const result = syncChecklistToRoutine(baseDayLog, item, true)
    expect(result).toEqual(baseDayLog)
  })
})

// ─── Untested label patterns ─────────────────────────────────────────────────

describe('inferRoutineKeys — additional patterns', () => {
  it('maps "Decodable reading" to decodableReading', () => {
    expect(inferRoutineKeys(makeItem('Decodable Reading Practice (15m)'))).toEqual([RoutineItemKey.DecodableReading])
  })

  it('maps "Narration practice" to narrationOrSoundReps', () => {
    expect(inferRoutineKeys(makeItem('Narration Practice (10m)'))).toEqual([RoutineItemKey.NarrationOrSoundReps])
  })

  it('returns empty for Other subjectBucket with no label match', () => {
    expect(inferRoutineKeys(makeItem('Free play time', SubjectBucket.Other))).toEqual([])
  })

  it('returns empty for Reading subjectBucket when label has no reading keyword', () => {
    expect(inferRoutineKeys(makeItem('Some activity', SubjectBucket.Reading))).toEqual([])
  })
})

// ─── Untested applyRoutineToggle paths ───────────────────────────────────────

describe('applyRoutineToggle — additional paths', () => {
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

  it('toggles math.wordProblems sub-item', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.WordProblemsModeled, true)
    expect(result.math?.wordProblems?.done).toBe(true)
    expect(result.math?.done).toBe(false)
  })

  it('toggles speech.narrationReps sub-item', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.NarrationOrSoundReps, true)
    expect(result.speech?.narrationReps?.done).toBe(true)
    expect(result.speech?.done).toBe(false)
  })

  it('un-toggles math.numberSense back to false', () => {
    const withNumberSense: DayLog = {
      ...baseDayLog,
      math: { done: false, numberSense: { done: true } },
    }
    const result = applyRoutineToggle(withNumberSense, RoutineItemKey.NumberSenseOrFacts, false)
    expect(result.math?.numberSense?.done).toBe(false)
  })

  it('un-toggles speech.narrationReps back to false', () => {
    const withNarration: DayLog = {
      ...baseDayLog,
      speech: { done: false, narrationReps: { done: true } },
    }
    const result = applyRoutineToggle(withNarration, RoutineItemKey.NarrationOrSoundReps, false)
    expect(result.speech?.narrationReps?.done).toBe(false)
  })

  it('initializes math if missing when toggling sub-item', () => {
    const noMath: DayLog = { childId: 'c', date: 'd', blocks: [] }
    const result = applyRoutineToggle(noMath, RoutineItemKey.NumberSenseOrFacts, true)
    expect(result.math?.numberSense?.done).toBe(true)
    expect(result.math?.done).toBe(false)
  })

  it('initializes speech if missing when toggling sub-item', () => {
    const noSpeech: DayLog = { childId: 'c', date: 'd', blocks: [] }
    const result = applyRoutineToggle(noSpeech, RoutineItemKey.NarrationOrSoundReps, true)
    expect(result.speech?.narrationReps?.done).toBe(true)
    expect(result.speech?.done).toBe(false)
  })

  it('preserves existing reading sub-fields when toggling another', () => {
    const withExisting: DayLog = {
      ...baseDayLog,
      reading: {
        ...baseDayLog.reading!,
        handwriting: { done: true },
        spelling: { done: true },
      },
    }
    const result = applyRoutineToggle(withExisting, RoutineItemKey.SightWords, true)
    expect(result.reading?.sightWords?.done).toBe(true)
    expect(result.reading?.handwriting?.done).toBe(true)
    expect(result.reading?.spelling?.done).toBe(true)
  })

  it('returns dayLog unchanged for unrecognized key', () => {
    const result = applyRoutineToggle(baseDayLog, 'unknownKey' as RoutineItemKey, true)
    expect(result).toEqual(baseDayLog)
  })

  it('toggles decodableReading reading sub-item', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.DecodableReading, true)
    expect(result.reading?.decodableReading?.done).toBe(true)
  })

  it('toggles spellingDictation reading sub-item', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.SpellingDictation, true)
    expect(result.reading?.spellingDictation?.done).toBe(true)
  })

  it('toggles phonemicAwareness reading sub-item', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.PhonemicAwareness, true)
    expect(result.reading?.phonemicAwareness?.done).toBe(true)
  })

  it('toggles phonicsLesson reading sub-item', () => {
    const result = applyRoutineToggle(baseDayLog, RoutineItemKey.PhonicsLesson, true)
    expect(result.reading?.phonicsLesson?.done).toBe(true)
  })
})
