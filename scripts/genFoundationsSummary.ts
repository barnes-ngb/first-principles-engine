/**
 * Codegen: emit the server-side foundations graph SUMMARY from the client graphs.
 *
 * The Cloud Functions build cannot import the client foundations TS module
 * (`src/core/foundations/`), so the synthesis task + the `learnerModel` context
 * slice read a compact, machine-generated mirror at
 * `functions/src/ai/data/foundationsGraphSummary.ts` (FEAT-57, Phase 3a).
 *
 * Re-run whenever the client graph changes, then commit the regenerated file:
 *   npx tsx scripts/genFoundationsSummary.ts
 *
 * `foundationsGraphSummary.test.ts` pins internal consistency of the output.
 */
import { writeFileSync } from 'node:fs'
import { foundationGraphs, foundationGraphVersion } from '../src/core/foundations'

const nodes = foundationGraphs.flatMap((g) => g.nodes)
const rows = nodes
  .map((n) => {
    const desc = JSON.stringify(n.parentDescription)
    const kid = JSON.stringify(n.kidName)
    const und = JSON.stringify(n.underlies)
    return `  { id: ${JSON.stringify(n.id)}, domain: ${JSON.stringify(n.domain)}, band: ${JSON.stringify(n.band)}, kidName: ${kid}, parentDescription: ${desc}, underlies: ${und} },`
  })
  .join('\n')

const out = `/**
 * Server-side foundations concept-graph SUMMARY (FEAT-57, Learner Model Phase 3a).
 *
 * A compact, read-only mirror of the client foundations spine
 * (\`src/core/foundations/{readingGraph,mathGraph}.ts\`) so the Cloud Functions —
 * which cannot import the client TS module — can name concepts in plain words when
 * they synthesize (\`learnerSynthesis\`) and format the \`learnerModel\` context slice.
 *
 * DELIBERATE DUPLICATION (same pattern as \`sanitizeJson.ts\`). This file is
 * MACHINE-GENERATED from the client graphs by \`scripts/genFoundationsSummary.ts\` —
 * do not hand-edit. If the client graph changes, re-run the generator and commit
 * the result; \`foundationsGraphSummary.test.ts\` pins internal consistency.
 * // TODO: consolidate — share one graph source across client + functions.
 *
 * Graph version at generation: ${foundationGraphVersion()}
 */

export interface FoundationSummaryNode {
  id: string;
  domain: "reading" | "math";
  band: string;
  kidName: string;
  parentDescription: string;
  underlies: string[];
}

export const FOUNDATIONS_GRAPH_VERSION = ${JSON.stringify(foundationGraphVersion())};

export const FOUNDATION_SUMMARY_NODES: FoundationSummaryNode[] = [
${rows}
];

/** Flat id → node lookup across both domains. */
export const FOUNDATION_SUMMARY_MAP: Record<string, FoundationSummaryNode> =
  Object.fromEntries(FOUNDATION_SUMMARY_NODES.map((n) => [n.id, n]));

/** The concept nodes for one domain, in spine order. */
export function summaryNodesForDomain(
  domain: "reading" | "math",
): FoundationSummaryNode[] {
  return FOUNDATION_SUMMARY_NODES.filter((n) => n.domain === domain);
}
`

writeFileSync(
  new URL('../functions/src/ai/data/foundationsGraphSummary.ts', import.meta.url),
  out,
)
console.log(`Wrote ${nodes.length} nodes to functions/src/ai/data/foundationsGraphSummary.ts`)
