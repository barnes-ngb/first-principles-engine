/**
 * FEAT-108 (batch photo capture): the tiny presentation helper for the summary
 * toast shown after the extra pages of a batch are saved.
 *
 * A batch capture runs photo #1 through the full unified-capture pipeline (the
 * one photo that registers/links/advances the workbook), then saves photos
 * 2..N as evidence-only artifacts on the same item. `n` is the count of those
 * extra pages that saved successfully; this renders the one message that stands
 * in for their per-photo toasts.
 *
 * Pure and side-effect free so it can be unit-tested in isolation.
 */
export function batchExtraSummary(n: number): string {
  return `+${n} more page${n === 1 ? '' : 's'} saved`
}
