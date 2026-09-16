/**
 * Server-side foundations concept-graph SUMMARY (FEAT-57, Learner Model Phase 3a).
 *
 * A compact, read-only PROJECTION of the foundations spine so the Cloud Functions
 * can name concepts in plain words when they synthesize (`learnerSynthesis`) and
 * format the `learnerModel` context slice.
 *
 * **It is no longer a copy (UX-296).** This file used to be a hand-committed,
 * machine-generated mirror of the client graphs — 60 node literals emitted by
 * `scripts/genFoundationsSummary.ts`, which a re-curation had to remember to
 * re-run, and whose test could only pin the mirror's own internal consistency.
 * Nothing compared the two definitions, so a forgotten regeneration would have
 * left this slice naming concepts the model no longer had, with no failing test.
 *
 * The spine now lives in `functions/src/shared/foundations/`, compiled by BOTH
 * projects (the ARCH-47 rule), and these exports are derived from it at module
 * load. The obsolete `scripts/genFoundationsSummary.ts` generator is retired;
 * it would overwrite this derivation with literals again.
 *
 * The projection itself is DELIBERATE and unchanged — the server reads six fields
 * per node, in spine order, with `band` as a plain `string`, and holds no seeding
 * or state logic. It copies each node's `underlies` rather than aliasing it, so a
 * server-side reader can never reach into the canonical graph.
 */

import {
  allFoundationNodes,
  foundationGraphVersion,
} from "../../shared/foundations/graph.js";

export interface FoundationSummaryNode {
  id: string;
  domain: "reading" | "math";
  band: string;
  kidName: string;
  parentDescription: string;
  underlies: string[];
}

/** e.g. `"reading@1+math@1"` — the tag stored on `LearnerModel.graphVersion`. */
export const FOUNDATIONS_GRAPH_VERSION = foundationGraphVersion();

export const FOUNDATION_SUMMARY_NODES: FoundationSummaryNode[] =
  allFoundationNodes.map((n) => ({
    id: n.id,
    domain: n.domain,
    band: n.band,
    kidName: n.kidName,
    parentDescription: n.parentDescription,
    underlies: [...n.underlies],
  }));

/** Flat id → node lookup across both domains. */
export const FOUNDATION_SUMMARY_MAP: Record<string, FoundationSummaryNode> =
  Object.fromEntries(FOUNDATION_SUMMARY_NODES.map((n) => [n.id, n]));

/** The concept nodes for one domain, in spine order. */
export function summaryNodesForDomain(
  domain: "reading" | "math",
): FoundationSummaryNode[] {
  return FOUNDATION_SUMMARY_NODES.filter((n) => n.domain === domain);
}
