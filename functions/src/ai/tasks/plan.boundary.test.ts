import { describe, it, expect } from "vitest";
import { buildPlannerBoundarySection } from "./plan.js";
import {
  PLANNER_BOUNDARY_JOBS,
  PLANNER_BOUNDARY_MARKER_EXAMPLE,
  PLANNER_BOUNDARY_MARKER_UNPLACED,
  parsePlannerBoundary,
} from "../../shared/plannerBoundary.js";

/**
 * The planner prompt's boundary section (UX-269).
 *
 * These assert the two things that make the link possible: the model is shown
 * every job id the client can resolve, and the marker shapes the prompt
 * demonstrates are shapes the parser actually accepts. A prompt that teaches a
 * syntax the parser misses puts `[[BOUNDARY:…]]` into a sentence Shelly reads.
 */
describe("buildPlannerBoundarySection", () => {
  const section = buildPlannerBoundarySection();

  it("names every job id the client can resolve", () => {
    for (const job of PLANNER_BOUNDARY_JOBS) {
      expect(section).toContain(`- ${job.id} —`);
      expect(section).toContain(job.covers);
    }
  });

  it("shows a marker the parser accepts, with its job", () => {
    const parsed = parsePlannerBoundary(`No.\n${PLANNER_BOUNDARY_MARKER_EXAMPLE}`);
    expect(parsed.destination?.id).toBe("curriculum");
    expect(parsed.text).toBe("No.");
    expect(section).toContain(PLANNER_BOUNDARY_MARKER_EXAMPLE);
  });

  it("shows an id-less marker the parser accepts as the general fallback", () => {
    const parsed = parsePlannerBoundary(`No.\n${PLANNER_BOUNDARY_MARKER_UNPLACED}`);
    expect(parsed.destination?.route).toBe("/chat");
    expect(parsed.text).toBe("No.");
    expect(section).toContain(PLANNER_BOUNDARY_MARKER_UNPLACED);
  });

  it("forbids inventing a screen, a URL or a path", () => {
    expect(section).toMatch(/NEVER name a screen, tab, setting or menu of your own/);
    expect(section).toMatch(/Do NOT write a URL or a path/);
  });

  it("forbids claiming the change was made, or that it is coming", () => {
    expect(section).toMatch(/NEVER say you have made one of those changes/);
    expect(section).toMatch(/NEVER say one is coming/);
  });

  it("requires the offer to follow the refusal", () => {
    expect(section).toMatch(/what you CAN do for the week instead/);
  });

  it("keeps the marker out of a plan response", () => {
    expect(section).toMatch(/NEVER anywhere inside a JSON plan response/);
  });

  it("stays short — it competes with eleven other sections and a strict-JSON instruction", () => {
    // The guard measures the PROSE, not the section: the job list grows with
    // the table (and grew by three when Codex's P1 split the three topics at
    // Ask AI's capability boundary), and a cap that has to be raised every time
    // a job is added stops meaning anything. What must not creep is the rule
    // written around the list.
    const lines = section.split("\n");
    const jobLines = lines.filter((l) => /^- [a-z-]+ — /.test(l));
    expect(jobLines).toHaveLength(PLANNER_BOUNDARY_JOBS.length);
    expect(lines.length - jobLines.length).toBeLessThanOrEqual(20);
  });
});
