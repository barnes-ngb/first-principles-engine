import type { ChecklistItem, DayBlock } from '../types'

/**
 * Shared correspondence rule between a checklist item and a day block — the
 * SINGLE source of truth for "does this completed checklist item represent the
 * same work as this block?" (DATA-14).
 *
 * Both sides of the hours system import this so they can never drift:
 *  - `TodayChecklist` uses it to auto-stamp `actualMinutes` onto the matching
 *    block when an item is checked (and to clear it on uncheck);
 *  - `records.logic` (`dayLogMinuteContributions`) uses it to dedup completed
 *    checklist items against blocks that already carry `actualMinutes`, so an
 *    unmatched completed item is counted while a matched one is not
 *    double-counted.
 *
 * Rule (kept byte-identical to the original TodayChecklist auto-set logic):
 *  - label match: the block's own checklist contains an entry whose `label`
 *    equals the item's `label`; OR
 *  - title match: the block has a `title` that either equals the item's label
 *    with a trailing "(Nm)" duration suffix stripped, or is a case-insensitive
 *    substring of that cleaned label.
 */
export const itemMatchesBlock = (
  item: ChecklistItem,
  block: DayBlock,
): boolean => {
  const matchesLabel = block.checklist?.some((ci) => ci.label === item.label) ?? false
  const titleClean = item.label.replace(/\s*\(\d+m\)\s*$/, '')
  const matchesTitle =
    block.title != null &&
    (block.title === titleClean ||
      titleClean.toLowerCase().includes(block.title.toLowerCase()))
  return matchesLabel || matchesTitle
}
