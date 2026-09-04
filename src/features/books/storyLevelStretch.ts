/**
 * The per-story "one step up" (FEAT-191).
 *
 * ## Why it exists
 *
 * Since FEAT-176 every story is written AND measured against one number — the
 * child's assessed `workingLevels.phonics`. That is the right default, and it is
 * why London stopped getting books he could not read. It is also a ceiling with
 * exactly one lever: the assessed level itself. The owner report (Nathan,
 * 2026-09-04) is the other end of the same rule — Lincoln's book read *"Tom had
 * a map. He was in the hut."* and *"the Lincoln words are very simple and he is
 * past this."* There was no way to ask for harder: a revise of "make it more
 * advanced" is vetoed by the READING LEVEL block, which outranks every other
 * instruction in the prompt by design.
 *
 * So there are two levers, and this is the second one:
 *   - **The assessed level** (Skill Snapshot → Working Levels) — the lasting fix
 *     when a child has genuinely moved up. Every story after it is written there.
 *   - **This**, per story, for the good day: write THIS book one or two rungs
 *     above and see how it reads.
 *
 * ## What it is not
 *
 * It never writes a level. Nothing here touches `skillSnapshots`; the next story
 * with no stretch is written at the child's own level again. That is the whole
 * point of it being per-story — it is a reach, not a reassessment, and the honest
 * line on the draft says which one happened.
 *
 * Pure: no I/O, no React, no Firestore.
 */

/** The steps a parent may ask for. Mirrors the server's `MAX_LEVEL_STRETCH`. */
export const LEVEL_STRETCH_VALUES = [0, 1, 2] as const
export type LevelStretch = (typeof LEVEL_STRETCH_VALUES)[number]

export const DEFAULT_LEVEL_STRETCH: LevelStretch = 0
export const MAX_LEVEL_STRETCH = 2

/**
 * Coerce a stored / restored value into a usable stretch. Anything that is not
 * one of the three — absent, a string, `NaN`, 7 — is the default, because a
 * stretch is only ever an explicit parent choice.
 */
export function normalizeLevelStretch(raw: unknown): LevelStretch {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LEVEL_STRETCH
  const rounded = Math.min(MAX_LEVEL_STRETCH, Math.max(0, Math.round(n)))
  return rounded as LevelStretch
}

/**
 * "one step up" / "two steps up" — the same phrase the server's prompt block
 * uses, so the control, the draft line and the prompt all say one thing.
 */
export function levelStretchPhrase(stretch: number): string {
  return normalizeLevelStretch(stretch) === 1 ? 'one step up' : 'two steps up'
}

/**
 * The label for the "at their own level" option.
 *
 * The name, not a pronoun. The `Child` record carries no pronoun field, and a
 * pronoun guessed from a name is a guess about a real child that this app has no
 * business making — the same reason nothing here branches on a literal name
 * (FEAT-183). A name is also simply clearer on a surface a parent may be using
 * for either boy.
 */
export function ownLevelLabel(childName: string): string {
  const name = childName.trim()
  return name ? `${name}'s level` : 'Their level'
}

export interface LevelStretchOption {
  value: LevelStretch
  label: string
  /** The one-line "what this does" under the strip. */
  hint: string
}

/**
 * The three choices, in order. Default first — a parent who taps nothing gets
 * the child's own level, which is every story before this run.
 */
export function levelStretchOptions(childName: string): LevelStretchOption[] {
  const name = childName.trim() || 'this reader'
  return [
    {
      value: 0,
      label: ownLevelLabel(childName),
      hint: `Written at the reading level on ${name}'s Skill Snapshot.`,
    },
    {
      value: 1,
      label: 'One step up',
      hint: `One rung above ${name}'s level, just for this book.`,
    },
    {
      value: 2,
      label: 'Two steps up',
      hint: `Two rungs above ${name}'s level, just for this book.`,
    },
  ]
}

/** The caption above the strip. */
export const LEVEL_STRETCH_CAPTION = 'How hard are the words?'

/**
 * The one line under the strip that says where the lasting change lives — so a
 * parent reaching for this every single time learns that the answer is the
 * assessed level, not this control. The rest of the explanation is in the
 * surface's "?" sheet (FEAT-178), not in a paragraph inside a book dialog.
 */
export const LEVEL_STRETCH_FOOTNOTE =
  'Just this book — it never changes the level on the Skill Snapshot.'

/**
 * What the option a parent has selected does, for the strip's live hint.
 * `''` is never returned: every value has a line.
 */
export function levelStretchHint(stretch: number, childName: string): string {
  const value = normalizeLevelStretch(stretch)
  const option = levelStretchOptions(childName).find((o) => o.value === value)
  return option?.hint ?? ''
}
