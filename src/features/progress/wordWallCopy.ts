/**
 * Kid-facing Word Wall copy rules (FEAT-161, UX-49).
 *
 * Its own module rather than a helper inside `PatternSummary.tsx` because the
 * rule it encodes is testable without a render — and because the wall is the
 * one Progress surface a child reads, so its wording deserves to be pinned.
 */

import type { PatternSummary } from './useWordWall'

/**
 * The per-pattern progress line, e.g. `"60% · 2 still practicing"`.
 *
 * A zero percent is **never** rendered. The wall sits under a HelpStrip that
 * says "No grades", and a bare "0%" is the one number on it that reads as a
 * score — a deficit score, on the surface a child sees. Zero known words means
 * this pattern has not been started, not that the child failed it.
 *
 * With work in flight, the in-flight counts carry the line on their own; with
 * nothing at all, the line names the absence instead of quantifying it.
 */
export function patternProgressLine(p: PatternSummary): string {
  const parts: string[] = []
  if (p.masteryPercent > 0) parts.push(`${p.masteryPercent}%`)
  if (p.strugglingWords > 0) parts.push(`${p.strugglingWords} still practicing`)
  if (p.emergingWords > 0) parts.push(`${p.emergingWords} emerging`)
  if (parts.length === 0) return 'Not started yet'
  return parts.join(' · ')
}
