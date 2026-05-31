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
  uploadedImageUrl?: string
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
