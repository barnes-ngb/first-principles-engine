/**
 * Math concept graph — v1, transcribed verbatim from the OWNER-CURATED
 * `docs/foundations/MATH_GRAPH_V0.md` (2026-07-03). 29 nodes across 9 strands.
 *
 * THE definition now lives in `functions/src/shared/foundations/mathGraph.ts`,
 * compiled by BOTH this app and the Cloud Functions project (UX-296) — the nodes
 * moved verbatim, not a value changed. This file keeps its path and re-exports,
 * so `workbookBridge`, `tagConceptBridge`, `mathseedsBridge`, the barrel and the
 * graph tests are untouched.
 *
 * Do not reinterpret band boundaries or edges — this is a transcription (D3).
 * Strands 8 (Data & Graphs) and 9 (Patterns/Algebra/Problem Solving) are
 * evidence-only: no working-level ladder seeds them (the bootstrap seeder starts
 * them `not-yet`). `math.operations.regrouping` (repo L7) and
 * `math.operations.multiTables` (repo L8) sit in ordinary flow but seed **by node
 * id / ladder level, not by band** — see the seeder.
 */
export {
  mathGraph,
  MATH_GRAPH_VERSION,
} from '../../../functions/src/shared/foundations/mathGraph'
