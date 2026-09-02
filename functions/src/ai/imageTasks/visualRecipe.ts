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
}

/** The palette / line / shading clauses, as one prompt fragment. */
export function recipeDetail(recipe: VisualRecipe): string {
  return (
    `Palette: ${recipe.palette} ` +
    `Line work: ${recipe.line} ` +
    `Shading: ${recipe.shading} `
  );
}
