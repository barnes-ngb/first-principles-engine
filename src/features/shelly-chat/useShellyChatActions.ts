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

import { useCallback, useState } from 'react'
import { arrayUnion, doc, updateDoc } from 'firebase/firestore'

import { shellyChatMessagesCollection } from '../../core/firebase/firestore'
import { updateChildSoftProfile } from '../../core/family/updateChildSoftProfile'
import type { ChatAction, Child } from '../../core/types'
import { todayKey } from '../../core/utils/dateKey'
import { writeSnapshotUpdate } from '../evaluate/skillSnapshotWrites'
import { addSightWord, removeSightWord } from '../books/useSightWordProgress'

export type ActionStatus = 'pending' | 'applied' | 'dismissed'

export interface PendingAction {
  /** Stable key for list rendering + per-card status. */
  id: string
  action: ChatAction
  status: ActionStatus
}

export interface ShellyChatActionsDeps {
  familyId: string
  children: Child[]
  /** The active chat context's childId. Actions must match this. */
  activeChildId: string
  /** Thread the pending actions came from, so applies can annotate the message. */
  activeThreadId: string | null
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
 * Owns the propose → human-confirm → write loop for `<action>` blocks. The page
 * stages actions parsed from the latest assistant message via
 * {@link stagePendingActions}; the confirm-card UI calls {@link applyChatAction}
 * or {@link dismissAction} on a tap.
 */
export function useShellyChatActions(deps: ShellyChatActionsDeps) {
  const { familyId, children, activeChildId, activeThreadId } = deps

  const [pending, setPending] = useState<PendingAction[]>([])
  // The assistant message the current `pending` set was parsed from — applied
  // actions are recorded back onto it for inline audit.
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null)

  /**
   * Stage the actions parsed from an assistant message, awaiting a confirm tap.
   * This NEVER writes — it only moves the proposals into confirm-card state.
   */
  const stagePendingActions = useCallback(
    (messageId: string, actions: ChatAction[]) => {
      setPendingMessageId(messageId)
      setPending(
        actions.map((action, i) => ({
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
      return true
    },
    [familyId, activeThreadId, pendingMessageId, rejectReason],
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
