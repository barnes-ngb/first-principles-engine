/**
 * Life Day — the third plan type, as a pure module (FEAT-200).
 *
 * ── Why a third type rather than a lighter checklist ─────────────────────────
 *
 * `Normal` and `Mvd` are both **plans**: a checklist assembled in advance and
 * worked through. MVD is the floor of that shape — prayer/scripture, read-aloud,
 * math practice, a project, one sentence of reflection. Five planned things.
 *
 * What the owner described (2026-09-05) is not a lighter plan; it is a different
 * direction of travel. On these days nothing was planned and real learning
 * happened anyway — building blocks, going outside, the tablet, helping, packing
 * the house for a move — and the job is to **record** it, not to complete it. A
 * checklist is the wrong instrument for that however short you make it: an
 * unfinished list on a hard day is a reproach, and the charter is explicitly
 * no-shame. So Today renders a capture surface for a Life Day instead of a
 * checklist, and nothing on that surface can read as unfinished.
 *
 * ── Hours: the block carries the time, the chips carry the record ────────────
 *
 * A Life Day's hours are real hours and flow through the **existing** counting
 * path with no change to it. `functions/src/shared/hoursContributions.ts` was
 * read and NOT touched — this run adds a day type, never a new way to count a
 * minute. Concretely, against that module's own rule:
 *
 *  - the Life Day **block** carries `actualMinutes`, so `blockCountedMinutes`
 *    emits it as an ordinary day-log contribution at the block's location. That
 *    is the whole of the day's counted time.
 *  - the **chips** are completed checklist items with `estimatedMinutes: 0`.
 *    `checklistItemCountedMinutes` short-circuits on that explicit zero (`0 ??
 *    x` is `0`, and the labels carry no `"(Nm)"` suffix to parse), and the
 *    caller skips any contribution `<= 0`. So a chip records *what happened*
 *    and adds no minutes on top of the block. This is the point: the parent
 *    sets the time once, and tapping six chips does not silently inflate a
 *    compliance figure.
 *
 * Any checklist work the parent had already completed before marking the day a
 * Life Day still counts, as it always did — those minutes were real and the
 * relabelling does not erase them. The Life Day block is additive to them, which
 * is why `None` is an offered amount: it is the parent's escape hatch when the
 * day's time is already accounted for.
 *
 * ── Why the default understates on purpose ───────────────────────────────────
 *
 * The owner's range is "2 to 3 hours is reasonable". The default here is the
 * bottom of it. A default that overstates puts a number in the compliance record
 * that nobody chose; a default that understates is corrected by the parent who
 * did more, with one tap. Understating is the honest direction to be wrong in.
 *
 * ── Switching is a relabel, never a destruction ──────────────────────────────
 *
 * Switching *to* a Life Day writes only `dailyPlans.planType`. The day's
 * checklist and blocks are untouched — Today hides the checklist, it does not
 * delete it — so switching back restores the day exactly. Switching *away* from
 * a Life Day likewise leaves the Life Day block and chips in place: the hours
 * were real, and a day is not destroyed by relabelling it in either direction.
 *
 * ── The chip set ─────────────────────────────────────────────────────────────
 *
 * Defined here as a constant. FEAT-199 will make the family's quick-log chips
 * editable; when it lands, `LIFE_DAY_CHIPS` becomes the fallback the family's
 * own set overrides, and nothing on the Life Day surface has to change — every
 * function below takes the chip it is given.
 *
 * Pure — no Firestore, no React, no clock.
 */
import type { ChecklistItem, DayBlock, DayLog } from '../../core/types'
import { DayBlockType, LearningLocation, SubjectBucket } from '../../core/types/enums'

/**
 * The Life Day block's title. Load-bearing: it is this block's identity for
 * `dayWriteGuard`'s `blockKey` (`type::title`), so it must be stable across
 * edits — changing the minutes must find and update the same block rather than
 * appending a second one.
 */
export const LIFE_DAY_BLOCK_TITLE = 'Life Day'

/**
 * The default recorded time, in minutes. The bottom of the owner's 2–3h range,
 * deliberately — see the header.
 */
export const LIFE_DAY_DEFAULT_MINUTES = 120

/** The one-tap amounts, spanning the owner's range with a zero escape hatch. */
export const LIFE_DAY_MINUTE_CHOICES = [0, 60, 90, 120, 150, 180] as const

/** Short label for an amount. `0` is "None" — an amount, not an omission. */
export function lifeDayMinutesLabel(minutes: number): string {
  if (minutes <= 0) return 'None'
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** One thing that can be recorded as having happened. */
export interface LifeDayChip {
  /** Stable id. Never rendered — the label is what a person reads. */
  id: string
  label: string
  subjectBucket: SubjectBucket
}

/**
 * The starting chip set (see the header on FEAT-199). Buckets are chosen so a
 * Life Day's record lands in a truthful subject, but they carry no minutes, so
 * they never move a compliance figure.
 */
export const LIFE_DAY_CHIPS: readonly LifeDayChip[] = [
  { id: 'packing', label: '📦 Packing', subjectBucket: SubjectBucket.PracticalArts },
  { id: 'building', label: '🧱 Building', subjectBucket: SubjectBucket.Art },
  { id: 'outside', label: '🌳 Outside', subjectBucket: SubjectBucket.PE },
  { id: 'tablet', label: '📱 Tablet', subjectBucket: SubjectBucket.Other },
  { id: 'helping', label: '🤝 Helping', subjectBucket: SubjectBucket.PracticalArts },
  { id: 'reading', label: '📖 Reading', subjectBucket: SubjectBucket.Reading },
]

/**
 * The surface's own words. They say what a Life Day **is**, never what it
 * lacks, and they do not rank it against the other two types.
 */
export const LIFE_DAY_COPY = {
  /** The picker's description, and the card's opening line. */
  description: 'Today the day was the lesson. Record what happened.',
  timeHeading: 'Time today',
  chipsHeading: 'What happened?',
  noteLabel: 'Anything worth remembering?',
  notePlaceholder: 'Optional. One line is plenty.',
} as const

// ── Reading a day ────────────────────────────────────────────────────────────

/** The Life Day block on this day, if one has been written. */
export function findLifeDayBlock(dayLog: DayLog | null | undefined): DayBlock | undefined {
  return (dayLog?.blocks ?? []).find(
    (b) => b.type === DayBlockType.Other && b.title === LIFE_DAY_BLOCK_TITLE,
  )
}

/**
 * The minutes currently recorded for the day. Absent block → the default, so a
 * day the parent has just marked shows the honest floor before they touch
 * anything. An explicit `0` is respected as a choice, not treated as absent.
 */
export function lifeDayMinutes(dayLog: DayLog | null | undefined): number {
  const block = findLifeDayBlock(dayLog)
  if (!block) return LIFE_DAY_DEFAULT_MINUTES
  return block.actualMinutes ?? LIFE_DAY_DEFAULT_MINUTES
}

/** The ids of the chips already recorded on this day. */
export function recordedLifeDayChipIds(dayLog: DayLog | null | undefined): Set<string> {
  const labels = new Set(
    (dayLog?.checklist ?? [])
      .filter((i) => i.source === 'manual' && i.completed)
      .map((i) => i.label),
  )
  return new Set(LIFE_DAY_CHIPS.filter((c) => labels.has(c.label)).map((c) => c.id))
}

// ── Writing a day (pure transforms — the caller persists) ────────────────────

/**
 * The day with its Life Day block set to `minutes`. Updates the existing block
 * in place when there is one (identity preserved for the write guard), else
 * appends it. Every other block and the whole checklist are carried through
 * untouched — a Life Day never rebuilds a day.
 */
export function withLifeDayMinutes(dayLog: DayLog, minutes: number): DayLog {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0
  const blocks = dayLog.blocks ?? []
  const existing = findLifeDayBlock(dayLog)

  const block: DayBlock = {
    ...(existing ?? {}),
    type: DayBlockType.Other,
    title: LIFE_DAY_BLOCK_TITLE,
    subjectBucket: SubjectBucket.Other,
    location: LearningLocation.Home,
    source: 'manual',
    actualMinutes: safe,
  }

  return {
    ...dayLog,
    blocks: existing
      ? blocks.map((b) => (b === existing ? block : b))
      : [...blocks, block],
  }
}

/**
 * The day with `chip` recorded, or un-recorded if it already was. Recorded chips
 * are completed checklist items carrying an explicit `estimatedMinutes: 0` — see
 * the header: the block is the day's time, a chip is the record of what filled
 * it.
 *
 * Un-recording flips `completed` to `false` rather than removing the row. Two
 * reasons, and they agree: the row keeps its identity, so `dayWriteGuard` sees a
 * legitimate un-check (the parent's authority over their own day) instead of a
 * dropped completion; and an un-checked item contributes nothing to the hours
 * fold either way, so nothing is gained by deleting it.
 */
export function toggleLifeDayChip(dayLog: DayLog, chip: LifeDayChip): DayLog {
  const checklist = dayLog.checklist ?? []
  const existing = checklist.find((i) => i.label === chip.label)

  if (existing) {
    return {
      ...dayLog,
      checklist: checklist.map((i) =>
        i === existing ? { ...i, completed: !i.completed } : i,
      ),
    }
  }

  const item: ChecklistItem = {
    label: chip.label,
    completed: true,
    // Explicitly zero: the Life Day block already carries this day's minutes,
    // and a chip must never add to a compliance figure. See the header.
    estimatedMinutes: 0,
    subjectBucket: chip.subjectBucket,
    source: 'manual',
    category: 'choose',
    mvdEssential: false,
  }
  return { ...dayLog, checklist: [...checklist, item] }
}

/**
 * The day with its optional "worth remembering" line set. Clearing it leaves
 * `retro` undefined, which the days converter's `stripUndefined` drops.
 */
export function withLifeDayNote(dayLog: DayLog, note: string): DayLog {
  const trimmed = note.trim()
  return { ...dayLog, retro: trimmed === '' ? undefined : trimmed }
}
