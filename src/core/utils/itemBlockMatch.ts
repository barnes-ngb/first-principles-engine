import type { ChecklistItem, DayBlock } from '../types'
import { itemMatchesBlock as sharedItemMatchesBlock } from '../../../functions/src/shared/hoursContributions'

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
 *    double-counted;
 *  - `liveDayEdit` and `watchItemCompletion` mirror the same correspondence when
 *    a live day is edited.
 *
 * ARCH-47 slice 4: the rule itself now has exactly ONE definition, in
 * `functions/src/shared/hoursContributions.ts`, compiled by BOTH the app and the
 * Cloud Functions — the monthly review book counts the same hours the Records
 * page does, and a change that breaks either side fails to COMPILE. This file
 * keeps its path and its TYPED signature so its four consumers are untouched,
 * and delegates. `ChecklistItem` / `DayBlock` are structurally assignable to the
 * shared module's `Raw*` shapes, so no cast is needed and no call site was
 * loosened to `unknown`.
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
): boolean => sharedItemMatchesBlock(item, block)
