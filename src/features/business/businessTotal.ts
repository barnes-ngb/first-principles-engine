import type { BusinessLogEntry } from '../../core/types/business'

/**
 * Derived money-in total for the Barnes Bros business (FEAT-30).
 *
 * The running total is ALWAYS computed by summing the additive `businessLog` —
 * it is never stored as a mutable balance. This is the load-bearing invariant
 * the chunk-3 thermometer climbs on: because entries are append-only and
 * amounts are non-negative, the total can only ever climb.
 *
 * Defensive against malformed data: non-finite or negative amounts are floored
 * to 0 so a single bad entry can never drag the meter down.
 */
export function sumBusinessLog(entries: readonly BusinessLogEntry[]): number {
  return entries.reduce((total, entry) => {
    const amount = entry.amount
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return total
    }
    return total + amount
  }, 0)
}

/**
 * Derived CONFIRMED money-in total (FEAT-30 chunk 4).
 *
 * Only entries a parent has OK'd (`confirmed === true`) count — this is the
 * honest figure the thermometer climbs on. A missing/`undefined` `confirmed`
 * is treated as PENDING and excluded, so any pre-chunk-4 entry stays uncounted
 * until confirmed. Shares the same defensive amount handling as
 * `sumBusinessLog` (non-finite / negative amounts floor to 0).
 */
export function sumConfirmedBusinessLog(entries: readonly BusinessLogEntry[]): number {
  return sumBusinessLog(entries.filter((entry) => entry.confirmed === true))
}

/** Format a dollar amount for kid-facing display (e.g. `$15`, `$8.50`). */
export function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '$0'
  const whole = Number.isInteger(amount)
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
}
