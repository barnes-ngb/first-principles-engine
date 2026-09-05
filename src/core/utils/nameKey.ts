// ── The one comparison key for a human-typed name (UX-205) ───────────────────
//
// Three places in the app already needed "are these two names the same thing to
// a person?" and each had written the same regex: the quick-log row's
// `quickLogLabelKey` (FEAT-199), Curriculum's scan-to-workbook matcher, and now
// the chat's duplicate-activity check. Three copies of a matching rule is three
// chances for two surfaces to disagree about whether a name is a duplicate, so
// the rule lives here once and the callers delegate.
//
// Pure, no I/O, no domain knowledge — it is a string rule, not a policy about
// activities or chips. What each caller DOES with a match stays the caller's.

/**
 * A name's letters and digits, lowercased — emoji, spaces, punctuation and
 * accents-as-punctuation dropped.
 *
 * `"📚 Reading"`, `"reading"` and `"Reading!"` all key the same. Deliberately
 * NOT fuzzy: `"Good and the Beautiful Math"` and `"The Good and the Beautiful
 * Math"` key differently, because they differ by a real word and no amount of
 * punctuation-stripping should collapse that. A looser near-match is a separate
 * decision with its own false positives (UX-207).
 *
 * Accepts a missing value so callers with optional fields need no guard.
 */
export function nameKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
