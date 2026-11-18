/**
 * The helper, and the one thing it can do: talk (LOCAL-BUILD-001).
 *
 * ── The helper NEVER edits source ──────────────────────────────────────────
 *
 * This module is **pure data and one pure selector**. It imports nothing from
 * the Arcade bridge, holds no reference to an iframe and has no way to post a
 * message, so "the hint cannot change his program" is a property of the file
 * rather than a promise about a handler. `buildStudioHints.test.ts` pins that
 * by scanning this source for `postMessage`, `importproject` and the bridge
 * module, and `BuildStudioPage`'s own test asserts that tapping Hint sends no
 * editor message and leaves the source untouched.
 *
 * ── Why authored, and why escalating ───────────────────────────────────────
 *
 * There is no dynamic AI here: no model call, no generated prose, no provider,
 * no paid anything. Five written lines, in order, each one more specific than
 * the last, ending in a question rather than the answer — because the thing
 * worth having is his prediction, not the number 4. He can stop at any rung,
 * and running out of hints says so plainly instead of inventing a sixth.
 *
 * ── It is not a score ──────────────────────────────────────────────────────
 *
 * The rung index is UI state for one visit. Nothing persists it, nothing reads
 * it back, no streak, no level, no meter, no reward. A child who taps Hint five
 * times has not lost anything, and the page does not tell him he has.
 */

import { BUILD_STUDIO_GOAL } from './buildStudioStarter'

export interface BuildStudioHint {
  /** 1-based rung, for an `aria-label` and for the "hint 2 of 5" line. */
  rung: number
  /** What the helper says, and what TTS speaks — one string, both. */
  text: string
}

/**
 * The number currently in the life block, when the app has read the open
 * source. `null` when it has not, which is a real state — before the import
 * round trip comes back, and for any project whose source could not be read.
 */
export type OpenLifeValue = number | null

/**
 * How to name the life block right now.
 *
 * **The reason this is a function and not a constant.** The first draft hard
 * coded *set life to 3*, so after reopening a version he had already changed to
 * 4 the helper kept telling him to find a block that is not on his screen —
 * which is the one thing the wording rule exists to prevent. The label is now
 * read from the source the editor actually has.
 */
export function lifeBlockLabel(lives: OpenLifeValue): string {
  return lives === null
    ? 'set life to'
    : `${BUILD_STUDIO_GOAL.blockLabelPrefix} ${lives}`
}

/**
 * The ladder, for the one authored goal, said about the project that is open.
 *
 * Written to be read aloud by `useTTS` at its kid rate: one sentence or two
 * short ones per rung, no parentheses, and no words a seven-year-old would stop
 * on. The block is named exactly as the editor labels it, with the number the
 * editor is showing — a hint that describes a block in different words than the
 * screen uses sends him looking for something that is not there.
 *
 * Pure, and derived per call rather than stored, so a reopened version cannot
 * be described by a stale ladder.
 */
export function buildStudioHints(lives: OpenLifeValue): readonly BuildStudioHint[] {
  const label = lifeBlockLabel(lives)
  // "one more" needs a number to be one more THAN. Without one, the instruction
  // stays relative rather than inventing a target.
  const bigger = lives === null ? 'a bigger number' : `${lives + 1}`
  return [
    {
      rung: 1,
      text: 'Your goal is to give your hero one more life. Look in the on start blocks.',
    },
    {
      rung: 2,
      text: `Find the block that says ${label}. It is the one with the heart word in it.`,
    },
    {
      rung: 3,
      text:
        lives === null
          ? `The number in ${label} is how many tries your hero gets. Tap that number.`
          : `The ${lives} in ${label} is how many tries your hero gets. Tap the ${lives}.`,
    },
    {
      rung: 4,
      text: `Now type ${bigger} instead. Before you press play, tell me what you think will happen.`,
    },
    {
      rung: 5,
      text: 'Press play and count the hearts at the top. Did you get what you expected?',
    },
  ]
}

/** How many rungs there are. Derived from the ladder, never typed twice. */
export const BUILD_STUDIO_HINT_COUNT = buildStudioHints(null).length

/**
 * What the goal line says on screen. The goal's own title, so the heading, the
 * spoken hints and the saved version's `goalId` are all about one thing.
 */
export const BUILD_STUDIO_GOAL_LINE = `Your job: ${BUILD_STUDIO_GOAL.title.toLowerCase()}.`

/** Said when there are no rungs left. Honest, and not a telling-off. */
export const BUILD_STUDIO_HINTS_DONE =
  'That is all the hints I have. Try it and see what happens — you can always change it back.'

/**
 * The hint for a rung count already offered, about the project that is open.
 *
 * `given` is how many have been offered so far, so `nextHint(0, lives)` is rung
 * 1. Returns `null` past the last rung rather than repeating the last one,
 * which is what lets the caller say {@link BUILD_STUDIO_HINTS_DONE} instead of
 * looping a line he has already had.
 */
export function nextHint(given: number, lives: OpenLifeValue): BuildStudioHint | null {
  const ladder = buildStudioHints(lives)
  if (!Number.isInteger(given) || given < 0) return ladder[0]
  return ladder[given] ?? null
}

/**
 * Read the life number out of a project's `main.ts`.
 *
 * The TypeScript rather than the Blocks, because it is the half that is one
 * canonical line, and both halves of a matched project carry the same number.
 * `null` for anything it cannot read — never a guess, and never the starter's
 * 3 as a default, which is exactly the stale answer this replaces.
 */
export function readOpenLifeValue(mainTs: string | undefined): OpenLifeValue {
  if (!mainTs) return null
  const match = mainTs.match(/info\.setLife\((\d+)\)/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isSafeInteger(value) ? value : null
}

/**
 * What *Hear it* reads out: the goal, and the block to look for.
 *
 * Separate from the hint ladder on purpose — "read me the goal again" is not a
 * hint, and tapping it should not move the ladder on.
 */
export function goalSpeech(lives: OpenLifeValue): string[] {
  return [
    BUILD_STUDIO_GOAL_LINE,
    `Look for the block that says ${lifeBlockLabel(lives)}.`,
  ]
}
