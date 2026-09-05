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
//
// ── UX-184: there were TWO kid quick-log surfaces, and FEAT-199 rewired one ──
//
// Kid Today renders `KidExtraLogger` — the row above — AND, higher up the page,
// `UnifiedCaptureCard`'s *Capture → Quick logs* panel, whose eight chips were
// hardcoded in that component. FEAT-199 made the lower one family-defined and
// left the upper one alone, so the owner flagged *Packing* and *Independent
// play*, opened his son's Today page, looked at the first quick-log panel he
// came to, and reported the new activities "don't show as options anywhere". He
// was reading the surface FEAT-199 did not touch.
//
// Two paths to one product means one is always behind — and the one nearer the
// top of the page is the one the user finds. So the capture panel resolves from
// the same flag, through this module, and a family chip appears on both.
//
// ── Reconciling the two shapes ──────────────────────────────────────────────
//
// They genuinely differ, and neither was wrong for its own surface: the logger's
// row is FLAT chips carrying a subject; the capture panel is GROUPED presets
// carrying an emoji, a subject and a suggested duration that pre-fills its
// duration field. What they share is the ANSWER to one question — *which of the
// family's activities are offered as a quick log* — so that is what is shared
// (`familyQuickLogActivities`), and each surface projects it into its own shape.
// Sharing the flag rather than the widget is what keeps the panel's duration
// field and the row's XP award from having to become the same thing.
//
// ── The two rails, and why they land differently on the two surfaces ────────
//
// `QUICK_LOG_MAX_CHIPS` and the always-last `🎮 Other` are rules about a KID
// PICKING FROM ONE ROW on a phone, and `resolveQuickLogChips` is byte-for-byte
// unchanged, cap and escape hatch included. The capture panel is a different
// object: grouped, headed, wrapping, and with no `Other` chip at all (its escape
// hatch is the free-text field beneath). So the cap applies there to the FAMILY
// group only — a family that flags twenty configs still gets a bounded group —
// and the eight built-in presets are never dropped to make room. Dropping *Zoo /
// museum trip* from a parent's capture card to fit a family chip would be a
// regression traded for a feature, which is not the trade being made here.

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

  // The shared answer — "which of the family's activities are offered as a
  // quick log" — has one definition, which the capture panel reads too (UX-184).
  for (const activity of familyQuickLogActivities(configs)) {
    push({
      label: activity.label,
      subject: activity.subject,
      key: `config:${activity.id}`,
      fromFamily: true,
    })
  }

  for (const chip of DEFAULT_QUICK_LOG_CHIPS) push(chip)

  // The cap leaves one slot for `Other`, which is then appended unconditionally.
  return [...row.slice(0, QUICK_LOG_MAX_CHIPS - 1), OTHER_QUICK_LOG_CHIP]
}

// ── The shared answer, and the capture panel's projection of it ─────────────

/**
 * One of the family's own activities, offered as a quick log.
 *
 * The shape BOTH surfaces are built from: the config's own name, its own
 * `subjectBucket` (never guessed from the name — a chip called "Packing" is
 * `PracticalArts` because the parent said so, and would otherwise land in
 * `Other`, which is the whole reason FEAT-199 exists) and its own
 * `defaultMinutes`.
 */
export interface FamilyQuickLogActivity {
  /** The config's `id` — a stable key on both surfaces. */
  id: string
  /** The config's own name, trimmed. Empty names are dropped by the resolver. */
  label: string
  subject: SubjectBucket
  /** The config's own `defaultMinutes`, for surfaces that suggest a duration. */
  minutes: number
}

/**
 * The family's flagged activities, in the order they should be offered.
 *
 * Flagged, uncompleted, sorted by the config's own `sortOrder`, nameless
 * configs dropped, and de-duped by label letters so a family cannot produce two
 * chips a kid reads as the same word. **Nothing surface-specific here** — no
 * cap, no defaults, no `Other`: those are each surface's own rule, applied by
 * its own resolver below.
 */
export function familyQuickLogActivities(
  configs: readonly ActivityConfig[],
): FamilyQuickLogActivity[] {
  const seen = new Set<string>()
  const out: FamilyQuickLogActivity[] = []
  const flagged = configs
    .filter(offersQuickLog)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  for (const config of flagged) {
    const label = (config.name ?? '').trim()
    const key = quickLogLabelKey(label)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push({
      id: config.id,
      label,
      subject: config.subjectBucket ?? 'Other',
      // Narrowed rather than trusted: `defaultMinutes` is typed `number` but
      // arrives from unvalidated Firestore, and a stored `null`/`"20"`/`NaN`
      // would reach the capture panel's duration field and render there. Zero
      // means "suggest nothing", which the field already handles. (The same
      // structural-narrowing rule ARCH-47 slice 4 applied to the hours fold.)
      minutes: Number.isFinite(config.defaultMinutes) ? Number(config.defaultMinutes) : 0,
    })
  }
  return out
}

/**
 * One chip on `UnifiedCaptureCard`'s *Quick logs* panel.
 *
 * `emoji` is optional and absent on family chips **on purpose**: picking one for
 * "Packing" would mean matching an emoji to a word, which is guessing at the
 * family's meaning in exactly the way the subject bucket is not allowed to. A
 * chip that reads *Packing* is honest; a chip that reads *📦 Packing* is the app
 * deciding what packing looks like.
 */
export interface CapturePreset {
  id: string
  label: string
  emoji?: string
  subjectBucket: SubjectBucket
  suggestedMinutes: number
  /** True when this chip came from one of the family's activity configs. */
  fromFamily: boolean
}

export interface CapturePresetGroup {
  label: string
  presets: CapturePreset[]
}

/** The heading the family's own chips sit under, beside *Creative* and *Active*. */
export const FAMILY_CAPTURE_GROUP_LABEL = 'Yours'

/**
 * The capture panel's built-in presets — byte-for-byte the eight that were
 * written into `UnifiedCaptureCard`, in their two groups, in order.
 *
 * These labels are a stored data shape for the same reason the row's defaults
 * are: the capture form writes the label into the artifact title and the hours
 * note, so renaming one forks a family's history. Held to that by
 * `quickLogChips.test.ts`; not to be reworded.
 */
export const BUILT_IN_CAPTURE_GROUPS: readonly CapturePresetGroup[] = [
  {
    label: 'Creative',
    presets: [
      { id: 'lego', label: 'Lego build', emoji: '🧱', subjectBucket: 'PracticalArts', suggestedMinutes: 45, fromFamily: false },
      { id: 'baking', label: 'Baking / cooking', emoji: '🥖', subjectBucket: 'PracticalArts', suggestedMinutes: 30, fromFamily: false },
      { id: 'drawing', label: 'Drawing / art', emoji: '🎨', subjectBucket: 'Art', suggestedMinutes: 30, fromFamily: false },
      { id: 'music', label: 'Music practice', emoji: '🎵', subjectBucket: 'Music', suggestedMinutes: 20, fromFamily: false },
      { id: 'reading', label: 'Reading session', emoji: '📚', subjectBucket: 'Reading', suggestedMinutes: 30, fromFamily: false },
    ],
  },
  {
    label: 'Active',
    presets: [
      { id: 'nature', label: 'Nature / park', emoji: '🌳', subjectBucket: 'Science', suggestedMinutes: 45, fromFamily: false },
      { id: 'sports', label: 'Sports / PE', emoji: '⚽', subjectBucket: 'PE', suggestedMinutes: 45, fromFamily: false },
      { id: 'fieldtrip', label: 'Zoo / museum trip', emoji: '🦁', subjectBucket: 'Science', suggestedMinutes: 120, fromFamily: false },
    ],
  },
]

/**
 * The groups the capture panel shows: the family's own first, then the built-ins.
 *
 * Guarantees:
 *   - the family group leads, because a family's own words are what a person is
 *     looking for, and it is omitted entirely when nothing is flagged (a
 *     family that has flagged nothing sees exactly what it saw before);
 *   - a family chip whose label matches a built-in's is dropped rather than
 *     shown twice — the built-in keeps its emoji and its suggested minutes;
 *   - the family group is capped at `QUICK_LOG_MAX_CHIPS`; the eight built-ins
 *     are never dropped (see the header for why the cap lands differently here
 *     than on the logger's single row);
 *   - every family chip's subject and minutes come from its own config.
 */
export function resolveCapturePresetGroups(
  configs: readonly ActivityConfig[],
): CapturePresetGroup[] {
  const builtInLabelKeys = new Set(
    BUILT_IN_CAPTURE_GROUPS.flatMap((g) => g.presets.map((p) => quickLogLabelKey(p.label))),
  )
  const family = familyQuickLogActivities(configs)
    .filter((a) => !builtInLabelKeys.has(quickLogLabelKey(a.label)))
    .slice(0, QUICK_LOG_MAX_CHIPS)
    .map<CapturePreset>((a) => ({
      id: `config:${a.id}`,
      label: a.label,
      subjectBucket: a.subject,
      suggestedMinutes: a.minutes,
      fromFamily: true,
    }))

  return [
    ...(family.length > 0
      ? [{ label: FAMILY_CAPTURE_GROUP_LABEL, presets: family }]
      : []),
    ...BUILT_IN_CAPTURE_GROUPS,
  ]
}
