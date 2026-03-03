import type { DayLog } from '../../core/types/domain'
import type { RoutineItemKey } from '../../core/types/enums'

/** XP mapping per routine item */
export const XP_VALUES = {
  handwriting: 1,
  spelling: 1,
  sightWords: 1,
  minecraft: 2,
  readingEggs: 1,
  readAloud: 1,
  math: 2,
  // Lincoln Literacy Engine
  phonemicAwareness: 1,
  phonicsLesson: 2,
  decodableReading: 2,
  spellingDictation: 1,
  // Lincoln Math Engine
  numberSenseOrFacts: 2,
  wordProblemsModeled: 2,
  // Lincoln Speech Micro
  narrationOrSoundReps: 1,
} as const

/**
 * Calculate total XP from a DayLog's routine fields.
 *
 * When `routineItems` is supplied, only items in that set contribute to XP.
 * This prevents cross-child leakage (e.g. Lincoln fields inflating London XP).
 */
export function calculateXp(dayLog: DayLog, routineItems?: RoutineItemKey[]): number {
  const scope = routineItems ? new Set(routineItems) : undefined

  let xp = 0
  const reading = dayLog.reading

  if (reading) {
    if ((!scope || scope.has('handwriting' as RoutineItemKey)) && reading.handwriting?.done)
      xp += XP_VALUES.handwriting
    if ((!scope || scope.has('spelling' as RoutineItemKey)) && reading.spelling?.done)
      xp += XP_VALUES.spelling
    if ((!scope || scope.has('sightWords' as RoutineItemKey)) && reading.sightWords?.done)
      xp += XP_VALUES.sightWords
    if ((!scope || scope.has('minecraft' as RoutineItemKey)) && reading.minecraft?.done)
      xp += XP_VALUES.minecraft
    if ((!scope || scope.has('readingEggs' as RoutineItemKey)) && reading.readingEggs?.done)
      xp += XP_VALUES.readingEggs
    if ((!scope || scope.has('readAloud' as RoutineItemKey)) && reading.readAloud?.done)
      xp += XP_VALUES.readAloud
    if ((!scope || scope.has('phonemicAwareness' as RoutineItemKey)) && reading.phonemicAwareness?.done)
      xp += XP_VALUES.phonemicAwareness
    if ((!scope || scope.has('phonicsLesson' as RoutineItemKey)) && reading.phonicsLesson?.done)
      xp += XP_VALUES.phonicsLesson
    if ((!scope || scope.has('decodableReading' as RoutineItemKey)) && reading.decodableReading?.done)
      xp += XP_VALUES.decodableReading
    if ((!scope || scope.has('spellingDictation' as RoutineItemKey)) && reading.spellingDictation?.done)
      xp += XP_VALUES.spellingDictation
  }

  if ((!scope || scope.has('math' as RoutineItemKey)) && dayLog.math?.done)
    xp += XP_VALUES.math
  if ((!scope || scope.has('numberSenseOrFacts' as RoutineItemKey)) && dayLog.math?.numberSense?.done)
    xp += XP_VALUES.numberSenseOrFacts
  if ((!scope || scope.has('wordProblemsModeled' as RoutineItemKey)) && dayLog.math?.wordProblems?.done)
    xp += XP_VALUES.wordProblemsModeled
  if ((!scope || scope.has('narrationOrSoundReps' as RoutineItemKey)) && dayLog.speech?.narrationReps?.done)
    xp += XP_VALUES.narrationOrSoundReps
  // Legacy speech toggle — counts when "speech" is in scope (or unscoped)
  if ((!scope || scope.has('speech' as RoutineItemKey)) && dayLog.speech?.done && !dayLog.speech?.narrationReps?.done)
    xp += 1

  return xp
}

/** Count how many categories were logged (have at least one done item). */
export function countLoggedCategories(dayLog: DayLog): number {
  let count = 0
  const reading = dayLog.reading
  if (reading) {
    if (
      reading.handwriting?.done ||
      reading.spelling?.done ||
      reading.sightWords?.done ||
      reading.minecraft?.done ||
      reading.readingEggs?.done ||
      reading.readAloud?.done ||
      reading.phonemicAwareness?.done ||
      reading.phonicsLesson?.done ||
      reading.decodableReading?.done ||
      reading.spellingDictation?.done
    ) {
      count += 1
    }
  }
  if (dayLog.math?.done || dayLog.math?.numberSense?.done || dayLog.math?.wordProblems?.done) count += 1
  if (dayLog.speech?.done || dayLog.speech?.narrationReps?.done) count += 1
  if (dayLog.formation?.done) count += 1
  if (dayLog.together?.done) count += 1
  if (dayLog.movement?.done) count += 1
  if (dayLog.project?.done) count += 1
  return count
}
