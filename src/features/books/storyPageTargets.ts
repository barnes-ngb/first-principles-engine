/**
 * Target page count for story/book generation (FEAT-97).
 *
 * Books are a priced product ($8 ≈ 10 pages), so page count is a **product
 * decision**, not an accident of generation. Every story-generation entry point
 * (Story Guide, Generate Chat, Sight Word Book) targets a count from this one
 * source instead of the old three hardcoded `isLincoln ? 10 : 6` literals.
 *
 * The default is **10** (the priced product size) for every reader — the
 * selector lets a kid pick Short / Normal / Long.
 *
 * NOTE: `functions/src/ai/storyPageBudget.ts` mirrors `DEFAULT_TARGET_PAGE_COUNT`
 * (the two TS build roots can't share a module — deliberate duplication, kept in
 * sync by the shared-constant test). The server also owns the `maxTokens`
 * budget scaling and the parse-time reconciliation.
 */

/** The priced product size — the default target when no selection is made. */
export const DEFAULT_TARGET_PAGE_COUNT = 10

/** Kid-friendly length options shown by the selector ("How long is your book?"). */
export interface StoryLengthOption {
  /** Target page count threaded into generation. */
  pages: number
  /** Kid-friendly label ("Short" / "Normal" / "Long"). */
  label: string
}

export const STORY_LENGTH_OPTIONS: readonly StoryLengthOption[] = [
  { pages: 6, label: 'Short' },
  { pages: 10, label: 'Normal' },
  { pages: 14, label: 'Long' },
] as const

/** The full allowed target range (min/max of the options). */
export const MIN_TARGET_PAGE_COUNT = STORY_LENGTH_OPTIONS[0].pages
export const MAX_TARGET_PAGE_COUNT =
  STORY_LENGTH_OPTIONS[STORY_LENGTH_OPTIONS.length - 1].pages

/**
 * Clamp an arbitrary page count into the supported range, falling back to the
 * default for a missing / non-finite value. Keeps a stray value (e.g. a legacy
 * book's stored config) from driving generation out of bounds.
 */
export function clampTargetPageCount(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_TARGET_PAGE_COUNT
  const rounded = Math.round(value)
  if (rounded < MIN_TARGET_PAGE_COUNT) return MIN_TARGET_PAGE_COUNT
  if (rounded > MAX_TARGET_PAGE_COUNT) return MAX_TARGET_PAGE_COUNT
  return rounded
}
