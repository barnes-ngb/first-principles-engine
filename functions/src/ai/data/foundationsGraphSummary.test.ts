import { describe, expect, it } from "vitest";
import {
  FOUNDATION_SUMMARY_MAP,
  FOUNDATION_SUMMARY_NODES,
  FOUNDATIONS_GRAPH_VERSION,
  summaryNodesForDomain,
} from "./foundationsGraphSummary.js";

/**
 * Pins internal consistency of the MACHINE-GENERATED server-side graph summary
 * (mirror of the client foundations spine — regenerate via
 * `scripts/genFoundationsSummary.ts`). It cannot cross the client/functions build
 * boundary, so it checks the invariants that matter for synthesis: unique ids,
 * in-graph edges, plain-language names, and both domains present.
 */
describe("foundationsGraphSummary", () => {
  it("has the expected shape and version tag", () => {
    expect(FOUNDATION_SUMMARY_NODES.length).toBe(60);
    expect(FOUNDATIONS_GRAPH_VERSION).toMatch(/^reading@\d+\+math@\d+$/);
  });

  it("has unique ids and both domains", () => {
    const ids = FOUNDATION_SUMMARY_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(summaryNodesForDomain("reading").length).toBeGreaterThan(0);
    expect(summaryNodesForDomain("math").length).toBeGreaterThan(0);
    expect(
      summaryNodesForDomain("reading").length + summaryNodesForDomain("math").length,
    ).toBe(FOUNDATION_SUMMARY_NODES.length);
  });

  it("keeps every `underlies` edge in-graph and in-domain", () => {
    for (const n of FOUNDATION_SUMMARY_NODES) {
      for (const child of n.underlies) {
        const target = FOUNDATION_SUMMARY_MAP[child];
        expect(target, `${n.id} → ${child} must exist`).toBeDefined();
        expect(target.domain).toBe(n.domain);
      }
    }
  });

  it("carries a plain-language kidName + description per node (no band numbers)", () => {
    for (const n of FOUNDATION_SUMMARY_NODES) {
      expect(n.kidName.trim()).toBeTruthy();
      expect(n.parentDescription.trim()).toBeTruthy();
      expect(n.kidName).not.toMatch(/band\s*\d/i);
      expect(n.kidName).not.toMatch(/level\s*\d/i);
    }
  });
});
