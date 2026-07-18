/**
 * Story page-count budget + parse reconciliation (FEAT-97).
 *
 * Page count is a **product decision** ($8 book ≈ 10 pages), targeted by the
 * client and threaded into `generateStory` / `reviseStory`. This module owns the
 * server side of that target:
 *   - `DEFAULT_TARGET_PAGE_COUNT` — the fallback when no target is sent (mirrors
 *     `src/features/books/storyPageTargets.ts`; the two TS build roots can't share
 *     a module — deliberate duplication, kept in sync by test).
 *   - `maxTokensForPageCount` — scales the output budget with the target so a long
 *     book doesn't truncate. `generateStory` runs adaptive thinking at HIGH effort
 *     (it's not in `EFFORT_BY_TASK`), so the model can spend a chunk of the budget
 *     on internal reasoning before emitting a single page — the FEAT-77/78 lesson.
 *     A fixed 6144 was fine for a 10-page book but leaves a 14-page book at risk of
 *     running out mid-story, so the budget grows per page.
 *   - `reconcileStoryPageCount` — validate-on-parse: the model may return a
 *     different count; we accept a good story regardless, but report the delta and
 *     flag a wildly-off (>±3) result for a warn.
 */

/** The priced product size — the default target when no target is sent. */
export const DEFAULT_TARGET_PAGE_COUNT = 10;

// Budget model: a base overhead (title + JSON scaffolding + adaptive-thinking
// headroom) plus a per-page allotment (page text + scene description + words).
const STORY_BASE_TOKENS = 2048;
const STORY_TOKENS_PER_PAGE = 512;
// Clamp rails: never below a sane floor (a 1-page ask still needs thinking room),
// never above a ceiling that would let a runaway target balloon the budget.
const STORY_MIN_TOKENS = 4096;
const STORY_MAX_TOKENS = 16384;

/**
 * Output-token budget for a story of `pageCount` pages.
 *
 * Mapping (after clamp to [4096, 16384]):
 *   -  6 pages → 5120
 *   - 10 pages → 7168  (was a fixed 6144 — bumped for high-effort headroom)
 *   - 14 pages → 9216
 */
export function maxTokensForPageCount(pageCount: number): number {
  const pages =
    Number.isFinite(pageCount) && pageCount > 0
      ? Math.round(pageCount)
      : DEFAULT_TARGET_PAGE_COUNT;
  const raw = STORY_BASE_TOKENS + STORY_TOKENS_PER_PAGE * pages;
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
