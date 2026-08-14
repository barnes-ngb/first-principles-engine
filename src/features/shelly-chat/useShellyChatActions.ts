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
import type { ChatAction, Child } from '../../core/types'
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
import type { ChatWeekDay, DayItemAction } from './dayItemActions'
import { isDayItemAction, resolveDayItemAction } from './dayItemActions'
import { currentWeekDayKeys } from './useChatWeekDays'
import { stagePlanAdjustment } from './stagePlanAdjustment'

export type ActionStatus = 'pending' | 'applied' | 'dismissed'

export interface PendingAction {
  /** Stable key for list rendering + per-card status. */
  id: string
  action: ChatAction
  status: ActionStatus
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

/** Stable empty default so an omitted `activityConfigs` dep doesn't churn refs. */
const EMPTY_CONFIGS: ChatActivityConfig[] = []
/** Same, for an omitted `weekDays` dep. */
const EMPTY_WEEK: ChatWeekDay[] = []

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
    canEditActivityConfigs = false,
    activeThreadId,
    navigateToPlanner,
  } = deps

  const [pending, setPending] = useState<PendingAction[]>([])
  // The assistant message the current `pending` set was parsed from — applied
  // actions are recorded back onto it for inline audit.
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null)
  // Why a proposal was dropped before it became a card. The model's prose says
  // "confirm with a tap", so a SILENTLY dropped action leaves the app promising
  // a card that never appears — the same "tells you something untrue" failure
  // this feature exists to fix. Surfaced instead.
  const [suppressed, setSuppressed] = useState<string[]>([])

  // Latest configs + capability, read at stage/apply time rather than captured
  // in a closure, so a snapshot that lands between renders is the one we
  // validate against — and so `stagePendingActions` keeps a stable identity
  // (the page threads it into useShellyChatFlows). Synced in an effect, which
  // runs before any confirm tap can reach these callbacks.
  const configsRef = useRef<ChatActivityConfig[]>(activityConfigs)
  const weekRef = useRef<ChatWeekDay[]>(weekDays)
  const parentRef = useRef<boolean>(canEditActivityConfigs)
  // The acting child's NAME, for the refusal sentences a dropped live-day edit
  // shows ("Lincoln already did this one — …"). A ref for the same reason as the
  // others: `stagePendingActions` must keep a stable identity.
  const childNameRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    configsRef.current = activityConfigs
    weekRef.current = weekDays
    parentRef.current = canEditActivityConfigs
    childNameRef.current = children.find((c) => c.id === activeChildId)?.name
  }, [activityConfigs, weekDays, canEditActivityConfigs, children, activeChildId])

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
      const notices: string[] = []
      const offerable = actions.filter((action) => {
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

  const clearPending = useCallback(() => {
    setPending([])
    setPendingMessageId(null)
    setSuppressed([])
  }, [])

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
      if (activeChildId && action.childId !== activeChildId) {
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
   * Apply a single proposed action on a confirm tap. Validates the active-child
   * binding, routes through the shared sight-word writer, records the applied
   * write inline on the source message, and marks the card applied. Idempotent
   * and safe to re-tap (the underlying writers guarantee this).
   *
   * @returns true if the write was performed, false if rejected.
   */
  const applyChatAction = useCallback(
    async (action: ChatAction): Promise<boolean> => {
      const reason = rejectReason(action)
      if (reason) {
        console.warn('[shellyChat] rejected action —', reason, action)
        return false
      }

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
      } else if (isCurriculumAction(action)) {
        // FEAT-143 — add / finish / reposition an activity, routed through the
        // shared `activityConfigWrites` core Progress → Curriculum calls. Nothing
        // retroactive: no dayLog is touched, no applied week is re-planned, and
        // no already-recorded minute moves.
        await applyCurriculumAction(familyId, action, configsRef.current)
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
    [familyId, activeThreadId, pendingMessageId, rejectReason, navigateToPlanner],
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
    applyChatAction,
    dismissAction,
    confirmAll,
  }
}
