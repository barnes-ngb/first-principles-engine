/**
 * `hoursBySubject` on MonthStats is stored in minutes (sourced from per-item
 * `actualMinutes` accumulation and the `hours` collection's `minutes` field).
 * Conversion happens at display time so the underlying data keeps
 * integer-minute precision.
 */
export function formatSubjectMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`
}
