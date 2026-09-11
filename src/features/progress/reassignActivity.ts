// ── Moving a curriculum row to the child it was meant for (UX-354) ──────────
//
// Owner, 2026-09-11: *"Shelly added content for Lincoln on London's page"* — and
// no way to move it. `AddActivityDialog` stamps the **live** `childId` on every
// row it creates and never `'both'`, so a row typed in while the wrong child is
// selected lands on the sibling; the ⋮ menu's *Assign to a child* was gated on
// `menuConfig?.type === 'workbook'`, one of `ActivityType`'s **seven** members.
// A routine, a formation block, an activity, an app, a strand or an evaluation
// could not be moved at all — it had to be deleted and retyped, which is why the
// report arrived as a question rather than as a bug.
//
// So the door reaches every type the dialog can create, and the rules that
// already existed keep their teeth:
//
//  * **DATA-08 stands.** A workbook still may not be owned by `'both'` — same
//    curriculum, different lessons, so a shared workbook surfaces to every child
//    through the `in [childId, 'both']` reader. `'both'` stays legitimate for
//    everything else, which is the other half of the owner's ask: a routine she
//    typed for one boy is often meant for the pair.
//  * **A finished program is a closed record**, exactly as `renameActivity`
//    refuses one. The Completed section has no ⋮ menu, so this is the second
//    layer: a surface gates what it shows, a resolver decides what is true.
//  * **A strand that has recorded sessions does not move.** Its
//    `currentPosition` is a *session count* written only by a captured session
//    (UX-283) — evidence of days that happened, with an artifact behind each
//    one. Reassigning the row would credit those days to the other child, and
//    correcting a record of what happened is a different act from correcting who
//    a row is for (`CLAUDE.md`'s attribution carve-out covers the second and
//    stops at the first). A strand with **no** sessions yet carries no record at
//    all, so it is just a mistyped row and moves freely.
//
// **The refusal is said in the dialog, not enforced by hiding the menu item** —
// the house pattern, because a parent who finds nothing learns nothing, and
// *"start a separate one for the other child"* is the answer being looked for.
//
// Pure: no React, no Firestore, never throws.

import type { ActivityConfig } from '../../core/types/planning'
import { ACTIVITY_TYPE_WORDS } from '../shelly-chat/activityTypeChoices'
import { isStrand, strandProgressLabel, strandSessionCount } from './strand'

/** The owner id shared rows carry. Not a child id. */
export const BOTH_OWNER_ID = 'both'
/** What `'both'` is called on screen — the word `RecordsPage` already uses. */
export const BOTH_OWNER_LABEL = 'Both kids'

/** One destination the dialog offers. */
export interface ReassignOwnerOption {
  /** A child id, or {@link BOTH_OWNER_ID}. */
  id: string
  label: string
}

/** What the dialog shows for one row. */
export interface ReassignPlan {
  /** Why this row may not be moved. `''` when it may. */
  refusal: string
  /** Whom it may be moved to. Empty when `refusal` is set. */
  options: ReassignOwnerOption[]
  /** The question above the buttons. */
  prompt: string
  /** One line on what this kind of row is, and what `'both'` means for it. */
  shapeNote: string
}

/** A finished program's owner is part of the record that it was finished. */
export const REASSIGN_COMPLETED_REFUSAL =
  'This program is marked finished, so who it belonged to is part of a closed record and stays as it is.'

/**
 * A strand's count is evidence, so moving the row would move somebody's days.
 *
 * Names the count and the current owner, because *"you can't"* without *"here is
 * what would have moved"* is the sentence a parent argues with.
 */
export function reassignStrandRefusal(
  config: Pick<ActivityConfig, 'currentPosition'>,
  ownerName: string,
): string {
  const count = strandProgressLabel(config)
  return (
    `${ownerName} has ${count} recorded on this one, each with a captured session behind it. ` +
    'Moving the row would move that record too, so it stays where it is — start a separate one for the other child.'
  )
}

function childOption(child: { id: string; name: string }): ReassignOwnerOption {
  return { id: child.id, label: child.name }
}

/**
 * May this row be moved, and where to.
 *
 * `childList` is the family's children in the family's own order; the `'both'`
 * option is appended for every type but a workbook, and only when there is more
 * than one child for it to mean anything.
 */
export function planReassignActivity(
  config: Pick<ActivityConfig, 'name' | 'type' | 'completed' | 'currentPosition' | 'childId'>,
  childList: { id: string; name: string }[],
): ReassignPlan {
  const name = config.name?.trim() || 'this row'
  const words = config.type ? ACTIVITY_TYPE_WORDS[config.type] : undefined
  const phrase = words?.phrase ?? 'an activity'
  const prompt = `Who is “${name}” for?`

  if (config.completed) {
    return { refusal: REASSIGN_COMPLETED_REFUSAL, options: [], prompt, shapeNote: '' }
  }

  if (isStrand(config) && strandSessionCount(config) > 0) {
    const ownerName =
      childList.find((c) => c.id === config.childId)?.name ?? 'This child'
    return {
      refusal: reassignStrandRefusal(config, ownerName),
      options: [],
      prompt,
      shapeNote: '',
    }
  }

  // DATA-08: a workbook is per-child, always.
  const workbook = config.type === 'workbook'
  const options: ReassignOwnerOption[] = childList.map(childOption)
  if (!workbook && childList.length > 1) {
    options.push({ id: BOTH_OWNER_ID, label: BOTH_OWNER_LABEL })
  }

  const shapeNote = workbook
    ? `It's ${phrase}, and a workbook belongs to one child — same book, different lessons.`
    : childList.length > 1
      ? `It's ${phrase}. It can belong to one child or to both.`
      : `It's ${phrase}.`

  return { refusal: '', options, prompt, shapeNote }
}

/**
 * The snack after a move that landed.
 *
 * `'both'` gets its own sentence rather than a possessive built from its label —
 * *"is now Both kids's"* is what a template produces and nobody writes.
 */
export function reassignedNotice(name: string, option: ReassignOwnerOption): string {
  if (option.id === BOTH_OWNER_ID) {
    return `“${name}” is now on both kids' plans.`
  }
  return `“${name}” is now ${option.label}'s.`
}

/**
 * The snack after one that did not.
 *
 * Says the row is **unchanged** rather than implying the move half-happened —
 * the `positionFailureNotice` rule on this same tab, and UX-351's on Today.
 */
export function reassignFailureNotice(name: string): string {
  return `Couldn't move “${name}”. It's still where it was — try again.`
}
