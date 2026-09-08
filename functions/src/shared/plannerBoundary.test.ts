import { describe, it, expect } from "vitest";
import {
  PLANNER_BOUNDARY_FALLBACK,
  PLANNER_BOUNDARY_JOBS,
  parsePlannerBoundary,
  plannerBoundaryJobById,
  plannerBoundaryRoutes,
  stripPlannerBoundaryMarkers,
} from "./plannerBoundary.js";

describe("the job table", () => {
  it("has a unique id, a covers line, a route and a label on every job", () => {
    const ids = new Set<string>();
    for (const job of PLANNER_BOUNDARY_JOBS) {
      expect(job.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(job.id)).toBe(false);
      ids.add(job.id);
      expect(job.covers.trim().length).toBeGreaterThan(0);
      expect(job.route.startsWith("/")).toBe(true);
      expect(job.linkLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it("routes to a bare path — never a query string the router table cannot be checked against", () => {
    for (const route of plannerBoundaryRoutes()) {
      expect(route).not.toContain("?");
      expect(route).not.toContain("#");
    }
  });

  it("resolves a job id case- and space-insensitively, and nothing else", () => {
    expect(plannerBoundaryJobById("curriculum")?.id).toBe("curriculum");
    expect(plannerBoundaryJobById("  CURRICULUM ")?.id).toBe("curriculum");
    expect(plannerBoundaryJobById("dad-lab")?.id).toBe("dad-lab");
    expect(plannerBoundaryJobById("schedule-settings")).toBeNull();
    expect(plannerBoundaryJobById("")).toBeNull();
    expect(plannerBoundaryJobById(undefined)).toBeNull();
  });
});

describe("parsePlannerBoundary — the marker is a hint, not a gate", () => {
  it("reads a named job and strips the marker", () => {
    const raw =
      "I can't change curriculum from here — that's Ask AI.\n\nMeanwhile I can shape this week: want Wednesday light?\n\n[[BOUNDARY:curriculum]]";
    const parsed = parsePlannerBoundary(raw);
    expect(parsed.destination?.id).toBe("curriculum");
    expect(parsed.destination?.route).toBe("/chat");
    expect(parsed.text).not.toContain("[[");
    expect(parsed.text).toContain("want Wednesday light?");
  });

  it("falls back to Ask AI when the marker names a job nobody has heard of", () => {
    const parsed = parsePlannerBoundary("Can't do that.\n[[BOUNDARY:schedule-settings]]");
    expect(parsed.destination).toEqual(PLANNER_BOUNDARY_FALLBACK);
    expect(parsed.text).toBe("Can't do that.");
  });

  it("falls back to Ask AI when the marker names nothing at all", () => {
    const parsed = parsePlannerBoundary("Can't do that.\n[[BOUNDARY]]");
    expect(parsed.destination).toEqual(PLANNER_BOUNDARY_FALLBACK);
  });

  it("offers no link at all when the reply carries no marker", () => {
    const parsed = parsePlannerBoundary("Here's the updated plan for Wednesday.");
    expect(parsed.destination).toBeNull();
    expect(parsed.text).toBe("Here's the updated plan for Wednesday.");
  });

  it("treats an empty or absent reply as no marker", () => {
    expect(parsePlannerBoundary("")).toEqual({ text: "", destination: null });
    expect(parsePlannerBoundary(null)).toEqual({ text: "", destination: null });
    expect(parsePlannerBoundary(undefined)).toEqual({ text: "", destination: null });
  });
});

describe("parsePlannerBoundary — nothing raw ever reaches a rendered sentence", () => {
  const shapes = [
    "[[BOUNDARY:curriculum]]",
    "[[ BOUNDARY : curriculum ]]",
    "[[boundary:curriculum]]",
    "[[BOUNDARY curriculum]]",
    "[[BOUNDARY]]",
    "[[BOUNDARY:]]",
    "[[BOUNDARY: ]]",
  ];

  for (const shape of shapes) {
    it(`strips ${shape} and still declares a boundary`, () => {
      const parsed = parsePlannerBoundary(`Sorry, not from here.\n\n${shape}`);
      expect(parsed.text).toBe("Sorry, not from here.");
      expect(parsed.text).not.toContain("[[");
      expect(parsed.text).not.toMatch(/BOUNDARY/i);
      expect(parsed.destination).not.toBeNull();
    });
  }

  it("strips a marker the model truncated at the end of the reply", () => {
    const parsed = parsePlannerBoundary("Sorry, not from here.\n\n[[BOUNDARY:curric");
    expect(parsed.text).toBe("Sorry, not from here.");
    // Unreadable, so it is the general link — never a guessed destination.
    expect(parsed.destination).toEqual(PLANNER_BOUNDARY_FALLBACK);
  });

  it("leaves a parent's own square brackets mid-sentence alone", () => {
    const raw = "Your note said [see BOUNDARY notes] — I've kept it on Tuesday.";
    const parsed = parsePlannerBoundary(raw);
    expect(parsed.text).toBe(raw);
    expect(parsed.destination).toBeNull();
  });

  it("strips every marker when a model emits more than one, and takes the first named job", () => {
    const parsed = parsePlannerBoundary(
      "No to both.\n[[BOUNDARY:records]]\nand also\n[[BOUNDARY:settings]]",
    );
    expect(parsed.text).not.toContain("[[");
    expect(parsed.destination?.id).toBe("records");
  });

  it("prefers the first RECOGNISED job when an earlier marker names nothing", () => {
    const parsed = parsePlannerBoundary("No.\n[[BOUNDARY]]\n[[BOUNDARY:records]]");
    expect(parsed.destination?.id).toBe("records");
  });

  it("does not leave a hole where the marker was", () => {
    const parsed = parsePlannerBoundary("First line.\n\n[[BOUNDARY:today]]\n\nSecond line.");
    expect(parsed.text).toBe("First line.\n\nSecond line.");
  });

  it("stripPlannerBoundaryMarkers is the same strip, callable on its own", () => {
    expect(stripPlannerBoundaryMarkers("Nope.\n[[BOUNDARY:records]]")).toBe("Nope.");
    expect(stripPlannerBoundaryMarkers(undefined)).toBe("");
  });
});
