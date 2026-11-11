/**
 * What the way back says, as pure copy — the `makeBookDoor.ts` precedent.
 *
 * Separate from the component for two reasons. It is held to the shared kid
 * readability bar (`src/test/kidReadability.ts`), and a bar is only enforceable
 * against something importable without mounting a tree. And the words are a
 * decision, not styling: a child reads them with nobody beside him.
 *
 * Neither line names Stonebridge or the Library, and that is the bar doing its
 * job rather than vagueness — the readability proxy counts three syllables in
 * both words, and "your village" is what a six-year-old reads. The castle emoji
 * beside the line is the thing that says *which* village, which is also how the
 * village card and the board already title themselves.
 */

/** Why this control is here at all. A sentence, so it ends in a full stop. */
export const LIBRARY_RETURN_LINE = 'You came from your village.'

/** The control itself. A label, so no full stop. */
export const LIBRARY_RETURN_LABEL = 'Back to your village'

// ── The town's Mine invitation, and the way back from it (UX-493) ───────────
//
// Same module, same bar, for the same reason: a child reads these alone. The
// line says there is something to do and nothing else — no level, no count, no
// state word and no reason addressed to a parent. The two action labels name a
// MODE of digging, never a question, because the invitation chooses a mode.

/** Why the invitation is there. A sentence, so it ends in a full stop. */
export const MINE_INVITATION_LINE = 'Your mine has a dig for you.'

/** Into the reading mode. A label, so no full stop. */
export const MINE_READING_DIG_LABEL = 'Try a reading dig'

/** Into the math mode. */
export const MINE_MATH_DIG_LABEL = 'Try a math dig'

/**
 * The way back from the Mine trip, offered in the Mine's intro and summary.
 *
 * Deliberately NOT {@link LIBRARY_RETURN_LABEL}'s words: the shelf's control and
 * this one can never be on screen together, but they are two different journeys
 * and a shared label would make one test pass for the other.
 */
export const MINE_RETURN_LABEL = 'Back to village'
