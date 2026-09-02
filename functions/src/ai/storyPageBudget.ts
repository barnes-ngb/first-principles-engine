/**
 * Story page-count budget + parse reconciliation (FEAT-97, resized FEAT-172).
 *
 * Page count is a **product decision** ($8 book ≈ 10 pages), targeted by the
 * client and threaded into `generateStory` / `reviseStory`. This module owns the
 * server side of that target:
 *   - `DEFAULT_TARGET_PAGE_COUNT` — the fallback when no target is sent (mirrors
 *     `src/features/books/storyPageTargets.ts`; the two TS build roots can't share
 *     a module — deliberate duplication, kept in sync by test).
 *   - `maxTokensForPageCount` — scales the output budget with the target (and the
 *     word list, FEAT-172) so a long book doesn't truncate. `generateStory` runs
 *     adaptive thinking at HIGH effort (it's not in `EFFORT_BY_TASK`), and on the
 *     Sonnet-5 generation thinking tokens count against `max_tokens`, so the model
 *     spends a chunk of the budget on internal reasoning before emitting a single
 *     page — the FEAT-77/78 lesson. FEAT-169's diagnostic then **confirmed** the
 *     truncation FEAT-97's 7168 had left possible: Shelly's Normal / 10-page book
 *     with a word list came back `stop_reason=max_tokens` ("The story came back
 *     too long to finish"). The visible story is small — ~100 tokens a page for
 *     text + scene + per-page word listing + JSON, so ~1–1.5k for a 10–14 page
 *     book — which means nearly all of the budget is thinking room, and the base
 *     is where the headroom has to live.
 *   - `reconcileStoryPageCount` — validate-on-parse: the model may return a
 *     different count; we accept a good story regardless, but report the delta and
 *     flag a wildly-off (>±3) result for a warn.
 */

/** The priced product size — the default target when no target is sent. */
export const DEFAULT_TARGET_PAGE_COUNT = 10;

// Budget model: a base overhead (title + JSON scaffolding + adaptive-thinking
// headroom) plus a per-page allotment (page text + scene description + words)
// plus a per-word allotment for the story's word list (FEAT-172): every word
// asked for is a constraint the model reasons over AND a candidate for each
// page's `wordsOnPage` listing, so a list makes the reply — and the thinking
// before it — longer.
//
// Sizing (FEAT-172). `max_tokens` is a ceiling, not a spend: the model bills
// what it emits, so a fuller ceiling costs nothing on a story that finishes
// early and only buys room on one that would otherwise be cut short. The base
// is the thinking headroom: 8192 gives a 10-page book ~12k tokens of reasoning
// room after its ~1.3k of visible text (was ~5.5k at 7168). Wall clock is the
// real bound — both the callable and the CF are capped at 300 s, and 16k output
// tokens at Sonnet-5 throughput sits inside that with margin.
export const STORY_BASE_TOKENS = 8192;
export const STORY_TOKENS_PER_PAGE = 512;
export const STORY_TOKENS_PER_WORD = 64;
// Clamp rails (unchanged): never below a sane floor (a 1-page ask still needs
// thinking room), never above a ceiling that would let a runaway target — or a
// runaway word list — balloon the budget past the 300 s window.
const STORY_MIN_TOKENS = 4096;
const STORY_MAX_TOKENS = 16384;

/**
 * Output-token budget for a story of `pageCount` pages carrying a word list of
 * `wordCount` words.
 *
 * Mapping (after clamp to [4096, 16384]; FEAT-172 — was 5120 / 7168 / 9216):
 *   -  6 pages → 11264   (+ 64 per word)
 *   - 10 pages → 13312   (10 pages + 12 words → 14080)
 *   - 14 pages → 15360   (14 pages + 15 words → 16320; + 22 words → 16384, clamped)
 */
export function maxTokensForPageCount(pageCount: number, wordCount = 0): number {
  const pages =
    Number.isFinite(pageCount) && pageCount > 0
      ? Math.round(pageCount)
      : DEFAULT_TARGET_PAGE_COUNT;
  const words =
    Number.isFinite(wordCount) && wordCount > 0 ? Math.round(wordCount) : 0;
  const raw =
    STORY_BASE_TOKENS + STORY_TOKENS_PER_PAGE * pages + STORY_TOKENS_PER_WORD * words;
  return Math.max(STORY_MIN_TOKENS, Math.min(STORY_MAX_TOKENS, raw));
}

export interface PageCountReconciliation {
  /** Pages the target asked for. */
  target: number;
  /** Pages the model actually returned. */
  actual: number;
  /** `actual - target` (positive = model wrote extra pages). */
  delta: number;
  /** True when the count is off by more than ±3 — worth a warn. */
  wildlyOff: boolean;
}

/** How far off a returned count must be before it's worth a warn. */
export const PAGE_COUNT_WILDLY_OFF_THRESHOLD = 3;

/**
 * Compare the requested target against the pages the model returned. Never
 * throws and never "fails" a story — an off-by-one is expected and fine. Callers
 * log the delta as telemetry and warn only when `wildlyOff`.
 */
export function reconcileStoryPageCount(
  target: number,
  actual: number,
): PageCountReconciliation {
  const delta = actual - target;
  return {
    target,
    actual,
    delta,
    wildlyOff: Math.abs(delta) > PAGE_COUNT_WILDLY_OFF_THRESHOLD,
  };
}
