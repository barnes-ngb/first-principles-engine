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
import { deriveChildAge } from './childAge'

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

/**
 * Age group resolved from a child's identity data, falling back to the
 * canonical birthdate seed in `childAge.ts` when the Firestore doc has no
 * `birthdate` of its own.
 *
 * Same threshold and same `'younger'` default as {@link getChildAgeGroup} —
 * this only widens where the age may come from. Use it when the age group
 * *selects a branch* (FEAT-183): `getChildAgeGroup` is birthdate-only and
 * silently reads `'younger'` for a child doc that predates the ARCH-15
 * identity backfill, which would flip an older child into the younger
 * child's flow. Seeding defaults (avatar proportions, worksheet fonts) can
 * keep using the narrower helper — a cosmetic default that lands on
 * `'younger'` is harmless.
 *
 * Still DATA, never a gate: it derives an age, it does not grant access.
 */
export function resolveChildAgeGroup(
  child: Child | null | undefined,
  now: Date = new Date(),
): AgeGroup {
  if (!child) return 'younger'
  const age = computeAge(child.birthdate, now) ?? deriveChildAge(child, now)
  if (age === null || age === undefined) return 'younger'
  return age >= OLDER_AGE_GROUP_THRESHOLD ? 'older' : 'younger'
}
