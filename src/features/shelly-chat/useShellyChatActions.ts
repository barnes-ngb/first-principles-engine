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
//   - `setActivityMinutes` (FEAT-135) writes ONE field — `defaultMinutes` — on
//     ONE activity config, the number every FUTURE plan reads. It is resolved
//     against the family's live configs BEFORE the card is offered (a
//     hallucinated id never reaches the write) and it touches no `dayLog`,
//     re-plans no applied week, and moves no already-recorded minute.

import { useCallback, useEffect, useRef, useState } from 'react'
import { arrayUnion, doc, updateDoc } from 'firebase/firestore'

import { shellyChatMessagesCollection } from '../../core/firebase/firestore'
import { updateActivityConfigMinutes } from '../../core/firebase/updateActivityMinutes'
import { updateChildSoftProfile } from '../../core/family/updateChildSoftProfile'
import type { ChatAction, Child } from '../../core/types'
import { todayKey } from '../../core/utils/dateKey'
import { writeSnapshotUpdate } from '../evaluate/skillSnapshotWrites'
import { addSightWord, removeSightWord } from '../books/useSightWordProgress'
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
   * Whether the signed-in profile is a parent. `setActivityMinutes` is
   * parent-only, and `/chat` is nav-gated rather than route-gated, so the write
   * layer states the gate itself instead of trusting the route. Defaults to
   * false — fail closed.
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
    canEditActivityConfigs = false,
    activeThreadId,
    navigateToPlanner,
  } = deps

  const [pending, setPending] = useState<PendingAction[]>([])
  // The assistant message the current `pending` set was parsed from — applied
  // actions are recorded back onto it for inline audit.
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null)

  // Latest configs + capability, read at stage/apply time rather than captured
  // in a closure, so a snapshot that lands between renders is the one we
  // validate against — and so `stagePendingActions` keeps a stable identity
  // (the page threads it into useShellyChatFlows). Synced in an effect, which
  // runs before any confirm tap can reach these callbacks.
  const configsRef = useRef<ChatActivityConfig[]>(activityConfigs)
  const parentRef = useRef<boolean>(canEditActivityConfigs)
  useEffect(() => {
    configsRef.current = activityConfigs
    parentRef.current = canEditActivityConfigs
  }, [activityConfigs, canEditActivityConfigs])

  /**
   * Stage the actions parsed from an assistant message, awaiting a confirm tap.
   * This NEVER writes — it only moves the proposals into confirm-card state.
   *
   * A `setActivityMinutes` proposal is resolved against the family's live
   * configs HERE, so an unresolvable (hallucinated, or wrong-child) id never
   * becomes a card the parent could tap. `applyChatAction` re-checks anyway —
   * this is the gate, that is the backstop.
   */
  const stagePendingActions = useCallback(
    (messageId: string, actions: ChatAction[]) => {
      setPendingMessageId(messageId)
      const offerable = actions.filter((action) => {
        if (action.kind !== 'setActivityMinutes') return true
        if (!parentRef.current) {
          console.warn('[shellyChat] dropped setActivityMinutes — parent-only action')
          return false
        }
        const config = resolveActivityConfig(configsRef.current, action)
        if (!config) {
          console.warn(
            '[shellyChat] dropped setActivityMinutes — unknown activity config',
            action.activityConfigId,
          )
          return false
        }
        return true
      })
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
    stagePendingActions,
    clearPending,
    applyChatAction,
    dismissAction,
    confirmAll,
  }
}
