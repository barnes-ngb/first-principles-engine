import type { ChecklistItem, DayLog, ReadingRoutine } from '../../core/types'
import { RoutineItemKey, SubjectBucket } from '../../core/types/enums'
import type { RoutineItemKey as RoutineItemKeyValue } from '../../core/types/enums'

/**
 * Mapping from checklist label keywords to RoutineItemKey(s).
 * Order matters — first match wins, so more specific patterns come first.
 */
const LABEL_PATTERNS: Array<{ pattern: RegExp; keys: RoutineItemKeyValue[] }> = [
  // Reading sub-items (specific first)
  { pattern: /\bhandwriting\b/i, keys: [RoutineItemKey.Handwriting] },
  { pattern: /\bspelling dictation\b/i, keys: [RoutineItemKey.SpellingDictation] },
  { pattern: /\bspelling\b/i, keys: [RoutineItemKey.Spelling] },
  { pattern: /\bsight\s*words?\b/i, keys: [RoutineItemKey.SightWords] },
  { pattern: /\bminecraft\b.*\bread/i, keys: [RoutineItemKey.MinecraftReading] },
  { pattern: /\bread.*\bminecraft\b/i, keys: [RoutineItemKey.MinecraftReading] },
  { pattern: /\bminecraft\b/i, keys: [RoutineItemKey.MinecraftReading] },
  { pattern: /\breading\s*eggs?\b/i, keys: [RoutineItemKey.ReadingEggs] },
  { pattern: /\bread\s*aloud\b/i, keys: [RoutineItemKey.ReadAloud] },
  { pattern: /\bphonemic\b/i, keys: [RoutineItemKey.PhonemicAwareness] },
  { pattern: /\bphonics\b/i, keys: [RoutineItemKey.PhonicsLesson] },
  { pattern: /\bdecodable\b/i, keys: [RoutineItemKey.DecodableReading] },
  // Math sub-items
  { pattern: /\bnumber\s*sense\b/i, keys: [RoutineItemKey.NumberSenseOrFacts] },
  { pattern: /\bword\s*problems?\b/i, keys: [RoutineItemKey.WordProblemsModeled] },
  // Speech sub-items
  { pattern: /\bnarration\b/i, keys: [RoutineItemKey.NarrationOrSoundReps] },
  // Workshop
  { pattern: /\bworkshop\b/i, keys: [RoutineItemKey.WorkshopGame] },
  // Broad subject-level matches (last resort)
  { pattern: /\bspeech\b/i, keys: [RoutineItemKey.Speech] },
  { pattern: /\bmath\b/i, keys: [RoutineItemKey.Math] },
]

/**
 * Infer which routine item key(s) a checklist item maps to,
 * based on its label and subjectBucket.
 */
export function inferRoutineKeys(
  item: ChecklistItem,
  activeRoutineItems?: RoutineItemKeyValue[],
): RoutineItemKeyValue[] {
  const activeSet = activeRoutineItems ? new Set(activeRoutineItems) : undefined

  // Try label-based matching first (most precise)
  for (const { pattern, keys } of LABEL_PATTERNS) {
    if (pattern.test(item.label)) {
      const filtered = activeSet ? keys.filter((k) => activeSet.has(k)) : keys
      if (filtered.length > 0) return filtered
    }
  }

  // Fall back to subjectBucket-based inference
  if (item.subjectBucket === SubjectBucket.Math) {
    if (activeSet?.has(RoutineItemKey.Math)) return [RoutineItemKey.Math]
    return [RoutineItemKey.Math]
  }
  if (item.subjectBucket === SubjectBucket.LanguageArts) {
    if (!activeSet || activeSet.has(RoutineItemKey.Speech)) return [RoutineItemKey.Speech]
  }

  return []
}

// Routine item keys that belong to the reading routine
const READING_KEYS = new Set<RoutineItemKeyValue>([
  RoutineItemKey.Handwriting,
  RoutineItemKey.Spelling,
  RoutineItemKey.SightWords,
  RoutineItemKey.MinecraftReading,
  RoutineItemKey.ReadingEggs,
  RoutineItemKey.ReadAloud,
  RoutineItemKey.PhonemicAwareness,
  RoutineItemKey.PhonicsLesson,
  RoutineItemKey.DecodableReading,
  RoutineItemKey.SpellingDictation,
])

const MATH_SUB_KEYS = new Set<RoutineItemKeyValue>([
  RoutineItemKey.NumberSenseOrFacts,
  RoutineItemKey.WordProblemsModeled,
])

const SPEECH_SUB_KEYS = new Set<RoutineItemKeyValue>([
  RoutineItemKey.NarrationOrSoundReps,
])

/**
 * Apply a routine toggle to the DayLog based on a routine item key.
 * Returns the updated DayLog with the specified routine field set.
 */
export function applyRoutineToggle(
  dayLog: DayLog,
  key: RoutineItemKeyValue,
  done: boolean,
): DayLog {
  if (READING_KEYS.has(key)) {
    const reading: ReadingRoutine = dayLog.reading ?? {
      handwriting: { done: false },
      spelling: { done: false },
      sightWords: { done: false },
      minecraft: { done: false },
      readingEggs: { done: false },
    }
    const field = key as keyof ReadingRoutine
    const current = reading[field]
    const updated = typeof current === 'object' && current
      ? { ...current, done }
      : { done }
    return { ...dayLog, reading: { ...reading, [field]: updated } }
  }

  if (key === RoutineItemKey.Math) {
    return { ...dayLog, math: { ...(dayLog.math ?? { done: false }), done } }
  }

  if (MATH_SUB_KEYS.has(key)) {
    const math = dayLog.math ?? { done: false }
    if (key === RoutineItemKey.NumberSenseOrFacts) {
      return { ...dayLog, math: { ...math, numberSense: { ...(math.numberSense ?? { done: false }), done } } }
    }
    if (key === RoutineItemKey.WordProblemsModeled) {
      return { ...dayLog, math: { ...math, wordProblems: { ...(math.wordProblems ?? { done: false }), done } } }
    }
  }

  if (key === RoutineItemKey.Speech) {
    return { ...dayLog, speech: { ...(dayLog.speech ?? { done: false }), done } }
  }

  if (SPEECH_SUB_KEYS.has(key)) {
    const speech = dayLog.speech ?? { done: false }
    if (key === RoutineItemKey.NarrationOrSoundReps) {
      return { ...dayLog, speech: { ...speech, narrationReps: { ...(speech.narrationReps ?? { done: false }), done } } }
    }
  }

  if (key === RoutineItemKey.WorkshopGame) {
    return { ...dayLog, workshop: { ...(dayLog.workshop ?? { done: false }), done } }
  }

  return dayLog
}

/**
 * Sync a checklist item's completion state to its corresponding routine fields.
 * Returns the updated DayLog, or the original if no mapping exists.
 */
export function syncChecklistToRoutine(
  dayLog: DayLog,
  item: ChecklistItem,
  completed: boolean,
  activeRoutineItems?: RoutineItemKeyValue[],
): DayLog {
  const keys = inferRoutineKeys(item, activeRoutineItems)
  let updated = dayLog
  for (const key of keys) {
    updated = applyRoutineToggle(updated, key, completed)
  }
  return updated
}
