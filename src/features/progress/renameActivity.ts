// ── Renaming a curriculum row, and keeping what it used to be called (UX-279) ─
//
// Owner, relaying Shelly, 2026-09-08: *"Shelly would like to be able to edit the
// curriculum titles. We need to be able to create tags of alternate names
// beneath the curriculum then."* Those are one feature, and this module is its
// decision half — pure, no Firestore, so every rule below is testable without a
// write.
//
// **What a rename must not do.** `name` is a join key in three places and a
// stored record in a fourth (see `core/utils/activityNames`), so renaming is
// only safe because the old name survives as an alternate. Nothing here is
// retroactive: no day log, no applied week, no artifact title and no recorded
// minute is touched. `days.checklist[].label` was written as
// `"{name} ({minutes}m)"` on the day it happened and is evidence of that day —
// renaming the program does not change what happened, and a rename that
// rewrote history would be a records app editing its own records.
//
// **A duplicate is a notice, not a block** — the same call FEAT-209 made for
// `addActivity`, and this composes that module's own sentence rather than
// writing a second, differently-worded one. She may have a reason for two rows
// with one name; she should see what is already there and decide.

import { duplicateActivityNotice } from '../shelly-chat/curriculumActions'
import type { ChatActivityConfig } from '../shelly-chat/useShellyChatActions'
import type { ActivityConfig } from '../../core/types/planning'
import {
  MAX_ACTIVITY_ALIASES,
  matchesActivityName,
  normalizeAliases,
} from '../../core/utils/activityNames'
import { nameKey } from '../../core/utils/nameKey'

/** What a rename would write, or why it would write nothing. */
export interface RenameActivityPlan {
  /** The name to write. `null` when nothing should be written at all. */
  name: string | null
  /** The alternate-name list to write beside it; `null` when `name` is null. */
  aliases: string[] | null
  /** Why nothing is written — '' when the plan is writable. */
  refusal: string
  /** "You already have …" — shown above the save, never in place of it. */
  duplicateNotice: string
  /** True when the old name is being carried into the alternates by this save. */
  carriesOldName: boolean
}

const NOTHING: RenameActivityPlan = {
  name: null,
  aliases: null,
  refusal: '',
  duplicateNotice: '',
  carriesOldName: false,
}

/** The refusal for an empty name. An activity with no name renders as a blank row. */
export const EMPTY_NAME_REFUSAL = 'An activity needs a name.'

/**
 * The refusal for a finished program.
 *
 * A completed config is part of a closed record — the Completed list says what
 * was finished and when, and renaming it would change what that record claims
 * was finished. The UI does not offer a rename there (the Completed section has
 * no ⋮ menu at all), so this is the second layer: the house pattern is that the
 * surface gates and the resolver refuses, because a gate is a decision about
 * what to show and a refusal is a decision about what is true.
 */
export const COMPLETED_NAME_REFUSAL =
  'This program is marked finished, so its name is part of a closed record and stays as it is.'

/**
 * Plan a rename: what to write, what to carry, and what to say first.
 *
 * `siblings` is whatever list the caller has — on Progress → Curriculum that is
 * the active child's configs plus the shared ones, which is exactly the set the
 * renamed row sits beside. The function is correct for the list it is handed
 * and invents no reads of its own (the same doctrine as
 * `findDuplicateActivities`, UX-205/UX-210).
 */
export function planRename(
  config: Pick<ActivityConfig, 'id' | 'name' | 'completed'> & { aliases?: string[] },
  nextName: string,
  /**
   * The alternates as edited, when a caller is editing them — the STORED list
   * stays on `config`, so this function can tell a change from a no-change.
   * Omitted means "leave them as they are".
   */
  nextAliases?: readonly string[],
  siblings: readonly ChatActivityConfig[] = [],
  options: { carryOldName?: boolean } = {},
): RenameActivityPlan {
  if (config.completed) return { ...NOTHING, refusal: COMPLETED_NAME_REFUSAL }

  const trimmed = (nextName ?? '').trim()
  if (!trimmed) return { ...NOTHING, refusal: EMPTY_NAME_REFUSAL }

  const previous = (config.name ?? '').trim()
  // Byte-identical is not a rename. A change of spacing, case or punctuation IS
  // one — she typed it — even though `nameKey` cannot tell the two apart.
  const nameChanged = trimmed !== previous

  // The old name is worth keeping only when it is a DIFFERENT key. Re-spelling
  // "math k" as "Math K" leaves every matcher answering exactly as before, so
  // storing the old spelling would spend a capped slot on a name that already
  // matches.
  const carriesOldName =
    options.carryOldName !== false &&
    nameChanged &&
    Boolean(nameKey(previous)) &&
    nameKey(previous) !== nameKey(trimmed)
  const stored = config.aliases ?? []
  const edited = nextAliases ?? stored
  const aliases = normalizeAliases(
    carriesOldName ? [...edited, previous] : edited,
    trimmed,
    MAX_ACTIVITY_ALIASES,
  )

  // This plans the whole save, not only the rename. Adding an alternate without
  // touching the name is a first-class thing to want — the cover's full title
  // is the commonest one — so a save with an unchanged name and a changed list
  // is writable, and a save that changes neither writes nothing.
  if (!nameChanged && sameNames(aliases, stored)) return NOTHING

  return {
    name: trimmed,
    aliases,
    refusal: '',
    duplicateNotice: renameDuplicateNotice(config.id, [trimmed, ...aliases], siblings),
    carriesOldName,
  }
}

/** Two alternate-name lists, compared as they are stored: order and text. */
function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

/**
 * The "you already have …" line for a save that would make this row answer to a
 * name another live row already answers to.
 *
 * **Every name on both sides** (Codex round 3, P2). It first compared only the
 * changed display name against siblings' names, which left the collision that
 * actually costs something un-warned: an alternate she adds — without touching
 * the display name, so the notice was suppressed entirely — that equals another
 * workbook's title. Both rows then match the same scanned page, and the scan
 * lookup's `.find(...)` updates whichever document comes back first. A position
 * written to the wrong workbook is precisely what the alternates were added to
 * prevent, so the warning has to see what the LOOKUP sees.
 *
 * Completed programs are excluded, as they are for an add: a finished program
 * is history and reusing its name is a legitimate thing to do. The row being
 * saved is excluded too — it always matches itself.
 */
export function renameDuplicateNotice(
  configId: string,
  nextNames: readonly string[],
  siblings: readonly ChatActivityConfig[],
): string {
  const matches = siblings.filter(
    (c) =>
      c.id !== configId &&
      !c.completed &&
      nextNames.some((candidate) => matchesActivityName(c, candidate)),
  )
  return duplicateActivityNotice(matches)
}

// ── The alternates, in words (UX-280) ────────────────────────────────────────

/** The owner asked for "tags of alternate names beneath the curriculum". */
export const ALIAS_SECTION_LABEL = 'Also known as'

/**
 * What the field is FOR, said in terms of the thing it actually protects.
 *
 * "Alias" is a developer's word for it. What a parent needs to know is that
 * this is where the long name on the cover goes, and that putting it here is
 * what lets a photo of that cover still find this row.
 */
export const ALIAS_FIELD_HELP =
  "What else this is called — the full title on the cover, say. A scan of the book will match any of these."

/** The line at the cap, naming the number rather than just refusing. */
export function aliasCapNotice(cap: number = MAX_ACTIVITY_ALIASES): string {
  return `That's ${cap} names, which is the most one activity can have. Remove one to add another.`
}

/**
 * The line for a rename that did not land (Codex round 1, P2).
 *
 * The house rule for a failed write, set by `deleteFailureNotice`: say what is
 * still true, not just that something went wrong. A rename whose write was
 * rejected leaves the row exactly as it was, and a parent who reads only
 * "something went wrong" does not know whether her curriculum is now half
 * renamed.
 */
export function renameFailureNotice(name: string): string {
  return `Couldn't save that — "${name}" is still called what it was, and nothing else changed. Check your connection and try again.`
}
