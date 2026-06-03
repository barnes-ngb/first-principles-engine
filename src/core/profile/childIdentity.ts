// ── Child identity helpers (ARCH-15) ────────────────────────────
//
// Pure helpers that derive display/calibration values from a child's
// real identity profile (`birthdate` / `grade` on `children/{childId}`).
//
// HARD RULE: these are DATA, never gates. Nothing here may be used to
// lock a feature by age, grade, or name. Capability gates stay
// snapshot-driven (see `knowledgeMineAccess.ts`). The age-group helper
// only SEEDS cosmetic/presentation defaults (avatar proportions, font
// sizing) for a child who has no avatar profile yet — exactly the
// "demographics may seed sensible defaults" allowance in CLAUDE.md.

import type { Child } from '../types'

/**
 * Whole-year age from a `YYYY-MM-DD` (or any Date-parseable) birthdate.
 * Calendar-accurate (accounts for whether this year's birthday has passed),
 * not a 365.25-day approximation. Returns `undefined` when the birthdate is
 * missing or unparseable so callers can fall back to neutral defaults.
 */
export function computeAge(
  birthdate?: string,
  now: Date = new Date(),
): number | undefined {
  if (!birthdate) return undefined
  const birth = new Date(birthdate)
  if (Number.isNaN(birth.getTime())) return undefined
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1
  }
  return age >= 0 ? age : undefined
}

/**
 * Threshold (in years) at or above which a child seeds the "older" avatar
 * body/theme rather than the "younger" one. Documented constant so the
 * cosmetic split is explicit and not a magic number.
 */
export const OLDER_AGE_GROUP_THRESHOLD = 8

export type AgeGroup = 'older' | 'younger'

/**
 * Cosmetic age group derived from the child's real age. Used ONLY to seed
 * avatar proportions / theme defaults and to size worksheet fonts — never to
 * gate a feature. A child with no usable birthdate defaults to `'younger'`
 * (the safer presentation default: larger fonts, simpler layout), preserving
 * the prior behavior where only the older child rendered as `'older'`.
 */
export function getChildAgeGroup(
  child: Pick<Child, 'birthdate'> | null | undefined,
  now: Date = new Date(),
): AgeGroup {
  const age = computeAge(child?.birthdate, now)
  if (age === undefined) return 'younger'
  return age >= OLDER_AGE_GROUP_THRESHOLD ? 'older' : 'younger'
}
