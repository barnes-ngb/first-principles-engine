// ── Shelly portal: confirmed-write layer (ARCH-09 / Build Step 3b) ──────
//
// This is the portal's FIRST write path. The AI *proposes* sight-word changes
// via `<action>` blocks (parsed by `parseChatActions`); Shelly sees inline
// confirm cards; only her tap calls `applyChatAction`, which performs exactly
// one typed, validated write. Nothing auto-writes.
//
// Guardrails (see docs/SHELLY_PORTAL_CONTEXT.md §3, §5):
//   - No write before a confirm tap — `stagePendingActions` only stages.
//   - Allowlist only — the `ChatAction` union is the structural boundary; this
//     hook handles the two sight-word kinds (3b), Tier-B `editProfileField`
//     (Step 4: motivators/interests/strengths only), and the Tier-C Option 2
//     additive snapshot kinds (6b): `addPrioritySkill` / `addSupport` /
//     `addStopRule` / `markSkillProgress`.
//   - Route through the shared writers (`addSightWord` / `removeSightWord` for
//     sight words; `updateChildSoftProfile` for soft fields; the central
//     `writeSnapshotUpdate` for snapshot edits) — no ad-hoc setDoc from the
//     page, and no fork with the Settings editor.
//   - Additive only — the snapshot kinds can only ADD a priority skill /
//     support / stop rule, or mark a skill progressing/mastered. Removals and
//     downgrades (Option 3) are unrepresentable in `ChatAction` and never reach
//     here; every snapshot write is auto-stamped as a parent directive by the
//     central writer (the UI never fabricates evidence).
//   - Bind to the active child — `action.childId` must resolve to a family
//     child AND match the active chat context, or the action is rejected.
//   - `proposePlanAdjustment` is a HANDOFF, not a write (chunk 2A/2): it stages
//     a brief to the planner's per-child inbox (`stagePlanAdjustment`) and
//     navigates to Plan My Week. shelly-chat NEVER writes the weekly plan — the
//     planner owns plan writes and applies via its existing lock-in path.
//   - The live-day edits (FEAT-142) — `removeItemFromDay` / `moveItemToDay` /
//     `addItemToDay` — change what is on a day of the CURRENT week. They are
//     routed through `today/liveDayEdit.ts`, the FEAT-138 lane, and are NOT
//     reimplemented here: the chat opens no second write path to a day document,
//     so the completed-row rule, the identity lookup and the FEAT-114
//     preservation guard hold exactly as they do for a tap on Today. Resolved
//     against the live week BEFORE a card is offered (`dayItemActions`), so a
//     hallucinated `itemKey` or an out-of-week date never reaches a write — and
//     the parent is told, in words, why no card appeared.
//   - `setActivityMinutes` (FEAT-135) writes ONE field — `defaultMinutes` — on
//     ONE activity config, the number every FUTURE plan reads. It is resolved
//     against the family's live configs BEFORE the card is offered (a
//     hallucinated id never reaches the write) and it touches no `dayLog`,
//     re-plans no applied week, and moves no already-recorded minute.
//   - The curriculum edits (FEAT-143) — `addActivity` / `markActivityComplete` /
//     `setActivityPosition` — are the writes Shelly makes by hand at Progress →
//     Curriculum. They are routed through `core/firebase/activityConfigWrites`,
//     the same core `useActivityConfigs` wraps, and are NOT reimplemented here:
//     the chat opens no second write lane to `activityConfigs`, so the DATA-08
//     owner rule holds exactly as it does for the Curriculum dialog. Resolved
//     against the live configs BEFORE a card is offered (`curriculumActions`),
//     so a hallucinated id, a finished program, or a lesson past the end of the
//     book never reaches a write — and the parent is told, in words, why no card
//     appeared. There is deliberately **no delete**: completion is the only
//     removal the chat can propose (retire, don't delete).
//   - The watch actions (FEAT-149) — `vetInVideo` / `planVideoOnDay` — let the
//     chat get a video it FOUND on the web into the app. Vet-in routes through
//     `addWatchVideo`, the same writer the vet-in form calls; a plan routes
//     through `writeWatchItemToDay`, the FEAT-132 day lane. Both are additive and
//     neither is reimplemented here. Resolved against the child's live library
//     and the plannable week window BEFORE a card is offered (`watchActions`), so
//     a duplicate, a retired entry, or a date outside this-week-or-next never
//     reaches a write — and the parent is told why no card appeared. There is
//     deliberately **no un-retire, no delete, and no library edit**: vet-in is
//     the only library write the chat can make. `vetInVideo` is, like
//     `addActivity`, NOT idempotent — it mints a fresh doc per call — so the
//     re-entry guard below is what stops a double tap creating two entries.
//   - The Dad Lab actions (FEAT-157) — `createConceptArc` / `planLab` — let the
//     chat create a concept arc and plan a backlog lab through the Dad Lab
//     page's own extracted lanes (`dad-lab/useConceptArcs.createArc`,
//     `dad-lab/plannedLab.createPlannedLab`). CREATE ONLY: no edit, archive,
//     delete, or status flip is representable, a planned lab lands `Planned`
//     with no hours write (compliance credits only on completion, on the Dad
//     Lab page), and a `planLab` arc link is resolved against the live arcs
//     BEFORE a card is offered (`dadLabActions`) — a hallucinated arc id or an
//     out-of-range step never reaches a write, and the parent is told why no
//     card appeared. Both mint fresh docs, so both lean on the re-entry guard.

import { useCallback, useEffect, useRef, useState } from 'react'
import { arrayUnion, doc, updateDoc } from 'firebase/firestore'

import {
  addActivityConfig,
  completeActivityConfig,
  setActivityConfigPosition,
} from '../../core/firebase/activityConfigWrites'
import { shellyChatMessagesCollection } from '../../core/firebase/firestore'
import { updateActivityConfigMinutes } from '../../core/firebase/updateActivityMinutes'
import { updateChildSoftProfile } from '../../core/family/updateChildSoftProfile'
import type { ChatAction, Child, WatchVideo } from '../../core/types'
import type { ActivityType } from '../../core/types/enums'
import { todayKey } from '../../core/utils/dateKey'
import { writeSnapshotUpdate } from '../evaluate/skillSnapshotWrites'
import { addSightWord, removeSightWord } from '../books/useSightWordProgress'
import {
  addItemToLiveDay,
  moveItemToLiveDay,
  removeItemFromLiveDay,
} from '../today/liveDayEdit'
import { buildManualChecklistItem } from '../today/manualDayItem'
import type { CurriculumAction } from './curriculumActions'
import {
  isCurriculumAction,
  nextActivitySortOrder,
  resolveCurriculumAction,
} from './curriculumActions'
import type { DadLabAction, DadLabChild } from './dadLabActions'
import {
  buildArcStepsFromAction,
  isDadLabAction,
  resolveDadLabAction,
} from './dadLabActions'
import type { ChatWeekDay, DayItemAction } from './dayItemActions'
import { isDayItemAction, resolveDayItemAction } from './dayItemActions'
import type { WatchAction } from './watchActions'
import { isWatchAction, repeatedVetInNotice, resolveWatchAction } from './watchActions'
import { currentWeekDayKeys, plannableWatchDayKeys } from './useChatWeekDays'
import {
  isDraftNextWeekAction,
  resolveDraftNextWeek,
  type DraftNextWeekAction,
} from './nextWeekActions'
import {
  confirmFailureNotice,
  PendingDropReason,
  pendingDropNotice,
  supersededNotice,
} from './pendingLifecycle'
import { stagePlanAdjustment } from './stagePlanAdjustment'
import { createArc } from '../dad-lab/useConceptArcs'
import { createPlannedLab } from '../dad-lab/plannedLab'
import { addWatchVideo } from '../watch/useWatchLibrary'
import { writeWatchItemToDay } from '../watch/writeWatchItemToDay'
import { ArcOrigin } from '../../core/types/enums'
import type { ConceptArc } from '../../core/types'

/**
 * `'applying'` is the in-flight state between a confirm tap and the write
 * resolving (Codex P1, PR #1669). It exists because a confirm tap awaits a
 * network round-trip, and until FEAT-143 every kind in the union was idempotent
 * — a repeated sight-word add, profile replace, snapshot add, minutes set,
 * completion or position set all converge on the same document, so a double tap
 * was harmless. `addActivity` is the first kind that is NOT: it mints a fresh
 * auto-id per call, so two taps create two active curriculum entries and BOTH
 * land in future plans.
 */
export type ActionStatus = 'pending' | 'applying' | 'applied' | 'dismissed'

export interface PendingAction {
  /** Stable key for list rendering + per-card status. */
  id: string
  action: ChatAction
  status: ActionStatus
  /**
   * UX-33(c). Set when a confirmed write REJECTED. The card reverts to
   * `'pending'` so a retry is possible — it always did — but the rejection was
   * swallowed, so the button simply came back with no account of why. Carried
   * per-card, not per-turn, because in a multi-card turn only one of them
   * failed. Cleared on the next confirm tap.
   */
  error?: string
}

/**
 * The slice of an `ActivityConfig` the portal needs to resolve, preview, and
 * write a `setActivityMinutes` action (FEAT-135). Structurally satisfied by a
 * full `ActivityConfig`; kept narrow so the hook doesn't depend on the whole
 * planning type surface.
 */
export interface ChatActivityConfig {
  id: string
  name: string
  childId: string | 'both'
  defaultMinutes: number
  /**
   * Whether the program is finished (FEAT-143). A completed config can't be
   * scheduled, so nothing about it is editable from chat — the resolvers refuse
   * it by name rather than by absence, so the parent reads the true reason.
   */
  completed?: boolean
  /** FEAT-143 — `'workbook'` carries the DATA-08 owner rule. */
  type?: ActivityType
  /** FEAT-143 — where the child is now; absent when the activity has no position. */
  currentPosition?: number
  /** FEAT-143 — the end of the book; the upper bound on a position set. */
  totalUnits?: number
  /** FEAT-143 — "lesson" / "chapter" / "unit", for card wording. */
  unitLabel?: string
  /** FEAT-143 — used only to place a NEW activity at the end of the list. */
  sortOrder?: number
}

/** A `setActivityMinutes` proposal, narrowed off the `ChatAction` union. */
export type ActivityMinutesAction = Extract<ChatAction, { kind: 'setActivityMinutes' }>

/**
 * Resolve a proposed `setActivityMinutes` action to a REAL config (FEAT-135).
 *
 * This is the guard that keeps a hallucinated id off the write path. A model
 * can emit any string it likes; only an id that names a config the family
 * actually owns — and that belongs to the acting child (or is shared, `'both'`)
 * — resolves. Everything else returns null, which both suppresses the confirm
 * card and rejects the write if one is somehow attempted.
 *
 * Pure, so the "never reaches a write" contract is testable without Firestore.
 */
export function resolveActivityConfig(
  configs: ChatActivityConfig[],
  action: ActivityMinutesAction,
): ChatActivityConfig | null {
  const match = configs.find((c) => c.id === action.activityConfigId)
  if (!match) return null
  // A config the acting child doesn't own is as invalid as one that doesn't
  // exist — `'both'` is shared and legitimately owned by every child.
  if (match.childId !== 'both' && match.childId !== action.childId) return null
  // A finished program can't be scheduled, so its default minutes are not a
  // thing to change. This used to hold implicitly, because the subscription
  // filtered completed configs out before the resolver ever saw them; FEAT-143
  // needs them visible (so a curriculum action can refuse one BY NAME rather
  // than as "no such activity"), so the rule is stated here instead. Same
  // refusal for `setActivityMinutes`, now from an explicit check.
  if (match.completed) return null
  return match
}

export interface ShellyChatActionsDeps {
  familyId: string
  children: Child[]
  /** The active chat context's childId. Actions must match this. */
  activeChildId: string
  /**
   * The family's live activity configs for the active child (including shared
   * `'both'` ones). Used to resolve a `setActivityMinutes` proposal to a real
   * config before its confirm card is offered. Defaults to empty, which simply
   * means no `setActivityMinutes` action can be staged.
   */
  activityConfigs?: ChatActivityConfig[]
  /**
   * The current week's five weekdays for the active child, with each day's rows
   * (FEAT-142). Used to resolve a proposed live-day edit — remove / move / add —
   * against a real day and a real row before its confirm card is offered.
   * Defaults to empty, which simply means no live-day action can be staged.
   */
  weekDays?: ChatWeekDay[]
  /**
   * The family's ACTIVE concept arcs (FEAT-157). Used to resolve a proposed
   * `planLab` arc link — a real arc, a real step — before its confirm card is
   * offered, and to render that card by the arc's title. Defaults to empty,
   * which simply means no arc link can resolve; unlinked labs and new arcs
   * still stage fine.
   */
  conceptArcs?: ConceptArc[]
  /**
   * The acting child's curated Watch Library — the child's own entries plus
   * shared `'both'` ones, RETIRED ones included (FEAT-149). Used to refuse a
   * duplicate vet-in with a reason, to resolve a proposed `planVideoOnDay` to a
   * real ACTIVE entry before its card is offered, and to render that card by
   * title. Defaults to empty, which simply means nothing can be planned (a
   * vet-in still resolves — nothing is a duplicate of nothing).
   */
  watchVideos?: WatchVideo[]
  /**
   * Whether the signed-in profile is a parent. `setActivityMinutes` and the
   * live-day edits are parent-only, and `/chat` is nav-gated rather than
   * route-gated, so the write layer states the gate itself instead of trusting
   * the route. Defaults to false — fail closed.
   */
  canEditActivityConfigs?: boolean
  /** Thread the pending actions came from, so applies can annotate the message. */
  activeThreadId: string | null
  /**
   * Navigate to Plan My Week — called after a confirmed `proposePlanAdjustment`
   * handoff has staged its brief. Optional so the hook stays decoupled from the
   * router (and testable); the page wires it with `useNavigate`.
   */
  navigateToPlanner?: () => void
  /**
   * Run the plan generation a confirmed `draftNextWeek` asks for (FEAT-150).
   *
   * **This is the first of the feature's two taps, and it writes nothing.** The
   * hook deliberately owns no draft state and no generation logic: the draft, the
   * week it targets, and the SECOND tap that actually writes it all live in
   * `useNextWeekDraft`. What crosses this seam is one call and one boolean —
   * `false` when no week was produced, so the confirm card reverts to pending
   * instead of stamping "Done ✓" over a generation that failed.
   *
   * Optional, and absent means the kind simply cannot be staged, which is the
   * correct behaviour for any caller that has not wired the draft surface.
   */
  onDraftNextWeek?: (action: DraftNextWeekAction) => Promise<boolean>
}

/** The Tier-C Option-2 additive snapshot kinds (6b). */
type SnapshotAction = Extract<
  ChatAction,
  { kind: 'addPrioritySkill' | 'addSupport' | 'addStopRule' | 'markSkillProgress' }
>

/**
 * Route a Tier-C Option-2 additive snapshot action through the central
 * {@link writeSnapshotUpdate} writer (6a). **Additive only** — each kind maps
 * onto an additive writer field; there is no removal/downgrade path here.
 *
 * The add* kinds append a priority skill / support / stop rule; the central
 * writer dedups them and auto-stamps each as a parent directive (`directive`
 * left unset → generic "parent directive via chat — <at>" stamp). We pin `at`
 * to today's date so the stamp carries the date. `markSkillProgress` routes
 * through the writer's mastered-skill path — `RESOLVING` by default, `RESOLVED`
 * when `mastered` is true — carrying a matching parent-directive evidence note
 * and `source: 'parent'`. Re-applying a duplicate add is a no-op via 6a's dedup.
 */
async function applySnapshotAction(familyId: string, action: SnapshotAction): Promise<void> {
  const at = todayKey()
  switch (action.kind) {
    case 'addPrioritySkill':
      await writeSnapshotUpdate(familyId, action.childId, {
        masteredSkills: [],
        addPrioritySkills: [action.skill],
        at,
      })
      return
    case 'addSupport':
      await writeSnapshotUpdate(familyId, action.childId, {
        masteredSkills: [],
        addSupports: [action.support],
        at,
      })
      return
    case 'addStopRule':
      await writeSnapshotUpdate(familyId, action.childId, {
        masteredSkills: [],
        addStopRules: [action.rule],
        at,
      })
      return
    case 'markSkillProgress':
      await writeSnapshotUpdate(familyId, action.childId, {
        masteredSkills: [action.skill],
        fullyMastered: action.mastered === true,
        source: 'parent',
        evidence: `parent directive via chat — ${at}`,
        at,
      })
      return
  }
}

/**
 * Why a proposal from the GENERAL tab was dropped (FEAT-152).
 *
 * The seatbelt under the prompt fix. Every action grammar is child-scoped by
 * construction — each addendum returns "" without a `childId` — so a General-tab
 * reply should carry no `<action>` block at all, and the live bug was that the
 * model, told nothing about its limits, narrated a write in prose instead. But
 * "should carry none" is a property of a prompt, and a prompt is a probability:
 * the grammars are still in the model's training-time reach through the rest of
 * the conversation, and a childId it read off the ALL CHILDREN section would be
 * a REAL one.
 *
 * That is exactly what made this the wrong thing to leave un-gated. On the
 * General tab `activeChildId` is `''`, so `rejectReason`'s mismatch check —
 * `activeChildId && action.childId !== activeChildId` — short-circuits to
 * false, and a well-formed action naming a real child would have been offered as
 * a card and written. The tab with no write powers was, structurally, the tab
 * with the LOOSEST child binding.
 *
 * So the General tab drops every action, and drops it out loud. Inferring the
 * child from the payload is deliberately not the fix: a write must name its
 * child by TAB, which is the parent's own unambiguous statement of who she means
 * — not the model's guess at it.
 *
 * Names come from the family's own children (capability-never-name: a name is a
 * label to render, never a gate), and fall back to a generic sentence that is
 * still true and still actionable when there are none to render.
 */
export function generalTabDropNotice(childNames: string[]): string {
  const names = childNames.map((n) => n.trim()).filter((n) => n.length > 0)
  const tabs =
    names.length >= 2
      ? `${names.slice(0, -1).join(", ")}'s or ${names[names.length - 1]}'s tab`
      : names.length === 1
        ? `${names[0]}'s tab`
        : "the child's tab"
  return `I can't change anything from the General tab, so nothing was changed. Ask on ${tabs} and you'll get a card to confirm — the card is what makes it real.`
}

/** Stable empty default so an omitted `activityConfigs` dep doesn't churn refs. */
const EMPTY_CONFIGS: ChatActivityConfig[] = []
/** Same, for an omitted `weekDays` dep. */
const EMPTY_WEEK: ChatWeekDay[] = []
/** Same, for an omitted `watchVideos` dep. */
const EMPTY_VIDEOS: WatchVideo[] = []
/** Same, for an omitted `conceptArcs` dep. */
const EMPTY_ARCS: ConceptArc[] = []

/**
 * Narrow the subscribed week to the week it is RIGHT NOW (Codex P2 on PR #1667).
 *
 * `useChatWeekDays` recomputes its week on every render, so in practice the
 * array handed in is current. But a tap does not require an intervening render:
 * a chat page left open across a Sunday→Monday rollover could hold a card
 * proposed before the boundary and apply it against last week's days. The whole
 * capability is scoped to THIS week, so the clock is re-read at the moment it
 * matters and anything that is no longer this week simply is not there to
 * resolve against — the proposal then drops with the ordinary out-of-week
 * reason, which is the true one.
 */
function thisWeekOnly(weekDays: ChatWeekDay[]): ChatWeekDay[] {
  const allowed = new Set(currentWeekDayKeys().map((d) => d.dateKey))
  return weekDays.filter((d) => allowed.has(d.dateKey))
}

/**
 * Perform a confirmed live-day edit through the FEAT-138 lane (FEAT-142).
 *
 * **This is a router, not a writer.** Every branch calls `today/liveDayEdit.ts`,
 * which re-reads the day, resolves the row by `checklistItemKey` against what is
 * actually saved, refuses a completed row, and writes through the FEAT-114
 * preservation guard. The chat opens no second path to a day document, so a row
 * removed from a confirm card and a row removed by a tap on Today are the same
 * write with the same refusals.
 *
 * `canEdit` is threaded through explicitly because the lane requires it as an
 * argument — the gate cannot be forgotten by a new call site the way a
 * page-local `if` can.
 *
 * Returns false when the lane refused, so the caller can leave the card pending
 * rather than stamping "Done" over a write that did not happen.
 */
async function applyDayItemAction(
  familyId: string,
  action: DayItemAction,
  canEdit: boolean,
): Promise<boolean> {
  if (action.kind === 'removeItemFromDay') {
    const outcome = await removeItemFromLiveDay({
      familyId,
      childId: action.childId,
      dateKey: action.dateKey,
      itemKey: action.itemKey,
      canEdit,
    })
    return outcome.status === 'done'
  }

  if (action.kind === 'moveItemToDay') {
    const outcome = await moveItemToLiveDay({
      familyId,
      childId: action.childId,
      fromDateKey: action.fromDateKey,
      toDateKey: action.toDateKey,
      itemKey: action.itemKey,
      canEdit,
    })
    // `'duplicated'` is the lane's deliberately-survivable half-failure: the row
    // reached the target day but the source removal failed, so it is on BOTH.
    // The move DID happen, so the card is honest to mark done; the lane has
    // already logged the anomaly for the parent's next look at the week.
    return outcome.status === 'done' || outcome.status === 'duplicated'
  }

  const outcome = await addItemToLiveDay({
    familyId,
    childId: action.childId,
    dateKey: action.dateKey,
    item: buildManualChecklistItem({
      title: action.label,
      estimatedMinutes: action.estimatedMinutes,
      subjectBucket: action.subjectBucket,
    }),
    canEdit,
  })
  return outcome.status === 'done'
}

/**
 * Perform a confirmed watch action (FEAT-149).
 *
 * **This is a router, not a writer.** A vet-in calls `addWatchVideo`, the same
 * module-level writer `WatchVetInForm` calls through `useWatchLibrary.addVideo`,
 * so a video curated from a confirm card and one curated from the form are the
 * same document written the same way. A plan calls `writeWatchItemToDay`, the
 * FEAT-132 lane, which builds the row through `buildWatchChecklistItem` (so
 * `itemType` / `watchVideoId` survive and the kid's watch bucket finds it),
 * routes through `setDayLogGuarded`, and creates the day document when the day
 * was never planned. The chat opens no second path to either.
 *
 * `addedBy` is stamped HERE with the confirming account's uid — never taken from
 * the model, and never defaulted by the writer. The tap is the vetting act, so
 * the identity on the record is the identity that tapped. (`familyId` IS that
 * uid: `useFamilyId` derives the family id from the signed-in user's uid, and
 * the family shares one account.)
 *
 * Returns false when the video a plan names is no longer resolvable, so the
 * caller leaves the card pending rather than stamping "Done" over nothing.
 */
async function applyWatchAction(
  familyId: string,
  action: WatchAction,
  videos: WatchVideo[],
): Promise<boolean> {
  if (action.kind === 'vetInVideo') {
    await addWatchVideo(familyId, {
      youtubeId: action.youtubeId,
      title: action.title,
      plannedMinutes: action.plannedMinutes,
      subjectBucket: action.subjectBucket,
      childId: action.childId,
      why: action.why,
      addedBy: familyId,
      suggestedFromUrl: action.suggestedFromUrl,
    })
    return true
  }

  const video = videos.find((v) => v.id === action.watchVideoId)
  if (!video) {
    console.warn('[shellyChat] planVideoOnDay — video vanished before the write', action)
    return false
  }
  await writeWatchItemToDay({
    familyId,
    childId: action.childId,
    dateKey: action.dateKey,
    video,
  })
  return true
}

/**
 * Perform a confirmed curriculum edit through the shared write core (FEAT-143).
 *
 * **This is a router, not a writer.** Every branch calls
 * `core/firebase/activityConfigWrites`, the same core `useActivityConfigs` wraps
 * for Progress → Curriculum — so an activity added from a confirm card and one
 * added from the dialog are the same write, and the DATA-08 owner rule refuses
 * the same payload on either path. The chat opens no second write lane to
 * `activityConfigs`.
 *
 * There is deliberately **no delete branch**: completion is the chat's only
 * removal (retire, don't delete), and `deleteConfig` is not reachable from here
 * because the `ChatAction` union has no kind that names it.
 *
 * `sortOrder` for an add is computed from the live configs, never taken from the
 * model — ordering is a property of a list the model cannot see.
 */
async function applyCurriculumAction(
  familyId: string,
  action: CurriculumAction,
  configs: ChatActivityConfig[],
): Promise<void> {
  if (action.kind === 'addActivity') {
    const scannable = action.totalUnits != null || action.currentPosition != null
    await addActivityConfig(familyId, {
      name: action.name,
      type: action.type,
      subjectBucket: action.subjectBucket,
      defaultMinutes: action.defaultMinutes,
      frequency: action.frequency,
      childId: action.shared ? 'both' : action.childId,
      sortOrder: nextActivitySortOrder(configs),
      scannable,
      ...(action.totalUnits != null ? { totalUnits: action.totalUnits } : {}),
      ...(action.currentPosition != null ? { currentPosition: action.currentPosition } : {}),
      // Curriculum's own add stamps a unit label whenever the activity tracks a
      // position, and the scan matcher keys on `scannable` — so an activity
      // added here is scannable on exactly the same terms as one added there.
      ...(scannable ? { unitLabel: 'lesson' } : {}),
    })
    return
  }

  if (action.kind === 'markActivityComplete') {
    await completeActivityConfig(familyId, action.activityConfigId)
    return
  }

  await setActivityConfigPosition(
    familyId,
    action.activityConfigId,
    action.position,
    configs.find((c) => c.id === action.activityConfigId),
  )
}

/**
 * Perform a confirmed Dad Lab action through the extracted lanes (FEAT-157).
 *
 * **This is a router, not a writer.** An arc calls the module-level
 * `createArc` the Dad Lab page's New Arc dialog routes through; a lab calls
 * `createPlannedLab`, the extracted suggestion-flow lane. The chat opens no
 * second write path to `conceptArcs` or `dadLabReports`.
 *
 * Three invariants, each held by construction rather than by this function's
 * good behaviour:
 *  - The arc's step statuses come from `buildArcStepsFromAction` (first
 *    active, rest upcoming) — there is no status field in the action.
 *  - `createdFrom` is `AiSuggested`, the member the enum reserved for
 *    AI-authored arcs (design §3) — a chat arc never masquerades as
 *    owner-authored.
 *  - The lab lands `Planned` (hardcoded in the shared builder) and writes no
 *    hours entry — labs feed compliance only on completion, which stays a Dad
 *    Lab page act.
 *
 * Both kinds mint fresh auto-id documents, so — like `addActivity` and
 * `vetInVideo` — they are NOT idempotent: the hook's re-entry guard and the
 * serialized write queue are what stop a double tap creating two records.
 */
async function applyDadLabAction(
  familyId: string,
  action: DadLabAction,
  allChildIds: string[],
): Promise<void> {
  if (action.kind === 'createConceptArc') {
    await createArc(familyId, allChildIds, {
      title: action.title,
      domainLabel: action.domainLabel,
      steps: buildArcStepsFromAction(action.steps),
      childIds: action.childIds,
      createdFrom: ArcOrigin.AiSuggested,
    })
    return
  }

  await createPlannedLab(familyId, {
    title: action.title,
    question: action.question,
    labType: action.labType,
    materials: action.materials,
    arcId: action.arcId,
    arcStepIndex: action.arcStepIndex,
  })
}

/**
 * Owns the propose → human-confirm → write loop for `<action>` blocks. The page
 * stages actions parsed from the latest assistant message via
 * {@link stagePendingActions}; the confirm-card UI calls {@link applyChatAction}
 * or {@link dismissAction} on a tap.
 */
export function useShellyChatActions(deps: ShellyChatActionsDeps) {
  const {
    familyId,
    children,
    activeChildId,
    activityConfigs = EMPTY_CONFIGS,
    weekDays = EMPTY_WEEK,
    watchVideos = EMPTY_VIDEOS,
    conceptArcs = EMPTY_ARCS,
    canEditActivityConfigs = false,
    activeThreadId,
    navigateToPlanner,
    onDraftNextWeek,
  } = deps

  const [pending, setPending] = useState<PendingAction[]>([])
  // UX-33(a)/(b): what was still awaiting a tap when a new turn, a tab switch
  // or a thread switch arrived. A ref because `stagePendingActions` and the
  // drop handler must keep a stable identity (the page threads them into
  // `useShellyChatFlows`), for the same reason every other read below is one.
  const pendingRef = useRef<PendingAction[]>([])
  // The assistant message the current `pending` set was parsed from — applied
  // actions are recorded back onto it for inline audit.
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null)
  // Why a proposal was dropped before it became a card. The model's prose says
  // "confirm with a tap", so a SILENTLY dropped action leaves the app promising
  // a card that never appears — the same "tells you something untrue" failure
  // this feature exists to fix. Surfaced instead.
  const [suppressed, setSuppressed] = useState<string[]>([])
  // Actions whose write has been started. The card's status flips to
  // `'applying'` at the same moment, which hides the buttons — but state is
  // asynchronous and two taps inside one frame both read the pre-render value,
  // so the ref is what actually holds the line and the status is what tells the
  // parent. Entries are kept after a SUCCESSFUL write (an applied action must
  // never be applied twice) and released on failure so a retry is possible.
  // Guarded here rather than in the card so the rail cannot be forgotten by a
  // new call site — and for every kind, since "idempotent" is a property a
  // future kind may not have.
  const appliedOrInFlightRef = useRef<Set<ChatAction>>(new Set())
  // Tail of the confirmed-write queue (Codex P1, PR #1676). Every confirmed
  // action chains onto this, so two cards tapped a frame apart write one after
  // the other instead of racing. See `applyChatAction` for why that matters.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve())

  // Latest configs + capability, read at stage/apply time rather than captured
  // in a closure, so a snapshot that lands between renders is the one we
  // validate against — and so `stagePendingActions` keeps a stable identity
  // (the page threads it into useShellyChatFlows). Synced in an effect, which
  // runs before any confirm tap can reach these callbacks.
  const configsRef = useRef<ChatActivityConfig[]>(activityConfigs)
  const weekRef = useRef<ChatWeekDay[]>(weekDays)
  const videosRef = useRef<WatchVideo[]>(watchVideos)
  const parentRef = useRef<boolean>(canEditActivityConfigs)
  // The acting child's NAME, for the refusal sentences a dropped live-day edit
  // shows ("Lincoln already did this one — …"). A ref for the same reason as the
  // others: `stagePendingActions` must keep a stable identity.
  const childNameRef = useRef<string | undefined>(undefined)
  // The next-week draft surface (FEAT-150). A ref for the same reason as the
  // others — `stagePendingActions` must keep a stable identity — and because the
  // stage gate needs to know whether a `draftNextWeek` card would have anything
  // behind it BEFORE offering one.
  const onDraftNextWeekRef = useRef<ShellyChatActionsDeps['onDraftNextWeek']>(undefined)
  // Whether a child tab is selected at all (FEAT-152). Empty on the General tab,
  // which has no write powers — see `generalTabDropNotice`. A ref for the same
  // reason as the others: `stagePendingActions` must keep a stable identity.
  const activeChildIdRef = useRef<string>(activeChildId)
  // Every child's name, for the General-tab drop's "ask on X's tab" sentence.
  const allChildNamesRef = useRef<string[]>([])
  // The live arcs and the family's children as id+name pairs (FEAT-157) — the
  // Dad Lab resolver needs both: an arc to resolve a `planLab` link against,
  // and real child ids to check a `createConceptArc` audience with. Refs for
  // the same reason as the others: `stagePendingActions` must keep a stable
  // identity.
  const arcsRef = useRef<ConceptArc[]>(conceptArcs)
  const familyChildrenRef = useRef<DadLabChild[]>([])
  useEffect(() => {
    configsRef.current = activityConfigs
    weekRef.current = weekDays
    videosRef.current = watchVideos
    parentRef.current = canEditActivityConfigs
    childNameRef.current = children.find((c) => c.id === activeChildId)?.name
    activeChildIdRef.current = activeChildId
    allChildNamesRef.current = children.map((c) => c.name)
    arcsRef.current = conceptArcs
    familyChildrenRef.current = children.map((c) => ({ id: c.id, name: c.name }))
    onDraftNextWeekRef.current = onDraftNextWeek
  }, [activityConfigs, weekDays, watchVideos, conceptArcs, canEditActivityConfigs, children, activeChildId, onDraftNextWeek])

  /**
   * Stage the actions parsed from an assistant message, awaiting a confirm tap.
   * This NEVER writes — it only moves the proposals into confirm-card state.
   *
   * A `setActivityMinutes` proposal is resolved against the family's live
   * configs HERE, so an unresolvable (hallucinated, or wrong-child) id never
   * becomes a card the parent could tap. `applyChatAction` re-checks anyway —
   * this is the gate, that is the backstop.
   *
   * A dropped proposal is never dropped *silently*. The prompt is not
   * profile-aware and the model always signs off with "confirm with a tap", so
   * a silent drop leaves the reply promising a card that never renders — for a
   * kid who reached `/chat` directly (the route is nav-gated, not
   * route-gated), and equally for a parent whose activity the model failed to
   * match. Each drop records a plain-language reason the UI shows in the card's
   * place, so the app never claims something it didn't do.
   */
  const stagePendingActions = useCallback(
    (messageId: string, actions: ChatAction[]) => {
      setPendingMessageId(messageId)
      // UX-33(a) — a new turn's cards replace the previous turn's, whole array
      // at a time. Correct (a proposal belongs to the reply that made it) but
      // it was silent. Recorded first so the sentence survives every branch
      // below, including the General-tab drop and the all-dropped case.
      const notices: string[] = []
      const superseded = supersededNotice(stillPendingCount())
      if (superseded) notices.push(superseded)
      // FEAT-152 — the General tab writes nothing, and says so. No action
      // grammar is emitted without a childId, so an action block here is already
      // off-contract; it is dropped whole rather than resolved, because the one
      // thing that could rescue it — inferring the child from the payload — is
      // precisely the thing a write must never do. See `generalTabDropNotice`.
      if (!activeChildIdRef.current) {
        if (actions.length > 0) {
          console.warn(
            '[shellyChat] dropped every action — the General tab has no write powers',
            actions,
          )
          notices.push(generalTabDropNotice(allChildNamesRef.current))
        }
        setSuppressed([...new Set(notices)])
        setPending([])
        return
      }
      // Videos this turn has already accepted a vet-in for (Codex P2, PR #1676).
      // One reply really can carry two `vetInVideo` blocks for the same video —
      // "add all five" with a repeat in the list is the obvious way — and both
      // would resolve against the SAME pre-write library snapshot, so neither
      // sees the other. `addWatchVideo` is an `addDoc`, and the re-entry guard
      // is keyed on the action OBJECT, so two distinct objects would mint two
      // library entries for one video. Deduped here, where the whole turn is
      // visible at once, rather than at the write, where each call is alone.
      const acceptedYouTubeIds = new Set<string>()
      // Both next-week routes in one turn (Codex P2, PR #1679). The grammar now
      // states precedence and forbids emitting both, but a prompt is a
      // probability and this is a determinism: `draftNextWeek` and
      // `proposePlanAdjustment` answer the SAME question ("reshape next week"),
      // so two cards would be two conflicting confirmations for one intent —
      // one drafting the week here, one navigating away to build it elsewhere.
      // When both arrive, the draft wins and the handoff is dropped.
      //
      // Deliberately NOT recorded as a suppressed notice: the notices exist so
      // that a reply promising "confirm with a tap" never leaves the parent
      // waiting on a card that does not come. Here a card DOES come, and it does
      // the thing she asked for — telling her about a redundant second route she
      // never saw would be noise, not honesty. (The escape hatch to Plan My Week
      // is still on the draft card itself.)
      // Keyed on whether a draft will actually be OFFERED, not merely on whether
      // one was emitted. The difference is load-bearing: for a kid profile (or
      // with no draft surface wired) the draft is refused, and suppressing the
      // handoff on the strength of its mere presence would leave the turn with
      // NO card at all — turning a redundancy fix into a capability regression.
      const draftWillBeOffered = actions.some(
        (a) =>
          isDraftNextWeekAction(a) &&
          Boolean(onDraftNextWeekRef.current) &&
          resolveDraftNextWeek(a, parentRef.current).ok,
      )
      const offerable = actions.filter((action) => {
        if (draftWillBeOffered && action.kind === 'proposePlanAdjustment') {
          console.warn(
            '[shellyChat] dropped a plan-adjustment handoff — a next-week draft was proposed in the same turn',
          )
          return false
        }
        // FEAT-142 — a live-day edit is resolved against THIS WEEK before it can
        // become a card: the day must be a weekday of the current week, the row
        // must really be on it, and a finished row is refused here with the
        // reason shown (and refused again by the lane at the write).
        if (isDayItemAction(action)) {
          const resolution = resolveDayItemAction(
            action,
            thisWeekOnly(weekRef.current),
            parentRef.current,
            childNameRef.current,
          )
          if (!resolution.ok) {
            console.warn('[shellyChat] dropped live-day edit —', resolution.notice, action)
            notices.push(resolution.notice)
            return false
          }
          return true
        }
        // FEAT-150 — a next-week draft is resolved against the capability
        // before it can become a card. It is the largest thing this chat can
        // propose, so it is also refused when the surface that would run it is
        // not wired: a card whose confirm has nothing behind it would spend the
        // parent's tap on nothing, which is the exact failure the suppressed
        // notices exist to prevent.
        if (isDraftNextWeekAction(action)) {
          if (!onDraftNextWeekRef.current) {
            console.warn('[shellyChat] dropped draftNextWeek — no draft surface wired')
            notices.push(
              "I can't draft a week from here right now — nothing was changed. Plan My Week can build it.",
            )
            return false
          }
          const resolution = resolveDraftNextWeek(action, parentRef.current)
          if (!resolution.ok) {
            console.warn('[shellyChat] dropped draftNextWeek —', resolution.notice, action)
            notices.push(resolution.notice)
            return false
          }
          return true
        }
        // FEAT-149 — a watch action is resolved against the child's live library
        // and the plannable week window before it can become a card: a video
        // already vetted in is refused (and pointed at the Archive when it was
        // retired), and a plan must name a live entry and a weekday of this week
        // or next. The window is recomputed from the clock HERE, for the same
        // reason `thisWeekOnly` recomputes the current week.
        if (isWatchAction(action)) {
          const resolution = resolveWatchAction(
            action,
            videosRef.current,
            plannableWatchDayKeys(),
            parentRef.current,
          )
          if (!resolution.ok) {
            console.warn('[shellyChat] dropped watch action —', resolution.notice, action)
            notices.push(resolution.notice)
            return false
          }
          if (action.kind === 'vetInVideo') {
            if (acceptedYouTubeIds.has(action.youtubeId)) {
              console.warn('[shellyChat] dropped a repeated vet-in in one turn', action)
              notices.push(repeatedVetInNotice(action.title))
              return false
            }
            acceptedYouTubeIds.add(action.youtubeId)
          }
          return true
        }
        // FEAT-157 — a Dad Lab proposal is resolved against the live arcs and
        // the family's real children before it can become a card: a `planLab`
        // arc link must name an active arc and an in-range step, and a
        // `createConceptArc` audience must name family children. Each drop
        // shows its own reason — a hallucinated arc id never reaches a card.
        if (isDadLabAction(action)) {
          const resolution = resolveDadLabAction(
            action,
            arcsRef.current,
            familyChildrenRef.current,
            parentRef.current,
          )
          if (!resolution.ok) {
            console.warn('[shellyChat] dropped Dad Lab action —', resolution.notice, action)
            notices.push(resolution.notice)
            return false
          }
          return true
        }
        // FEAT-143 — a curriculum edit is resolved against the family's live
        // configs before it can become a card: the id must name a config the
        // acting child owns, the program must still be running, and a position
        // must fit the book. Each drop shows its own reason.
        if (isCurriculumAction(action)) {
          const resolution = resolveCurriculumAction(
            action,
            configsRef.current,
            parentRef.current,
          )
          if (!resolution.ok) {
            console.warn('[shellyChat] dropped curriculum edit —', resolution.notice, action)
            notices.push(resolution.notice)
            return false
          }
          return true
        }
        if (action.kind !== 'setActivityMinutes') return true
        if (!parentRef.current) {
          console.warn('[shellyChat] dropped setActivityMinutes — parent-only action')
          notices.push(
            'Changing how long an activity takes is something a grown-up does — nothing was changed.',
          )
          return false
        }
        const config = resolveActivityConfig(configsRef.current, action)
        if (!config) {
          console.warn(
            '[shellyChat] dropped setActivityMinutes — unknown activity config',
            action.activityConfigId,
          )
          notices.push(
            "That didn't match one of your activities, so nothing was changed. Try naming it as it appears in Progress → Curriculum.",
          )
          return false
        }
        return true
      })
      // Dedupe: two bad proposals in one turn shouldn't stack the same sentence.
      setSuppressed([...new Set(notices)])
      setPending(
        offerable.map((action, i) => ({
          id: `${messageId}_${i}`,
          action,
          status: 'pending' as const,
        })),
      )
    },
    [],
  )

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  /** How many cards are still awaiting a tap right now. */
  const stillPendingCount = () =>
    pendingRef.current.filter((p) => p.status === 'pending').length

  const clearPending = useCallback(() => {
    setPending([])
    setPendingMessageId(null)
    setSuppressed([])
    // The guard is scoped to the cards on screen; a new turn starts clean.
    appliedOrInFlightRef.current = new Set()
  }, [])

  /**
   * UX-33(b) — drop the pending cards because the CONTEXT they were proposed in
   * is gone: the parent switched child tabs, or moved to another conversation.
   *
   * Both were previously left standing. `clearPending` existed and was tested
   * but was called from nowhere in the UI, so the only thing between a stale
   * card and a write was `rejectReason` — which returns
   * `'child mismatch with active context'` and `false`, silently, leaving a
   * button that does nothing and says nothing. A thread switch was worse: the
   * child still matches, so the write goes THROUGH, and the applied-action
   * annotation lands on `pendingMessageId` under the NEW `activeThreadId` — a
   * message id that does not exist in that thread.
   *
   * Clearing is the rail; the notice is the disclosure. Read the pending set
   * and the acting child's name synchronously, before the switch re-renders
   * this hook, so the sentence can name who the cards were for.
   */
  const dropPendingForContext = useCallback(
    (reason: Exclude<PendingDropReason, typeof PendingDropReason.Superseded>) => {
      const notice = pendingDropNotice(reason, stillPendingCount(), childNameRef.current)
      setPending([])
      setPendingMessageId(null)
      setSuppressed(notice ? [notice] : [])
      appliedOrInFlightRef.current = new Set()
    },
    [],
  )

  /**
   * Validate the active-child binding. Returns a rejection reason or null.
   * A confused model must not edit the wrong child: the action's `childId` must
   * resolve to a real family child AND match the active chat context.
   */
  const rejectReason = useCallback(
    (action: ChatAction): string | null => {
      if (!children.some((c) => c.id === action.childId)) {
        return 'unknown child'
      }
      // FEAT-152 backstop, and the reason the mismatch check below is not enough
      // on its own: on the General tab `activeChildId` is `''`, so that check
      // short-circuits and a well-formed action naming a REAL child would sail
      // through. No child tab selected means no write, full stop.
      if (!activeChildId) {
        return 'no child tab selected — the General tab cannot write'
      }
      if (action.childId !== activeChildId) {
        return 'child mismatch with active context'
      }
      // FEAT-135 backstop: even if a card were somehow offered, the action must
      // still be parent-initiated AND name a real config the acting child owns
      // before we write.
      if (action.kind === 'setActivityMinutes') {
        if (!parentRef.current) return 'activity minutes are parent-only'
        if (!resolveActivityConfig(configsRef.current, action)) {
          return 'unknown activity config'
        }
      }
      // FEAT-142 backstop: even if a card were somehow offered, a live-day edit
      // must still be parent-initiated and still resolve against this week
      // before we call the lane. (The lane refuses a third time on the
      // freshly-read document — this check is not what makes it safe, it is
      // what keeps a stale card from getting as far as a network round-trip.)
      if (isDayItemAction(action)) {
        const resolution = resolveDayItemAction(
          action,
          thisWeekOnly(weekRef.current),
          parentRef.current,
          childNameRef.current,
        )
        if (!resolution.ok) return resolution.notice
      }
      // FEAT-149 backstop: same shape as the ones above. A card staged before
      // the video was retired elsewhere — or before the week rolled over,
      // carrying "next Tuesday" out of the plannable window — must not reach a
      // write on a later tap.
      if (isWatchAction(action)) {
        const resolution = resolveWatchAction(
          action,
          videosRef.current,
          plannableWatchDayKeys(),
          parentRef.current,
        )
        if (!resolution.ok) return resolution.notice
      }
      // FEAT-150 backstop: a card staged while the parent was signed in must not
      // reach a generation on a later tap from a kid profile — and a surface
      // that has since gone away must not be called into.
      if (isDraftNextWeekAction(action)) {
        if (!onDraftNextWeekRef.current) return 'no next-week draft surface'
        const resolution = resolveDraftNextWeek(action, parentRef.current)
        if (!resolution.ok) return resolution.notice
      }
      // FEAT-157 backstop: same shape as its siblings. A card staged before
      // the arc it links to was archived elsewhere — or before the capability
      // was lost — must not reach a write on a later tap.
      if (isDadLabAction(action)) {
        const resolution = resolveDadLabAction(
          action,
          arcsRef.current,
          familyChildrenRef.current,
          parentRef.current,
        )
        if (!resolution.ok) return resolution.notice
      }
      // FEAT-143 backstop: same shape as the two above. A card staged before a
      // config was completed elsewhere (or before the capability was lost) must
      // not reach a write on a later tap.
      if (isCurriculumAction(action)) {
        const resolution = resolveCurriculumAction(
          action,
          configsRef.current,
          parentRef.current,
        )
        if (!resolution.ok) return resolution.notice
      }
      return null
    },
    [children, activeChildId],
  )

  /**
   * The write itself. Split out of {@link applyChatAction} so the re-entry guard
   * above wraps it whole — a guard that shares a function body with the writes
   * it protects is one early `return` away from being bypassed.
   */
  const performChatAction = useCallback(
    async (action: ChatAction): Promise<boolean> => {
      if (action.kind === 'addSightWord') {
        await addSightWord(familyId, action.childId, action.word)
      } else if (action.kind === 'removeSightWord') {
        await removeSightWord(familyId, action.childId, action.word)
      } else if (action.kind === 'editProfileField') {
        // editProfileField — replace-write one freeform soft-profile field
        // through the shared, allowlist-validated writer (Tier B). Idempotent:
        // re-applying the same value is a harmless overwrite.
        await updateChildSoftProfile(familyId, action.childId, {
          [action.field]: action.value,
        })
      } else if (action.kind === 'setActivityMinutes') {
        // FEAT-135 — the narrowest write in the portal: one field
        // (`defaultMinutes`) on one activity config, the number every FUTURE
        // plan reads. Nothing retroactive: no dayLog is touched, no applied
        // week is re-planned, and no already-recorded minute moves.
        await updateActivityConfigMinutes(familyId, action.activityConfigId, action.minutes)
      } else if (isWatchAction(action)) {
        // FEAT-149 — vet a found video into the library, or plan a vetted one
        // onto a weekday of this week or next. Routed through the vet-in form's
        // own writer and the FEAT-132 day lane; purely additive on both sides.
        const done = await applyWatchAction(familyId, action, videosRef.current)
        if (!done) return false
      } else if (isCurriculumAction(action)) {
        // FEAT-143 — add / finish / reposition an activity, routed through the
        // shared `activityConfigWrites` core Progress → Curriculum calls. Nothing
        // retroactive: no dayLog is touched, no applied week is re-planned, and
        // no already-recorded minute moves.
        await applyCurriculumAction(familyId, action, configsRef.current)
      } else if (isDadLabAction(action)) {
        // FEAT-157 — create a concept arc or a Planned backlog lab, routed
        // through the Dad Lab page's own extracted lanes. Create only: no
        // status flip, no hours, no XP — completing a lab stays a Dad Lab
        // page act, and that is where compliance credit happens.
        await applyDadLabAction(
          familyId,
          action,
          familyChildrenRef.current.map((c) => c.id),
        )
      } else if (isDayItemAction(action)) {
        // FEAT-142 — remove / move / add on a day of THIS week, routed through
        // the FEAT-138 lane. If the lane refuses (a completion landed between
        // the card rendering and the tap, the row is gone, the capability is
        // missing), the card stays pending rather than claiming a write that
        // did not happen.
        const done = await applyDayItemAction(familyId, action, parentRef.current)
        if (!done) {
          console.warn('[shellyChat] live-day edit refused by the write lane', action)
          return false
        }
      } else if (isDraftNextWeekAction(action)) {
        // FEAT-150 — tap ONE of two. This spends a plan generation and puts a
        // draft on screen; it writes no week, no day and no child record. The
        // second tap lives on the draft card and has no `ChatAction` kind, so a
        // reply can never reach a week write in a single confirmation.
        //
        // A `false` return means no week was produced, so the card must go back
        // to pending rather than claim a draft the parent cannot see.
        const drafted = await onDraftNextWeekRef.current?.(action)
        if (!drafted) return false
      } else if (action.kind === 'proposePlanAdjustment') {
        // HANDOFF, not a write (chunk 2A/2): stage the brief to the planner's
        // per-child inbox. shelly-chat NEVER writes the plan — the planner owns
        // plan writes and applies via its existing lock-in path. Navigation to
        // the planner happens AFTER the inline confirm-audit below, so we don't
        // unmount the page before the record lands.
        await stagePlanAdjustment(familyId, action)
      } else {
        // Tier C Option 2 (6b) — additive snapshot edits routed through the
        // central writer. Additive-only fields; the writer auto-stamps each new
        // entry as a parent directive and dedups, so a duplicate add is a no-op.
        await applySnapshotAction(familyId, action)
      }

      setPending((prev) =>
        prev.map((p) =>
          p.action === action ? { ...p, status: 'applied' } : p,
        ),
      )

      // Audit inline on the source assistant message (no new collection).
      if (pendingMessageId && activeThreadId) {
        try {
          await updateDoc(
            doc(shellyChatMessagesCollection(familyId, activeThreadId), pendingMessageId),
            {
              appliedActions: arrayUnion({
                action,
                appliedAt: new Date().toISOString(),
              }),
            },
          )
        } catch (err) {
          console.warn('[shellyChat] failed to record applied action on message:', err)
        }
      }

      console.info('[shellyChat] applied action', action)

      // Plan-adjustment handoff: the brief is staged + audited — now leave for
      // Plan My Week, where Shelly reviews and locks in via the existing flow.
      if (action.kind === 'proposePlanAdjustment') {
        navigateToPlanner?.()
      }

      return true
    },
    [familyId, activeThreadId, pendingMessageId, navigateToPlanner],
  )

  /**
   * Apply a single proposed action on a confirm tap.
   *
   * Guards re-entry, validates the active-child binding, then hands off to
   * {@link performChatAction} for the write itself. A repeat tap — a double tap
   * inside one frame, or a tap on a card whose write already succeeded — is
   * refused before any writer is reached, so a non-idempotent kind like
   * `addActivity` cannot create two documents (Codex P1, PR #1669).
   *
   * Writes are additionally **serialized** against each other (Codex P1, PR
   * #1676). The re-entry guard is keyed on the action object, so it says nothing
   * about two DIFFERENT cards confirmed a frame apart — and every day write in
   * this app is a read-modify-`setDoc` (`liveDayEdit`, `writeWatchItemToDay`),
   * so two of them racing on the same day both build from the same old checklist
   * and the later one silently drops the earlier one's row. Both cards would
   * still say "Done". Nothing about the shared lane changes; the chat simply
   * stops firing its writes concurrently, which is the only surface that can
   * (a tap on Today or in the planner is one affordance at a time, and
   * `confirmAll` already awaits in sequence).
   *
   * @returns true if the write was performed, false if refused.
   */
  const applyChatAction = useCallback(
    async (action: ChatAction): Promise<boolean> => {
      // Re-entry guard (Codex P1, PR #1669). A second tap while the first write
      // is still in flight — or on a card whose write already succeeded — must
      // not reach a writer. See `appliedOrInFlightRef`.
      if (appliedOrInFlightRef.current.has(action)) {
        console.warn('[shellyChat] ignored a repeat confirm — already applied or in flight', action)
        return false
      }

      const reason = rejectReason(action)
      if (reason) {
        console.warn('[shellyChat] rejected action —', reason, action)
        return false
      }

      appliedOrInFlightRef.current.add(action)
      // Hide the buttons for the duration. Reverted to `'pending'` below if the
      // write does not happen, so a genuine failure stays retryable. The
      // previous attempt's error clears here: a retry in flight must not still
      // be showing the sentence from the try before it.
      setPending((prev) =>
        prev.map((p) =>
          p.action === action ? { ...p, status: 'applying', error: undefined } : p,
        ),
      )
      let wrote = false
      // UX-33(c). The rejection used to propagate out of `applyChatAction`
      // into an `onClick` that discards it: no error, no toast, no sentence,
      // just the button coming back. Caught here, turned into a sentence on
      // the card itself, and swallowed so a failed card in a `confirmAll` run
      // cannot abort the cards behind it.
      let failed = false
      try {
        // Queue behind whatever write is already running. The tail is reset to a
        // resolved promise on failure so one rejected write cannot wedge the
        // queue for the rest of the turn.
        const queued = writeQueueRef.current.then(
          () => performChatAction(action),
          () => performChatAction(action),
        )
        writeQueueRef.current = queued.then(
          () => undefined,
          () => undefined,
        )
        wrote = await queued
      } catch (err) {
        console.error('[shellyChat] a confirmed write failed', err, action)
        failed = true
      } finally {
        if (!wrote) {
          appliedOrInFlightRef.current.delete(action)
          setPending((prev) =>
            prev.map((p) =>
              p.action === action
                ? {
                    ...p,
                    status: 'pending',
                    ...(failed ? { error: confirmFailureNotice() } : {}),
                  }
                : p,
            ),
          )
        }
      }
      return wrote
    },
    [performChatAction, rejectReason],
  )

  /** Dismiss a proposed action without writing. */
  const dismissAction = useCallback((action: ChatAction) => {
    setPending((prev) =>
      prev.map((p) =>
        p.action === action ? { ...p, status: 'dismissed' } : p,
      ),
    )
  }, [])

  /** Confirm every still-pending action (Tier-B turns are often multi-word). */
  const confirmAll = useCallback(async () => {
    const stillPending = pending.filter((p) => p.status === 'pending')
    for (const p of stillPending) {
      await applyChatAction(p.action)
    }
  }, [pending, applyChatAction])

  return {
    pending,
    /** Plain-language reasons a proposal was dropped before becoming a card. */
    suppressed,
    stagePendingActions,
    clearPending,
    dropPendingForContext,
    applyChatAction,
    dismissAction,
    confirmAll,
  }
}
