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
 * The ladder, for the one authored goal.
 *
 * Written to be read aloud by `useTTS` at its kid rate, so each line is one
 * sentence or two short ones, with no parentheses, no numbers spelled as
 * digits-in-words, and no words a seven-year-old would stop on. The block is
 * named exactly as the editor labels it — *set life to 3* — because a hint that
 * describes a block in different words than the screen uses is a hint that
 * sends him looking for something that is not there.
 */
export const BUILD_STUDIO_HINTS: readonly BuildStudioHint[] = [
  {
    rung: 1,
    text: 'Your goal is to give your hero one more life. Look in the on start blocks.',
  },
  {
    rung: 2,
    text: 'Find the block that says set life to 3. It is the one with the heart word in it.',
  },
  {
    rung: 3,
    text: 'The 3 in set life to 3 is how many tries your hero gets. Tap the 3.',
  },
  {
    rung: 4,
    text: 'Now type a bigger number instead of the 3. Before you press play, tell me what you think will happen.',
  },
  {
    rung: 5,
    text: 'Press play and count the hearts at the top. Did you get what you expected?',
  },
]

/** How many rungs there are. Derived, never typed twice. */
export const BUILD_STUDIO_HINT_COUNT = BUILD_STUDIO_HINTS.length

/**
 * What the goal line says on screen. The goal's own title, so the heading, the
 * spoken hints and the saved version's `goalId` are all about one thing.
 */
export const BUILD_STUDIO_GOAL_LINE = `Your job: ${BUILD_STUDIO_GOAL.title.toLowerCase()}.`

/** Said when there are no rungs left. Honest, and not a telling-off. */
export const BUILD_STUDIO_HINTS_DONE =
  'That is all the hints I have. Try it and see what happens — you can always change it back.'

/**
 * The hint for a rung count already given.
 *
 * `given` is how many have been heard so far, so `nextHint(0)` is rung 1.
 * Returns `null` past the last rung rather than repeating the last one, which
 * is what lets the caller say {@link BUILD_STUDIO_HINTS_DONE} instead of
 * looping a line he has already heard.
 */
export function nextHint(given: number): BuildStudioHint | null {
  if (!Number.isInteger(given) || given < 0) return BUILD_STUDIO_HINTS[0]
  return BUILD_STUDIO_HINTS[given] ?? null
}

/**
 * What *Hear it* reads out: the goal, then the numbers worth knowing about.
 *
 * Separate from the hint ladder on purpose — "read me the goal again" is not a
 * hint, and tapping it should not move the ladder on.
 */
export function goalSpeech(): string[] {
  return [BUILD_STUDIO_GOAL_LINE, `Look for the block that says ${BUILD_STUDIO_GOAL.blockLabel}.`]
}
