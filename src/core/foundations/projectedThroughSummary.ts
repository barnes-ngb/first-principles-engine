import type { ProjectedWorkingLevels } from '../types/learnerModel'

/**
 * **Has the working-level re-projection run on this model, and on what?** (UX-384)
 *
 * `LearnerModel.projectedThrough` is FIX-225's watermark: the working LEVELS a
 * projection was last computed from, one slot per driving key with `null` for
 * "no level". Nothing rendered it, so two exports and two screenshots could not
 * answer whether the feature that shipped the day before had ever fired — which
 * is the one question a diagnostic surface exists to answer.
 *
 * There are three states and collapsing any two of them makes the answer lie:
 * **never recorded** (the projection has not run), **recorded with no level**,
 * and **recorded with levels**. This returns `null` for the first — each surface
 * words that one itself, because a chip and a markdown table say it differently
 * — and the formatted level list for the other two, so the list has exactly one
 * definition.
 */
export function projectedThroughSummary(
  projected: ProjectedWorkingLevels | undefined,
  dash = '—',
): string | null {
  if (!projected) return null
  const keys = (Object.keys(projected) as (keyof ProjectedWorkingLevels)[]).sort()
  if (keys.length === 0) return ''
  return keys.map((key) => `${key} ${projected[key] ?? dash}`).join(' · ')
}
