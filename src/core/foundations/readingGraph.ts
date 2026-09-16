/**
 * Reading concept graph — v1, transcribed verbatim from the OWNER-CURATED
 * `docs/foundations/READING_GRAPH_V0.md` (2026-07-03). 31 nodes across 8 strands.
 *
 * THE definition now lives in `functions/src/shared/foundations/readingGraph.ts`,
 * compiled by BOTH this app and the Cloud Functions project (UX-296) — the nodes
 * moved verbatim, not a value changed. This file keeps its path and re-exports,
 * so `fastPhonicsBridge`, `workbookBridge`, `tagConceptBridge`, the barrel and the
 * graph tests are untouched.
 *
 * Do not reinterpret band boundaries or edges — this is a transcription (D3).
 * Any content change is a graph re-curation (a new doc + version bump), never an
 * inline edit, and it now happens in ONE file that both projects compile.
 */
export {
  readingGraph,
  READING_GRAPH_VERSION,
} from '../../../functions/src/shared/foundations/readingGraph'
