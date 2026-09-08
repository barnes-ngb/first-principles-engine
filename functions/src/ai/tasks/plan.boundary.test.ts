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
  // Phrases wrap across the prompt's hand-wrapped lines, so assert against a
  // whitespace-collapsed copy: a rule that re-wraps is not a rule that changed.
  const flat = section.replace(/\s+/g, " ");

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
    expect(flat).toMatch(/NEVER name a screen, tab, setting or menu of your own/);
    expect(flat).toMatch(/never write a URL or a path/i);
  });

  it("forbids claiming the change was made, or that it is coming", () => {
    expect(flat).toMatch(/NEVER say you have made one of those changes/);
    expect(flat).toMatch(/NEVER say one is coming/);
  });

  it("requires the offer to follow the refusal", () => {
    expect(flat).toMatch(/what you CAN do for the week instead/);
  });

  it("keeps the marker out of a plan response", () => {
    expect(flat).toMatch(/NEVER inside a JSON plan response/);
  });

  it("protects the planner's OWN job from the boundary (Codex round 2, P1)", () => {
    // The free-form drawer's placeholder advertises "add a science project on
    // Thursday". Without this carve-out, "ADDING an activity" on the job list
    // could make the model refuse the one thing this chat is for.
    expect(flat).toMatch(/item on a DAY of this week's draft is YOUR OWN job/);
    expect(flat).toMatch(/never refuse it and never emit a marker for it/i);
  });

  it("never lets a generate request come back as a refusal (Codex round 2, P2)", () => {
    // The rule rides every `TaskType.Plan` call, generation included, so a job
    // typed into the setup card's notes could otherwise draw a refusal where a
    // week was asked for — which the generate paths read as a broken plan.
    expect(flat).toMatch(/GENERATE or ADJUST the week is never one of those jobs/);
    expect(flat).toMatch(/Always return the plan/);
  });

  it("sends nobody anywhere to un-finish an activity (Codex round 2, P1)", () => {
    expect(flat).toMatch(/Un-finishing an activity is not in this app at all/);
    expect(flat).toMatch(/emit NO marker: there is nowhere to send her/);
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
    expect(lines.length - jobLines.length).toBeLessThanOrEqual(21);
  });
});
