/**
 * Motivation Protocol (Slice H)
 *
 * Start-Anyway Protocol for handling refusal, complaining, and avoidance.
 * Treats self-regulation as a first-class skill.
 */

import type {
  ModalityChoice,
  SkillSnapshot,
  StartAnywayScript,
  StopRule,
} from '../../core/types/domain'
import { RegulationTags } from '../../core/types/skillTags'

/**
 * Default start-anyway scripts mapped to common triggers.
 */
export const DEFAULT_START_ANYWAY_SCRIPTS: StartAnywayScript[] = [
  {
    trigger: 'Refusal/complaining > 60s',
    choices: [
      { label: 'Worksheet version', description: 'Do 3 problems on paper with manipulatives' },
      { label: 'Whiteboard version', description: 'Same skill on whiteboard with dry-erase markers' },
    ],
    timerMinutes: 5,
    firstRepTogether: true,
    winReward: '1 XP + high-five + 2-min break',
    skillTags: [RegulationTags.StartAnyway],
  },
  {
    trigger: '3 mistakes in a row on regrouping',
    choices: [
      { label: 'Manipulatives', description: 'Use base-ten blocks for regrouping' },
      { label: 'Drawing method', description: 'Draw tens and ones, cross out to regroup' },
    ],
    timerMinutes: 5,
    firstRepTogether: true,
    winReward: 'Return with 2 problems only, then done',
    skillTags: [RegulationTags.FrustrationTolerance, 'math.subtraction.regroup'],
  },
  {
    trigger: 'CVC reading avoidance / "I can\'t read"',
    choices: [
      { label: 'Tap & blend', description: 'Tap each sound, then slide to blend (5 words)' },
      { label: 'Sound boxes', description: 'Use Elkonin boxes with letter tiles (5 words)' },
    ],
    timerMinutes: 5,
    firstRepTogether: true,
    winReward: '1 XP + choose a fun read-aloud book',
    skillTags: [RegulationTags.StartAnyway, 'reading.cvcBlend'],
  },
  {
    trigger: 'General "I don\'t want to do school" (low energy)',
    choices: [
      { label: 'Easy win first', description: 'Start with sight words or math facts you already know' },
      { label: 'Movement break', description: '2-min jumping jacks, then start with timer' },
    ],
    timerMinutes: 5,
    firstRepTogether: true,
    winReward: '1 XP + 5-min free choice after timer',
    skillTags: [RegulationTags.StartAnyway, RegulationTags.Stamina],
  },
]

/**
 * Find the best start-anyway script for a given trigger situation.
 * Matches against stop rules and returns the most relevant protocol.
 */
export function findStartAnywayScript(
  triggerText: string,
  snapshot: SkillSnapshot | null,
): StartAnywayScript | null {
  const lower = triggerText.toLowerCase()

  // First check custom stop rules from snapshot
  if (snapshot) {
    for (const rule of snapshot.stopRules) {
      if (lower.includes(rule.trigger.toLowerCase())) {
        return stopRuleToScript(rule)
      }
    }
  }

  // Then check default scripts
  for (const script of DEFAULT_START_ANYWAY_SCRIPTS) {
    const triggerLower = script.trigger.toLowerCase()
    // Simple keyword matching
    const keywords = triggerLower.split(/\s+/).filter((w) => w.length > 3)
    const matchCount = keywords.filter((kw) => lower.includes(kw)).length
    if (matchCount >= 2) {
      return script
    }
  }

  // Fallback: generic start-anyway
  return {
    trigger: triggerText,
    choices: [
      { label: 'Choice A', description: 'Same skill, different format (whiteboard/verbal)' },
      { label: 'Choice B', description: 'Easier version of the same skill (fewer reps)' },
    ],
    timerMinutes: 5,
    firstRepTogether: true,
    winReward: '1 XP + praise + short break',
    skillTags: [RegulationTags.StartAnyway],
  }
}

/**
 * Convert a stop rule into a start-anyway script.
 */
function stopRuleToScript(rule: StopRule): StartAnywayScript {
  return {
    trigger: rule.trigger,
    choices: buildChoicesFromAction(rule.action),
    timerMinutes: 5,
    firstRepTogether: true,
    winReward: '1 XP + praise + short break',
    skillTags: [RegulationTags.StartAnyway],
  }
}

/**
 * Parse a stop rule action into modality choices.
 */
function buildChoicesFromAction(action: string): ModalityChoice[] {
  // Try to extract meaningful choices from the action text
  return [
    { label: 'Modified version', description: action },
    { label: 'Alternative approach', description: 'Try a different modality (verbal, whiteboard, manipulatives)' },
  ]
}

/**
 * Build all applicable start-anyway scripts for a child's snapshot.
 * Used to pre-populate the teach helper.
 */
export function buildAllScripts(
  snapshot: SkillSnapshot | null,
): StartAnywayScript[] {
  const scripts: StartAnywayScript[] = [...DEFAULT_START_ANYWAY_SCRIPTS]

  // Add scripts from custom stop rules
  if (snapshot) {
    for (const rule of snapshot.stopRules) {
      // Don't duplicate if already covered by defaults
      const isDuplicate = scripts.some(
        (s) => s.trigger.toLowerCase().includes(rule.trigger.toLowerCase()),
      )
      if (!isDuplicate) {
        scripts.push(stopRuleToScript(rule))
      }
    }
  }

  return scripts
}

/**
 * Parent daily difficulty rating (1-5) for trend tracking.
 */
export interface DailyDifficultyRating {
  date: string
  childId: string
  rating: 1 | 2 | 3 | 4 | 5
  notes?: string
}

/**
 * Calculate difficulty trend from recent ratings.
 * Returns: 'improving', 'stable', 'declining'
 */
export function getDifficultyTrend(
  ratings: DailyDifficultyRating[],
): 'improving' | 'stable' | 'declining' {
  if (ratings.length < 3) return 'stable'

  // Compare last 3 vs previous 3
  const sorted = [...ratings].sort((a, b) => a.date.localeCompare(b.date))
  const recent = sorted.slice(-3)
  const previous = sorted.slice(-6, -3)

  if (previous.length < 3) return 'stable'

  const recentAvg = recent.reduce((sum, r) => sum + r.rating, 0) / recent.length
  const previousAvg = previous.reduce((sum, r) => sum + r.rating, 0) / previous.length

  const diff = recentAvg - previousAvg
  if (diff <= -0.5) return 'improving' // Lower rating = easier day
  if (diff >= 0.5) return 'declining'
  return 'stable'
}
