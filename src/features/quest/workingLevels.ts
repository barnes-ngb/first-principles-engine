/**
 * Pure helpers for Knowledge Mine working-level progression.
 *
 * - computeStartLevel: read path — determines where a quest session begins
 * - computeWorkingLevelFromSession: write path 1 — derives new level after quest
 * - deriveWorkingLevelFromEvaluation: write path 2 — infers level from eval findings
 * - canOverwriteWorkingLevel: manual-override protection (48 hr guard)
 */

import type { WorkingLevel, WorkingLevels, SkillSnapshot, EvaluationFinding, QuestActivityMarker } from '../../core/types/evaluation'
import type { QuestMode, SessionQuestion } from './questTypes'
import { QUEST_MODE_LEVEL_CAP, DEFAULT_LEVEL_CAP, WRITING_LEVEL_CAP, SENTENCE_LEVEL_CAP } from './questTypes'
// Skill-tag → level maps now live in core/curriculum (curriculum data; the
// Learning Map re-derivation engine inverts the same maps). Quest consumes them.
import {
  PHONICS_SKILL_LEVEL_MAP,
  COMPREHENSION_SKILL_LEVEL_MAP,
  MATH_SKILL_LEVEL_MAP,
  WRITING_SKILL_LEVEL_MAP,
  SENTENCE_SKILL_LEVEL_MAP,
} from '../../core/curriculum/skillLevelMaps'

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

// ── Quest activity marker (visibility-only, separate from the level) ──
//
// The conservative working level only moves when a quest *raises* it, so a
// counted session that holds steady at the conservative level looks invisible.
// These helpers derive a *separate* "last mined" marker so quest activity is
// visible without touching the level value, never-downgrade, or manual logic.

/**
 * The session high-water mark: the highest level at which the child answered a
 * question **correctly** this session (falling back to `fallbackLevel` — the
 * level the session ended at — when nothing was answered correctly). This is
 * deliberately more generous than the conservative working level: it shows how
 * high he reached, even when the level holds a notch below.
 */
export function sessionHighWaterLevel(
  questions: SessionQuestion[],
  fallbackLevel: number,
): number {
  const correct = questions.filter((q) => q.correct && !q.skipped && !q.flaggedAsError)
  const peak = correct.length > 0 ? Math.max(...correct.map((q) => q.level)) : fallbackLevel
  return Math.max(peak, 1)
}

/**
 * Derive the per-domain quest activity marker from a *sufficient* session.
 *
 * Visibility-only: it reports what the (unchanged) conservative level did —
 * `rose` when the quest's new level is strictly higher than the prior stored
 * level (or when there was no prior level at all — first signal counts as a
 * climb), otherwise `held`. It never decides or mutates the level itself.
 *
 * - `priorLevel` — the stored working level before this quest (undefined if unset).
 * - `newLevel`   — the level this quest derived (the value the level write would
 *                  persist); undefined when no level was derived.
 * - `sessionHighWater` — see {@link sessionHighWaterLevel}.
 */
export function computeQuestActivityMarker(args: {
  priorLevel: number | undefined
  newLevel: number | undefined
  sessionHighWater: number
  at?: string
}): QuestActivityMarker {
  const { priorLevel, newLevel, sessionHighWater } = args
  const rose = priorLevel == null ? true : newLevel != null && newLevel > priorLevel
  return {
    lastQuestAt: args.at ?? new Date().toISOString(),
    outcome: rose ? 'rose' : 'held',
    levelReached: Math.max(sessionHighWater, 1),
  }
}

// ── Write path 2: evaluation → working level ──────────────────
//
// The five skill-tag → level maps (PHONICS/COMPREHENSION/MATH/WRITING/SENTENCE)
// moved to `core/curriculum/skillLevelMaps.ts` and are imported above — the
// Learning Map re-derivation engine inverts the same maps, so they are shared
// curriculum data rather than quest-local consts. Values are unchanged.

/**
 * Derives a working level from evaluation findings for a given domain.
 * Returns null if no relevant findings or if ambiguous.
 *
 * Strategy:
 * - For each finding with status="mastered", substring-match its skill against
 *   the domain's skill→level map; the longest / highest-level match wins.
 * - The working level is the highest level where a "mastered" finding lands.
 * - For math: if a "not-yet" or "emerging" finding lands at level N+1 above
 *   the highest mastered level, that confirms N as the real ceiling
 *   (no change to the returned level — this is just a guard against
 *   over-counting "mastered" findings at adjacent levels).
 * - Capped at QUEST_MODE_LEVEL_CAP[domain].
 */
export function deriveWorkingLevelFromEvaluation(
  findings: EvaluationFinding[],
  domain: 'phonics' | 'comprehension' | 'math' | 'writing' | 'sentence',
): WorkingLevel | null {
  const skillMap =
    domain === 'phonics' ? PHONICS_SKILL_LEVEL_MAP
    : domain === 'comprehension' ? COMPREHENSION_SKILL_LEVEL_MAP
    : domain === 'writing' ? WRITING_SKILL_LEVEL_MAP
    : domain === 'sentence' ? SENTENCE_SKILL_LEVEL_MAP
    : MATH_SKILL_LEVEL_MAP

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

  const cap = domain === 'writing'
    ? WRITING_LEVEL_CAP
    : domain === 'sentence'
    ? SENTENCE_LEVEL_CAP
    : (QUEST_MODE_LEVEL_CAP[domain] ?? DEFAULT_LEVEL_CAP)
  const level = Math.min(highestMasteredLevel, cap)

  return {
    level,
    updatedAt: new Date().toISOString(),
    source: 'evaluation',
    evidence: `Evaluation mastered: ${masteredSkills.join(', ')} → Level ${level}`,
  }
}

// ── Write path 3: curriculum scan → working level ───────────

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

/**
 * Infers a phonics working level from a curriculum scan's lesson number.
 * Uses the GATB Language Arts / Phonics lesson progression as the baseline.
 *
 * Phonics curricula typically progress:
 * - Lessons 1-20: letter sounds, letter recognition (Level 1)
 * - Lessons 21-40: CVC words, short vowels (Level 2)
 * - Lessons 41-60: consonant blends (Level 3)
 * - Lessons 61-80: digraphs (Level 4)
 * - Lessons 81-100: CVCe / silent-e / long vowels (Level 5)
 * - Lessons 101-120: vowel teams (Level 6)
 * - Lessons 121-140: diphthongs, r-controlled (Level 7)
 * - Lessons 141+: multisyllable (Level 8)
 *
 * Returns null if no meaningful inference can be made.
 */
export function derivePhonicsWorkingLevelFromScan(
  lessonNumber: number | null | undefined,
  curriculumName: string,
): WorkingLevel | null {
  if (lessonNumber == null || lessonNumber <= 0) return null

  let level: number
  if (lessonNumber <= 20) level = 1
  else if (lessonNumber <= 40) level = 2
  else if (lessonNumber <= 60) level = 3
  else if (lessonNumber <= 80) level = 4
  else if (lessonNumber <= 100) level = 5
  else if (lessonNumber <= 120) level = 6
  else if (lessonNumber <= 140) level = 7
  else level = 8

  const cap = QUEST_MODE_LEVEL_CAP['phonics'] ?? DEFAULT_LEVEL_CAP
  level = Math.min(level, cap)

  return {
    level,
    updatedAt: new Date().toISOString(),
    source: 'curriculum',
    evidence: `Scanned ${curriculumName} Lesson ${lessonNumber}`,
  }
}

/**
 * Infers a comprehension/reading working level from a curriculum scan's lesson number.
 * Uses a broad mapping — reading comprehension curricula vary more than phonics/math,
 * so this is deliberately conservative.
 *
 * - Lessons 1-25: literal recall, sequencing (Level 1)
 * - Lessons 26-50: main idea, character (Level 2-3)
 * - Lessons 51-75: inference, cause-effect (Level 3-4)
 * - Lessons 76-100: compare-contrast, theme (Level 4-5)
 * - Lessons 101+: critical thinking, synthesis (Level 5-6)
 *
 * Returns null if no meaningful inference can be made.
 */
export function deriveReadingWorkingLevelFromScan(
  lessonNumber: number | null | undefined,
  curriculumName: string,
): WorkingLevel | null {
  if (lessonNumber == null || lessonNumber <= 0) return null

  let level: number
  if (lessonNumber <= 25) level = 1
  else if (lessonNumber <= 50) level = 3
  else if (lessonNumber <= 75) level = 4
  else if (lessonNumber <= 100) level = 5
  else level = 6

  const cap = QUEST_MODE_LEVEL_CAP['comprehension'] ?? DEFAULT_LEVEL_CAP
  level = Math.min(level, cap)

  return {
    level,
    updatedAt: new Date().toISOString(),
    source: 'curriculum',
    evidence: `Scanned ${curriculumName} Lesson ${lessonNumber}`,
  }
}

// ── Write path 4: spell-the-word → writing (spelling) working level ─
//
// FEAT-11 Phase 1. Spell-the-word questions are mixed into a reading/phonics
// quest (1–2 per session), so we cannot reuse `computeWorkingLevelFromSession`
// (which needs ≥5 answered questions and would blur spelling into phonics).
// Instead we derive the **writing/spelling** level only from the spell-word
// subset — keeping spelling a separate, separable signal from both phonics and
// future composition.

/** A spell-word question is any tile-assembly question tagged `writing.spelling.*`. */
function isSpellingQuestion(q: SessionQuestion): boolean {
  return q.type === 'spell-word' || (q.skill ?? '').toLowerCase().startsWith('writing.spelling')
}

/**
 * Derive the spelling working level from the spell-the-word questions in a
 * session. The level is the highest level at which the child spelled a word
 * correctly; if none were spelled correctly, a gentle downstep below the lowest
 * attempted level. Returns null when there were no answered spelling questions.
 *
 * Intentionally separate from `computeWorkingLevelFromSession`: spelling earns
 * its **own** working level (`workingLevels.writing`) so it routes by its own
 * gap and is never folded into the phonics number.
 */
export function computeWritingLevelFromSpellingQuestions(
  questions: SessionQuestion[],
): WorkingLevel | null {
  const answered = questions.filter(
    (q) => isSpellingQuestion(q) && !q.skipped && !q.flaggedAsError,
  )
  if (answered.length === 0) return null

  const correct = answered.filter((q) => q.correct)
  const totalCorrect = correct.length

  let newLevel: number
  if (correct.length > 0) {
    newLevel = Math.max(...correct.map((q) => q.level))
  } else {
    const lowestAttempted = Math.min(...answered.map((q) => q.level))
    newLevel = lowestAttempted - 1
  }

  newLevel = Math.min(newLevel, WRITING_LEVEL_CAP)
  newLevel = Math.max(newLevel, 1)

  return {
    level: newLevel,
    updatedAt: new Date().toISOString(),
    source: 'quest',
    evidence: `Spelled ${totalCorrect}/${answered.length} from tiles → Level ${newLevel}`,
  }
}

/**
 * Build seeding findings for the spelling skills exercised this session.
 *
 * Returns at most one finding per `writing.spelling.*` skill, status
 * `emerging` (when at least one word in that skill was spelled) or `not-yet`.
 * **Never returns `mastered`** — spelling mastery is decided only later by the
 * conservative `masteryRollup` and written through the central
 * `skillSnapshotWrites` path. These findings exist purely to *seed* the priority
 * skill on the snapshot (a "teach this next" marker) so the central mastery loop
 * has a target to advance; they assert no mastery and downgrade nothing.
 */
export function deriveSpellingFindings(questions: SessionQuestion[]): EvaluationFinding[] {
  const answered = questions.filter(
    (q) => isSpellingQuestion(q) && !q.skipped && !q.flaggedAsError,
  )
  if (answered.length === 0) return []

  const bySkill = new Map<string, { attempts: number; correct: number }>()
  for (const q of answered) {
    const skill = (q.skill ?? '').trim() || 'writing.spelling.phonetic'
    const entry = bySkill.get(skill) ?? { attempts: 0, correct: 0 }
    entry.attempts += 1
    if (q.correct) entry.correct += 1
    bySkill.set(skill, entry)
  }

  const at = new Date().toISOString()
  const findings: EvaluationFinding[] = []
  for (const [skill, { attempts, correct }] of bySkill) {
    findings.push({
      skill,
      // Cap at 'emerging' — mastery is never asserted inline (central-writer only).
      status: correct > 0 ? 'emerging' : 'not-yet',
      evidence: `Spelled ${correct}/${attempts} from tiles (Spell-the-word)`,
      testedAt: at,
    })
  }
  return findings
}

// ── Write path 5: build-the-sentence → sentence working level ───────
//
// FEAT-11 Phase 2. Build-the-sentence questions are mixed into a reading/phonics
// quest (≤1 per session), so — exactly like spelling — we derive the **sentence**
// level only from the build-sentence subset, never from the full session. This
// keeps sentence-building a separate, separable signal from both phonics and the
// spelling signal (`workingLevels.writing`); sentence results are NEVER folded
// into the spelling number.

/** A build-sentence question is any tagged `writing.composition.sentence` / `writing.sentence.*`. */
function isSentenceQuestion(q: SessionQuestion): boolean {
  const skill = (q.skill ?? '').toLowerCase()
  return (
    q.type === 'build-sentence' ||
    skill.startsWith('writing.composition.sentence') ||
    skill.startsWith('writing.sentence')
  )
}

/**
 * Derive the sentence working level from the build-the-sentence questions in a
 * session: the highest level at which the child built a sentence correctly, or a
 * gentle downstep below the lowest attempted level if none were correct. Returns
 * null when there were no answered sentence questions.
 *
 * Intentionally separate from `computeWorkingLevelFromSession` and from
 * `computeWritingLevelFromSpellingQuestions`: sentence-building earns its **own**
 * working level (`workingLevels.sentence`) so it routes by its own gap and is
 * never folded into the phonics or spelling number.
 */
export function computeSentenceLevelFromQuestions(
  questions: SessionQuestion[],
): WorkingLevel | null {
  const answered = questions.filter(
    (q) => isSentenceQuestion(q) && !q.skipped && !q.flaggedAsError,
  )
  if (answered.length === 0) return null

  const correct = answered.filter((q) => q.correct)
  const totalCorrect = correct.length

  let newLevel: number
  if (correct.length > 0) {
    newLevel = Math.max(...correct.map((q) => q.level))
  } else {
    const lowestAttempted = Math.min(...answered.map((q) => q.level))
    newLevel = lowestAttempted - 1
  }

  newLevel = Math.min(newLevel, SENTENCE_LEVEL_CAP)
  newLevel = Math.max(newLevel, 1)

  return {
    level: newLevel,
    updatedAt: new Date().toISOString(),
    source: 'quest',
    evidence: `Built ${totalCorrect}/${answered.length} sentences from tiles → Level ${newLevel}`,
  }
}

/**
 * Build seeding findings for the sentence skills exercised this session.
 *
 * Returns at most one finding per `writing.composition.sentence` / `writing.sentence.*`
 * skill, status `emerging` (when at least one sentence in that skill was built) or
 * `not-yet`. **Never returns `mastered`** — sentence mastery is decided only later
 * by the conservative `masteryRollup` and written through the central
 * `skillSnapshotWrites` path. These seed the priority skill (a "teach this next"
 * marker) so the central mastery loop has a target to advance; they assert no
 * mastery and downgrade nothing. Mirrors `deriveSpellingFindings` exactly, but
 * for the separate sentence signal.
 */
export function deriveSentenceFindings(questions: SessionQuestion[]): EvaluationFinding[] {
  const answered = questions.filter(
    (q) => isSentenceQuestion(q) && !q.skipped && !q.flaggedAsError,
  )
  if (answered.length === 0) return []

  const bySkill = new Map<string, { attempts: number; correct: number }>()
  for (const q of answered) {
    const skill = (q.skill ?? '').trim() || 'writing.composition.sentence'
    const entry = bySkill.get(skill) ?? { attempts: 0, correct: 0 }
    entry.attempts += 1
    if (q.correct) entry.correct += 1
    bySkill.set(skill, entry)
  }

  const at = new Date().toISOString()
  const findings: EvaluationFinding[] = []
  for (const [skill, { attempts, correct }] of bySkill) {
    findings.push({
      skill,
      // Cap at 'emerging' — mastery is never asserted inline (central-writer only).
      status: correct > 0 ? 'emerging' : 'not-yet',
      evidence: `Built ${correct}/${attempts} sentences from tiles (Build-the-sentence)`,
      testedAt: at,
    })
  }
  return findings
}
