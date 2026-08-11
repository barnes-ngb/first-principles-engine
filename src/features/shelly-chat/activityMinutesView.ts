// ── Pure presenters for the setActivityMinutes confirm card (FEAT-135) ──
//
// Lives beside the card rather than inside it so the wording is unit-testable
// and the component file stays component-only (fast refresh).

/**
 * Plain-language "who does this hit" line for a `setActivityMinutes` card.
 *
 * A `'both'` config is shared, so changing its minutes changes it for every
 * child — the parent must read that BEFORE she taps, not discover it after.
 */
export function describeActivityAudience(
  configChildId: string,
  allChildNames: string[],
  actingChildName: string,
): string {
  if (configChildId !== 'both') return `Affects ${actingChildName} only.`
  const names = allChildNames.filter((n) => n.trim().length > 0)
  const list =
    names.length >= 2
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names[0] || 'every child'
  return `Shared activity — this changes it for ${list}.`
}
