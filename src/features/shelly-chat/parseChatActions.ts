// ── <action> block parser ───────────────────────────────────────
//
// The Shelly portal has the AI emit `<action>{...json...}</action>` blocks that
// propose a write to a child's record. This pure helper extracts those blocks
// from an assistant message: it parses each payload, validates it against the
// `ChatAction` allowlist, and returns the surviving typed actions plus the
// message text with all `<action>` blocks stripped for clean rendering.
//
// Mirrors EvaluateChatPage's `extractFindings` (tag-detect + JSON-parse +
// skip-on-failure) and `parseFollowUps` (extract a structured block, render the
// rest clean). Extracted to a sibling module so it is unit-testable without the
// component. See docs/SHELLY_PORTAL_CONTEXT.md §4.
//
// 3a is pure plumbing: nothing wires this into `sendToAI` yet, and there is no
// write path — `applyChatAction` lands in 3b.

import { isWorkbookOwnerInvalid } from '../../core/firebase/activityConfigWrites'
import { ActivityFrequency, ActivityType, DadLabType, SubjectBucket } from '../../core/types/enums'
import type { ChatAction } from '../../core/types/shellyChat'
import { sanitizeAndParseJson } from '../../core/utils/sanitizeJson'
import { extractYouTubeId, isValidYouTubeId } from '../../core/utils/youtubeId'

export interface ParsedChatActions {
  actions: ChatAction[]
  cleanText: string
}

/** The three soft-profile fields `editProfileField` may target — the allowlist. */
const SOFT_PROFILE_FIELDS = ['motivators', 'interests', 'strengths'] as const

/**
 * The accepted band for `setActivityMinutes` (FEAT-135), inclusive.
 *
 * Deliberately narrow: a default block shorter than 5 minutes isn't a real
 * activity and one longer than 2 hours isn't a block, it's a day. Values
 * outside the band are **rejected as malformed** (the action returns null), not
 * clamped — clamping would silently write a number the parent never saw on the
 * confirm card. If a legitimate activity ever needs a value outside this band,
 * that's a deliberate widening decision, not something to work around here.
 */
export const MIN_ACTIVITY_MINUTES = 5
export const MAX_ACTIVITY_MINUTES = 120

/**
 * The cap on a `draftNextWeek` instruction string (FEAT-150).
 *
 * Generous enough for any real ask a parent would voice about a week — "lighter
 * overall, math every day but short, and please keep Wednesday clear for the
 * dentist" is under 120 characters — and short enough that the field cannot
 * become a channel for model-authored prose into a generation prompt. Rejected
 * when exceeded, never truncated.
 */
export const MAX_DRAFT_INSTRUCTION_CHARS = 600

/**
 * Shape gate for a `YYYY-MM-DD` day key (FEAT-142).
 *
 * Strict on both halves: the string must LOOK like a date key, and the date it
 * names must really exist — `2026-02-31` and `2026-13-01` match the pattern and
 * are still not days, and `new Date('2026-02-31')` would helpfully roll them
 * forward rather than fail. The round-trip through `toISOString()` catches that.
 *
 * Deliberately says nothing about WHICH week the date belongs to: this module is
 * pure and has no clock and no family data. Week membership is resolved against
 * the live week at stage time (`dayItemActions`), the same division of labour
 * `setActivityMinutes` uses for its config id.
 */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Non-empty trimmed string, or null. */
function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Minutes gate shared by `setActivityMinutes` and `addItemToDay` — a real
 * integer inside [5, 120]. Out-of-band, fractional, string, `NaN` and `Infinity`
 * values are all **rejected as malformed**, never clamped: a clamped value is a
 * number the parent never saw on the confirm card.
 */
function isValidMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_ACTIVITY_MINUTES &&
    value <= MAX_ACTIVITY_MINUTES
  )
}

const SUBJECT_BUCKETS = Object.values(SubjectBucket) as readonly string[]
const ACTIVITY_TYPES = Object.values(ActivityType) as readonly string[]
const ACTIVITY_FREQUENCIES = Object.values(ActivityFrequency) as readonly string[]
const DAD_LAB_TYPES = Object.values(DadLabType) as readonly string[]

/**
 * The Dad Lab caps (FEAT-157), all rejected-never-truncated: a truncated title
 * or step is text the parent read on the card and did not get, and an
 * over-long one is a model misusing a field that lands verbatim in a record.
 *
 * The step band is the load-bearing one. An arc IS its ordered concept beats
 * (design D1 Option C: `steps[].status` is the arc's own coverage record), so a
 * one-step "arc" is just a lab with a wrapper and is rejected as malformed —
 * and nine-plus Saturdays is a season, not an arc; the manual dialog's own seed
 * example is four. The character caps mirror the shapes the Dad Lab surfaces
 * already render: a step title is a chip, a concept beat is "one line" (its
 * field label in the New Arc dialog), materials are short list rows.
 */
export const MIN_ARC_STEPS = 2
export const MAX_ARC_STEPS = 8
export const MAX_DAD_LAB_TITLE_CHARS = 80
export const MAX_ARC_STEP_TITLE_CHARS = 80
export const MAX_ARC_CONCEPT_BEAT_CHARS = 120
export const MAX_ARC_DOMAIN_LABEL_CHARS = 40
export const MAX_LAB_QUESTION_CHARS = 200
export const MAX_LAB_MATERIALS = 12
export const MAX_LAB_MATERIAL_CHARS = 60

/**
 * A count gate for `totalUnits` / `currentPosition` (FEAT-143) — a real integer
 * of at least 1. Lesson 0 does not exist, a half-lesson does not exist, and
 * `"107"` is a string. All rejected as malformed, never coerced.
 */
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/**
 * Validate an arbitrary parsed payload against the `ChatAction` allowlist.
 *
 * Returns a typed `ChatAction` only for the recognized kinds:
 * - sight words: string `childId` + non-empty string `word`.
 * - `editProfileField`: string `childId` + `field` in
 *   `motivators | interests | strengths` + string `value`.
 * - Tier C Option 2 additive snapshot edits: `addPrioritySkill` (+`skill`),
 *   `addSupport` (+`support`), `addStopRule` (+`rule`), `markSkillProgress`
 *   (+`skill`, optional boolean `mastered`).
 * - `setActivityMinutes` (FEAT-135): string `childId` + non-empty string
 *   `activityConfigId` + integer `minutes` in [5, 120]. Sets the default
 *   duration future plans use for ONE activity; out-of-band or non-integer
 *   minutes are rejected as malformed, never clamped.
 * - Live-day edits (FEAT-142): `removeItemFromDay` (+`dateKey`, `itemKey`),
 *   `moveItemToDay` (+`fromDateKey`, `toDateKey` — must differ, `itemKey`),
 *   `addItemToDay` (+`dateKey`, non-empty `label`, integer `estimatedMinutes`
 *   in [5, 120], optional real `subjectBucket`). Date keys must be real
 *   calendar days; week membership and row existence are resolved later.
 * - `proposePlanAdjustment` (chunk 2A/2): a HANDOFF, not a write — string
 *   `childId` + non-empty `summary` + non-empty `rationale`, optional string
 *   `scope` / `targetWeek`. On confirm it stages a planner brief and navigates;
 *   it never touches a child record or the plan.
 * - Curriculum edits (FEAT-143): `addActivity` (+ non-empty `name`, a real
 *   `ActivityType`, a real `SubjectBucket`, integer `defaultMinutes` in
 *   [5, 120], a real `ActivityFrequency`, optional boolean `shared` and
 *   positive-integer `totalUnits` / `currentPosition` with position ≤ total),
 *   `markActivityComplete` (+ non-empty `activityConfigId`), and
 *   `setActivityPosition` (+ non-empty `activityConfigId`, integer `position`
 *   ≥ 1). A **shared workbook** is rejected outright (DATA-08). Whether an id
 *   names a real config, whether that config is already finished, and whether a
 *   position is past the end are resolved later, against the live configs.
 * - Dad Lab (FEAT-157): `createConceptArc` (+ non-empty capped `title`,
 *   optional `domainLabel` hint, optional `childIds` — every entry a non-empty
 *   string, and 2–8 `steps`, each a non-empty capped `title` with an optional
 *   capped one-line `conceptBeat`) and `planLab` (+ non-empty capped `title`,
 *   a real `DadLabType`, optional capped `question` / `materials`, optional
 *   `arcId` with an optional non-negative integer `arcStepIndex` that requires
 *   it). Create only — there is no status, no edit, no delete, and no
 *   `narrativeHook` (design D5) representable here. Whether an `arcId` names a
 *   live arc, a step index is in range, and a `childIds` entry names a family
 *   child are resolved later, against the live arcs.
 * - Watch Vehicle (FEAT-149): `vetInVideo` (+ an 11-char `youtubeId` that must
 *   be extractable from a REQUIRED http(s) `suggestedFromUrl`, a non-empty
 *   `title`, a positive-integer `plannedMinutes`, a real `SubjectBucket`, and a
 *   non-empty `why`), and `planVideoOnDay` (+ a non-empty `watchVideoId` and a
 *   real `dateKey`). Whether the video is already in the library, whether it is
 *   retired, and whether the date is a plannable weekday are resolved later.
 *
 * Everything else — including a well-formed JSON object carrying an unknown
 * `kind`, an `editProfileField` targeting a disallowed field like
 * `supports`/`grade`/`prioritySkills`, or any **removal/downgrade**-shaped
 * snapshot payload — returns null. The additive kinds are the ONLY
 * snapshot-touching kinds, and they are additive only; removals and
 * level-lowering (Option 3) are unrepresentable here by construction (see
 * docs/SHELLY_PORTAL_CONTEXT.md §3).
 */
function toChatAction(payload: unknown): ChatAction | null {
  if (typeof payload !== 'object' || payload === null) return null
  const obj = payload as Record<string, unknown>

  if (typeof obj.childId !== 'string' || obj.childId.length === 0) return null

  if (obj.kind === 'addSightWord' || obj.kind === 'removeSightWord') {
    if (typeof obj.word !== 'string' || obj.word.trim().length === 0) return null
    return { kind: obj.kind, childId: obj.childId, word: obj.word }
  }

  if (obj.kind === 'editProfileField') {
    if (
      typeof obj.field !== 'string' ||
      !(SOFT_PROFILE_FIELDS as readonly string[]).includes(obj.field)
    ) {
      return null
    }
    // value may be empty (clearing a field) but must be a string.
    if (typeof obj.value !== 'string') return null
    return {
      kind: 'editProfileField',
      childId: obj.childId,
      field: obj.field as (typeof SOFT_PROFILE_FIELDS)[number],
      value: obj.value,
    }
  }

  // ── Tier C Option 2 — additive snapshot edits ──────────────────────
  // Additive only: each carries a single non-empty string to ADD (or a skill
  // to mark progressing/mastered). There is no removal/downgrade kind in the
  // `ChatAction` union, so any removal/downgrade-shaped payload (e.g.
  // `removePrioritySkill`, `setSkillLevel`, `downgradeSupport`) falls through
  // to the final `return null` — the structural guarantee that the portal can
  // never lower or strip a snapshot entry (that is the future Option 3).
  if (obj.kind === 'addPrioritySkill') {
    if (typeof obj.skill !== 'string' || obj.skill.trim().length === 0) return null
    return { kind: 'addPrioritySkill', childId: obj.childId, skill: obj.skill.trim() }
  }

  if (obj.kind === 'addSupport') {
    if (typeof obj.support !== 'string' || obj.support.trim().length === 0) return null
    return { kind: 'addSupport', childId: obj.childId, support: obj.support.trim() }
  }

  if (obj.kind === 'addStopRule') {
    if (typeof obj.rule !== 'string' || obj.rule.trim().length === 0) return null
    return { kind: 'addStopRule', childId: obj.childId, rule: obj.rule.trim() }
  }

  if (obj.kind === 'markSkillProgress') {
    if (typeof obj.skill !== 'string' || obj.skill.trim().length === 0) return null
    // `mastered` is optional; accept only a real boolean, ignore anything else.
    const mastered = typeof obj.mastered === 'boolean' ? obj.mastered : undefined
    return mastered === undefined
      ? { kind: 'markSkillProgress', childId: obj.childId, skill: obj.skill.trim() }
      : { kind: 'markSkillProgress', childId: obj.childId, skill: obj.skill.trim(), mastered }
  }

  // ── setActivityMinutes — one field on one activity config (FEAT-135) ─
  // The narrowest write in the union: `defaultMinutes` on a single
  // `activityConfigs` doc, the number every FUTURE plan reads. Two strict
  // gates here, and a third outside this module:
  //   1. `activityConfigId` must be a non-empty string (shape only — this
  //      module is pure and has no family data to resolve it against).
  //   2. `minutes` must be a real INTEGER inside [5, 120]. `0`, `4`, `121`,
  //      `30.5`, `"30"`, `NaN`, and `Infinity` are all malformed → null. We
  //      reject rather than clamp so a confirmed write is always exactly the
  //      number the parent saw on the card.
  //   3. (outside this file) `useShellyChatActions` resolves the id against
  //      the family's live configs before a confirm card is offered, so a
  //      hallucinated id never reaches the write helper.
  if (obj.kind === 'setActivityMinutes') {
    if (typeof obj.activityConfigId !== 'string' || obj.activityConfigId.trim().length === 0) {
      return null
    }
    if (!isValidMinutes(obj.minutes)) return null
    return {
      kind: 'setActivityMinutes',
      childId: obj.childId,
      activityConfigId: obj.activityConfigId.trim(),
      minutes: obj.minutes,
    }
  }

  // ── proposePlanAdjustment — a HANDOFF, never a write (chunk 2A/2) ───
  // Validate the brief shape; on confirm this stages a doc + navigates to the
  // planner (no child-record write, no plan write). `summary` + `rationale` are
  // required non-empty strings; `scope` / `targetWeek` are optional string hints
  // (kept only when present and non-empty).
  if (obj.kind === 'proposePlanAdjustment') {
    if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) return null
    if (typeof obj.rationale !== 'string' || obj.rationale.trim().length === 0) return null
    const scope = typeof obj.scope === 'string' && obj.scope.trim().length > 0 ? obj.scope.trim() : undefined
    const targetWeek =
      typeof obj.targetWeek === 'string' && obj.targetWeek.trim().length > 0 ? obj.targetWeek.trim() : undefined
    return {
      kind: 'proposePlanAdjustment',
      childId: obj.childId,
      summary: obj.summary.trim(),
      rationale: obj.rationale.trim(),
      ...(scope ? { scope } : {}),
      ...(targetWeek ? { targetWeek } : {}),
    }
  }

  // ── Live-day edits — remove / move / add on THIS week (FEAT-142) ────
  // The chat's half of FEAT-138's live-week edit lane. Validated here exactly as
  // strictly as `setActivityMinutes`, and — like it — every claim this module
  // CANNOT check is checked where the live day is readable:
  //   1. (here) shape only — a real `YYYY-MM-DD`, a non-empty `itemKey`, a
  //      non-empty label, integer minutes in band.
  //   2. (`dayItemActions`, at stage time) the date is a weekday of the CURRENT
  //      week, the `itemKey` names a row really on that day, and the row is not
  //      completed — each drop carrying a plain-language reason.
  //   3. (`liveDayEdit`, at the write) the row is re-resolved against the
  //      freshly-read document and a completed row is refused again.
  // A model can emit any string it likes; none of them reaches a day document
  // without surviving all three.
  if (obj.kind === 'removeItemFromDay') {
    if (!isValidDateKey(obj.dateKey)) return null
    const itemKey = nonEmptyString(obj.itemKey)
    if (!itemKey) return null
    return { kind: 'removeItemFromDay', childId: obj.childId, dateKey: obj.dateKey, itemKey }
  }

  if (obj.kind === 'moveItemToDay') {
    if (!isValidDateKey(obj.fromDateKey) || !isValidDateKey(obj.toDateKey)) return null
    // A move onto the day the row already sits on is not a change. Rejecting it
    // here means it never becomes a card promising something it wouldn't do.
    if (obj.fromDateKey === obj.toDateKey) return null
    const itemKey = nonEmptyString(obj.itemKey)
    if (!itemKey) return null
    return {
      kind: 'moveItemToDay',
      childId: obj.childId,
      fromDateKey: obj.fromDateKey,
      toDateKey: obj.toDateKey,
      itemKey,
    }
  }

  if (obj.kind === 'addItemToDay') {
    if (!isValidDateKey(obj.dateKey)) return null
    const label = nonEmptyString(obj.label)
    if (!label) return null
    if (!isValidMinutes(obj.estimatedMinutes)) return null
    // `subjectBucket` is optional and must be a real bucket when present. An
    // unrecognised bucket drops the FIELD, not the action — a subject is a
    // colour-coding hint, and refusing the whole add over one would fail the
    // parent for something that costs nothing to omit.
    const subjectBucket =
      typeof obj.subjectBucket === 'string' && SUBJECT_BUCKETS.includes(obj.subjectBucket)
        ? (obj.subjectBucket as SubjectBucket)
        : undefined
    return {
      kind: 'addItemToDay',
      childId: obj.childId,
      dateKey: obj.dateKey,
      label,
      estimatedMinutes: obj.estimatedMinutes,
      ...(subjectBucket ? { subjectBucket } : {}),
    }
  }

  // ── Curriculum edits — add / complete / reposition (FEAT-143) ───────
  // The writes Shelly makes by hand at Progress → Curriculum. Validated here
  // exactly as strictly as the kinds above, and — like them — every claim this
  // pure module CANNOT check is checked where the live configs are readable:
  //   1. (here) shape only — real enum members, a real integer band, a
  //      non-empty id, and the DATA-08 owner rule where it is decidable.
  //   2. (`curriculumActions`, at stage time) the id names a config the family
  //      owns and the acting child can touch, the config is not already
  //      finished, and it tracks position at all — each drop carrying a
  //      plain-language reason.
  //   3. (`activityConfigWrites`, at the write) `assertWorkbookOwner` throws.
  if (obj.kind === 'addActivity') {
    const name = nonEmptyString(obj.name)
    if (!name) return null
    if (typeof obj.type !== 'string' || !ACTIVITY_TYPES.includes(obj.type)) return null
    if (
      typeof obj.subjectBucket !== 'string' ||
      !SUBJECT_BUCKETS.includes(obj.subjectBucket)
    ) {
      return null
    }
    if (!isValidMinutes(obj.defaultMinutes)) return null
    if (
      typeof obj.frequency !== 'string' ||
      !ACTIVITY_FREQUENCIES.includes(obj.frequency)
    ) {
      return null
    }
    const type = obj.type as ActivityType
    // `shared` is optional and must be a real boolean. Unlike `addItemToDay`'s
    // `subjectBucket`, a junk value here drops the ACTION rather than the field:
    // "who is this for" is the one thing about an add a parent cannot recover
    // from being guessed wrong, and the whole owner rule below hangs off it.
    if (obj.shared !== undefined && typeof obj.shared !== 'boolean') return null
    const shared = obj.shared === true
    // DATA-08, decided here because it IS decidable from the payload alone: a
    // workbook is per-child (same curriculum, different lessons), so a shared
    // workbook is malformed, not merely unwise. The resolver refuses it again
    // with the rule's own sentence and the writer throws — three layers, and
    // the grammar tells the model the rule up front so it never emits one.
    if (isWorkbookOwnerInvalid(type, shared ? 'both' : obj.childId)) return null
    if (obj.totalUnits !== undefined && !isPositiveInteger(obj.totalUnits)) return null
    if (obj.currentPosition !== undefined && !isPositiveInteger(obj.currentPosition)) {
      return null
    }
    // A starting position past the end of the book is not a position. Rejected,
    // never clamped — the same rail the minutes band holds.
    if (
      typeof obj.totalUnits === 'number' &&
      typeof obj.currentPosition === 'number' &&
      obj.currentPosition > obj.totalUnits
    ) {
      return null
    }
    return {
      kind: 'addActivity',
      childId: obj.childId,
      name,
      type,
      subjectBucket: obj.subjectBucket as SubjectBucket,
      defaultMinutes: obj.defaultMinutes,
      frequency: obj.frequency as ActivityFrequency,
      ...(shared ? { shared: true as const } : {}),
      ...(obj.totalUnits !== undefined ? { totalUnits: obj.totalUnits as number } : {}),
      ...(obj.currentPosition !== undefined
        ? { currentPosition: obj.currentPosition as number }
        : {}),
    }
  }

  if (obj.kind === 'markActivityComplete') {
    const activityConfigId = nonEmptyString(obj.activityConfigId)
    if (!activityConfigId) return null
    return { kind: 'markActivityComplete', childId: obj.childId, activityConfigId }
  }

  // ── Watch Vehicle — vet a found video in, plan a vetted one (FEAT-149) ─
  // The chat could already search the web for a teaching video; it could not
  // get one into the app. These two kinds do, and the first one carries the
  // rail the whole feature hangs on:
  //
  //   **A youtubeId the model did not read off a real page is unrepresentable.**
  //
  // `suggestedFromUrl` is REQUIRED and must be an http(s) URL that
  // `extractYouTubeId` — the exact rule `WatchVetInForm` validates a paste with,
  // reused rather than re-implemented — resolves to the same id. A bare id in
  // that field is therefore rejected too: `extractYouTubeId` would happily
  // accept it, and accepting it would let the model launder a remembered id
  // through the field that exists to prove provenance.
  //
  // Everything this pure module cannot check — is that video already in the
  // library, is it retired, is that date in a plannable week — is checked in
  // `watchActions` against the live library and the live clock.
  if (obj.kind === 'vetInVideo') {
    if (typeof obj.youtubeId !== 'string' || !isValidYouTubeId(obj.youtubeId)) return null
    const suggestedFromUrl = nonEmptyString(obj.suggestedFromUrl)
    if (!suggestedFromUrl) return null
    if (!/^https?:\/\//i.test(suggestedFromUrl)) return null
    if (extractYouTubeId(suggestedFromUrl) !== obj.youtubeId) return null
    const title = nonEmptyString(obj.title)
    if (!title) return null
    // The vet-in form's own minutes rule — a positive integer — mirrored, not
    // reinvented. The [5, 120] band the other kinds carry is deliberately NOT
    // applied: a 3-minute clip and a 90-minute documentary are both real
    // library entries, and the form has always accepted them.
    if (!isPositiveInteger(obj.plannedMinutes)) return null
    if (
      typeof obj.subjectBucket !== 'string' ||
      !SUBJECT_BUCKETS.includes(obj.subjectBucket)
    ) {
      return null
    }
    // `why` is REQUIRED here, unlike the library's own optional field: a video
    // the parent did not choose the framing for is one the model is pushing, and
    // the one line of "why we're watching" is what makes the card checkable.
    const why = nonEmptyString(obj.why)
    if (!why) return null
    return {
      kind: 'vetInVideo',
      childId: obj.childId,
      youtubeId: obj.youtubeId,
      title,
      plannedMinutes: obj.plannedMinutes,
      subjectBucket: obj.subjectBucket as SubjectBucket,
      why,
      suggestedFromUrl,
    }
  }

  if (obj.kind === 'planVideoOnDay') {
    const watchVideoId = nonEmptyString(obj.watchVideoId)
    if (!watchVideoId) return null
    // Shape only. WHICH week the date belongs to is not this module's to know —
    // `watchActions` resolves it against the current-or-next school week, the
    // one deliberate widening past FEAT-142's current-week gate.
    if (!isValidDateKey(obj.dateKey)) return null
    return {
      kind: 'planVideoOnDay',
      childId: obj.childId,
      watchVideoId,
      dateKey: obj.dateKey,
    }
  }

  // ── draftNextWeek — ask for a draft of next week (FEAT-150) ────────
  //
  // The narrowest possible shape for the widest capability in the portal, and
  // the narrowness is the point. Three things are deliberately NOT here:
  //
  //   1. **No plan.** The model cannot emit days, items or minutes. A week it
  //      wrote out of prose would be a plan no generator produced, checked
  //      against no workbook position and no day budget. Confirming this action
  //      runs the planner's own generation task instead.
  //   2. **No week.** There is no `weekStart` / `targetWeek` field to hallucinate
  //      into. "Next week" is resolved from the family's clock at generation and
  //      re-resolved at the write (`nextWeekActions`), so a stale card cannot
  //      write to a week that has since become the current one.
  //   3. **No apply.** There is no `applyNextWeek` kind anywhere in the union,
  //      so the model has no way to express "and write it". The apply card is
  //      built by the app from a draft that already exists.
  //
  // What it does carry is `instructions`: the parent's own words, gated as a
  // non-empty string and CAPPED. The cap is not a formatting nicety — the string
  // is folded into a generation prompt, so an unbounded one is a way to spend
  // the parent's tokens and to bury the planner's instructions under a wall of
  // model-authored text. Over-long is rejected as malformed, never truncated: a
  // truncated instruction is one the parent read on the card and did not get.
  if (obj.kind === 'draftNextWeek') {
    const instructions = nonEmptyString(obj.instructions)
    if (!instructions) return null
    if (instructions.length > MAX_DRAFT_INSTRUCTION_CHARS) return null
    return { kind: 'draftNextWeek', childId: obj.childId, instructions }
  }

  // ── Dad Lab — create a Concept Arc, plan a lab (FEAT-157) ───────────
  // The pair that closes the 2026-08-23 substitution episode by making the
  // asked-for writes exist. Validated here exactly as strictly as the kinds
  // above — shape only; whether an `arcId` names a live arc, a step index is
  // in range for it, and a `childIds` entry names a family child are resolved
  // in `dadLabActions` against the live data before a card is offered.
  //
  // Two absences are the point:
  //  - There is no `status` anywhere: an arc's step statuses are built by the
  //    apply layer (first active, rest upcoming — the New Arc dialog's rule)
  //    and a planned lab's `Planned` is hardcoded in the shared builder. The
  //    model cannot express an `Active` lab or a pre-`done` step.
  //  - There is no `narrativeHook`: design D5 (evaluate, don't force) — the
  //    model does not get to push Stonebridge ties, so the field is
  //    unrepresentable and a payload carrying one simply loses it.
  if (obj.kind === 'createConceptArc') {
    const title = nonEmptyString(obj.title)
    if (!title || title.length > MAX_DAD_LAB_TITLE_CHARS) return null
    // `domainLabel` is a hint, like `addItemToDay`'s subjectBucket: junk drops
    // the FIELD (the arc is still whole without it), but an over-long value is
    // rejected — never truncated — because it lands verbatim in the record.
    const rawDomain = typeof obj.domainLabel === 'string' ? obj.domainLabel.trim() : ''
    if (rawDomain.length > MAX_ARC_DOMAIN_LABEL_CHARS) return null
    const domainLabel = rawDomain.length > 0 ? rawDomain : undefined
    // `childIds` is "who is this for" — like `addActivity`'s `shared`, junk
    // drops the ACTION, because audience is the one thing a write must never
    // guess. Deduped so a repeated id can't double a card's "for" line.
    let childIds: string[] | undefined
    if (obj.childIds !== undefined) {
      if (!Array.isArray(obj.childIds) || obj.childIds.length === 0) return null
      const ids: string[] = []
      for (const raw of obj.childIds) {
        const id = nonEmptyString(raw)
        if (!id) return null
        if (!ids.includes(id)) ids.push(id)
      }
      childIds = ids
    }
    // The steps ARE the write: 2–8 entries, each a non-empty capped title plus
    // an optional capped one-line concept beat. Any bad entry drops the whole
    // action — a partially-kept list would silently differ from what the model
    // proposed, and the card must show exactly what will be written.
    if (!Array.isArray(obj.steps)) return null
    if (obj.steps.length < MIN_ARC_STEPS || obj.steps.length > MAX_ARC_STEPS) return null
    const steps: { title: string; conceptBeat?: string }[] = []
    for (const raw of obj.steps) {
      if (typeof raw !== 'object' || raw === null) return null
      const step = raw as Record<string, unknown>
      const stepTitle = nonEmptyString(step.title)
      if (!stepTitle || stepTitle.length > MAX_ARC_STEP_TITLE_CHARS) return null
      const rawBeat = typeof step.conceptBeat === 'string' ? step.conceptBeat.trim() : ''
      if (rawBeat.length > MAX_ARC_CONCEPT_BEAT_CHARS) return null
      steps.push(
        rawBeat.length > 0 ? { title: stepTitle, conceptBeat: rawBeat } : { title: stepTitle },
      )
    }
    return {
      kind: 'createConceptArc',
      childId: obj.childId,
      ...(childIds ? { childIds } : {}),
      title,
      ...(domainLabel ? { domainLabel } : {}),
      steps,
    }
  }

  if (obj.kind === 'planLab') {
    const title = nonEmptyString(obj.title)
    if (!title || title.length > MAX_DAD_LAB_TITLE_CHARS) return null
    // The real enum, exactly as `addActivity` gates `ActivityType`: an unknown
    // labType is malformed, never coerced to a default the parent didn't see.
    if (typeof obj.labType !== 'string' || !DAD_LAB_TYPES.includes(obj.labType)) return null
    const rawQuestion = typeof obj.question === 'string' ? obj.question.trim() : ''
    if (rawQuestion.length > MAX_LAB_QUESTION_CHARS) return null
    const question = rawQuestion.length > 0 ? rawQuestion : undefined
    // Materials land verbatim in the record, so a half-valid list is rejected
    // whole rather than silently thinned to something the model didn't write.
    let materials: string[] | undefined
    if (obj.materials !== undefined) {
      if (!Array.isArray(obj.materials) || obj.materials.length > MAX_LAB_MATERIALS) {
        return null
      }
      const items: string[] = []
      for (const raw of obj.materials) {
        const item = nonEmptyString(raw)
        if (!item || item.length > MAX_LAB_MATERIAL_CHARS) return null
        items.push(item)
      }
      materials = items.length > 0 ? items : undefined
    }
    // The arc link: `arcId` alone is a valid link (the arc page surfaces
    // step-less links under "Other labs in this arc"), but a step index
    // without an arc points at nothing and is malformed. Range is the live
    // arc's to decide, at resolution.
    const arcId = obj.arcId === undefined ? undefined : (nonEmptyString(obj.arcId) ?? null)
    if (arcId === null) return null
    if (obj.arcStepIndex !== undefined) {
      if (!arcId) return null
      if (
        typeof obj.arcStepIndex !== 'number' ||
        !Number.isInteger(obj.arcStepIndex) ||
        obj.arcStepIndex < 0
      ) {
        return null
      }
    }
    return {
      kind: 'planLab',
      childId: obj.childId,
      title,
      ...(question ? { question } : {}),
      labType: obj.labType as DadLabType,
      ...(materials ? { materials } : {}),
      ...(arcId ? { arcId } : {}),
      ...(arcId && obj.arcStepIndex !== undefined
        ? { arcStepIndex: obj.arcStepIndex as number }
        : {}),
    }
  }

  if (obj.kind === 'setActivityPosition') {
    const activityConfigId = nonEmptyString(obj.activityConfigId)
    if (!activityConfigId) return null
    // Position 0, 3.5, "107", NaN and Infinity are all malformed. The upper
    // bound is the config's own `totalUnits`, which this module cannot see —
    // the resolver enforces it against the live config (rejected, not clamped).
    if (!isPositiveInteger(obj.position)) return null
    return {
      kind: 'setActivityPosition',
      childId: obj.childId,
      activityConfigId,
      position: obj.position,
    }
  }

  return null
}

/**
 * Extract all `<action>...</action>` blocks from an assistant message.
 *
 * - Parses each payload with `sanitizeAndParseJson`; on parse failure the block
 *   is skipped (never throws), matching `extractFindings`' tolerance.
 * - Validates each parsed payload against the `ChatAction` allowlist; anything
 *   that fails validation is dropped.
 * - `cleanText` is the original message with every `<action>...</action>` block
 *   removed (and surrounding whitespace tidied), mirroring `stripTags`.
 */
export function parseChatActions(raw: string): ParsedChatActions {
  const actions: ChatAction[] = []
  const regex = /<action>([\s\S]*?)<\/action>/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(raw)) !== null) {
    let payload: unknown
    try {
      payload = sanitizeAndParseJson(match[1])
    } catch {
      /* skip unparseable */
      continue
    }
    const action = toChatAction(payload)
    if (action) actions.push(action)
  }

  const cleanText = raw.replace(/<action>[\s\S]*?<\/action>/g, '').trim()

  return { actions, cleanText }
}
