// ── Upload grounding filter (FEAT-53, slice 2b) ──────────────────────────
//
// The division of labor for a mid-chat curriculum upload (design §11.3):
//   • the LLM is trusted for the POSITION — which peak the screenshot shows;
//   • the bridge (`bridgeEvidenceForPosition`) is the authority for the MAPPING —
//     which reading-graph concepts that peak legitimately covers.
//
// So after the model returns its batch of `covered` proposals, we RE-GROUND them:
// for every proposal against a *bridged* source (Fast Phonics), we recompute the
// authoritative concept set for the extracted peak and DROP any proposal whose
// conceptId is not in that set. This catches model over-reach (e.g. proposing
// `longVowels` — Peak 18 content — for a Peak-13 child); the bridge, not the LLM,
// decides the mapping. Proposals for un-bridged sources, and `attest`/`queueTest`
// proposals (incl. work-sample attestations, amendment C), pass through untouched —
// only peak-mapped curriculum-position claims are ground-filtered.
//
// This runs on EVERY assistant turn (upload or plain chat), so a conversational
// "we did Peak 8 in Fast Phonics" is grounded identically. It is a no-op whenever
// no bridged-source `covered` proposal is present.

import { bridgeEvidenceForPosition, bridgeForSource } from '../../core/foundations'
import type { FoundationsReviewAction } from './foundationsReviewActions'

/** Parse a completed-peak number (1–20) out of a `unit` string like "Peak 13". */
export function parsePeakFromUnit(unit?: string): number | null {
  if (!unit) return null
  const m = unit.match(/peak\s*(\d+)/i) ?? unit.match(/\b(\d{1,2})\b/)
  if (!m) return null
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null
}

export interface GroundedProposals {
  kept: FoundationsReviewAction[]
  /** Proposals the bridge rejected — surfaced for logging / debugging, not staged. */
  dropped: Array<{ action: FoundationsReviewAction; reason: string }>
}

/**
 * Ground a batch of parsed review actions against the bridge. Pure — no I/O.
 * Currently only Fast Phonics has a bridge (`bridgeEvidenceForPosition`); this
 * generalizes cleanly when more sources land (each returns its own concept set).
 */
export function groundCoveredProposals(
  actions: FoundationsReviewAction[],
): GroundedProposals {
  // Pass 1 — the extracted POSITION per bridged source = the max completed peak
  // seen across its covered proposals (positions are cumulative).
  const maxPeakBySource = new Map<string, number>()
  for (const a of actions) {
    if (a.kind !== 'covered') continue
    const bridge = bridgeForSource(a.source)
    if (!bridge) continue
    const peak = parsePeakFromUnit(a.unit)
    if (peak === null) continue
    const prev = maxPeakBySource.get(bridge.source)
    if (prev === undefined || peak > prev) maxPeakBySource.set(bridge.source, peak)
  }

  // Pass 2 — filter covered proposals for bridged sources to the authoritative set.
  const allowedBySource = new Map<string, Set<string>>()
  for (const [source, peak] of maxPeakBySource) {
    allowedBySource.set(source, new Set(bridgeEvidenceForPosition(peak).map((e) => e.conceptId)))
  }

  const kept: FoundationsReviewAction[] = []
  const dropped: GroundedProposals['dropped'] = []
  for (const a of actions) {
    if (a.kind !== 'covered') {
      kept.push(a) // attest / queueTest — never ground-filtered
      continue
    }
    const bridge = bridgeForSource(a.source)
    if (!bridge) {
      kept.push(a) // un-bridged source — a single generic covered, kept as-is
      continue
    }
    const allowed = allowedBySource.get(bridge.source)
    if (!allowed) {
      // Bridged source but no parseable peak anywhere — can't ground; keep the
      // proposal rather than silently drop a legitimate claim.
      kept.push(a)
      continue
    }
    if (allowed.has(a.conceptId)) kept.push(a)
    else dropped.push({ action: a, reason: `not covered by the extracted ${bridge.source} position` })
  }

  return { kept, dropped }
}
