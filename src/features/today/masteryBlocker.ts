import type { ChecklistItem } from '../../core/types/planning'
import type { ConceptualBlock } from '../../core/types/evaluation'
import { generateBlockId } from '../../core/utils/blockerLifecycle'

/** Infer a usable skill key from a checklist item's subject + label. */
function inferSkillKey(item: ChecklistItem): string {
  const bucket = item.subjectBucket ?? 'general'
  const label = (item.label || 'activity').trim()
  // If the item has tagged skills, use the first one (most specific).
  if (item.skillTags && item.skillTags.length > 0) return String(item.skillTags[0])
  return `${bucket}.${label}`.toLowerCase()
}

/**
 * Build a Partial<ConceptualBlock> for a "Stuck" mastery chip tap.
 * Returns null if the item is not identifiable.
 */
export function buildStuckBlock(
  item: ChecklistItem,
  dateISO: string = new Date().toISOString(),
): Partial<ConceptualBlock> | null {
  if (!item || !item.label) return null

  const skillKey = inferSkillKey(item)
  const id = generateBlockId(skillKey)
  const dayLabel = dateISO.slice(0, 10)

  return {
    id,
    name: item.label,
    affectedSkills: item.skillTags?.length ? item.skillTags.map(String) : [item.label],
    status: 'ADDRESS_NOW',
    recommendation: 'ADDRESS_NOW',
    rationale: 'Parent observation — Shelly marked this activity as "Stuck" during daily work.',
    evidence: `Shelly marked '${item.label}' as Stuck on ${dayLabel}`,
    detectedAt: dateISO,
    firstDetectedAt: dateISO,
    lastReinforcedAt: dateISO,
    sessionCount: 1,
    source: 'parent',
    lastSource: 'parent',
    evaluationSessionId: '',
  }
}

/**
 * Build a RESOLVING reinforcement signal for a "Got it" mastery chip tap on an
 * item that aligns with an existing blocker. Returns null if nothing to merge.
 *
 * The merge helper handles the actual state transition — this just supplies
 * fresh evidence + a RESOLVING status nudge so the existing block moves along
 * its lifecycle.
 */
export function buildGotItReinforcement(
  item: ChecklistItem,
  existingBlocks: ConceptualBlock[],
  dateISO: string = new Date().toISOString(),
): Partial<ConceptualBlock> | null {
  if (!item || !item.label) return null
  const skillKey = inferSkillKey(item)
  const id = generateBlockId(skillKey)
  // Only emit a reinforcement if this id already corresponds to a known block.
  const match = existingBlocks.find((b) => b.id === id)
  if (!match) return null
  const dayLabel = dateISO.slice(0, 10)
  return {
    id,
    status: 'RESOLVING',
    recommendation: 'ADDRESS_NOW',
    evidence: `Shelly marked '${item.label}' as Got it on ${dayLabel}`,
    lastReinforcedAt: dateISO,
    source: 'parent',
    lastSource: 'parent',
  }
}
