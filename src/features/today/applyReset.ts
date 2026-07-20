import type { ChecklistItem, DayBlock } from '../../core/types'

/**
 * Applied-plan authority (owner decision 2026-07-19: "the week planning should
 * reset so there's no rollover, and the week aligns with plan").
 *
 * When a week plan is (re)applied over a day that already has a day log, the
 * applied plan becomes authoritative for that day: fresh planned items replace
 * the day's planner residue. But the reset clears **unfinished rolled-over
 * residue only** — three things are NEVER dropped, because hours honesty and the
 * additive-only rail outrank tidiness (HARD CONSTRAINT):
 *
 *   1. completed items — and, with them, any logged `actualMinutes`, evidence
 *      (`evidenceArtifactId`/`evidenceCollection`), grade/mastery, etc.;
 *   2. manually-added items (`source === 'manual'`);
 *   3. (blocks) any block carrying logged `actualMinutes` — those minutes count
 *      toward compliance via the block-actuals path (`records.logic`).
 *
 * What the reset DOES remove from the existing checklist:
 *   - incomplete items stamped `rolledOverFrom` — the stale rolled-over residue
 *     from *before* the apply (all such residue predates the apply by
 *     definition, since it was rolled from an earlier day);
 *   - incomplete planner items with no completion/minutes are simply not
 *     retained here; the fresh planned items take their place.
 */
export function retainChecklistForApply(
  existing: ChecklistItem[],
): ChecklistItem[] {
  return existing.filter((item) => {
    // (1) Never drop completed work — preserves its minutes/evidence.
    if (item.completed) return true
    // Reset: drop incomplete pre-apply rolled-over residue.
    if (item.rolledOverFrom) return false
    // (2) Keep manually-added items (matches pre-reset apply behavior).
    return item.source === 'manual'
  })
}

/**
 * Blocks half of the apply reset. Keeps every block that either carries logged
 * `actualMinutes` (HARD CONSTRAINT #3 — those minutes are a compliance
 * contribution) or was manually added. Planner blocks with no tracked time are
 * dropped and re-created from the fresh plan.
 */
export function retainBlocksForApply(existing: DayBlock[]): DayBlock[] {
  return existing.filter(
    (block) => (block.actualMinutes ?? 0) > 0 || block.source === 'manual',
  )
}
