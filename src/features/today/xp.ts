import type { DayLog } from '../../core/types/domain'

/** XP mapping per routine item */
export const XP_VALUES = {
  handwriting: 1,
  spelling: 1,
  sightWords: 1,
  minecraft: 2,
  readingEggs: 1,
  math: 2,
} as const

/** Calculate total XP from a DayLog's routine fields. */
export function calculateXp(dayLog: DayLog): number {
  let xp = 0
  const reading = dayLog.reading
  if (reading) {
    if (reading.handwriting?.done) xp += XP_VALUES.handwriting
    if (reading.spelling?.done) xp += XP_VALUES.spelling
    if (reading.sightWords?.done) xp += XP_VALUES.sightWords
    if (reading.minecraft?.done) xp += XP_VALUES.minecraft
    if (reading.readingEggs?.done) xp += XP_VALUES.readingEggs
  }
  if (dayLog.math?.done) xp += XP_VALUES.math
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
      reading.readingEggs?.done
    ) {
      count += 1
    }
  }
  if (dayLog.math?.done) count += 1
  if (dayLog.speech?.done) count += 1
  if (dayLog.formation?.done) count += 1
  if (dayLog.together?.done) count += 1
  if (dayLog.movement?.done) count += 1
  if (dayLog.project?.done) count += 1
  return count
}
