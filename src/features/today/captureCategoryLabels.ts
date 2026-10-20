/**
 * What the PARENT CAPTURE FORM calls a category (FIX-266).
 *
 * Reported: logging extra work is unclear, and there is no History category to
 * pick. History belongs in the existing `SubjectBucket.SocialStudies`, so what
 * is added is the word on the picker, under three limits:
 *
 *   • **Display only.** Nothing here is stored, matched or compared. The option
 *     values stay the `SubjectBucket` members, so a capture saved under this
 *     label writes `'SocialStudies'` as before — no new chip, no second
 *     category identity, nothing re-categorised.
 *   • **Local, not the shared label.** `SubjectBucketLabel` has many readers
 *     across the app, none of them reviewed in this slice, so this is a narrow
 *     override for the parent picker that falls through to the shared label for
 *     every other bucket.
 *   • **The minutes preview keeps the shared label**, since that is the name
 *     other readers of `SubjectBucketLabel` use; the parenthetical is filing
 *     guidance, not part of the record.
 */
import { SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'

/**
 * Parent-capture overrides, by stored bucket. A bucket absent from this map
 * uses the shared label — the common case, and the reason this is a
 * `Partial` rather than a second full table to keep in step.
 */
export const CAPTURE_CATEGORY_LABEL_OVERRIDE: Partial<Record<SubjectBucket, string>> = {
  [SubjectBucket.SocialStudies]: 'Social Studies (including History)',
}

/** The word the parent capture form shows for a stored bucket. */
export function captureCategoryLabel(bucket: SubjectBucket): string {
  return CAPTURE_CATEGORY_LABEL_OVERRIDE[bucket] ?? SubjectBucketLabel[bucket]
}
