/**
 * Central Claude model-selection table (FEAT-58).
 *
 * The ONE place Claude model IDs live for the functions AI layer. `modelForTask`
 * (chat.ts), the per-request override allowlist, the provider alias map
 * (`providers/claude.ts`), and the vision image tasks all resolve their model
 * strings from here — a model swap is a one-line edit in this file.
 *
 * Model IDs verified at run time against the Anthropic model catalog
 * (platform.claude.com/docs/en/about-claude/models/overview):
 *   - Sonnet 5  → `claude-sonnet-5`            (dateless, per the 4.6+ ID convention)
 *   - Opus 4.8  → `claude-opus-4-8`
 *   - Haiku 4.5 → `claude-haiku-4-5-20251001`
 *
 * aiUsage note: token counts on Sonnet-5 / Opus-4.8 tasks run ~30% higher than the
 * retired Sonnet-4.6 tasks did, due to the new tokenizer — expected, not a
 * regression. See docs/PROJECT_CONTEXT.md (AI section) + the AI usage panel.
 *
 * Fable 5 was considered and rejected (2x Opus cost + requires refusal/stop_reason
 * fallback handling) — do not re-add without an owner decision.
 */

// ── Model IDs — the only Claude model string literals in the AI layer ──
export const CLAUDE_SONNET = "claude-sonnet-5";
export const CLAUDE_OPUS = "claude-opus-4-8";
export const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";

/**
 * Tasks not listed default to Haiku — routine generation (`generate` / `chat`,
 * kid-facing utility, ≤1024 tokens).
 */
export const DEFAULT_MODEL = CLAUDE_HAIKU;

/**
 * Per-task model assignment. Sonnet 5 for complex reasoning; Opus 4.8 pilot on
 * exactly two tasks; Haiku for routine generation.
 */
export const MODEL_BY_TASK: Readonly<Record<string, string>> = {
  // Opus 4.8 pilot — revert to sonnet if quality delta unjustified (owner review after 2 weeks)
  evaluate: CLAUDE_OPUS,
  // Opus 4.8 pilot — revert to sonnet if quality delta unjustified (owner review after 2 weeks)
  learnerSynthesis: CLAUDE_OPUS,

  // Sonnet 5 — complex reasoning
  plan: CLAUDE_SONNET,
  quest: CLAUDE_SONNET,
  generateStory: CLAUDE_SONNET,
  reviseStory: CLAUDE_SONNET,
  revisePage: CLAUDE_SONNET,
  workshop: CLAUDE_SONNET,
  analyzeWorkbook: CLAUDE_SONNET,
  disposition: CLAUDE_SONNET,
  conundrum: CLAUDE_SONNET,
  weeklyFocus: CLAUDE_SONNET,
  scan: CLAUDE_SONNET,
  shellyChat: CLAUDE_SONNET,
  foundationsReview: CLAUDE_SONNET,
  chapterQuestions: CLAUDE_SONNET,
  bookLookup: CLAUDE_SONNET,
  lessonVideo: CLAUDE_SONNET,
  helpCard: CLAUDE_SONNET,
  weeklyReview: CLAUDE_SONNET,
  analyzePatterns: CLAUDE_SONNET,
  monthlyReview: CLAUDE_SONNET,

  // Haiku (default) — routine generation. Listed for completeness.
  generate: CLAUDE_HAIKU,
  chat: CLAUDE_HAIKU,
};

/** Resolve a task type to its model ID (Haiku default for unlisted tasks). */
export function resolveModelForTask(taskType: string): string {
  return MODEL_BY_TASK[taskType] ?? DEFAULT_MODEL;
}

/**
 * Models a client may request via the per-request override (chat / generate
 * only — see chat.ts). Kept in lock-step with the table: the distinct set of IDs
 * `resolveModelForTask` can return, so an override can never point the chat path
 * at an unknown/expensive model.
 */
export const ALLOWED_OVERRIDE_MODELS: readonly string[] = Array.from(
  new Set(Object.values(MODEL_BY_TASK)),
);
