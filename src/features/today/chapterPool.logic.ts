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
 * Whether the kid read-aloud SECTION should mount for a child (FUNC-09).
 *
 * The read-aloud book is shared per week — its id lives on the shared
 * `weeks/{weekStart}` doc, not a per-child plan. Section visibility therefore
 * follows the shared book, NOT whether this child has a populated per-child
 * `bookProgress` / question pool. A child with no plan and no generated pool
 * (e.g. London) still gets the section so the shared book reaches their Today;
 * the per-child pool and answers fill in independently.
 *
 * - No shared book → no section.
 * - Book but no per-child pool yet → show the section (book reaches Today).
 * - Pool exists → defer to `isChapterPoolVisible` so a finished book still
 *   unmounts the kid section (FUNC-07 behavior, unchanged).
 */
export function isReadAloudSectionVisible(
  hasBook: boolean,
  pool: ChapterQuestionPoolItem[] | undefined,
): boolean {
  if (!hasBook) return false
  if (!pool || pool.length === 0) return true
  return isChapterPoolVisible(pool)
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
