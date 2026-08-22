/**
 * The week-energy toggle's labels, in one place (UX-68).
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
 * Strings only: no state, no behavior. The `full` label carries the configured
 * daily hours, so it is a function rather than a constant.
 */
export function weekEnergyLabel(
  value: 'full' | 'lighter' | 'mvd',
  hoursPerDay: number,
): string {
  switch (value) {
    case 'full':
      return `Normal (${Math.round(hoursPerDay * 10) / 10}h/day)`
    case 'lighter':
      return 'Lighter'
    case 'mvd':
      return 'Tough (Minimum Viable Day)'
  }
}
