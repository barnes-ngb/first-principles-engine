/**
 * Is the day's plan settled enough to write — UX-345 (GATE).
 *
 * `useDailyPlan` loads `dailyPlans/{date}_{childId}` and `saveDailyPlan` writes
 * it back with `merge: true`, carrying `sessions: dailyPlan?.sessions ?? []`
 * along with the energy and plan type the parent just tapped. The document *id*
 * is rebuilt from the live `childId`; the *payload* was not. Today has its own
 * `ChildSelector` (and UX-324's header chip reaches it), so between a child
 * change and the new child's `getDoc` resolving, the hook still held the
 * previous child's plan — and a tap in that window wrote **his brother's
 * sessions** onto his day. The census filed this row as SAFE and then dismissed
 * the hazard it had just named; Codex round 4 on PR #1820 overturned it.
 *
 * Two halves, and the second is the one that is easy to miss:
 *
 * 1. **The loaded plan is cleared before the read opens**, during render rather
 *    than in an effect, so there is no frame in which the hook holds one child's
 *    plan under another child's id. (The `RecordsPage` precedent: adjusting
 *    state during render is React's own answer to "derive from a changed prop",
 *    and this repo's lint forbids the set-state-in-effect form.)
 * 2. **A failed read is not an affirmative empty result.** A rejected `getDoc`
 *    left `dailyPlan` null with `isLoading` false, which is indistinguishable
 *    from "this child has no plan yet" — and writing `sessions: []` under
 *    `merge: true` REPLACES a stored array. So a dropped read could empty a
 *    day's sessions rather than misfile them. This is the `useBusinessGoal`
 *    rule (Codex round 5 on PR #1817), and this is its third instance.
 *
 * **No plan math changes.** Nothing here folds minutes, counts blocks, or
 * decides a budget; the written document's shape, its `merge: true` and the
 * energy → plan-type derivation on `TodayPage` are exactly as they were. This
 * module answers one question: may the plan be written right now.
 *
 * The decision itself lives in `core/hooks/childScopedGate` — `useSkillMap`
 * (UX-344) is the same verdict on the same run and one predicate serves both.
 * What stays here is the copy: "today's plan" is what a parent is looking at.
 *
 * Pure: no React, no Firestore, never throws.
 */
import {
  childScopedGateNote,
  childScopedReadIsSettled,
  type ChildScopedReadState,
} from '../../core/hooks/childScopedGate'

export type DailyPlanGateState = ChildScopedReadState


/**
 * The plan may be written only once the read for THIS child has resolved and
 * resolved successfully. Absent (`false`) is the safe answer for every other
 * state, including the one nobody thinks about: a hook with no child yet.
 */
export function dailyPlanIsEditable(state: DailyPlanGateState): boolean {
  return childScopedReadIsSettled(state)
}

/**
 * What "How's today going?" says while it cannot be tapped.
 *
 * Two sentences, not one, because the two states need different advice: waiting
 * resolves on its own, a failed read does not and the parent needs to know the
 * controls are not merely slow. Neither claims anything about the day itself —
 * saying "no plan yet" over a read that never landed is the defect, not the
 * message.
 */
export function dailyPlanGateNote(state: DailyPlanGateState): string | null {
  return childScopedGateNote(state, {
    failed: "Couldn't read today's plan — reload before changing it.",
    waiting: "Loading today's plan…",
  })
}

// ── What happens when a tap gets through anyway — UX-352 ────────────────────
//
// The gate above is **right and stays**: it is what stops one child's `sessions`
// being written onto his brother's day, and UX-345 filed it against a live
// defect. What was wrong was that it was **silent**. `saveDailyPlan` opened with
// two bare `return`s and closed with a `console.error`, so all three ways it can
// decline to record a tap — no target, not settled, a rejected `setDoc` —
// reached the parent as nothing at all, on a surface whose other control
// announces every success with a *"Saved"* snack.
//
// `DayStatusRow` disables both controls while the gate is shut and says why, so
// the refusals below should be unreachable through the UI. They are reported
// anyway, because "unreachable" is a claim about today's markup: the write is
// the thing that knows whether it happened.

/** Why an energy / day-type tap was not recorded. */
export const DailyPlanSaveRefusal = {
  /** No family, child or date yet — there is no document to address. */
  NoTarget: 'no-target',
  /** This child's read has not settled. Resolves on its own. */
  NotReady: 'not-ready',
  /** This child's read FAILED. Does not resolve on its own. */
  ReadFailed: 'read-failed',
  /** The write was attempted and rejected. */
  Rejected: 'rejected',
} as const
export type DailyPlanSaveRefusal =
  (typeof DailyPlanSaveRefusal)[keyof typeof DailyPlanSaveRefusal]

/** Did the tap land? `saveDailyPlan` answers with this instead of `void`. */
export type DailyPlanSaveOutcome =
  | { ok: true }
  | { ok: false; reason: DailyPlanSaveRefusal }

/**
 * What the page says when a tap was not recorded.
 *
 * Four sentences, because the advice differs: two of these resolve on their own
 * and two do not, and telling a parent to "try again" against a read that will
 * never land is the same species of lie as saying *Saved*. None of them asserts
 * anything about the day itself.
 */
export function dailyPlanSaveFailureNotice(reason: DailyPlanSaveRefusal): {
  text: string
  severity: 'error'
} {
  const text =
    reason === DailyPlanSaveRefusal.ReadFailed
      ? "Not saved — today's plan couldn't be read. Reload before changing it."
      : reason === DailyPlanSaveRefusal.NotReady
        ? "Not saved — today's plan is still loading. Try that again in a moment."
        : reason === DailyPlanSaveRefusal.NoTarget
          ? "Not saved — today's plan isn't open yet."
          : "That didn't save. It's back to how it was — try again."
  return { text, severity: 'error' }
}
