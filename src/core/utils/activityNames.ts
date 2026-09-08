// ── The names an activity answers to (UX-280) ────────────────────────────────
//
// A curriculum row's `name` does four different jobs, and until UX-279 it had
// to do all four with one string:
//
//   1. a JOIN KEY — `isWorkbookMatch` uses it to decide which config a scanned
//      page belongs to, and `findDuplicateActivities` uses it to decide whether
//      an add would create a second row for the same thing;
//   2. PROSE — `activityConfigsToRoutineText` sends it to the planner as words
//      the model copies verbatim into the week;
//   3. a STORED RECORD — the logger writes `"{name} ({minutes}m)"` into
//      `days.checklist[].label`, which is evidence of a day and is never
//      rewritten;
//   4. a LABEL — what a person reads on the row.
//
// Those pull in opposite directions. The publisher's name on the cover is
// "Simply Good and Beautiful Math K — Course Book", which is what a photo of
// that cover will say and therefore what the join key wants; what the family
// calls it is "Math", which is what the label and the plan want. One string
// cannot be both, so the label became `name` (hers, renameable) and the join
// key gained `aliases` (the publisher's, and anything else she wants matched).
//
// This module is the ONE definition of "which names does this activity answer
// to" and "do these two rows name the same thing". Pure, no I/O. It delegates
// the character rule to `nameKey` — UX-205 made that one definition and this is
// a policy layered over it, never a second copy of it.
//
// **It answers about identity, not about display.** The matchers that ask *is
// this the same program?* read it; the de-dupers that ask *would a person read
// these two chips as the same word?* deliberately do not. `quickLogChips` is
// the latter: a kid reads the chip's label, aliases are not on it, and dropping
// her renamed chip because its old name matched a built-in would make a rename
// silently undo itself on that surface.

import { nameKey } from './nameKey'

/**
 * The most alternate names one activity may carry.
 *
 * Six, because this is a **matching aid and not a tag system**. The alternates
 * that earn their place are few and known in advance: what the cover says, what
 * the publisher's site says, the abbreviation the family types, and the one or
 * two names it went by before. Past that, a list stops being a set of names for
 * one book and starts being a folksonomy — and every extra alternate widens
 * what a scan can match, which is the one direction this feature must not drift
 * (a scan that matches the wrong workbook writes a position into the wrong
 * record). Six is also what fits under a row on a phone without the row
 * becoming a paragraph.
 */
export const MAX_ACTIVITY_ALIASES = 6

/**
 * The structural shape this module needs — deliberately not `ActivityConfig`,
 * so a caller holding a narrowed Firestore read (the chat's
 * `ChatActivityConfig`, the daily-signal resolver's `StuckSignalConfig`) can
 * pass what it has. Both fields are optional and unvalidated: they arrive from
 * Firestore, where a stored `null`, a number or a missing key are all possible.
 */
export interface NamedActivity {
  name?: string | null
  aliases?: string[] | null
  /**
   * The publisher-name slot that predates alternates — `isWorkbookMatch` was
   * already called on it as well as on `name`, and `resolveSeedDefaults`
   * already matched across both. It is a name this row answers to, so every
   * lookup that asks *is this the same program?* should see it too.
   */
  curriculum?: string | null
}

/** A trimmed string, or '' for anything that is not a usable name. */
function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Every name this activity answers to: its own first, then its alternates, in
 * the order they are stored.
 *
 * Structurally narrowed rather than trusted — a stored `aliases` that is not an
 * array, or that holds numbers or blanks, yields the names that ARE usable
 * instead of throwing inside a matcher. The same rule ARCH-47 slice 4 applied
 * to the hours fold: unvalidated Firestore fields are narrowed at the edge.
 */
export function activityNames(config: NamedActivity | null | undefined): string[] {
  if (!config) return []
  const out: string[] = []
  const seen = new Set<string>()
  const push = (value: unknown) => {
    const name = cleanName(value)
    const key = nameKey(name)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(name)
  }
  push(config.name)
  if (Array.isArray(config.aliases)) for (const alias of config.aliases) push(alias)
  return out
}

/**
 * "Do these name the same thing?" — the candidate keys equal to this activity's
 * own name or to any of its alternates.
 *
 * **Exact on `nameKey`, alias by alias.** The alternates widen WHAT is compared,
 * never HOW: "The Good and the Beautiful Math" still does not match "Good and
 * the Beautiful Math", because they differ by a real word (UX-205 / UX-207).
 * Adding alternates is how a rename keeps matching; loosening the comparison is
 * how a scan starts matching the wrong workbook, and this function does the
 * first and not the second.
 */
export function matchesActivityName(
  config: NamedActivity | null | undefined,
  candidate: string | null | undefined,
): boolean {
  const key = nameKey(candidate)
  if (!key) return false
  // The LOOKUP list, not the display one (Codex round 3, P2): a duplicate
  // warning has to see what the scan matcher sees, and that includes the
  // publisher slot. A row whose `curriculum` equals the candidate would match
  // the same scanned page, which is the collision worth naming.
  return activityMatchNames(config).some((name) => nameKey(name) === key)
}

/**
 * Clean an alternate-name list against the name it sits under.
 *
 * Drops blanks, drops any alternate that keys the same as the current name
 * (storing it twice buys nothing — `matchesActivityName` checks the name
 * first), de-dupes the rest by `nameKey`, and caps the result.
 *
 * **The cap trims from the OLDEST end**, the same rule
 * `collectPlannerRequestAsks` uses: when a rename carries an old name in and
 * the list is already full, the name she just moved away from is the one worth
 * keeping and the oldest alternate is the one worth losing. Nothing is silent —
 * the rename dialog renders the resulting list, so a trim is visible before she
 * saves.
 */
export function normalizeAliases(
  values: readonly (string | null | undefined)[] | null | undefined,
  name: string | null | undefined,
  cap: number = MAX_ACTIVITY_ALIASES,
): string[] {
  if (!Array.isArray(values)) return []
  const nameOwnKey = nameKey(name)
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const alias = cleanName(value)
    const key = nameKey(alias)
    if (!key || key === nameOwnKey || seen.has(key)) continue
    seen.add(key)
    out.push(alias)
  }
  return out.length > cap ? out.slice(out.length - cap) : out
}

/**
 * Every name a LOOKUP should compare against: the row's own, its alternates,
 * and the publisher slot — deduped by `nameKey`, blanks dropped.
 *
 * Distinct from {@link activityNames}, which is what a PERSON reads (and whose
 * tail is what the row renders beneath itself). `curriculum` is never shown as
 * a label, so it belongs in one and not the other.
 *
 * There are five of these lookups — the untargeted scan match, the Curriculum
 * card's own scan guard, both certificate paths, and the workbook bridge — and
 * before this they each hand-rolled their own two- or one-name list. That is
 * how the card guard came to disagree with the lookup two lines above it
 * (Codex round 1) and how the certificate paths came to disagree with both
 * (round 2). One definition, so the next lookup cannot start a sixth.
 */
export function activityMatchNames(
  config: NamedActivity | null | undefined,
): string[] {
  if (!config) return []
  const out = activityNames(config)
  const extra = typeof config.curriculum === 'string' ? config.curriculum.trim() : ''
  const key = nameKey(extra)
  if (key && !out.some((name) => nameKey(name) === key)) out.push(extra)
  return out
}
