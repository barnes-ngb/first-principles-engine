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
 * portal write path. `applyChatAction` (Build Step 3b) must reject any `kind`
 * not present here — which is the guarantee that the portal can never reach
 * Tier-C authority surfaces (`skillSnapshots`, `childSkillMaps`,
 * `dispositionCache`). See docs/SHELLY_PORTAL_CONTEXT.md §3 and §5.
 *
 * This build defines the two sight-word kinds (3a/3b) plus the Tier-B
 * `editProfileField` kind (Step 4). No Tier-C kind is ever added here.
 *
 * `editProfileField` can only ever touch the three freeform soft-profile
 * fields on the `children` doc — `motivators | interests | strengths`. The
 * `field` literal type IS the allowlist: `supports` (which lives on
 * `skillSnapshots` → Tier C), `prioritySkills`, `grade`, and any
 * `skillSnapshots`/`childSkillMaps` path are unrepresentable here and are
 * rejected by `parseChatActions`. It is a replace-write of freeform text, so
 * `value` is the full intended new text, not a fragment.
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
