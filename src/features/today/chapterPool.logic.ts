import type { ChapterQuestionPoolItem } from '../../core/types'

/**
 * Chapter-pool completion semantics (FUNC-07).
 *
 * Skipping a chapter is a parent-only action and is recorded as `skipped: true`
 * WITHOUT `answered: true`. Before this split, skips were stamped `answered`,
 * which finished the book early and unmounted the kid's read section. These
 * pure predicates keep the three surfaces (kid pool visibility, parent pool,
 * book-finished) in agreement on what "to go" / "done" mean.
 */

/** A chapter the kid can still answer: neither answered nor parent-skipped. */
export function isChapterToGo(item: ChapterQuestionPoolItem): boolean {
  return !item.answered && !item.skipped
}

/**
 * A book is finished only when no chapter is left untouched — every chapter is
 * either answered or parent-skipped. An empty pool is not "finished".
 */
export function isBookFinished(pool: ChapterQuestionPoolItem[]): boolean {
  return pool.length > 0 && pool.every((item) => item.answered || item.skipped)
}

/** The kid chapter pool stays visible while any chapter is still to-go. */
export function isChapterPoolVisible(pool: ChapterQuestionPoolItem[]): boolean {
  return pool.some(isChapterToGo)
}

/**
 * One-time repair of legacy skip-model docs (FUNC-07). Pre-split skips were
 * stamped `answered: true, skipped: true`; reset every `skipped` chapter back to
 * answerable and clear its stale answer metadata. Genuine answers
 * (`answered && !skipped`) and untouched chapters are left exactly as-is.
 * Pure — returns a new pool array.
 */
export function repairLegacySkips(
  pool: ChapterQuestionPoolItem[],
): ChapterQuestionPoolItem[] {
  return pool.map((item) =>
    item.skipped
      ? {
          ...item,
          answered: false,
          skipped: false,
          answeredDate: undefined,
          responseNote: undefined,
        }
      : item,
  )
}
