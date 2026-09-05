/**
 * A look, spelled out — the house shape for making an art style specific.
 *
 * Introduced by FEAT-159 for the "Make it fancy" sticker picker, where eight of
 * nine surfaced options rendered the *same* dominant sentence and differed only
 * by one short theme line. The prompts were never literally identical — the
 * routing was fine — but the model had almost nothing to separate them by, which
 * is why Cartoon, Fantasy and Blocky came back looking alike. Naming **palette,
 * line weight and shading** for each look is what makes them tell apart at a
 * glance.
 *
 * FEAT-174 found the same near-collapse on the book-illustration surface: three
 * of the six styles a parent can pick (Comic Book, Storybook, Realistic) named
 * only adjectives — "bold", "dynamic", "soft colors", "warm lighting" — while
 * the other three named concrete visual nouns (blocks, pea shooters, green
 * pipes). The adjective-only three drifted toward one generic children's-book
 * look, so "Comic Book" did not read as comic. Both surfaces now share this one
 * definition of what a look is, so a style added to either has to answer the
 * same three questions.
 */
export interface VisualRecipe {
  /** Fits the slot "Create a polished children's book illustration ___,". */
  hint: string;
  /** One-line identity of the look. */
  summary: string;
  palette: string;
  line: string;
  shading: string;
  /**
   * The shading clause to use instead of {@link shading} when the picture is
   * rendered as a transparent cutout (FEAT-193 / UX-162).
   *
   * A cutout has no ground and no background, and the prompt says so outright
   * ("no ground, no shadows on the ground"). A recipe whose shading asks for a
   * cast, drop or long shadow is therefore asking for the one thing the same
   * prompt removes — the model is handed a contradiction and resolves it however
   * it likes, so the look a parent picked arrives diluted. Three sticker looks
   * did exactly this: `adventure` ("strong cast shadows"), `faith` ("long soft
   * shadows") and `science` ("a single soft light-grey drop shadow").
   *
   * The fix is not to drop the shading — it is to describe the same light
   * falling **on the subject**, which is what survives a cutout. Set this only
   * where the two genuinely differ; a recipe whose shading is already
   * cutout-safe leaves it unset and {@link shading} is used on both paths.
   */
  shadingCutout?: string;
}

/**
 * The palette / line / shading clauses, as one prompt fragment.
 *
 * `transparent` selects {@link VisualRecipe.shadingCutout} where a recipe has
 * one — the cutout paths (every "Make it fancy" sticker, and the sticker style
 * in `generateImage`) get shading that describes light on the subject rather
 * than a shadow on a ground that has been removed.
 */
export function recipeDetail(
  recipe: VisualRecipe,
  opts?: { transparent?: boolean },
): string {
  const shading =
    opts?.transparent && recipe.shadingCutout
      ? recipe.shadingCutout
      : recipe.shading;
  return (
    `Palette: ${recipe.palette} ` +
    `Line work: ${recipe.line} ` +
    `Shading: ${shading} `
  );
}

/**
 * The mediums a look can name, and the words that name them (FEAT-193 / UX-179).
 *
 * **Why a medium, specifically.** The owner reported that Cartoon and Fantasy
 * came back looking like variations of one thing. Measured, the two recipes
 * share **no** palette word at all — the collapse was not lexical. What they
 * shared was the *medium*: both said watercolor washes under a soft ink line,
 * and they were the only two of nine options that did. Medium is the axis a
 * viewer reads first, and on the sticker surface it is the axis that survives:
 * the picture is a re-draw of the child's own drawing, so the palette is largely
 * the drawing's, whatever the recipe says.
 *
 * So a picker's options must not share one. {@link recipeMediums} is the scan
 * that makes that testable, and the tests in `enhanceSketch.test.ts` /
 * `generateImage.test.ts` assert it per picker — the assertion that would have
 * caught this pair, and the one that stops the next look collapsing into its
 * neighbour.
 *
 * The lexicon names **materials**, not adjectives: "flat fills" is not a medium
 * (two looks can both be flat and still read as different materials), while
 * gouache, marker and airbrush are.
 */
export const MEDIUM_TERMS: Record<string, readonly string[]> = {
  watercolor: ["watercolor", "watercolour"],
  gouache: ["gouache"],
  acrylic: ["acrylic"],
  oil: ["oil paint", "oil-paint", "oil painting"],
  "colored pencil": ["coloured pencil", "colored pencil", "pencil crayon"],
  pencil: ["pencil"],
  "chalk pastel": ["chalk pastel", "soft pastel"],
  "oil pastel": ["oil pastel"],
  crayon: ["crayon"],
  marker: ["marker", "felt-tip", "felt tip"],
  airbrush: ["airbrush", "airbrushed"],
  ink: ["translucent ink", "layered ink", "brush ink"],
  "screen print": ["halftone", "screen-print", "screenprint", "screen print"],
  "cut paper": ["cut-paper", "cut paper", "collage"],
  vector: ["vector"],
  "technical pen": ["technical pen"],
  voxel: ["pixel", "voxel", "cube face", "cubes"],
} as const;

/**
 * Every medium a recipe names, read off its palette / line / shading text (both
 * shading variants, so a cutout rewrite cannot quietly drop a look's medium).
 *
 * Longest-phrase-first, and a match on a longer phrase consumes it, so
 * "coloured pencil" is read as `colored pencil` and never also as `pencil`.
 */
export function recipeMediums(recipe: VisualRecipe): string[] {
  let text = [
    recipe.palette,
    recipe.line,
    recipe.shading,
    recipe.shadingCutout ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const entries = Object.entries(MEDIUM_TERMS).flatMap(([medium, words]) =>
    words.map((word) => ({ medium, word })),
  );
  entries.sort((a, b) => b.word.length - a.word.length);

  const found = new Set<string>();
  for (const { medium, word } of entries) {
    if (text.includes(word)) {
      found.add(medium);
      text = text.split(word).join(" ");
    }
  }
  return [...found].sort();
}
