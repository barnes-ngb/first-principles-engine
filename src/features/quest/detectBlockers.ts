import type { ConceptualBlock } from '../../core/types/evaluation'
import { generateBlockId } from '../../core/utils/blockerLifecycle'
import type { QuestMode, SessionQuestion } from './questTypes'
import { formatSkillLabel } from './questAdaptive'

/** Minimum questions before a session is worth scanning for blockers. */
export const MIN_SESSION_FOR_BLOCKER_DETECTION = 5

/** Number of wrong answers at the same skill that counts as a signal. */
const WRONG_THRESHOLD = 2

interface SkillGroup {
  skill: string
  wrong: SessionQuestion[]
  skipped: SessionQuestion[]
  correct: SessionQuestion[]
}

function groupBySkill(questions: SessionQuestion[]): Map<string, SkillGroup> {
  const map = new Map<string, SkillGroup>()
  for (const q of questions) {
    if (q.flaggedAsError) continue
    const skill = q.skill || 'unknown'
    let g = map.get(skill)
    if (!g) {
      g = { skill, wrong: [], skipped: [], correct: [] }
      map.set(skill, g)
    }
    if (q.skipped) g.skipped.push(q)
    else if (q.correct) g.correct.push(q)
    else g.wrong.push(q)
  }
  return map
}

function targetWordFromQuestion(q: SessionQuestion): string | null {
  // Mirror the extractTargetWord heuristic but on SessionQuestion (not QuestQuestion).
  if (q.stimulus && q.stimulus.trim()) {
    const trimmed = q.stimulus.trim()
    if (/^[a-zA-Z][a-zA-Z\-']{0,24}$/.test(trimmed)) return trimmed.toLowerCase()
  }
  if (q.correctAnswer && /^[a-zA-Z][a-zA-Z\-']{0,24}$/.test(q.correctAnswer.trim())) {
    return q.correctAnswer.trim().toLowerCase()
  }
  return null
}

/**
 * Detect blockers from a completed quest session.
 *
 * Rule: if Lincoln got 2+ wrong at the same sub-skill, that's a blocker signal.
 * - 2-3 wrong → ADDRESS_NOW
 * - exactly 2 wrong AND one question on that skill was skipped → DEFER (noisy signal)
 * - Fluency sessions skip detection (no MC questions to count).
 * - Sessions shorter than MIN_SESSION_FOR_BLOCKER_DETECTION skip detection.
 *
 * Returns Partial<ConceptualBlock> entries ready for mergeBlock. Each entry
 * carries a stable `id` (from the skill tag), rationale, evidence, source,
 * and the specific words that were missed.
 */
export function detectBlockersFromSession(
  questions: SessionQuestion[],
  questMode: QuestMode | undefined,
  opts?: { sessionId?: string; now?: string },
): Partial<ConceptualBlock>[] {
  if (questMode === 'fluency') return []
  if (!questions || questions.length < MIN_SESSION_FOR_BLOCKER_DETECTION) return []

  const now = opts?.now ?? new Date().toISOString()
  const sessionId = opts?.sessionId ?? ''
  const groups = groupBySkill(questions)
  const blocks: Partial<ConceptualBlock>[] = []

  for (const group of groups.values()) {
    const wrongCount = group.wrong.length
    if (wrongCount < WRONG_THRESHOLD) continue

    const skippedOnThisSkill = group.skipped.length > 0
    const status =
      wrongCount === WRONG_THRESHOLD && skippedOnThisSkill ? 'DEFER' : 'ADDRESS_NOW'

    const label = formatSkillLabel(group.skill)
    const id = generateBlockId(group.skill || label)

    // Words the kid missed, de-duplicated.
    const words: string[] = []
    const seen = new Set<string>()
    for (const q of group.wrong) {
      const w = targetWordFromQuestion(q)
      if (!w || seen.has(w)) continue
      seen.add(w)
      words.push(w)
    }

    // Question IDs that triggered detection.
    const questionIds = group.wrong.map((q) => q.id).filter((id) => !!id)

    const wordsStr = words.length > 0 ? ` (${words.join(', ')})` : ''
    const evidence = `Quest ${questMode ?? ''} session: ${wrongCount} wrong at ${label}${wordsStr}`
      .trim()

    const rationale =
      status === 'DEFER'
        ? `Signal is mixed — ${wrongCount} wrong and ${group.skipped.length} skipped on ${label}. Re-probe next session before committing to intervention.`
        : `${wrongCount} wrong at ${label} within a single quest session. Pattern worth targeting.`

    blocks.push({
      id,
      name: label,
      affectedSkills: [group.skill],
      status,
      recommendation: status === 'DEFER' ? 'DEFER' : 'ADDRESS_NOW',
      rationale,
      evidence,
      detectedAt: now,
      firstDetectedAt: now,
      lastReinforcedAt: now,
      sessionCount: 1,
      source: 'quest',
      lastSource: 'quest',
      specificWords: words.length > 0 ? words : undefined,
      specificQuestions: questionIds.length > 0 ? questionIds : undefined,
      evaluationSessionId: sessionId,
    })
  }

  return blocks
}
