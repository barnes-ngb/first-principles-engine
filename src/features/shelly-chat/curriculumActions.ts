// ── Curriculum chat actions: resolution + plain-language previews (FEAT-143) ──
//
// The pure half of "Ask AI can edit the curriculum". `parseChatActions` validates
// the SHAPE of an `addActivity` / `markActivityComplete` / `setActivityPosition`
// proposal; this module decides whether that shape names anything real, and —
// when it doesn't — says why in a sentence a parent can read.
//
// It is the direct sibling of `dayItemActions` (FEAT-142) and of
// `resolveActivityConfig` (FEAT-135): a model can emit any id and any lesson
// number it likes, so a proposal is resolved against the family's live configs
// BEFORE a confirm card is offered. Nothing here writes; the writes are
// `core/firebase/activityConfigWrites`, the same core Progress → Curriculum
// calls, which re-checks the DATA-08 owner rule at the write (two layers, per
// the house pattern — this is the gate, that is the backstop).
//
// Pure by design, so "a hallucinated id never reaches a write" is testable
// without Firestore.

import { WORKBOOK_OWNER_REASON } from '../../core/firebase/activityConfigWrites'
import type { ChatAction } from '../../core/types'
import type { ChatActivityConfig } from './useShellyChatActions'

/** The curriculum kinds, narrowed off the `ChatAction` union. */
export type CurriculumAction = Extract<
  ChatAction,
  { kind: 'addActivity' | 'markActivityComplete' | 'setActivityPosition' }
>

export const isCurriculumAction = (action: ChatAction): action is CurriculumAction =>
  action.kind === 'addActivity' ||
  action.kind === 'markActivityComplete' ||
  action.kind === 'setActivityPosition'

/** The two kinds that name an EXISTING config. */
type ExistingConfigAction = Extract<
  CurriculumAction,
  { kind: 'markActivityComplete' | 'setActivityPosition' }
>

/**
 * A resolved proposal — everything the confirm card needs, with no ids in it.
 * `config` is absent for `addActivity`, which names no existing doc.
 */
export interface ResolvedCurriculumAction {
  action: CurriculumAction
  /** The config being finished or repositioned. Absent for an add. */
  config?: ChatActivityConfig
  /** The `sortOrder` a new config will land at. Only set for an add. */
  sortOrder?: number
}

export type CurriculumResolution =
  | { ok: true; resolved: ResolvedCurriculumAction }
  | { ok: false; notice: string }

/**
 * Plain-language refusals. Every one of these is shown to the parent in the
 * card's place — FEAT-135's lesson: the model's prose signs off with "confirm
 * with a tap", so a SILENTLY dropped proposal leaves the app promising a card
 * that never appears.
 *
 * `notFound` is FEAT-135's sentence verbatim rather than a paraphrase, so a
 * failure to match an activity reads identically whichever curriculum action
 * caused it. `sharedWorkbook` is `WORKBOOK_OWNER_REASON` — the DATA-08 rule's own
 * words, quoted from the writer that enforces it, so the chat never invents a
 * second phrasing of a rule it does not own.
 */
export const CURRICULUM_NOTICES = {
  notPermitted: 'Changing the curriculum is something a grown-up does — nothing was changed.',
  notFound:
    "That didn't match one of your activities, so nothing was changed. Try naming it as it appears in Progress → Curriculum.",
  sharedWorkbook: WORKBOOK_OWNER_REASON,
} as const

/** "GATB Math 3 is already finished" — never quoting an id back. */
export function alreadyCompleteNotice(name: string): string {
  return `"${name}" is already marked finished, so nothing was changed. It stays in the Completed list on Progress → Curriculum.`
}

/** The refusal for a config that has no position to set. */
export function noPositionNotice(name: string): string {
  return `"${name}" doesn't track a lesson or page number, so there's no position to set. You can add one at Progress → Curriculum.`
}

/**
 * The refusal for a position past the end of the book.
 *
 * Rejected, never clamped — the same rail the minutes band holds. Writing
 * `totalUnits` when the parent said something larger would silently record a
 * number she never saw, and the likeliest cause is a misheard lesson number,
 * which is worth one more sentence to get right.
 */
export function positionPastEndNotice(
  name: string,
  totalUnits: number,
  unitLabel: string,
): string {
  return `"${name}" only has ${totalUnits} ${unitLabel}${totalUnits === 1 ? '' : 's'}, so that's past the end — nothing was changed. Tell me the right number and I'll propose it again.`
}

/** A config's unit noun, defaulting to the label Curriculum's own add uses. */
export function unitLabelFor(config: Pick<ChatActivityConfig, 'unitLabel'>): string {
  return config.unitLabel?.trim() || 'lesson'
}

/**
 * The `sortOrder` a newly-added activity lands at: the end of the child's list.
 *
 * The model never picks this — ordering is a property of a list it cannot see,
 * and a guessed `sortOrder` would silently reshuffle a parent's day. Computed
 * from the live configs as `max + 1` rather than `length + 1` (Curriculum's
 * dialog form) so a list whose orders have drifted apart still appends rather
 * than colliding with an existing row.
 */
export function nextActivitySortOrder(configs: ChatActivityConfig[]): number {
  return configs.reduce((max, c) => Math.max(max, c.sortOrder ?? 0), 0) + 1
}

/**
 * Resolve an existing-config action against the family's live configs.
 *
 * A config the acting child doesn't own is as invalid as one that doesn't exist
 * — `'both'` is shared and legitimately owned by every child, the same ownership
 * test `resolveActivityConfig` applies.
 */
function resolveExistingConfig(
  configs: ChatActivityConfig[],
  action: ExistingConfigAction,
): ChatActivityConfig | null {
  const match = configs.find((c) => c.id === action.activityConfigId)
  if (!match) return null
  if (match.childId !== 'both' && match.childId !== action.childId) return null
  return match
}

/**
 * Resolve a proposed curriculum edit against the family's live configs.
 *
 * Returns the resolved action or a single plain-language reason it was dropped.
 * The order of the checks is the order a parent would ask them in: am I allowed
 * to do this, is that a real activity, is it still running, and does the number
 * make sense for it.
 *
 * `canEdit` is a required argument, not an ambient assumption — `/chat` sits
 * outside `RequireParent`, so a kid profile can reach it by URL. The write layer
 * states the gate too; neither layer trusts the other (FEAT-133's lesson).
 */
export function resolveCurriculumAction(
  action: CurriculumAction,
  configs: ChatActivityConfig[],
  canEdit: boolean,
): CurriculumResolution {
  if (!canEdit) return { ok: false, notice: CURRICULUM_NOTICES.notPermitted }

  if (action.kind === 'addActivity') {
    // The DATA-08 owner rule again, in the layer that can SPEAK. `parseChatActions`
    // already rejects this combination as malformed, so in practice nothing
    // reaches here — but a rule enforced only where it cannot explain itself is
    // a silent drop, and this is the gate that shows the parent a reason.
    if (action.type === 'workbook' && action.shared) {
      return { ok: false, notice: CURRICULUM_NOTICES.sharedWorkbook }
    }
    return { ok: true, resolved: { action, sortOrder: nextActivitySortOrder(configs) } }
  }

  const config = resolveExistingConfig(configs, action)
  if (!config) return { ok: false, notice: CURRICULUM_NOTICES.notFound }
  // A finished program is not a thing to finish again or to reposition. Refused
  // here with the true reason rather than falling through to "didn't match",
  // which would tell the parent something false about an activity she can see.
  if (config.completed) {
    return { ok: false, notice: alreadyCompleteNotice(config.name) }
  }

  if (action.kind === 'setActivityPosition') {
    // Only offered for configs that track position at all. A routine has no
    // lesson number, so "he's on lesson 107" against one is a mismatch worth
    // naming rather than a write worth inventing a field for.
    if (config.currentPosition == null && config.totalUnits == null) {
      return { ok: false, notice: noPositionNotice(config.name) }
    }
    if (config.totalUnits != null && action.position > config.totalUnits) {
      return {
        ok: false,
        notice: positionPastEndNotice(config.name, config.totalUnits, unitLabelFor(config)),
      }
    }
  }

  return { ok: true, resolved: { action, config } }
}

/**
 * Resolve for DISPLAY, ignoring the gates that decide whether an action may be
 * OFFERED (Codex P2, PR #1669).
 *
 * A confirmed write changes the state its own card resolves against, and the
 * subscription delivers that change at once. `markActivityComplete` is the sharp
 * case: the instant it succeeds the config reads `completed: true`, so
 * {@link resolveCurriculumAction} correctly refuses it as already finished — and
 * the card vanishes, taking with it the "Done ✓" that is the parent's only
 * confirmation that an **irreversible** write happened.
 *
 * So an already-decided card renders through here instead: same shape, but the
 * running / position / owner gates are not applied, because they answer "may
 * this be proposed?" and that question is settled once she has tapped. The
 * config is still found by id — a card that can name nothing still renders
 * nothing.
 *
 * **Never** use this to decide whether to OFFER a card; that is
 * {@link resolveCurriculumAction}'s job and it stays gated on the live state, so
 * an activity finished in another tab stops offering a card here.
 */
export function resolveCurriculumActionForDisplay(
  action: CurriculumAction,
  configs: ChatActivityConfig[],
): ResolvedCurriculumAction | null {
  if (action.kind === 'addActivity') {
    return { action, sortOrder: nextActivitySortOrder(configs) }
  }
  const config = configs.find((c) => c.id === action.activityConfigId)
  return config ? { action, config } : null
}

// ── Card wording ─────────────────────────────────────────────────────────────

/**
 * The one-line preview a parent reads before tapping Confirm. Names the child
 * and the activity by NAME, and shows old → new for a position change — never a
 * doc id, because an id on a confirm card is not something a parent can check
 * the proposal against.
 */
export function describeCurriculumAction(
  resolved: ResolvedCurriculumAction,
  childName: string,
): string {
  const { action, config } = resolved
  switch (action.kind) {
    case 'addActivity':
      return `Add "${action.name}" to ${childName}'s curriculum`
    case 'markActivityComplete':
      return `Mark "${config?.name ?? 'this activity'}" finished for ${childName}`
    case 'setActivityPosition': {
      const name = config?.name ?? 'this activity'
      const unit = config ? unitLabelFor(config) : 'lesson'
      const from = config?.currentPosition
      // No arrow when there is nothing to move FROM, and none when the two ends
      // are equal — which is what an APPLIED card reads like once the write has
      // landed and the config already holds the new number. "lesson 107 → 107"
      // would read as a bug rather than as a completed change.
      return from == null || from === action.position
        ? `${name}: ${unit} ${action.position}`
        : `${name}: ${unit} ${from} → ${action.position}`
    }
  }
}

/**
 * The shape line for an `addActivity` card — subject, minutes, frequency.
 *
 * An add is the only curriculum action that creates something from nothing, so
 * the card has to show the WHOLE thing being created. The parent cannot check an
 * add against anything already on screen the way she can check a position bump.
 */
export function describeAddActivityShape(
  action: Extract<CurriculumAction, { kind: 'addActivity' }>,
): string {
  const parts = [action.subjectBucket, `${action.defaultMinutes}m`, action.frequency]
  if (action.totalUnits != null) {
    const unit = 'lesson'
    parts.push(
      action.currentPosition != null
        ? `${unit} ${action.currentPosition} of ${action.totalUnits}`
        : `${action.totalUnits} ${unit}s`,
    )
  } else if (action.currentPosition != null) {
    parts.push(`starting at lesson ${action.currentPosition}`)
  }
  return parts.join(' · ')
}

/**
 * The line under the preview. Says what the write does NOT touch, because the
 * thing a parent most needs to know before changing the curriculum is that
 * finished work and recorded hours are not in play.
 *
 * The completion footnote states the consequence in full, and states that the
 * app has **no undo for it anywhere** — not from chat and not from Progress →
 * Curriculum, whose Completed section renders but does not edit. Nothing in the
 * app writes `completed: false` back onto an existing config, so promising a way
 * back would be the same invented-screen failure the navigation-honesty rule
 * exists to stop.
 */
export function curriculumActionFootnote(action: CurriculumAction): string {
  switch (action.kind) {
    case 'addActivity':
      return 'Starts appearing in future plans. This week and anything already recorded stay as they are.'
    case 'markActivityComplete':
      return 'Finishes this program — it stops appearing in future plans; everything already logged stays. There is no undo for this, here or in Progress → Curriculum.'
    case 'setActivityPosition':
      return 'Where future plans pick up. This week and anything already recorded stay as they are.'
  }
}
