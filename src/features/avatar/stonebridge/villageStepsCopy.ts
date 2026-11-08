/**
 * The village's repair NUMBER, in words — one definition for all three surfaces.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 *
 * The counter a child meets on the board, in a location visit and on the Hero
 * Hub card was rendered three times as `N / M done`, with no word for what the
 * numbers are and three different sentences nearby guessing at it. "N / M done"
 * invites exactly one reading — *N books finished* — and that is not what is
 * counted: `countReadingActions` counts non-diamond `BOOK_READ` **and**
 * `QUEST_COMPLETE` rows (Knowledge Mine quests, Math included), and the
 * reader's `BOOK_READ` carries its own book/day dedup, so an opened book may
 * add nothing and a finished quest may add one. A number a child has to guess
 * at is a number a parent has to translate.
 *
 * So the unit is named — **steps** — and the one place it is named is here.
 *
 * ── The rules this copy must keep true ───────────────────────────────────────
 *
 *   • a step is a *credited* book read or a *finished* Mine quest, never a page,
 *     never a minute, never a visit and never an opened book;
 *   • both sources are named, because naming only reading is what made the old
 *     framing misleading for a child whose last step came from the Mine;
 *   • "can add" is the honest verb: the writers dedup and the counter excludes
 *     per-answer diamond rows, so no copy here promises a step for an action;
 *   • a whole-child count cannot name WHICH trip earned a step, so nothing here
 *     claims one did;
 *   • no quota, no shame and no mastery: the capstone's done state has no
 *     number at all, and these strings are never shown once it is reached.
 *
 * ── Why these words and not the drafted ones ─────────────────────────────────
 *
 * The approved label is verbatim. The two drafted sentences — *"Book reading and
 * finished Mine quests can add steps."* and *"Opening a book may not add one."* —
 * are kept in meaning and reworded, which the brief allows for readability,
 * because the repo's kid bar (`src/test/kidReadability.ts`, FEAT-178/186) is a
 * hard check here and both failed it: nine words in the first, and *finished*
 * (fin·ish·ed) and *Opening* (o·pen·ing) are three syllables by its proxy. Every
 * string below passes that bar — `villageStepsCopy.test.ts` runs the same
 * shared helper over all of them — and no fact was dropped to get there: the
 * read, the finished quest, the hedge and the opened-book caveat are each still
 * said, one short sentence apiece.
 *
 * Pure strings and pure functions: no Firestore, no progress read, no state, no
 * writes. Reading this file, opening its help or dismissing it records nothing.
 */

/** The unit a repair is counted in. One word, so a child can hold it. */
export const VILLAGE_STEP_UNIT = 'steps'

/**
 * The full label — the visible legend that gives every compact number its unit.
 *
 * The approved wording, held to the kid bar as the label it is: eight words,
 * nothing over two syllables.
 */
export function villageStepsLabel(current: number, target: number): string {
  return `Village steps for this repair: ${current} / ${target}`
}

/**
 * The compact form, for a tile or a map legend row sitting UNDER the full label.
 *
 * It still carries the unit word, so a number that has scrolled away from the
 * legend is not a bare pair of digits again.
 */
export function villageStepsCompact(current: number, target: number): string {
  return `${current} / ${target} ${VILLAGE_STEP_UNIT}`
}

/**
 * The default line, always visible beside the number — no tap required.
 *
 * Both sources, hedged. This is the sentence that has to work on its own for a
 * child who never opens the help below, so it uses the board's own verb (*fix*,
 * as in *Being fixed now.*) rather than a second word for the same thing.
 */
export const VILLAGE_STEPS_LINE = 'Reading and quests can help fix this place.'

/** The optional explanation's control. A question, because it answers one. */
export const VILLAGE_STEPS_HELP_LABEL = 'What adds steps?'

/**
 * The optional explanation — what adds a step, and what may not.
 *
 * The third line is the half that stops a child counting a step they did not
 * get, and it is deliberately the near-twin of the first: *a book you read*
 * against *a book you open*. Opening is not a credited read, and the reader's
 * own book/day dedup means a re-read on the same day adds nothing either.
 */
export const VILLAGE_STEPS_HELP_LINES = [
  'A book you read can add a step.',
  'A Mine quest you finish can add one.',
  'A book you open may add no step.',
] as const
