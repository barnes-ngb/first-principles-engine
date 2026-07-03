/**
 * Shared addressing + qualification helpers for the inline Today Help Card
 * (FEAT-43, slice 1 of FEAT-40).
 *
 * The card doc is keyed by a stable fragment computed identically by the
 * lock-in writer (planner) and the Today reader (TodayChecklist), so both sides
 * resolve the same doc without threading an ID through the day-log checklist
 * item. The key is derived from the item's subject + minutes-stripped label.
 */

/** Buckets that get an inline Help Card in slice 1 — kept deliberately narrow. */
export const HELP_CARD_BUCKETS: ReadonlySet<string> = new Set(['Reading', 'Math'])

/** Minimal item shape both DraftPlanItem and ChecklistItem satisfy for keying. */
export interface HelpCardKeyable {
  /** For a checklist item this includes a trailing "(Nm)"; for a plan item, the raw title. */
  label: string
  subjectBucket?: string
}

/** Minimal shape for the slice-1 qualification predicate. */
export interface HelpCardEligible extends HelpCardKeyable {
  category?: 'must-do' | 'choose' | 'routine'
  mvdEssential?: boolean
  skipped?: boolean
}

/** Strip a trailing "(Nm)" minutes suffix and collapse surrounding whitespace. */
export function normalizeHelpCardLabel(label: string): string {
  return label.replace(/\s*\(\d+m\)\s*$/, '').trim()
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Stable per-item key fragment: `{subjectSlug}__{labelSlug}`. */
export function helpCardKey(item: HelpCardKeyable): string {
  const subject = slug(item.subjectBucket ?? 'other') || 'other'
  const label = slug(normalizeHelpCardLabel(item.label)) || 'item'
  return `${subject}__${label}`
}

/** Full Help Card doc id under `families/{familyId}/helpCards`. */
export function helpCardDocId(childId: string, item: HelpCardKeyable): string {
  return `${childId}__${helpCardKey(item)}`
}

/**
 * Slice-1 qualification: must-do Reading/Math items only, never prayer/scripture.
 * Works on both DraftPlanItem (label = title) and ChecklistItem (label + minutes).
 */
export function qualifiesForHelpCard(item: HelpCardEligible): boolean {
  if (item.skipped) return false
  const bucket = item.subjectBucket
  if (!bucket || !HELP_CARD_BUCKETS.has(bucket)) return false
  const isMustDo = item.mvdEssential === true || item.category === 'must-do'
  if (!isMustDo) return false
  if (/prayer|scripture|devotion/i.test(item.label)) return false
  return true
}
