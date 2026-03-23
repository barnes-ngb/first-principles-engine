import type { SightWordProgress } from '../../core/types'

/** Compute mastery level from encounter/help data. */
export function computeMasteryLevel(progress: SightWordProgress): SightWordProgress['masteryLevel'] {
  if (progress.shellyConfirmed) return 'mastered'
  if (progress.encounters < 3) return 'new'

  const helpRate = progress.encounters > 0
    ? progress.helpRequested / progress.encounters
    : 1

  // Familiar: self-reported known 3+ times, OR high encounter count with low help rate
  const isFamiliar = progress.selfReportedKnown >= 3
    || (progress.encounters >= 10 && helpRate < 0.2)

  if (isFamiliar) {
    // Mastered: familiar + 15+ encounters with very low help rate
    if (progress.encounters >= 15 && helpRate < 0.1) return 'mastered'
    return 'familiar'
  }

  return 'practicing'
}

/** Update progress after an encounter (seen on a page). */
export function recordEncounter(
  existing: SightWordProgress | null,
  word: string,
  interaction: 'seen' | 'help' | 'known',
): SightWordProgress {
  const now = new Date().toISOString()
  const base: SightWordProgress = existing ?? {
    word: word.toLowerCase(),
    encounters: 0,
    selfReportedKnown: 0,
    helpRequested: 0,
    shellyConfirmed: false,
    masteryLevel: 'new',
    firstSeen: now,
    lastSeen: now,
    lastLevelChange: now,
  }

  const updated = { ...base, lastSeen: now }

  if (interaction === 'seen') {
    updated.encounters++
  } else if (interaction === 'help') {
    updated.encounters++
    updated.helpRequested++
  } else if (interaction === 'known') {
    updated.selfReportedKnown++
  }

  const newLevel = computeMasteryLevel(updated)
  if (newLevel !== updated.masteryLevel) {
    updated.lastLevelChange = now
  }
  updated.masteryLevel = newLevel

  return updated
}

/** Summarize mastery for a set of words. */
export function summarizeMastery(
  progress: SightWordProgress[],
): { mastered: number; familiar: number; practicing: number; newCount: number; total: number } {
  return {
    mastered: progress.filter(p => p.masteryLevel === 'mastered').length,
    familiar: progress.filter(p => p.masteryLevel === 'familiar').length,
    practicing: progress.filter(p => p.masteryLevel === 'practicing').length,
    newCount: progress.filter(p => p.masteryLevel === 'new').length,
    total: progress.length,
  }
}

/** Dolch Pre-Primer sight word list. */
export const DOLCH_PRE_PRIMER = [
  'a', 'and', 'away', 'big', 'blue', 'can', 'come', 'down', 'find',
  'for', 'funny', 'go', 'help', 'here', 'I', 'in', 'is', 'it',
  'jump', 'little', 'look', 'make', 'me', 'my', 'not', 'one', 'play',
  'red', 'run', 'said', 'see', 'the', 'three', 'to', 'two', 'up',
  'we', 'where', 'yellow', 'you',
] as const

/** Dolch Primer sight word list. */
export const DOLCH_PRIMER = [
  'all', 'am', 'are', 'at', 'ate', 'be', 'black', 'brown', 'but',
  'came', 'did', 'do', 'eat', 'four', 'get', 'good', 'have', 'he',
  'into', 'like', 'must', 'new', 'no', 'now', 'on', 'our', 'out',
  'please', 'pretty', 'ran', 'ride', 'saw', 'say', 'she', 'so',
  'soon', 'that', 'there', 'they', 'this', 'too', 'under', 'want',
  'was', 'well', 'went', 'what', 'white', 'who', 'will', 'with', 'yes',
] as const

// ── London (age 6) word lists ────────────────────────────────

/** Simple CVC words appropriate for kindergarten / beginning readers. */
export const LONDON_STARTER_WORDS = [
  'cat', 'dog', 'big', 'run', 'sun', 'hat', 'mom', 'dad',
  'the', 'a', 'is', 'my', 'I', 'see', 'go', 'me',
  'love', 'like', 'no', 'yes',
] as const

/** Age-appropriate generation defaults per child profile. */
export const CHILD_BOOK_DEFAULTS = {
  lincoln: {
    pageCount: 10,
    style: 'minecraft' as const,
    defaultTheme: 'A Minecraft adventure',
    difficulty: 'moderate' as const,
    wordsPerPage: 30,
  },
  london: {
    pageCount: 6,
    style: 'storybook' as const,
    defaultTheme: 'A magical story with animals',
    difficulty: 'simple' as const,
    wordsPerPage: 15,
  },
} as const
