/**
 * Catalog price display (FEAT-81). `priceCents` of `0` (or missing/invalid)
 * reads as "No price yet" — a draft promoted from a roster starts unpriced,
 * since pricing is parent-only (design §2/§6). Positive cents render as `$X.XX`.
 */
export function formatPriceCents(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return 'No price yet'
  return `$${(cents / 100).toFixed(2)}`
}
