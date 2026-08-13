import type { SubjectBucket } from './enums'

export type ChatContext = 'lincoln' | 'london' | 'general'

export interface ChatThread {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  lastMessagePreview: string
  chatContext: ChatContext
  context?: {
    source: 'sparkle' | 'planner' | 'evaluation' | 'general'
    itemTitle?: string
    weekTheme?: string
  }
  archived: boolean
}

export interface ShellyChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  imageUrl?: string
  imagePrompt?: string
  /** Single uploaded image (analyze/attach-one). Legacy + single-file path. */
  uploadedImageUrl?: string
  /** Batch of uploaded images on one turn (FEAT-59 multi-file attach). */
  uploadedImageUrls?: string[]
  imageAction?: 'analyze' | 'generate' | 'attach'
  /**
   * Portal write audit (Build Step 3b): the `<action>` proposals Shelly
   * confirmed on this assistant message, recorded inline so the applied write
   * is auditable in the thread itself (no separate collection). Appended on
   * apply by `useShellyChatActions.applyChatAction`.
   */
  appliedActions?: { action: ChatAction; appliedAt: string }[]
}

/**
 * Discriminated union of the actions the Shelly portal can propose from an AI
 * `<action>{...}</action>` block.
 *
 * This union is an **allowlist**: it is the structural safety boundary for the
 * portal write path. `applyChatAction` must reject any `kind` not present here.
 *
 * Tiers represented here:
 * - **Tier A (3a/3b):** the two sight-word kinds (`addSightWord` /
 *   `removeSightWord`).
 * - **Tier B (Step 4):** `editProfileField` — soft-profile freeform fields on
 *   the `children` doc.
 * - **Tier C Option 2 (6b):** additive, evidence-stamped edits to the child's
 *   Skill Snapshot — `addPrioritySkill` / `addSupport` / `addStopRule` /
 *   `markSkillProgress`. See below.
 *
 * `editProfileField` can only ever touch the three freeform soft-profile
 * fields on the `children` doc — `motivators | interests | strengths`. The
 * `field` literal type IS the allowlist: `prioritySkills`, `grade`, and any
 * `skillSnapshots`/`childSkillMaps` path are unrepresentable here and are
 * rejected by `parseChatActions`. It is a replace-write of freeform text, so
 * `value` is the full intended new text, not a fragment. Note: there is no
 * `children.supports` field — `supports` lives on the snapshot and is reached
 * only via the snapshot-explicit `addSupport` kind below.
 *
 * The four snapshot kinds below are the **only** snapshot-touching actions and
 * they are **additive only**: they add a priority skill / support / stop rule,
 * or mark a skill progressing/mastered. Removals, downgrades, and
 * level-lowering (Option 3) are intentionally **absent** — unrepresentable in
 * this union — and require a separate human-override writer class plus the
 * ARCH-10 rules backstop. They route through the central additive writer
 * (`writeSnapshotUpdate`) with an auto-stamped parent-directive evidence note;
 * the model/UI never fabricates evidence. The kind names are kept
 * snapshot-explicit (`addSupport`, not `addProfileSupport`) so the
 * authoritative target stays unambiguous.
 *
 * **`setActivityMinutes` (FEAT-135)** writes ONE field — `defaultMinutes` — on
 * ONE `activityConfigs` doc. That number is the default every FUTURE plan reads
 * (via `activityConfigsToRoutineText` / the planner's config load); it is a
 * standing preference, NOT an edit to anything already recorded. Confirming it
 * touches no `dayLog`, re-plans no applied week, and moves no `plannedMinutes`
 * on an existing block — hours already logged are a child's school record and a
 * forward-looking preference must never restate history. `activityConfigId` is
 * validated as a non-empty string here, but the id being *real* is not a
 * type-level guarantee: the app resolves it against the family's live configs
 * before a confirm card is ever offered, so a hallucinated id cannot reach the
 * write. `minutes` is an integer in [5, 120] — outside that band the action is
 * rejected as malformed, never clamped.
 *
 * `setActivityMinutes` and `proposePlanAdjustment` are deliberately distinct: a
 * **standing default** for one activity is this write; a **shape change to next
 * week** (drop/repace/reorder a subject) stays the handoff below.
 *
 * **The live-day kinds (FEAT-142)** — `removeItemFromDay`, `moveItemToDay`,
 * `addItemToDay` — are the chat's half of FEAT-138's live-week edit lane. They
 * change what is on a day of the CURRENT week: a row comes off, a row moves to
 * another weekday, or a new row is added. Each is confirm-gated, parent-only,
 * and routed through `today/liveDayEdit.ts` — the chat opens no second write
 * path to a day document.
 *
 * Three properties hold across all three, and none of them is a type-level
 * guarantee, so each is enforced where the live day is actually readable
 * (`useShellyChatActions` at stage time, then the lane itself at the write):
 *  1. **`itemKey` naming a row that is really on the day.** It is validated as a
 *     non-empty string here; a hallucinated key resolves to nothing and no card
 *     is offered.
 *  2. **Dates inside the current week.** `dateKey` is validated as a real
 *     `YYYY-MM-DD` calendar date here; *which* week it belongs to is not this
 *     module's to know. A move's target must be a weekday of the same week (the
 *     five-weekday rule `MoveToDayDialog` established).
 *  3. **Completed work is immovable.** A finished row has credited minutes and
 *     may carry evidence, so remove and move refuse it — at stage time with the
 *     reason shown, and again at the write. There is no override, and no kind
 *     here can un-complete a row.
 *
 * `addItemToDay` carries `estimatedMinutes` as an integer in [5, 120] — the same
 * band, rejected-never-clamped, as `setActivityMinutes` — and lands as
 * `source: 'manual'`, never `'planner'`: `retainChecklistForApply` drops
 * incomplete planner residue, so a fake planner row would be silently deleted by
 * a later re-apply (the same reasoning as `buildWatchChecklistItem`). It writes
 * one checklist row and no block, so no `plannedMinutes` is created on a live
 * week — minutes on an applied week stay locked exactly as FEAT-138 left them.
 *
 * **`proposePlanAdjustment` is a HANDOFF, not a write** (chunk 2A/2). It is the
 * one kind that touches **no** child record at all: on confirm it stages a brief
 * to the planner's per-child inbox (`settings/pendingPlanAdjustment_{childId}`)
 * and navigates to Plan My Week. shelly-chat **never** writes the weekly plan —
 * the planner owns plan writes and applies the adjustment via its existing
 * generate / lock-in path (single-writer-lane discipline). `summary` is the
 * one-line change Shelly will review in the planner; `rationale` is the
 * grounded "why"; `scope` / `targetWeek` are optional hints.
 */
export type ChatAction =
  | { kind: 'addSightWord'; childId: string; word: string }
  | { kind: 'removeSightWord'; childId: string; word: string }
  | {
      kind: 'editProfileField'
      childId: string
      field: 'motivators' | 'interests' | 'strengths'
      value: string
    }
  | { kind: 'addPrioritySkill'; childId: string; skill: string }
  | { kind: 'addSupport'; childId: string; support: string }
  | { kind: 'addStopRule'; childId: string; rule: string }
  | { kind: 'markSkillProgress'; childId: string; skill: string; mastered?: boolean }
  | {
      kind: 'setActivityMinutes'
      childId: string
      /** Doc id of the `activityConfigs` doc whose `defaultMinutes` changes. */
      activityConfigId: string
      /** New default duration. Integer, 5–120 (enforced by `parseChatActions`). */
      minutes: number
    }
  | {
      kind: 'proposePlanAdjustment'
      childId: string
      summary: string
      rationale: string
      scope?: string
      targetWeek?: string
    }
  | {
      kind: 'removeItemFromDay'
      childId: string
      /** `YYYY-MM-DD` of the day the row is on. Must be in the current week. */
      dateKey: string
      /** `checklistItemKey` of the row — the guard's own notion of identity. */
      itemKey: string
    }
  | {
      kind: 'moveItemToDay'
      childId: string
      /** `YYYY-MM-DD` the row is on now. */
      fromDateKey: string
      /** `YYYY-MM-DD` it moves to. Same week only (Mon–Fri). */
      toDateKey: string
      itemKey: string
    }
  | {
      kind: 'addItemToDay'
      childId: string
      /** `YYYY-MM-DD` of the day the row is added to. Current week only. */
      dateKey: string
      /** Kid-facing title, without a minutes suffix. */
      label: string
      /** Integer, 5–120 (enforced by `parseChatActions`). */
      estimatedMinutes: number
      /** Optional subject bucket; omitted rather than guessed. */
      subjectBucket?: SubjectBucket
    }

/**
 * The brief shelly-chat stages for Plan My Week when Shelly confirms a
 * `proposePlanAdjustment` handoff. Written to
 * `families/{familyId}/settings/pendingPlanAdjustment_{childId}` by the chat and
 * consumed-once by `PlannerChatPage` (read → preload into the generation
 * context + surface a banner → clear the doc). This is **not** a child's record
 * and **not** a plan write — it is a one-shot inbox the planner drains. The
 * planner still requires Shelly to review and lock in via its existing flow;
 * nothing here auto-applies.
 */
export interface PendingPlanAdjustment {
  childId: string
  summary: string
  rationale: string
  scope?: string
  targetWeek?: string
  /** ISO timestamp the brief was staged. */
  stagedAt: string
}
