// ── A strand: curriculum with no lessons, that still keeps count (UX-281) ────
//
// The owner asked for *"a new kind of curriculum activity for ad hoc history
// curriculum where sometimes they watch videos, sometimes read books, but it'll
// be photos, audio recordings that come from questions and sometimes notes as
// the content of it — just progression similar to what the artifact has but
// under that curriculum."*
//
// It is neither of the two shapes the app had:
//
//   • not a **workbook** — no fixed sequence, no `totalUnits`, no page to scan,
//     and nothing to be "on lesson 14 of 60" of;
//   • not a **routine** — not the same thing each time; each return has its own
//     subject.
//
// It is a **strand**: a subject the family keeps returning to, where each return
// has a topic and leaves evidence, and the only true measure is how many times
// and on what.
//
// ── The three properties, and why each one is load-bearing ──────────────────
//
// **1. The count only goes up, and there is no total.** No percentage, no bar,
// no end — because there is no end. A strand answers *"have we done any history
// lately?"*, which is the question it exists for and which a percentage of
// nothing cannot answer. This is why {@link strandProgressLabel} returns a bare
// count and why `totalUnits` is refused on a strand (UX-282): a field that does
// not exist must never be printed as zero, and nothing downstream may invent
// one. The repo already gets this right where it matters — `pace.logic`'s
// `positionPhrase` omits an absent total, and the server's
// `toCurriculumPositions` keys on the PRESENCE of a position rather than on
// `type === 'workbook'` — so a strand flows into the parent-only coverage rate
// unchanged and reads *"4 sessions in 3 weeks"*. That is asserted, not assumed.
//
// **2. Each session carries a topic.** The count says how much; the topic says
// what. "Ancient Egypt", "The Pilgrims".
//
// **3. Topics recur and group.** The third Ancient Egypt session offers that
// name back and files with the other two — which is what turns a pile of
// captures into a thread, without asking her to plan an arc up front, the thing
// she is explicitly not doing.
//
// Pure: no React, no Firestore, no clock. It answers what a strand row says and
// what a topic means, nothing else.

import type { ActivityConfig } from '../../core/types'
import { ActivityType } from '../../core/types/enums'
import { activityMatchNames } from '../../core/utils/activityNames'
import { nameKey } from '../../core/utils/nameKey'

/**
 * The unit a strand counts in.
 *
 * Stored on the config as `unitLabel` at creation, and it is the reason the
 * parent-only coverage line reads *"4 sessions in 3 weeks"* rather than *"4
 * lessons"*: `computeObservedCoverage` resolves `position.unitLabel ||
 * before.unitLabel || 'lesson'`, so a strand that stores nothing would be
 * described in the vocabulary of the one shape it is not.
 */
export const STRAND_UNIT_LABEL = 'session'

/**
 * Is this row a strand? The one place the type is compared.
 *
 * Takes an OPTIONAL type, like {@link StrandLike}, because the callers that
 * most need this guard hold narrowed views of a config — the chat's
 * `ChatActivityConfig` among them — and an absent type is simply not a strand.
 * Demanding the full shape pushed those call sites toward comparing the literal
 * themselves, which is how a rail acquires a second definition.
 */
export function isStrand(config: { type?: string }): boolean {
  return config.type === ActivityType.Strand
}

/**
 * How many sessions this strand has recorded.
 *
 * `currentPosition` is a single unvalidated Firestore field, so anything that is
 * not a non-negative finite number reads as `0` — a strand that has never been
 * logged and a strand whose stored count is corrupt both honestly have no
 * sessions to report. Never negative: the count of days that happened cannot be.
 */
export function strandSessionCount(
  config: Pick<ActivityConfig, 'currentPosition'>,
): number {
  const raw = config.currentPosition
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0
  return Math.floor(raw)
}

/**
 * The count, in words — *"14 sessions"*, *"1 session"*, *"No sessions yet"*.
 *
 * Deliberately has no denominator and no share of anything. A strand that has
 * never run says so plainly rather than reading `0 sessions`, which scans as a
 * failed target on a surface that has no targets.
 */
export function strandProgressLabel(
  config: Pick<ActivityConfig, 'currentPosition'>,
): string {
  const count = strandSessionCount(config)
  if (count === 0) return 'No sessions yet'
  return `${count} ${STRAND_UNIT_LABEL}${count === 1 ? '' : 's'}`
}

/**
 * The `unitLabel` a NEWLY created config should carry, by type.
 *
 * It exists because both creation doors — Curriculum's `AddActivityDialog` and
 * the chat's `addActivity` confirm card — independently wrote
 * `...(scannable ? { unitLabel: 'lesson' } : {})`. A strand is not scannable,
 * so it would have been created with **no** unit label, and
 * `computeObservedCoverage` resolves `unitLabel || 'lesson'` — the parent's
 * coverage line would then have read *"History — lesson 14. 4 lessons in 3
 * weeks."* about a subject that has no lessons. That is precisely the class of
 * lie a strand must not produce, and it would have been produced by the code
 * that creates one rather than by the code that reads it.
 *
 * One definition, so the two doors cannot disagree. Returns `undefined` where
 * no label is meaningful, which is what both doors wrote before.
 */
export function unitLabelForNewActivity(
  type: ActivityType,
  scannable: boolean,
): string | undefined {
  if (type === ActivityType.Strand) return STRAND_UNIT_LABEL
  return scannable ? 'lesson' : undefined
}

/**
 * A strand never carries workbook position fields — strip them (Codex round 1).
 *
 * `withActivityType` corrects the model's guess by spreading the proposal and
 * replacing `type`, so a workbook-shaped `addActivity` ("he's on lesson 1 of
 * 60") retyped as a strand kept `totalUnits: 60` and `currentPosition: 1`. The
 * writer then derived `scannable: true` from their presence and wrote both, and
 * the weekly snapshot would have reported *"session 1 of 60"* — the no-total
 * model contradicted by the door that creates a strand, which is the same class
 * of defect as the missing unit label and arrives by the same route.
 *
 * One rule, applied at BOTH the correction and the write: a strand has no end,
 * so it has no total and no position handed to it from outside. Its count is
 * only ever moved by `logStrandSession`.
 */
export function withoutStrandPositionFields<
  T extends { type: ActivityType; totalUnits?: number; currentPosition?: number },
>(value: T): T {
  if (value.type !== ActivityType.Strand) return value
  if (value.totalUnits == null && value.currentPosition == null) return value
  const next = { ...value }
  delete next.totalUnits
  delete next.currentPosition
  return next
}

// ── Topics ──────────────────────────────────────────────────────────────────

/**
 * The most topics a strand's suggestion list will hold.
 *
 * A cap, because this is a *suggestion* list on a phone and the tail of it is
 * never read — she is offered what she has used lately, and can always type
 * something new. The durable record of a topic is the artifact the session
 * wrote (`Artifact.topic`), never this array, which is why trimming it loses
 * nothing: see the field docs on `ActivityConfig.recentTopics`.
 */
export const MAX_RECENT_TOPICS = 12

/**
 * Trim a typed topic to what will be stored.
 *
 * Whitespace only — never title-casing, never truncating a real word. What she
 * typed is what the artifact carries and what she is offered back; the app does
 * not have an opinion about how she spells "Ancient Egypt".
 */
export function normalizeTopic(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Structurally narrow the stored suggestion list.
 *
 * `recentTopics` is an unvalidated Firestore array written by this app and
 * readable by an older build; anything that is not a non-empty string is
 * dropped rather than rendered.
 */
export function readRecentTopics(
  config: Pick<ActivityConfig, 'recentTopics'>,
): string[] {
  const raw = config.recentTopics
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const topic = normalizeTopic(entry)
    if (topic) out.push(topic)
  }
  return out
}

/**
 * The suggestion list after this session's topic — most-recent-first, distinct,
 * capped.
 *
 * **Matched on `nameKey`, the repo's one comparison key for a human-typed name
 * (UX-205).** Typing "ancient egypt" where "Ancient Egypt" already exists
 * offers back the name she used before rather than creating a second entry that
 * reads as a different subject — which is the whole of property 3. A second
 * normaliser is deliberately not written here.
 *
 * The new topic moves to the FRONT even when it already existed: the list is
 * ordered by when a topic was last used, so the strand she returned to today is
 * the first thing offered tomorrow. Trimming is from the **oldest** end.
 */
export function mergeRecentTopic(existing: string[], topic: string): string[] {
  const next = normalizeTopic(topic)
  if (!next) return existing.slice(0, MAX_RECENT_TOPICS)
  const key = nameKey(next)
  const rest = existing.filter((t) => nameKey(t) !== key)
  return [next, ...rest].slice(0, MAX_RECENT_TOPICS)
}

/**
 * What the topic field offers, most-recent-first.
 *
 * Never a closed list — the caller renders these beside a free-text field, and
 * she can always type something new. An empty list is the ordinary state of a
 * strand's first session and renders nothing, not an empty-state.
 */
export function topicSuggestions(
  config: Pick<ActivityConfig, 'recentTopics'>,
): string[] {
  return readRecentTopics(config)
}

/**
 * Do these two topic strings name the same topic?
 *
 * Delegates the character rule to `nameKey` (UX-205) rather than copying it, so
 * the strand cannot disagree with the rest of the app about whether two typed
 * names are the same word. Deliberately exact, never fuzzy: "Ancient Egypt" and
 * "Egypt" are different topics, and merging them would be the app deciding what
 * her curriculum is about.
 */
export function isSameTopic(a: string, b: string): boolean {
  const left = nameKey(normalizeTopic(a))
  return left !== '' && left === nameKey(normalizeTopic(b))
}

/**
 * The strand row's secondary line: the count, then the frequency.
 *
 * The caller supplies the frequency wording (the shared `ActivityFrequencyLabel`
 * — never a hand-written member list) so this module holds no display table of
 * its own. No minutes: a strand's session length is whatever the afternoon was,
 * and `defaultMinutes` on a strand is a planning estimate, not a record.
 */
export function strandRowSummary(
  config: Pick<ActivityConfig, 'currentPosition'>,
  frequencyLabel: string,
): string {
  return `${strandProgressLabel(config)} · ${frequencyLabel}`
}

/**
 * The most recent topic, for the row — or `null` when there is none.
 *
 * `null` rather than a placeholder: a strand with no sessions yet has nothing to
 * say about what it has covered, and inventing a line for it would be the same
 * class of error as printing a total it does not have.
 */
export function mostRecentTopic(
  config: Pick<ActivityConfig, 'recentTopics'>,
): string | null {
  return readRecentTopics(config)[0] ?? null
}

/**
 * The line the capture dialog shows above the form: where this strand stands,
 * and what this session will do to it.
 *
 * Its own function because the obvious composition — `${strandProgressLabel()}
 * so far.` — reads "No sessions yet so far." on the first session, which is
 * the one session where the sentence matters most.
 *
 * Never a total, never a target, and never a comparison with another strand.
 */
export function strandSessionStandingLine(
  config: Pick<ActivityConfig, 'currentPosition'>,
): string {
  const count = strandSessionCount(config)
  if (count === 0) return 'This will be the first session.'
  return `${strandProgressLabel(config)} so far. This will be one more.`
}

// ── Finding the strand a planned day item belongs to (UX-283) ───────────────

/**
 * The shape this matcher needs, structurally — an `ActivityConfig` satisfies it.
 *
 * Deliberately loose, mirroring `WorkbookConfigLike`: `TodayChecklist` holds a
 * narrowed view of the family's configs, and a matcher that demanded the full
 * document would force that prop to widen for a button.
 */
export interface StrandLike {
  id: string
  /** Optional, matching `WorkbookConfigLike`: an absent type is never a strand. */
  type?: string
  name?: string
  aliases?: string[]
  curriculum?: string
  completed?: boolean
}

/**
 * The id of the strand config a checklist item was planned from, or `undefined`.
 *
 * A `ChecklistItem` carries no `activityConfigId` — the join it does carry,
 * `workbookConfigId`, is stamped only for workbook-type configs — so a planned
 * strand item is resolved the way the rest of the app resolves a row from a
 * label: through `activityMatchNames`, every name the row answers to, including
 * the alternates a rename left behind (UX-280). Matching only `name` would
 * silently stop offering the capture door the first time she renamed the strand.
 *
 * Returns an **id**, exactly as `findWorkbookConfigId` does, so the caller that
 * holds the real configs resolves the document — a checklist renderer should
 * not be handed one to pass along.
 *
 * Deliberately **exact**, through `nameKey` (UX-205), and deliberately NOT
 * `isSameWorkbook`: that matcher carries workbook-shaped subject and level
 * heuristics with no meaning for a subject that has no levels. A miss costs the
 * day-surface button, and the Curriculum row's own is one screen away; a loose
 * match would file an afternoon of history under the wrong strand.
 *
 * A completed strand is skipped — a finished program's record is closed — and
 * the first match wins, since two strands answering to one name is the
 * duplicate case Curriculum's own notice (FEAT-209 / UX-205) exists to surface.
 */
export function findStrandConfigId(
  item: { label?: string },
  configs: StrandLike[],
): string | undefined {
  const candidates = itemLabelCandidates(item.label)
  if (candidates.length === 0) return undefined
  const match = configs.find(
    (config) =>
      config.type === ActivityType.Strand &&
      !config.completed &&
      activityMatchNames(config).some((name) => {
        const key = nameKey(name)
        return key !== '' && candidates.includes(key)
      }),
  )
  return match?.id
}

/**
 * The planner's rendered duration suffix — `History (30m)`.
 *
 * `buildApplyChecklist` stores `` `${item.title} (${item.estimatedMinutes}m)` ``,
 * so a stored label is never the bare name a config answers to. Matching the
 * label as-is meant `nameKey('History (30m)')` → `history30m` against `history`,
 * and the Today button this feature advertises rendered for **no ordinary
 * applied plan at all** (Codex) — the run's own tests used a duration-free
 * label and so never saw it. `findWorkbookConfigId` avoids this by being called
 * at apply time with `item.title`, before the suffix exists; this matcher runs
 * later, off the stored row, and has to undo it.
 */
const DURATION_SUFFIX = /\s*\(\d+m\)\s*$/

/**
 * Comparison keys to try for a stored checklist label, most exact first.
 *
 * The whole label is tried BEFORE the stripped one, so a strand a family
 * genuinely named *"History (30m)"* still matches itself rather than being
 * shortened out from under them. Empty keys are dropped so a label of only
 * punctuation cannot match a config whose name normalises to nothing.
 */
function itemLabelCandidates(label: string | undefined): string[] {
  const raw = (label ?? '').trim()
  if (!raw) return []
  const keys = [nameKey(raw), nameKey(raw.replace(DURATION_SUFFIX, ''))]
  return [...new Set(keys.filter(Boolean))]
}
