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

import type { ChatAction } from '../../core/types/shellyChat'
import { sanitizeAndParseJson } from '../../core/utils/sanitizeJson'

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
 * - `proposePlanAdjustment` (chunk 2A/2): a HANDOFF, not a write — string
 *   `childId` + non-empty `summary` + non-empty `rationale`, optional string
 *   `scope` / `targetWeek`. On confirm it stages a planner brief and navigates;
 *   it never touches a child record or the plan.
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
    if (typeof obj.minutes !== 'number' || !Number.isInteger(obj.minutes)) return null
    if (obj.minutes < MIN_ACTIVITY_MINUTES || obj.minutes > MAX_ACTIVITY_MINUTES) return null
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
