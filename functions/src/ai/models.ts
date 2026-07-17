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
 * Per-task model assignment. Sonnet 5 for complex reasoning; Haiku for routine
 * generation. The Opus 4.8 pilot (evaluate + learnerSynthesis) is **suspended**
 * as of 2026-07-16 — the first live call failed before quality could be assessed
 * (the model ID was documentation-verified but never live-called). The
 * `CLAUDE_OPUS` constant is retained for the expected re-pilot; see the suspended
 * rows below and models.test.ts.
 */
export const MODEL_BY_TASK: Readonly<Record<string, string>> = {
  // evaluate: CLAUDE_OPUS,          // pilot suspended 2026-07-16 — first live call failed before quality could be assessed; re-pilot only after verifying claude-opus-4-8 via a live GET /v1/models (or one successful live call) from the deployed environment
  evaluate: CLAUDE_SONNET,
  // learnerSynthesis: CLAUDE_OPUS,  // pilot suspended 2026-07-16 — first live call failed before quality could be assessed; re-pilot only after verifying claude-opus-4-8 via a live GET /v1/models (or one successful live call) from the deployed environment
  learnerSynthesis: CLAUDE_SONNET,

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
 * The `temperature` sampling param (and its siblings `top_p` / `top_k`) was
 * **removed** on the Sonnet-5 / Opus-4.6+ generation. A request to one of those
 * models that carries `temperature` fails with
 * `400 invalid_request_error: "temperature is deprecated for this model."`, which
 * the function layer wraps as a 503/UNAVAILABLE (FEAT-58 follow-up). Haiku 4.5
 * (and older models) still accept `temperature`.
 *
 * The AI request builders (`callClaude` in chatTypes.ts, the provider adapter in
 * providers/claude.ts) gate `temperature` through this predicate so a request to a
 * rejecting model never carries it — a mixed-fleet-safe conditional, not a blanket
 * removal (Haiku legitimately accepts it). This is an **allowlist, not a
 * denylist**: an unknown/unlisted model defaults to *omitting* temperature (the
 * param is optional, so omission is always safe), which means a newly added
 * current-generation model can never silently regress into a 503 on it.
 *
 * Note on siblings: `top_p` / `top_k` are not sent anywhere in the AI layer, so
 * there is nothing to gate for them today — this predicate covers the one param
 * that is actually sent.
 */
const TEMPERATURE_ACCEPTING_MODELS: ReadonlySet<string> = new Set([CLAUDE_HAIKU]);

/** True when `model` still accepts the legacy `temperature` sampling param. */
export function modelAcceptsTemperature(model: string): boolean {
  return TEMPERATURE_ACCEPTING_MODELS.has(model);
}

/**
 * Reasoning-effort levels the Messages API exposes for the Sonnet-5 / 4.6+
 * generation (`output_config.effort`, GA — no beta header). Lower effort ⇒ the
 * model spends fewer tokens on internal reasoning before it answers.
 */
export const ReasoningEffort = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Xhigh: "xhigh",
  Max: "max",
} as const;
export type ReasoningEffort = (typeof ReasoningEffort)[keyof typeof ReasoningEffort];

/**
 * Per-task reasoning-effort override (FEAT-77, second D6 amendment).
 *
 * Sonnet 5 runs **adaptive thinking at HIGH effort by default** (omitting the
 * `thinking` param on Sonnet 5 enables adaptive thinking; effort defaults to
 * high). On a structured-JSON task with a tight `maxTokens`, the model can burn
 * the entire output budget on internal reasoning and emit **zero visible text**
 * — which then reads as an empty/unparseable reply. `learnerSynthesis` is
 * structured summarization against provided evidence (deep reasoning is waste),
 * so it runs at **low**. Tasks not listed inherit the API default (high) — this
 * table intentionally does **not** touch the global chat-task default.
 *
 * The chosen effort is sent as `output_config.effort`; see `callClaude`.
 */
export const EFFORT_BY_TASK: Readonly<Record<string, ReasoningEffort>> = {
  learnerSynthesis: ReasoningEffort.Low,
};

/** Resolve a task type to its reasoning effort, or `undefined` (API default). */
export function resolveEffortForTask(taskType: string): ReasoningEffort | undefined {
  return EFFORT_BY_TASK[taskType];
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
