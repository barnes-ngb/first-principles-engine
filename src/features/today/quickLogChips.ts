// ── The Kid Today quick-log chip row, resolved from the family (FEAT-199) ──
//
// `KidExtraLogger` — the "⭐ I Did More!" card — offered six chips written into
// the component:
//
//     📖 Reading Eggs · 🔢 Math App · 📚 Reading · ✏️ Writing · 🔬 Science · 🎮 Other
//
// A family whose life changes could not add one and could not retire one. The
// Barnes family is moving over the next three months
// (`claude/PLAN_moving-season-2026.md`), and the owner's ask was literally
// *"let's add packing activities somewhere then. Also independent play etc."* —
// two things no chip offered, and one of them (**packing**) belonging to a
// `SubjectBucket` the row could not produce at all: `PracticalArts`. Everything
// that was not Reading / Math / Language Arts / Science landed as `Other`, so a
// season of real practical work read back as a season of "Other".
//
// So the row comes from `activityConfigs` — the app's own structured per-child
// activity layer, already created and edited in Progress › Curriculum. This
// module only READS it. There is no second editor and no new collection.
//
// ── Why an opt-in flag, and not "every config is a chip" ────────────────────
//
// Because every family already has configs. `migrateToActivityConfigs` /
// `ensureDefaultActivityConfigs` seed roughly fourteen of them on first load —
// *Prayer and Scripture*, *Handwriting (while read-aloud)*, *Knowledge Mine*,
// *Fluency Practice*, the workbooks. Those are the PLANNED day, which the
// checklist above this card already shows. Turning all of them into chips would
// not add packing; it would replace six deliberate extra-work chips with the
// routine, and no family would ever see the defaults again.
//
// So `ActivityConfig.quickLog` is additive and **opt-in**: absent or `false`
// means "not offered", which is every config that exists today. Nothing
// migrates, nothing moves, and a family that flags nothing sees exactly the six
// chips it saw before. Flagging is a two-tap thing on the config's own menu.
//
// ── The order, and the two rails on it ──────────────────────────────────────
//
// Family chips first (by the config's own `sortOrder`), the built-in defaults
// after — the family's own words are what a kid is looking for. Then:
//
//   1. **`Other` is always last and always present.** It is the escape hatch:
//      whatever the kid did that nobody thought to configure still logs. A cap
//      that pushes it off the row is a cap that loses work.
//   2. **The row is capped** (`QUICK_LOG_MAX_CHIPS`). A kid picks from a row on
//      a phone; a family that flags twenty configs would otherwise get a wall.
//      Family chips win the cap — if they fill it, the defaults drop, which is
//      the point of the feature.
//
// Labels are deduped by their letters, so a family config named "Reading" does
// not appear beside the built-in "📚 Reading".
//
// **Nothing here writes.** The chip carries a `subject` and the logger writes
// exactly the `ChecklistItem` it always wrote.

import type { ActivityConfig } from '../../core/types'
import type { SubjectBucket } from '../../core/types/enums'

export interface QuickLogChip {
  /** What the kid reads on the chip. */
  label: string
  /** The bucket the logged `ChecklistItem` carries. */
  subject: SubjectBucket
  /** Stable React key — a config id for a family chip, the label for a default. */
  key: string
  /** True when this chip came from one of the family's activity configs. */
  fromFamily: boolean
}

/**
 * The most chips the row may show, `Other` included.
 *
 * Ten wraps to two comfortable lines at a phone width, where six is one and a
 * half. Above that a kid is reading a list rather than picking from a row.
 */
export const QUICK_LOG_MAX_CHIPS = 10

/**
 * The built-in six — byte-for-byte the labels and subjects that were written
 * into `KidExtraLogger` before this run, in the order they were in.
 *
 * These labels are ALSO a stored data shape: the logger writes
 * `"{label} ({minutes}m)"` into `days.checklist[].label`, so a rename here
 * silently forks a family's history. They are held to the FEAT-178 kid
 * readability bar in `quickLogChips.test.ts` and are not to be reworded
 * casually (the same reason FEAT-186 left them alone).
 */
export const DEFAULT_QUICK_LOG_CHIPS: readonly QuickLogChip[] = [
  { label: '📖 Reading Eggs', subject: 'Reading', key: 'default:reading-eggs', fromFamily: false },
  { label: '🔢 Math App', subject: 'Math', key: 'default:math-app', fromFamily: false },
  { label: '📚 Reading', subject: 'Reading', key: 'default:reading', fromFamily: false },
  { label: '✏️ Writing', subject: 'LanguageArts', key: 'default:writing', fromFamily: false },
  { label: '🔬 Science', subject: 'Science', key: 'default:science', fromFamily: false },
  { label: '🎮 Other', subject: 'Other', key: 'default:other', fromFamily: false },
]

/** The escape hatch, by construction — always the last chip on the row. */
export const OTHER_QUICK_LOG_CHIP: QuickLogChip =
  DEFAULT_QUICK_LOG_CHIPS[DEFAULT_QUICK_LOG_CHIPS.length - 1]

/**
 * A label's letters, lowercased — emoji, spaces and punctuation dropped.
 *
 * "📚 Reading" and a family config named "Reading" are the same chip to a kid,
 * and showing both is the kind of small mess that makes a row feel broken.
 */
export function quickLogLabelKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Does this config want to appear on the quick-log row? */
function offersQuickLog(config: ActivityConfig): boolean {
  return config.quickLog === true && config.completed !== true
}

/**
 * The chips this child's quick-log row shows.
 *
 * `configs` is the live `activityConfigs` list the caller already subscribes to
 * — already narrowed to `childId in [child, 'both']` by the reader — so this
 * function does no child filtering of its own beyond honouring that.
 *
 * Guarantees, in order of who wins:
 *   - flagged, uncompleted family configs first, by `sortOrder`;
 *   - the built-in defaults after, minus any whose label a family chip already
 *     says;
 *   - at most `QUICK_LOG_MAX_CHIPS` chips;
 *   - `Other` last, always — even when the cap is full and even when a family
 *     chip is named "Other" (that one is dropped in favour of the escape hatch,
 *     because two chips reading "Other" is worse than one).
 */
export function resolveQuickLogChips(configs: readonly ActivityConfig[]): QuickLogChip[] {
  const otherKey = quickLogLabelKey(OTHER_QUICK_LOG_CHIP.label)
  const seen = new Set<string>([otherKey])
  const row: QuickLogChip[] = []

  const push = (chip: QuickLogChip) => {
    const key = quickLogLabelKey(chip.label)
    if (key === '' || seen.has(key)) return
    seen.add(key)
    row.push(chip)
  }

  const family = configs
    .filter(offersQuickLog)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  for (const config of family) {
    push({
      label: (config.name ?? '').trim(),
      subject: config.subjectBucket ?? 'Other',
      key: `config:${config.id}`,
      fromFamily: true,
    })
  }

  for (const chip of DEFAULT_QUICK_LOG_CHIPS) push(chip)

  // The cap leaves one slot for `Other`, which is then appended unconditionally.
  return [...row.slice(0, QUICK_LOG_MAX_CHIPS - 1), OTHER_QUICK_LOG_CHIP]
}
