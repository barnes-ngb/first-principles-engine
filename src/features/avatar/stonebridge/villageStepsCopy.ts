/**
 * The village's repair NUMBER, in words — one definition for all three surfaces.
 *
 * The counter was rendered three times as `N / M done`, which named no unit.
 * What it counts is non-diamond `BOOK_READ` **and** `QUEST_COMPLETE` rows
 * (Knowledge Mine quests, Math included); the reader's `BOOK_READ` carries its
 * own book/day dedup. So the unit is named — **steps** — once, here.
 *
 * What this copy must keep true:
 *
 *   • a step is a *credited* book read or a *finished* Mine quest — never a
 *     page, a minute, a visit or an opened book;
 *   • both sources are named, since a step may come from either;
 *   • "can add" is the honest verb: the writers dedup and the counter excludes
 *     per-answer diamond rows, so no copy promises a step for an action;
 *   • a whole-child count cannot name WHICH trip earned a step;
 *   • no quota and no mastery claim — the capstone's done state carries no
 *     number, and none of this is shown once it is reached.
 *
 * The approved label is verbatim. The two drafted help sentences are kept in
 * meaning and reworded, which the brief allows for readability: the repo's kid
 * bar (`src/test/kidReadability.ts`) is a hard check here and both failed it —
 * nine words in the first, and *finished* and *Opening* are three syllables by
 * its proxy. The read, the finished quest, the hedge and the opened-book caveat
 * are each still said.
 *
 * Pure strings and pure functions: no Firestore, no progress read, no state, no
 * writes.
 */

/** The unit a repair is counted in. One word, so a child can hold it. */
export const VILLAGE_STEP_UNIT = 'steps'

/** The full label — the visible legend that gives a compact number its unit. */
export function villageStepsLabel(current: number, target: number): string {
  return `Village steps for this repair: ${current} / ${target}`
}

/**
 * The compact form, for a tile or a map legend row under the full label. It
 * carries the unit word, so it stands on its own away from the legend.
 */
export function villageStepsCompact(current: number, target: number): string {
  return `${current} / ${target} ${VILLAGE_STEP_UNIT}`
}

/**
 * The default line, always visible beside the number — no tap required.
 *
 * Both sources, hedged, in the board's own verb (*fix*, as in *Being fixed
 * now.*) rather than a second word for the same thing.
 */
export const VILLAGE_STEPS_LINE = 'Reading and quests can help fix this place.'

/** The optional explanation's control. A question, because it answers one. */
export const VILLAGE_STEPS_HELP_LABEL = 'What adds steps?'

/**
 * The optional explanation — what adds a step, and what may not.
 *
 * The third line is the near-twin of the first on purpose (*a book you read*
 * against *a book you open*): opening is not a credited read, and the reader's
 * book/day dedup means a same-day re-read adds nothing either.
 */
export const VILLAGE_STEPS_HELP_LINES = [
  'A book you read can add a step.',
  'A Mine quest you finish can add one.',
  'A book you open may add no step.',
] as const
