/**
 * Foundations Review Chat — deterministic concept walk order (FEAT-51, slice 2a).
 *
 * The Review Chat (§11 of `docs/LEARNER_MODEL_DESIGN.md`) walks a child's concepts
 * one at a time. **The order is computed here, client-side, deterministically** —
 * the LLM is *handed* the ordered list and follows it; it never invents the order
 * (§11.1). Keeping the ranker pure and unit-tested is what makes the walk
 * reproducible and reviewable.
 *
 * The rule (§11.1):
 *   1. **frontier** concepts first — the active working edge, most worth confirming.
 *   2. then **forming** concepts — partial evidence, the next most uncertain.
 *   3. then **not-yet** concepts ranked by how many downstream nodes they block
 *      (`underlies` fan-out, descending) — establishing a high-fan-out foundation
 *      resolves the most of the graph.
 *   4. **solid** concepts are skipped entirely — the chat never re-litigates a
 *      concept with strong standing evidence ("skip anything with fresh strong
 *      evidence, never re-litigate a recent `solid`").
 *
 * Ties within a tier break by fan-out (desc), then band (earlier first — foundations
 * before later skills), then id (stable). This module is pure: no Firestore, no
 * graph import beyond the nodes passed in.
 */

import type { ConceptStateEntry, ConceptStateKind } from '../types/learnerModel'
import type { Band, ConceptNode } from './types'

/** Walk tier for each reviewable state; `solid` is excluded from the walk. */
const STATE_TIER: Record<Exclude<ConceptStateKind, 'solid'>, number> = {
  frontier: 0,
  forming: 1,
  'not-yet': 2,
}

/** Lower numeric bound of a band string, for the band tie-break ('K'→0, '1-2'→1). */
function bandRank(band: Band): number {
  const first = band.split('-')[0]
  return first === 'K' ? 0 : Number(first)
}

/**
 * Transitive `underlies` fan-out for every node: the count of *distinct* downstream
 * concepts each node ultimately blocks. Memoized DFS over the in-domain edge set
 * (the curated graphs keep `underlies` in-domain and acyclic — FEAT-48 validated
 * both, so the recursion terminates and stays within `byId`).
 */
export function computeFanOut(nodes: ConceptNode[]): Record<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const memo = new Map<string, Set<string>>()

  const descendants = (id: string, seen: Set<string>): Set<string> => {
    const cached = memo.get(id)
    if (cached) return cached
    const out = new Set<string>()
    const node = byId.get(id)
    if (!node || seen.has(id)) return out
    seen.add(id)
    for (const child of node.underlies) {
      if (!byId.has(child)) continue // defensive: cross-domain / stale edge
      out.add(child)
      for (const d of descendants(child, seen)) out.add(d)
    }
    seen.delete(id)
    memo.set(id, out)
    return out
  }

  const result: Record<string, number> = {}
  for (const node of nodes) result[node.id] = descendants(node.id, new Set()).size
  return result
}

/**
 * Compute the ordered list of concept ids the Review Chat should walk for one
 * domain. `nodes` are that domain's concept nodes; `conceptStates` is the stored
 * model's `conceptStates` map (missing entries are treated as `not-yet` —
 * unseeded is "we haven't seen it"). `solid` concepts are omitted.
 *
 * Deterministic: same inputs → same order, every time.
 */
export function computeReviewPriority(
  nodes: ConceptNode[],
  conceptStates: Record<string, ConceptStateEntry | undefined>,
): string[] {
  const fanOut = computeFanOut(nodes)

  const stateOf = (id: string): ConceptStateKind =>
    conceptStates[id]?.state ?? 'not-yet'

  return nodes
    .filter((n) => stateOf(n.id) !== 'solid')
    .sort((a, b) => {
      const ta = STATE_TIER[stateOf(a.id) as Exclude<ConceptStateKind, 'solid'>]
      const tb = STATE_TIER[stateOf(b.id) as Exclude<ConceptStateKind, 'solid'>]
      if (ta !== tb) return ta - tb
      // fan-out descending (blocks the most downstream first)
      if (fanOut[b.id] !== fanOut[a.id]) return fanOut[b.id] - fanOut[a.id]
      // earlier band first (foundations before later skills)
      const ba = bandRank(a.band)
      const bb = bandRank(b.band)
      if (ba !== bb) return ba - bb
      return a.id.localeCompare(b.id) // stable final tie-break
    })
    .map((n) => n.id)
}
