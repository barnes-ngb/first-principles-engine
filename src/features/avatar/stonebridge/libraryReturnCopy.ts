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
