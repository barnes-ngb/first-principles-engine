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

/** Is this row a strand? The one place the type is compared. */
export function isStrand(config: Pick<ActivityConfig, 'type'>): boolean {
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
