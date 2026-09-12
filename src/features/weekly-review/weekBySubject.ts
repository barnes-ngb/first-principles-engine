/**
 * The week, by subject and topic — the rollup that sits ABOVE the log (UX-388).
 *
 * Owner, 2026-09-11, asking for *"the current week summary by topic"*: subject
 * sections, with strands sub-grouped by their topic, placed above the log as the
 * first thing you see. Nothing removed.
 *
 * FEAT-204 / UX-219 turned this page into a **log** — the week as it happened,
 * with the reflection question underneath — and that is the right shape for
 * *reading back* a week. It is the wrong shape for the question actually being
 * asked on a Sunday morning, which is not "what happened on Tuesday" but **what
 * did we do this week, by subject, and within History, what did we actually
 * study.** Both readings come from the same records; only the axis differs. So
 * this is an addition and not a replacement: the log still renders, unchanged,
 * directly below.
 *
 * ── What it may not do ──────────────────────────────────────────────────────
 *
 * **No target, no percentage, no share, no bar, no colour that means behind.**
 * The owner's decision is on file and unchanged (2026-09-06): *"When we move to
 * Texas hours aren't the goal."* This is the week as it was. A progress ring
 * here would be the wrong row.
 *
 * **No recomputation of hours.** Every minute on this surface comes from
 * `computeHoursSummary` → `computeSubjectDistribution` (`records.logic.ts`),
 * which fold the shared `collectHoursContributions`
 * (`functions/src/shared/hoursContributions.ts`, ARCH-47 slice 4) — the same
 * path the Records page, the compliance dashboard, the compliance pack, the
 * monthly trend and the monthly review book all take, and the same one the
 * hours line immediately below this section takes. The per-subject fold already
 * existed for §5b of the data-review export and for the Records page's
 * distribution panel; this reuses it rather than writing a third. A number this
 * page computed its own way would be UX-206's tautology in a new place.
 *
 * **No write.** Pure: no React, no Firestore, no clock.
 *
 * ── The three columns, and why they are kept apart ──────────────────────────
 *
 * Some of a week's minutes arrive from `hours` documents (a creative timer, a
 * quick-add, a Dad Lab session) and some are credited by a checked item on the
 * day. The shared fold reconciles those; nothing here does. So the three things
 * a subject block says are deliberately three separate claims, from three
 * separate places, and the copy never presents one as the explanation of
 * another:
 *
 *   • **hours** — the canonical fold, all three additive sources;
 *   • **what got done** — the day log's own COMPLETED checklist items, named
 *     and counted. A day *block* is not listed beside the item that checked it:
 *     they are the same work (`itemMatchesBlock`), so listing both would name
 *     one afternoon twice;
 *   • **what else was logged** — the counted time no completed item accounts
 *     for, named (UX-408). See below;
 *   • **evidence** — the artifacts captured in that subject.
 *
 * ── The fourth claim, and the report that asked for it (UX-408) ─────────────
 *
 * Owner, Friday 2026-09-11: *"I added time in artefacts and it didn't change it
 * for packing and independent play."* Practical Arts read **4 hours · 1 piece of
 * evidence** and named nothing. Both numbers were right and the section was
 * still unreadable, because the door he used does not write a checklist item at
 * all: Today's **Capture** card writes an `hours` document carrying the
 * activity's own name in `notes` — *"Packing"*, *"Independent play"* — plus one
 * `artifacts` document, and no day-log row. The hours line counted it; *what got
 * done* is checklist items and only checklist items, so it had nothing to say.
 *
 * That is one of three shapes, and all three are minutes this section counted
 * and named nowhere:
 *
 *   • an `hours` entry — the Capture card, the creative timer, Records'
 *     quick-add, a Dad Lab session, a reading session. Each writes `notes`;
 *   • an `hoursAdjustments` row — *Log watch time*, a historical-hours backfill.
 *     Each writes `reason`;
 *   • a day **block** carrying `actualMinutes` that no completed item matches —
 *     a Life Day's 2-hour block being the one every family meets, since its
 *     block is `Other` and its chips are worth zero minutes each.
 *
 * So they are named, through the SAME matcher the fold dedups with, which is why
 * nothing is named twice: the fold skips an *item* that matches a
 * block-with-actuals, and this skips a *block* that a completed item matches.
 *
 * **They are counted, not totalled.** Each source is named with how many times
 * it appears and no minutes of its own. That is deliberate: extracting per-source
 * minutes here would be a second copy of the fold's own per-source rules
 * (`blockCountedMinutes` is private to it, and a `NaN`-narrowing or a
 * `hours * 60` rounding that disagreed by one would be UX-206's tautology
 * arriving by the door this run exists to close). The subject's total above is
 * the one number; this line says what it was for.
 *
 * A **negative** adjustment is never named. The fold emits every adjustment
 * document, including zero and negative ones, because a correction must subtract
 * everywhere — but *"Packing ×1"* under a line that removed 40 minutes would read
 * as work that happened. A correction is read on the Records page.
 *
 * ── Grouping, and what a failed read may never look like ────────────────────
 *
 * Names group through `nameKey` (UX-205), and a row's ALTERNATES widen which
 * labels collapse into one line (UX-280) — a stored `days.checklist[].label` is
 * evidence of the day it was logged on and is never rewritten, so a program
 * renamed mid-week has both names in this week's log and they are one activity.
 * `configs` exist for exactly that widening and for nothing else: with none —
 * or with a failed configs read — grouping falls back to the label, which
 * splits a renamed activity into two lines carrying the same total count. That
 * degradation understates a merge; it never misstates a count, which is why it
 * needs no warning line of its own.
 *
 * Artifacts are different, and get `null`: this page's one rule is that **a
 * failed read is never rendered as a result** (UX-211's hours line, UX-212's
 * positions line, UX-219's review line — this is the fourth). A dropped
 * artifacts query must not print as *"nothing was captured"*, so `artifacts:
 * null` means *could not be read* and propagates to `artifactCount: null` /
 * `topics: null`, which the presenter cannot accidentally render as zero.
 *
 * ── Topics need no config lookup ────────────────────────────────────────────
 *
 * A strand session's durable record is the artifact it wrote: `Artifact.topic`
 * plus `Artifact.activityConfigId` are the topic and the join, and strand
 * session capture is the only surface that writes either (UX-282). So topics are
 * grouped from the artifacts alone, and a failed *configs* read cannot silently
 * delete the topic lines. A session carrying the join but no topic is listed as
 * {@link NO_TOPIC_LABEL} rather than hidden — the count is the record, and the
 * one door that writes a session refuses a topic-less one, so a topic-less
 * session is a fact about the data worth showing.
 */

import { ADJUSTMENT_BOTH, entryMinutes } from '../../../functions/src/shared/hoursContributions'
import type {
  ActivityConfig,
  Artifact,
  ChecklistItem,
  DayBlock,
  DayLog,
  HoursAdjustment,
  HoursEntry,
} from '../../core/types'
import { activityMatchNames } from '../../core/utils/activityNames'
import { itemMatchesBlock } from '../../core/utils/itemBlockMatch'
import { nameKey } from '../../core/utils/nameKey'
import {
  computeHoursSummary,
  computeSubjectDistribution,
  subjectDistributionLabel,
} from '../records/records.logic'

// ── Copy ─────────────────────────────────────────────────────────────────────

export const WEEK_BY_SUBJECT_TITLE = 'The Week by Subject'

/**
 * What the three claims in a block are and where each comes from.
 *
 * It says the hours are counted the same way as the Records page for the same
 * reason {@link HOURS_SOURCE_CAPTION} does one section below — so the two
 * figures are reconcilable rather than mysterious — and it states that the
 * items and the hours are separate readings of the week, because they are.
 */
export const WEEK_BY_SUBJECT_CAPTION =
  'What the week held, by subject. Hours are counted the same way as the Records page and the compliance pack; what got done is the day log’s own completed items, and “Also logged” is time recorded another way — a capture, a timer, an adjustment. Nothing here is measured against a target.'

/**
 * A week with nothing logged — one line, not a page of empty cards.
 *
 * The `hasAnyEvidenceToShow` rule `WeekInEvidence` already follows: seven empty
 * subject blocks say less than one honest sentence, and an empty card under a
 * bold heading is the defect UX-219 retired from this page.
 */
export const WEEK_BY_SUBJECT_EMPTY_LINE =
  'Nothing was logged this week — no hours, no completed items and no evidence.'

/**
 * What is said when the week's day logs / hours / adjustments could not be read.
 *
 * Without them there are neither hours nor items, so the whole section says it
 * could not look rather than rendering an empty week. Fourth instance of this
 * page's one rule.
 */
export const WEEK_BY_SUBJECT_UNAVAILABLE_LINE =
  'Couldn’t read this week’s log, so there’s no summary by subject yet.'

/**
 * What is said when the week's artifacts could not be read.
 *
 * The evidence counts and the topic lines both come from artifacts, so one
 * sentence covers both — and neither renders as zero.
 */
export const EVIDENCE_UNAVAILABLE_LINE =
  'Couldn’t read this week’s evidence, so what was captured isn’t shown.'

/** A strand session that carries its join but no topic. Never hidden. */
export const NO_TOPIC_LABEL = '(no topic)'

/**
 * The most named entries one line will carry before it becomes `+N more`.
 *
 * Six, on the UX-259 precedent (a bucket named by its own item titles plus
 * `+N`) and for its reason: a named list is its own check, and a phone row that
 * becomes a paragraph is read by nobody. The counts of the named entries are
 * exact; the tail is counted, not dropped silently.
 */
export const MAX_NAMED_ENTRIES = 6

// ── Shapes ───────────────────────────────────────────────────────────────────

/** One activity, and how many times it was completed this week. */
export interface WeekSubjectItemCount {
  /** Stable grouping key — a config id where one is known, else a name key. */
  key: string
  /** What a person reads: her current name for the row, else the label as logged. */
  name: string
  count: number
}

/** One strand topic, and how many sessions it held this week. */
export interface WeekSubjectTopicCount {
  key: string
  /** The topic as she typed it, or {@link NO_TOPIC_LABEL}. */
  label: string
  count: number
  /** False only for the {@link NO_TOPIC_LABEL} bucket. */
  recorded: boolean
}

/** One subject's week. */
export interface WeekSubjectSummary {
  subjectBucket: string
  /** `SubjectBucketLabel`, with the catch-all read honestly as "Other / untagged". */
  label: string
  /** Counted minutes, from the canonical fold. Never a share of anything. */
  totalMinutes: number
  /** Completed day-log items, most-frequent first. */
  items: WeekSubjectItemCount[]
  /**
   * Counted time in this subject that no completed checklist item accounts for,
   * named and counted (UX-408) — an `hours` entry's `notes`, an adjustment's
   * `reason`, or an untracked block's `title`.
   *
   * Never minutes of its own: see this module's header for why the per-source
   * arithmetic deliberately stays in the shared fold.
   */
  sourcesWithoutItem: WeekSubjectItemCount[]
  /** Artifacts captured in this subject — `null` when the read FAILED. */
  artifactCount: number | null
  /** Strand topics, most-sessions first — `null` when the read FAILED. */
  topics: WeekSubjectTopicCount[] | null
}

export interface WeekBySubjectInput {
  dayLogs: DayLog[]
  hoursEntries: HoursEntry[]
  adjustments: HoursAdjustment[]
  /**
   * This week's artifacts, or `null` when the read failed.
   *
   * `null` rather than `[]` so the distinction survives into the rendered
   * output: an empty list is "nothing was captured" and a failure is "we could
   * not look", and only one of those may be printed as a count.
   */
  artifacts: Artifact[] | null
  /**
   * The child's activity configs. Used ONLY to widen which logged labels
   * collapse into one line (a rename leaves the old name in `aliases`), never
   * to decide what is shown. `[]` is a safe input.
   */
  configs: ActivityConfig[]
  childId: string
}

// ── The `(Nm)` suffix a stored label carries ─────────────────────────────────

/**
 * `buildApplyChecklist` stores `` `${title} (${minutes}m)` ``, so a logged label
 * is never the bare name a config answers to. The same suffix `itemMatchesBlock`
 * and `findStrandConfigId` undo, and stripped here for the same reason: a line
 * reading *"Fast Phonics (20m) ×4"* names a rendering rather than an activity.
 */
const DURATION_SUFFIX = /\s*\(\d+m\)\s*$/

/** The label as a person should read it: trimmed, with the duration suffix off. */
export function cleanItemLabel(label: string | undefined): string {
  const raw = (label ?? '').trim()
  const stripped = raw.replace(DURATION_SUFFIX, '').trim()
  return stripped || raw
}

// ── Narrowing (this module reads unvalidated Firestore documents) ────────────

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * The `'Other'` default every hours source applies (`bucketOf`, shared fold).
 *
 * Repeated here rather than imported because the shared module keeps it private,
 * and because the buckets MUST agree: an item bucketed by a different rule from
 * the one that counted its minutes would sit in a different section from its own
 * hours. Pinned by test against the fold's own answer.
 */
const OTHER_BUCKET = 'Other'

function bucketOf(value: unknown): string {
  return asString(value) ?? OTHER_BUCKET
}

// ── Resolving a logged label to the activity it names ────────────────────────

interface ItemGroup {
  key: string
  name: string
}

/**
 * Which activity does this logged item name?
 *
 * The STAMPED joins are authoritative and tried first — `activityConfigId`, then
 * the two typed siblings `workbookConfigId` (FEAT-62) and `strandConfigId`
 * (UX-283) — because they were written at apply time when the identity was still
 * known and they survive a rename. A stamp naming a config that is no longer in
 * the list falls through to the name path rather than resolving to nothing: this
 * is a display grouping, not a write, so the worst case of a wrong guess is a
 * line split in two, and the row still has a label to show.
 *
 * The name path is exact, through `activityMatchNames` — every name the row
 * answers to, alternates included — and **refuses an ambiguous match**: two live
 * rows answering to one label is the duplicate case Curriculum's own notice
 * exists to surface (FEAT-209 / UX-205), and picking one of them here would file
 * a week's work under a row it may not belong to. An unresolved label groups as
 * itself, which is exactly what it is.
 */
function resolveItemGroup(
  item: ChecklistItem,
  configs: readonly ActivityConfig[],
  configById: ReadonlyMap<string, ActivityConfig>,
): ItemGroup {
  for (const id of [item.activityConfigId, item.workbookConfigId, item.strandConfigId]) {
    const stamped = id ? configById.get(id) : undefined
    if (stamped) return { key: `config:${stamped.id}`, name: stamped.name }
  }

  const clean = cleanItemLabel(item.label)
  const candidates = [nameKey(clean), nameKey((item.label ?? '').trim())].filter(Boolean)
  if (candidates.length > 0) {
    const matched = new Set<string>()
    for (const config of configs) {
      const answers = activityMatchNames(config).some((name) => {
        const key = nameKey(name)
        return key !== '' && candidates.includes(key)
      })
      if (answers) matched.add(config.id)
    }
    if (matched.size === 1) {
      const config = configById.get([...matched][0])
      if (config) return { key: `config:${config.id}`, name: config.name }
    }
  }

  // Key on the name key where there is one, else on the label itself — a label
  // of only punctuation keys to '' and would otherwise merge every such row.
  return { key: `label:${nameKey(clean) || clean.toLowerCase()}`, name: clean }
}

// ── The fold ─────────────────────────────────────────────────────────────────

interface Bucket {
  items: Map<string, WeekSubjectItemCount>
  sources: Map<string, WeekSubjectItemCount>
  artifactCount: number
  topics: Map<string, WeekSubjectTopicCount>
}

function emptyBucket(): Bucket {
  return { items: new Map(), sources: new Map(), artifactCount: 0, topics: new Map() }
}

/** Add one named occurrence to a counted map, keyed the way items are keyed. */
function tally(into: Map<string, WeekSubjectItemCount>, name: string): void {
  const key = `label:${nameKey(name) || name.toLowerCase()}`
  const row = into.get(key)
  if (row) row.count += 1
  else into.set(key, { key, name, count: 1 })
}

/**
 * Is this block's time already named by a completed item on the same day?
 *
 * The mirror image of the shared fold's own DATA-14 dedupe, through the SAME
 * matcher: the fold skips an ITEM that matches a block carrying actuals, so this
 * skips a BLOCK that a completed item matches. A block whose only matching item
 * is unchecked is not named by anything — the fold does not count that item's
 * minutes either — so it is still listed.
 */
function blockIsNamedByAnItem(
  block: DayBlock,
  checklist: readonly ChecklistItem[],
): boolean {
  return checklist.some((item) => item?.completed === true && itemMatchesBlock(item, block))
}

/**
 * The week, by subject — hours from the canonical fold, items from the day log,
 * evidence and topics from the artifacts.
 *
 * Subjects are ordered by counted minutes DESCENDING, then by label, which is
 * `computeSubjectDistribution`'s own order rather than a second copy of it.
 * A subject that recorded no minutes but does carry completed items or evidence
 * sorts after the ones that did, and is still SHOWN — an item completed with no
 * planned minutes, or a photo captured on a day nobody logged time for, is
 * something that happened.
 *
 * A subject with nothing at all — no minutes, no items, no evidence — is never
 * in the result.
 */
export function groupWeekBySubject(
  input: WeekBySubjectInput,
): WeekSubjectSummary[] {
  const { dayLogs, hoursEntries, adjustments, artifacts, configs, childId } = input

  // ── Hours: the shared path, folded once, never re-derived ──
  const summary = computeHoursSummary(dayLogs, hoursEntries, adjustments, childId)
  const distribution = computeSubjectDistribution(summary)
  const minutesByBucket = new Map<string, number>()
  for (const row of distribution.rows) {
    minutesByBucket.set(row.subjectBucket, row.totalMinutes)
  }

  const buckets = new Map<string, Bucket>()
  const bucketFor = (name: string): Bucket => {
    const existing = buckets.get(name)
    if (existing) return existing
    const fresh = emptyBucket()
    buckets.set(name, fresh)
    return fresh
  }

  // ── What got done: the day log's own completed checklist items ──
  //
  // `completed === true` and nothing else, which is the shared fold's own
  // condition for counting an item's planned minutes. A second condition here
  // (a `skipped` guard, say) would be a second rule about what "done" means on
  // a page whose whole job is to agree with the record.
  const configById = new Map(configs.map((c) => [c.id, c]))
  for (const log of dayLogs) {
    if (log.childId !== childId) continue
    for (const item of log.checklist ?? []) {
      if (item?.completed !== true) continue
      const group = resolveItemGroup(item, configs, configById)
      const bucket = bucketFor(bucketOf(item.subjectBucket))
      const row = bucket.items.get(group.key)
      if (row) row.count += 1
      else bucket.items.set(group.key, { ...group, count: 1 })
    }
  }

  // ── What else was logged: counted time no completed item accounts for ──
  //
  // UX-408. Three shapes, all of them minutes the fold above counted and the
  // items line cannot name — see this module's header. Counted, never totalled.
  for (const log of dayLogs) {
    if (log.childId !== childId) continue
    const checklist = log.checklist ?? []
    for (const block of log.blocks ?? []) {
      // The fold counts a block only for its ACTUAL minutes, so a block with
      // none contributed nothing and has nothing to explain.
      const minutes = block?.actualMinutes
      if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) continue
      if (blockIsNamedByAnItem(block, checklist)) continue
      const name = cleanItemLabel(block.title)
      if (!name) continue
      tally(bucketFor(bucketOf(block.subjectBucket)).sources, name)
    }
  }

  for (const entry of hoursEntries) {
    if (entry?.childId !== childId) continue
    // The fold's own guard: a non-positive entry is not counted, so naming it
    // would name minutes that are not in the total beside it.
    if (entryMinutes(entry) <= 0) continue
    const name = cleanItemLabel(entry.notes)
    if (!name) continue
    tally(bucketFor(bucketOf(entry.subjectBucket)).sources, name)
  }

  for (const adj of adjustments) {
    // DATA-09 attribution, the same rule the fold applies: this child, or the
    // `'both'` sentinel for legitimate family-wide time.
    if (adj?.childId !== childId && adj?.childId !== ADJUSTMENT_BOTH) continue
    // Positive only — a correction that subtracts is not work that happened.
    if (typeof adj.minutes !== 'number' || !Number.isFinite(adj.minutes) || adj.minutes <= 0) continue
    const name = cleanItemLabel(adj.reason)
    if (!name) continue
    tally(bucketFor(bucketOf(adj.subjectBucket)).sources, name)
  }

  // ── Evidence and topics: the artifacts, or nothing claimed at all ──
  const evidenceKnown = artifacts !== null
  if (artifacts) {
    for (const artifact of artifacts) {
      if (artifact?.childId !== childId) continue
      const bucket = bucketFor(bucketOf(artifact.tags?.subjectBucket))
      bucket.artifactCount += 1

      // A strand session: its topic is the record and `activityConfigId` the
      // join, and strand capture is the only writer of either (UX-282). One
      // carrying the join and no topic is listed, not hidden.
      const topic = asString(artifact.topic)
      const joined = asString(artifact.activityConfigId)
      if (!topic && !joined) continue
      const key = topic ? `topic:${nameKey(topic) || topic.toLowerCase()}` : 'topic:'
      const row = bucket.topics.get(key)
      if (row) row.count += 1
      else {
        bucket.topics.set(key, {
          key,
          label: topic ?? NO_TOPIC_LABEL,
          count: 1,
          recorded: topic !== undefined,
        })
      }
    }
  }

  // ── Assemble ──
  const names = new Set<string>([...minutesByBucket.keys(), ...buckets.keys()])
  const out: WeekSubjectSummary[] = []
  for (const subjectBucket of names) {
    const bucket = buckets.get(subjectBucket) ?? emptyBucket()
    const totalMinutes = minutesByBucket.get(subjectBucket) ?? 0
    const items = [...bucket.items.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    )
    const sourcesWithoutItem = [...bucket.sources.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    )
    const hasEvidence = evidenceKnown && bucket.artifactCount > 0
    // `sourcesWithoutItem` is in the emptiness test as well as the other three:
    // a positive entry cancelled out by a correcting adjustment leaves a subject
    // at zero minutes that still holds something a person did.
    if (
      totalMinutes === 0 &&
      items.length === 0 &&
      sourcesWithoutItem.length === 0 &&
      !hasEvidence
    ) {
      continue
    }
    out.push({
      subjectBucket,
      label: subjectDistributionLabel(subjectBucket),
      totalMinutes,
      items,
      sourcesWithoutItem,
      artifactCount: evidenceKnown ? bucket.artifactCount : null,
      topics: evidenceKnown ? sortTopics([...bucket.topics.values()]) : null,
    })
  }

  return out.sort(
    (a, b) => b.totalMinutes - a.totalMinutes || a.label.localeCompare(b.label),
  )
}

/**
 * Topics by session count, then by name — with {@link NO_TOPIC_LABEL} last
 * always, however many sessions it holds, because it is not a topic.
 */
function sortTopics(
  topics: WeekSubjectTopicCount[],
): WeekSubjectTopicCount[] {
  return topics.sort((a, b) => {
    if (a.recorded !== b.recorded) return a.recorded ? -1 : 1
    return b.count - a.count || a.label.localeCompare(b.label)
  })
}

// ── Lines ────────────────────────────────────────────────────────────────────

/** One decimal, with a trailing `.0` dropped — {@link hoursLoggedLine}'s rule. */
function formatHours(minutes: number): string {
  const hours = minutes / 60
  return hours % 1 === 0 ? `${hours}` : hours.toFixed(1)
}

/**
 * A subject's counted time, in words. Never a ratio, never a target.
 *
 * Under an hour it stays in minutes, and a non-positive total reads as none
 * rather than as a negative duration — both {@link hoursLoggedLine}'s rules,
 * followed rather than re-decided. A subject can go net-negative when a
 * correcting adjustment subtracts more than was logged (`computeSubjectDistribution`
 * suppresses its percentages for the same reason); a correction is read on the
 * Records page, and *"−0.3 h"* on a summary reads as a defect rather than as a
 * record.
 */
export function subjectHoursLine(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 'No hours counted'
  if (totalMinutes < 60) {
    const mins = Math.round(totalMinutes)
    return `${mins} minute${mins === 1 ? '' : 's'}`
  }
  return `${formatHours(totalMinutes)} hours`
}

/**
 * `"Fast Phonics ×4 · Booster cards ×3"`, capped with an honest `+N more`.
 *
 * `''` when nothing was completed — a subject can hold hours from a manual entry
 * and no checked item at all, and the caller renders no line rather than an
 * empty one.
 */
export function namedCountsLine(
  entries: readonly { label: string; count: number }[],
  cap: number = MAX_NAMED_ENTRIES,
): string {
  if (entries.length === 0) return ''
  const shown = entries.slice(0, cap)
  const rest = entries.length - shown.length
  const parts = shown.map((e) => `${e.label} ×${e.count}`)
  if (rest > 0) parts.push(`+${rest} more`)
  return parts.join(' · ')
}

/** The subject's completed items, as one line. */
export function subjectItemsLine(
  items: readonly WeekSubjectItemCount[],
  cap: number = MAX_NAMED_ENTRIES,
): string {
  return namedCountsLine(
    items.map((i) => ({ label: i.name, count: i.count })),
    cap,
  )
}

/**
 * What the line naming un-itemised time is introduced by (UX-408).
 *
 * It says *logged*, not *done*, and it does not say *missing* or *untracked*:
 * this time IS counted and IS in the total above — what it lacks is a checked
 * row on the day, which is a fact about the door it came through and not a
 * reproach to anybody. The Capture card is a first-class way to record a day.
 */
export const SOURCES_WITHOUT_ITEM_PREFIX = 'Also logged'

/** The subject's un-itemised time sources, as one line. `''` when there are none. */
export function subjectSourcesLine(
  sources: readonly WeekSubjectItemCount[],
  cap: number = MAX_NAMED_ENTRIES,
): string {
  return namedCountsLine(
    sources.map((s) => ({ label: s.name, count: s.count })),
    cap,
  )
}

/** The subject's strand topics, as one line. `''` when there are none. */
export function subjectTopicsLine(
  topics: readonly WeekSubjectTopicCount[] | null,
  cap: number = MAX_NAMED_ENTRIES,
): string {
  if (topics === null) return ''
  return namedCountsLine(
    topics.map((t) => ({ label: t.label, count: t.count })),
    cap,
  )
}

/**
 * How much evidence this subject holds — `''` for none and for a failed read.
 *
 * A failed read says nothing HERE on purpose: the caller shows
 * {@link EVIDENCE_UNAVAILABLE_LINE} once for the whole section rather than
 * repeating it under every subject, and a count is exactly what must not be
 * invented for it.
 */
export function subjectEvidenceLine(artifactCount: number | null): string {
  if (artifactCount === null || artifactCount <= 0) return ''
  return `${artifactCount} piece${artifactCount === 1 ? '' : 's'} of evidence captured`
}
