/**
 * Navigating TO the Progress page, with the parent's context intact (UX-52).
 *
 * Every route into `/progress` used to be a bare `navigate('/progress')`, which
 * has two costs the audit named:
 *
 *  1. **The tab resets.** `ProgressPage` reads `?tab=<slug>` and falls back to
 *     index 0 (Foundations), so exiting a Monthly Book landed on Foundations —
 *     every book read cost a re-navigation back to where she was.
 *  2. **`?diag=1` is dropped.** The flag lives in the query string, so a bare
 *     path silently closes the diagnostic panels; the Monthly Book reader's own
 *     panel became unreachable by navigation at all.
 *
 * Both are fixed the same way: name the tab, and carry the flag through.
 */

/** The `?tab=` slugs `ProgressPage` resolves. One definition, shared. */
export const PROGRESS_TABS = {
  Foundations: 'foundations',
  MonthlyBooks: 'monthly-books',
  LearningMap: 'learning-map',
  Curriculum: 'curriculum',
  SkillSnapshot: 'skill-snapshot',
  WordWall: 'word-wall',
} as const
export type ProgressTabSlug = (typeof PROGRESS_TABS)[keyof typeof PROGRESS_TABS]

/**
 * Query params that must survive a navigation into `/progress`.
 *
 * `diag` only — it is a *surface* flag the parent turned on deliberately, and
 * dropping it silently undoes their choice. Everything else is page-local and
 * carrying it would leak one screen's state onto another.
 */
const PRESERVED_PARAMS = ['diag'] as const

/**
 * Build a `/progress` path for `tab`, carrying the preserved params from
 * `current` (the caller's own `useSearchParams()`).
 *
 * `tab` is optional: a caller with no opinion about where to land omits it and
 * still keeps the flag.
 */
export function progressPath(
  tab?: ProgressTabSlug,
  current?: URLSearchParams,
): string {
  const params = new URLSearchParams()
  if (tab) params.set('tab', tab)
  for (const key of PRESERVED_PARAMS) {
    const value = current?.get(key)
    if (value !== null && value !== undefined) params.set(key, value)
  }
  const query = params.toString()
  return query ? `/progress?${query}` : '/progress'
}
