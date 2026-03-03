/**
 * Skip Advisor v1 (Slice F)
 *
 * Evaluates plan items for skip/modify/keep recommendations
 * based on mastery gates, skill tags, and evidence.
 */

import type {
  DraftPlanItem,
  PrioritySkill,
  SkillSnapshot,
  SkipAdvisorResult,
} from '../../core/types/domain'
import { MasteryGate, MasteryGateLabel } from '../../core/types/enums'
import { SKILL_TAG_MAP } from '../../core/types/skillTags'

/**
 * Evaluate whether a plan item can be skipped based on mastery gates.
 *
 * Only MasteryGate.IndependentConsistent (Level 3) unlocks skip.
 * Level 2 (MostlyIndependent) may suggest "modify" (lighter version).
 * Levels 0-1 always "keep".
 */
export function evaluateSkipEligibility(
  item: DraftPlanItem,
  snapshot: SkillSnapshot | null,
): SkipAdvisorResult {
  if (!snapshot || snapshot.prioritySkills.length === 0) {
    return { action: 'keep', rationale: 'No skill data available — keep by default.' }
  }

  // Find matching priority skills for this item's skill tags
  const matchedSkills = findMatchingSkills(item.skillTags, snapshot.prioritySkills)

  if (matchedSkills.length === 0) {
    return {
      action: 'keep',
      rationale: 'No priority skill match — keep for coverage.',
    }
  }

  // If any matched skill has mastery gate 3, suggest skip
  const masteredSkill = matchedSkills.find(
    (s) => s.masteryGate === MasteryGate.IndependentConsistent,
  )
  if (masteredSkill) {
    return {
      action: 'skip',
      rationale: `Skip: ${masteredSkill.label} at ${MasteryGateLabel[MasteryGate.IndependentConsistent]}. Mastery evidence this week.`,
      evidenceLevel: MasteryGate.IndependentConsistent,
      skillTag: masteredSkill.tag,
    }
  }

  // If highest matched skill is mastery gate 2, suggest modify
  const mostlyIndependent = matchedSkills.find(
    (s) => s.masteryGate === MasteryGate.MostlyIndependent,
  )
  if (mostlyIndependent) {
    return {
      action: 'modify',
      rationale: `Modify: ${mostlyIndependent.label} is ${MasteryGateLabel[MasteryGate.MostlyIndependent]}. Convert to 1-2 problems + quick check.`,
      evidenceLevel: MasteryGate.MostlyIndependent,
      skillTag: mostlyIndependent.tag,
    }
  }

  // Check for redundancy (same skill tag appears in multiple items)
  // This is a heuristic — if the item duplicates a skill that's already well-covered
  const tagDef = item.skillTags.length > 0 ? SKILL_TAG_MAP[item.skillTags[0]] : undefined
  if (tagDef) {
    return {
      action: 'keep',
      rationale: `Keep: ${tagDef.label} still developing. ${tagDef.evidence}`,
      skillTag: item.skillTags[0],
    }
  }

  return {
    action: 'keep',
    rationale: 'Core skill / priority — keep for mastery building.',
  }
}

/**
 * Batch evaluate all items in a plan.
 */
export function batchEvaluateSkip(
  items: DraftPlanItem[],
  snapshot: SkillSnapshot | null,
): Map<string, SkipAdvisorResult> {
  const results = new Map<string, SkipAdvisorResult>()
  for (const item of items) {
    if (item.isAppBlock) {
      results.set(item.id, {
        action: 'keep',
        rationale: 'App block — runs automatically.',
      })
      continue
    }
    results.set(item.id, evaluateSkipEligibility(item, snapshot))
  }
  return results
}

/**
 * Find priority skills that match any of the given skill tags.
 */
function findMatchingSkills(
  itemTags: string[],
  prioritySkills: PrioritySkill[],
): PrioritySkill[] {
  if (itemTags.length === 0) return []

  return prioritySkills.filter((skill) => {
    // Match if the priority skill tag overlaps with item tags
    // Tags are dot-delimited, so check prefix matches too
    return itemTags.some((itemTag) => {
      const normalizedItem = itemTag.toLowerCase()
      const normalizedSkill = skill.tag.toLowerCase()
      return (
        normalizedItem === normalizedSkill ||
        normalizedItem.startsWith(normalizedSkill.split('.').slice(0, 2).join('.')) ||
        normalizedSkill.startsWith(normalizedItem.split('.').slice(0, 2).join('.'))
      )
    })
  })
}

/**
 * Convert a SkillLevel to an approximate MasteryGate for existing data.
 * Used when migrating or when masteryGate is not yet set.
 */
export function skillLevelToMasteryGate(level: string): MasteryGate {
  switch (level) {
    case 'emerging':
      return MasteryGate.NotYet
    case 'developing':
      return MasteryGate.WithHelp
    case 'supported':
      return MasteryGate.WithHelp
    case 'practice':
      return MasteryGate.MostlyIndependent
    case 'secure':
      return MasteryGate.IndependentConsistent
    default:
      return MasteryGate.NotYet
  }
}

/**
 * Get the effective mastery gate for a priority skill.
 * Falls back to converting from SkillLevel if masteryGate is not set.
 */
export function getEffectiveMasteryGate(skill: PrioritySkill): MasteryGate {
  if (skill.masteryGate !== undefined) return skill.masteryGate
  return skillLevelToMasteryGate(skill.level)
}
