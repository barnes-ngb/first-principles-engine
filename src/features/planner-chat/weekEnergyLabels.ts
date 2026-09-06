/**
 * The week-energy toggle's labels and its question, in one place (UX-68).
 *
 * The wizard and the compact setup render the same three choices and used to
 * word them differently — "Full Week (2.5h/day) / Lighter Week / Tough Week
 * (MVD)" in one, "Normal (2.5h/day) / Lighter / Tough (MVD)" in the other. Same
 * toggle, same values, two vocabularies one screen apart.
 *
 * Two decisions are baked in here:
 *  - **"Normal"**, not "Full" — it is the word `PlanTypeLabel` already uses for
 *    the same idea everywhere else in the app.
 *  - **"Minimum Viable Day" spelled out**, not "MVD" — the acronym is internal
 *    shorthand and appears nowhere else in parent-facing copy.
 *
 * Strings only: no state, no behavior.
 */

/**
 * One of the three week-energy choices, as a word.
 *
 * ── UX-238: they are peers, and only one of them carried a number ──
 * `full` used to read *"Normal (4.8h/day)"* while the other two were bare words,
 * so the first option looked like the real one and the other two like reductions
 * of it. Worse, that figure is **derived** — the planner's `hoursPerDay` is a
 * re-parse of the routine prose the app itself wrote (UX-206) — so a computed
 * artifact sat on a toggle button, in the slot where a parent reads an option's
 * *value*, as though it were a setting she had chosen.
 *
 * The number is not lost: `PlanSummaryPanel` states the day's minutes once,
 * where a summary belongs. Here the three choices are three words.
 */
export function weekEnergyLabel(value: 'full' | 'lighter' | 'mvd'): string {
  switch (value) {
    case 'full':
      return 'Normal'
    case 'lighter':
      return 'Lighter'
    case 'mvd':
      return 'Tough (Minimum Viable Day)'
  }
}

/**
 * The one wording of the question above that toggle (UX-236).
 *
 * The wizard asked *"How's this week looking?"* and the compact setup asked
 * *"How's the week looking?"* — the same control, the same three answers, two
 * sentences one screen apart, differing only on whether a prior plan existed.
 * UX-68 pulled the option labels into this file for exactly that reason and left
 * the question itself behind.
 */
export const WEEK_ENERGY_QUESTION = "How's this week looking?"
