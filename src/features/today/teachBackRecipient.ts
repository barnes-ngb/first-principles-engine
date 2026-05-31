import type { Child } from '../../core/types/family'
import { deriveChildAge } from '../../core/profile/childAge'

/**
 * Map a freeform grade string to a comparable rank (lower = younger).
 * Used only as a fallback when birthdates aren't available. Returns
 * `null` when the grade can't be interpreted.
 */
function gradeRank(grade?: string): number | null {
  if (!grade) return null
  const g = grade.trim().toLowerCase()
  if (g.startsWith('pre')) return -1 // pre-K / preschool
  if (g.startsWith('k')) return 0 // kindergarten
  const n = parseInt(g, 10)
  return Number.isNaN(n) ? null : n
}

/** True when `a` is younger than `b` (later birthdate, or lower grade). */
function isYounger(a: Child, b: Child): boolean {
  const ageA = deriveChildAge(a)
  const ageB = deriveChildAge(b)
  if (ageA !== null && ageB !== null) return ageA < ageB
  const gradeA = gradeRank(a.grade)
  const gradeB = gradeRank(b.grade)
  if (gradeA !== null && gradeB !== null) return gradeA < gradeB
  return false
}

/**
 * The younger sibling this child would teach — encoding the charter's
 * "older teaches younger" relationship (e.g. Lincoln teaches London).
 *
 * Derives the relationship from existing child data (birthdate first,
 * grade as a fallback), never from a hardcoded name. Returns the closest
 * younger sibling (the oldest among those younger than `child`), or `null`
 * when this child is the youngest and so has no one to teach.
 */
export function findYoungerSibling(child: Child, children: Child[]): Child | null {
  const younger = children.filter(
    (c) => c.id !== child.id && isYounger(c, child),
  )
  if (younger.length === 0) return null
  return younger.reduce((closest, c) => (isYounger(c, closest) ? closest : c))
}
