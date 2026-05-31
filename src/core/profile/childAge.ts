import type { Child } from '../types/family'

/**
 * Default birthdates for known children when the Firestore doc doesn't
 * carry one yet. Keeps age-based features approximately right until a
 * parent enters real birthdates in Settings.
 */
export const CHILD_BIRTHDATES: Record<string, string> = {
  Lincoln: '2015-09-01',
  London: '2019-05-01',
}

/** Compute integer age in years from a birthdate string (YYYY-MM-DD). */
export function deriveChildAge(child: Child): number | null {
  const birthdate = child.birthdate ?? CHILD_BIRTHDATES[child.name]
  if (!birthdate) return null
  const birth = new Date(birthdate)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return age
}
