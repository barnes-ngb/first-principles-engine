/**
 * Pure helpers for Knowledge Mine working-level progression.
 *
 * - computeStartLevel: read path — determines where a quest session begins
 * - computeWorkingLevelFromSession: write path 1 — derives new level after quest
 * - deriveWorkingLevelFromEvaluation: write path 2 — infers level from eval findings
 * - canOverwriteWorkingLevel: manual-override protection (48 hr guard)
 */

import type { WorkingLevel, WorkingLevels, SkillSnapshot, EvaluationFinding } from '../../core/types/evaluation'
import type { QuestMode, SessionQuestion } from './questTypes'
import { QUEST_MODE_LEVEL_CAP, DEFAULT_LEVEL_CAP } from './questTypes'

// ── Manual override protection ────────────────────────────────

const MANUAL_OVERRIDE_WINDOW_MS = 48 * 60 * 60 * 1000 // 48 hours

/**
 * Returns true if the given working level slot can be overwritten by an automated source.
 * Manual overrides are protected for 48 hours.
 */
export function canOverwriteWorkingLevel(current: WorkingLevel | undefined): boolean {
  if (!current) return true
  if (current.source !== 'manual') return true
  const age = Date.now() - new Date(current.updatedAt).getTime()
  return age > MANUAL_OVERRIDE_WINDOW_MS
}

// ── Read path: compute starting level ─────────────────────────

export interface CurriculumLevelHint {
  /** Starting level derived from curriculum data (workbook completion / mastered skills) */
  level: number
}

/**
 * Determines the starting level for a quest session using the fallback chain:
 * 1. workingLevels[questMode] if present
 * 2. curriculum hint (existing logic from workbook configs)
 * 3. default = 2
 *
 * Always capped at the mode's level ceiling.
 */
export function computeStartLevel(
  skillSnapshot: Pick<SkillSnapshot, 'workingLevels'> | null | undefined,
  questMode: QuestMode | undefined,
  curriculumHint?: CurriculumLevelHint | null,
): number {
  let startLevel = 2

  // 1. Working level (authoritative)
  const modeKey = questMode as keyof WorkingLevels | undefined
  const workingLevel = modeKey ? skillSnapshot?.workingLevels?.[modeKey] : undefined
  if (workingLevel) {
    startLevel = workingLevel.level
  }
  // 2. Curriculum hint (fallback)
  else if (curriculumHint && curriculumHint.level > startLevel) {
    startLevel = curriculumHint.level
  }

  // Always cap at mode ceiling
  const cap = questMode
    ? (QUEST_MODE_LEVEL_CAP[questMode] ?? DEFAULT_LEVEL_CAP)
    : DEFAULT_LEVEL_CAP
  startLevel = Math.min(startLevel, cap)

  // Never below 1
  startLevel = Math.max(startLevel, 1)

  return startLevel
}

// ── Write path 1: quest session → working level ───────────────

/** Minimum answered questions for a reliable signal */
const MIN_QUESTIONS_FOR_UPDATE = 5
/** Minimum correct at a level to consider it "stable" */
const STABLE_CORRECT_THRESHOLD = 2

/**
 * After a quest session ends, compute the new working level for that mode.
 * Returns null if the session is too short to give a reliable signal.
 */
export function computeWorkingLevelFromSession(
  questions: SessionQuestion[],
  sessionEndLevel: number,
  questMode: QuestMode | undefined,
): WorkingLevel | null {
  // Filter to only answered (non-skipped, non-flagged) questions
  const answered = questions.filter((q) => !q.skipped && !q.flaggedAsError)

  // Too short → don't update
  if (answered.length < MIN_QUESTIONS_FOR_UPDATE) return null

  // Count correct per level
  const correctByLevel = new Map<number, number>()
  for (const q of answered) {
    if (q.correct) {
      correctByLevel.set(q.level, (correctByLevel.get(q.level) ?? 0) + 1)
    }
  }

  // Find the highest level with STABLE_CORRECT_THRESHOLD+ correct
  let stableCeiling: number | null = null
  for (const [level, count] of correctByLevel) {
    if (count >= STABLE_CORRECT_THRESHOLD) {
      if (stableCeiling === null || level > stableCeiling) {
        stableCeiling = level
      }
    }
  }

  let newLevel: number
  if (stableCeiling !== null) {
    // Sustained vs crashed
    newLevel = sessionEndLevel >= stableCeiling ? stableCeiling : sessionEndLevel
  } else {
    // No stable ceiling — gentle downstep
    newLevel = sessionEndLevel - 1
  }

  // Clamp to mode ceiling
  const cap = questMode
    ? (QUEST_MODE_LEVEL_CAP[questMode] ?? DEFAULT_LEVEL_CAP)
    : DEFAULT_LEVEL_CAP
  newLevel = Math.min(newLevel, cap)

  // Never below 1
  newLevel = Math.max(newLevel, 1)

  const totalCorrect = answered.filter((q) => q.correct).length

  return {
    level: newLevel,
    updatedAt: new Date().toISOString(),
    source: 'quest',
    evidence: `Session ended at Level ${sessionEndLevel} with ${totalCorrect}/${answered.length} correct`,
  }
}

// ── Write path 2: evaluation → working level ──────────────────

/**
 * Phonics skill → level mapping.
 * The highest level where the child showed competence determines the working level.
 */
const PHONICS_SKILL_LEVEL_MAP: Record<string, number> = {
  'letter-sounds': 1,
  'letter-recognition': 1,
  'cvc': 2,
  'short-vowel': 2,
  'consonant-blend': 3,
  'blends': 3,
  'consonant-digraph': 4,
  'digraphs': 4,
  'digraph': 4,
  'cvce': 5,
  'silent-e': 5,
  'long-vowel': 5,
  'vowel-team': 6,
  'vowel-digraph': 6,
  'vowel-teams': 6,
  'diphthong': 7,
  'diphthongs': 7,
  'le-ending': 7,
  'le-endings': 7,
  'final-stable': 7,
  'r-controlled': 8,
  'multisyllable': 8,
  'multi-syllable': 8,
}

/**
 * Comprehension skill → level mapping (approximate).
 */
const COMPREHENSION_SKILL_LEVEL_MAP: Record<string, number> = {
  'literal-recall': 1,
  'recall': 1,
  'sequencing': 2,
  'main-idea': 3,
  'character': 3,
  'inference': 4,
  'cause-effect': 4,
  'compare-contrast': 5,
  'theme': 5,
  'critical-thinking': 6,
  'evaluation': 6,
  'synthesis': 6,
}

/**
 * Derives a working level from evaluation findings for a given domain.
 * Returns null if no relevant findings or if ambiguous.
 */
export function deriveWorkingLevelFromEvaluation(
  findings: EvaluationFinding[],
  domain: 'phonics' | 'comprehension',
): WorkingLevel | null {
  const skillMap = domain === 'phonics'
    ? PHONICS_SKILL_LEVEL_MAP
    : COMPREHENSION_SKILL_LEVEL_MAP

  let highestMasteredLevel = 0
  const masteredSkills: string[] = []

  for (const finding of findings) {
    if (finding.status !== 'mastered') continue

    // Try to match the finding's skill to a known level
    // Check ALL matches and take the highest level (avoid substring false positives like 'cvc' matching 'cvce')
    const skillLower = finding.skill.toLowerCase()
    let bestKey: string | null = null
    let bestLevel = 0
    for (const [key, level] of Object.entries(skillMap)) {
      if (skillLower.includes(key) && level > bestLevel) {
        bestKey = key
        bestLevel = level
      }
    }
    if (bestKey) {
      if (bestLevel > highestMasteredLevel) {
        highestMasteredLevel = bestLevel
      }
      masteredSkills.push(bestKey)
    }
  }

  if (highestMasteredLevel === 0) return null

  const cap = QUEST_MODE_LEVEL_CAP[domain] ?? DEFAULT_LEVEL_CAP
  const level = Math.min(highestMasteredLevel, cap)

  return {
    level,
    updatedAt: new Date().toISOString(),
    source: 'evaluation',
    evidence: `Evaluation mastered: ${masteredSkills.join(', ')} → Level ${level}`,
  }
}

// ── Write path 3: curriculum scan → math working level ────────

/**
 * Infers a math working level from a curriculum scan's lesson number.
 * Uses a simple mapping: GATB Math lessons map roughly to quest levels.
 *
 * Returns null if no meaningful inference can be made.
 */
export function deriveMathWorkingLevelFromScan(
  lessonNumber: number | null | undefined,
  curriculumName: string,
): WorkingLevel | null {
  if (lessonNumber == null || lessonNumber <= 0) return null

  // Simple mapping: GATB Math lesson ranges → quest levels
  // Level 1: Lessons 1-30 (counting, number recognition)
  // Level 2: Lessons 31-60 (addition/subtraction basics)
  // Level 3: Lessons 61-90 (two-digit operations)
  // Level 4: Lessons 91-120 (multiplication intro, place value)
  // Level 5: Lessons 121-150 (division, fractions intro)
  // Level 6: Lessons 151+ (advanced operations)
  let level: number
  if (lessonNumber <= 30) level = 1
  else if (lessonNumber <= 60) level = 2
  else if (lessonNumber <= 90) level = 3
  else if (lessonNumber <= 120) level = 4
  else if (lessonNumber <= 150) level = 5
  else level = 6

  const cap = QUEST_MODE_LEVEL_CAP['math'] ?? DEFAULT_LEVEL_CAP
  level = Math.min(level, cap)

  return {
    level,
    updatedAt: new Date().toISOString(),
    source: 'curriculum',
    evidence: `Scanned ${curriculumName} Lesson ${lessonNumber}`,
  }
}
