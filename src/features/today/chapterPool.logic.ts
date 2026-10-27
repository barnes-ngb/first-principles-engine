import type { ChapterQuestionPoolItem } from '../../core/types'

/** The raw AI-generated question shape the three create paths parse and map. */
export interface RawChapterQuestion {
  chapter: number
  questionType: string
  question: string
}

/**
 * Build a single `questionPool` item from a raw AI question, omitting
 * `chapterTitle` entirely when there's no title.
 *
 * The app's Firestore is plain `getFirestore(app)` (no
 * `ignoreUndefinedProperties`), so writing `chapterTitle: undefined` inside a
 * pool item makes `setDoc` reject the whole `BookProgress` doc with
 * `invalid-argument` (Unsupported field value: undefined). Books without
 * per-chapter titles (e.g. Prince Caspian) hit this on every create path, so
 * the spread below NEVER includes `chapterTitle` unless a real title is present.
 *
 * Returns `null` for malformed questions (missing/empty `questionType` or
 * `question`) so callers can skip them rather than write a broken pool entry.
 */
export function buildChapterPoolItem(
  q: RawChapterQuestion,
  chapterTitle?: string,
): ChapterQuestionPoolItem | null {
  if (!q.questionType || !q.question) return null
  return {
    chapter: q.chapter,
    questionType: q.questionType as ChapterQuestionPoolItem['questionType'],
    question: q.question,
    answered: false,
    ...(chapterTitle ? { chapterTitle } : {}),
  }
}

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
 *
 * UX-464: questions are now written a batch at a time and a run that stops
 * part-way keeps what landed, so a pool can hold 12 of a book's 58 chapters.
 * When the book's `totalChapters` is given, the pool must also COVER that many
 * distinct chapters — answering every question that exists so far is not
 * finishing the book. Omitted (or not a positive number), the rule is the
 * pool-only one it always was.
 */
export function isBookFinished(
  pool: ChapterQuestionPoolItem[],
  totalChapters?: number,
): boolean {
  if (pool.length === 0 || !pool.every((item) => item.answered || item.skipped)) return false
  if (typeof totalChapters !== 'number' || !Number.isFinite(totalChapters) || totalChapters < 1) {
    return true
  }
  return new Set(pool.map((item) => item.chapter)).size >= totalChapters
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
 *   unmounts the kid section (FUNC-07 behavior, unchanged) — and, given the
 *   book's chapter count, an exhausted PARTIAL pool keeps it (UX-464).
 */
export function isReadAloudSectionVisible(
  hasBook: boolean,
  pool: ChapterQuestionPoolItem[] | undefined,
  totalChapters?: number,
): boolean {
  if (!hasBook) return false
  if (!pool || pool.length === 0) return true
  if (isChapterPoolVisible(pool)) return true
  // UX-464 — every saved question is done, but a batch run stopped part-way
  // and the book has chapters with no question yet. That is not a finished
  // book, so the section stays (showing the "a grown-up will add questions"
  // placeholder, as for a book with no pool). Without a chapter count the rule
  // is the one it was.
  return !isBookFinished(pool, totalChapters)
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
