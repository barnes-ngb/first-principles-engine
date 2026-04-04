import { describe, expect, it } from "vitest";
import {
  compressEngagement,
  formatChildProfile,
  TASK_CONTEXT,
  CHARTER_PREAMBLE,
} from "./contextSlices.js";

// ── TASK_CONTEXT registry ──────────────────────────────────────

describe("TASK_CONTEXT", () => {
  it("plan includes all context slices", () => {
    expect(TASK_CONTEXT.plan).toContain("charter");
    expect(TASK_CONTEXT.plan).toContain("childProfile");
    expect(TASK_CONTEXT.plan).toContain("workbookPaces");
    expect(TASK_CONTEXT.plan).toContain("weekFocus");
    expect(TASK_CONTEXT.plan).toContain("hoursProgress");
    expect(TASK_CONTEXT.plan).toContain("engagement");
    expect(TASK_CONTEXT.plan).toContain("gradeResults");
    expect(TASK_CONTEXT.plan).toContain("bookStatus");
    expect(TASK_CONTEXT.plan).toContain("sightWords");
    expect(TASK_CONTEXT.plan).toContain("recentEval");
  });

  it("chat only includes charter and childProfile", () => {
    expect(TASK_CONTEXT.chat).toEqual(["charter", "childProfile"]);
  });

  it("evaluate does not include enriched context slices", () => {
    expect(TASK_CONTEXT.evaluate).toContain("charter");
    expect(TASK_CONTEXT.evaluate).toContain("childProfile");
    expect(TASK_CONTEXT.evaluate).toContain("sightWords");
    expect(TASK_CONTEXT.evaluate).not.toContain("workbookPaces");
    expect(TASK_CONTEXT.evaluate).not.toContain("engagement");
    expect(TASK_CONTEXT.evaluate).not.toContain("hoursProgress");
  });

  it("quest includes workbookPaces but not charter or enriched context", () => {
    expect(TASK_CONTEXT.quest).toContain("childProfile");
    expect(TASK_CONTEXT.quest).toContain("sightWords");
    expect(TASK_CONTEXT.quest).toContain("recentEval");
    expect(TASK_CONTEXT.quest).toContain("workbookPaces");
    expect(TASK_CONTEXT.quest).not.toContain("charter");
    expect(TASK_CONTEXT.quest).not.toContain("engagement");
  });
});

// ── compressEngagement ─────────────────────────────────────────

describe("compressEngagement", () => {
  it("returns empty string for empty input", () => {
    expect(compressEngagement([])).toBe("");
  });

  it("groups activities by dominant engagement", () => {
    const summaries = [
      { activity: "Reading Eggs", counts: { engaged: 5, okay: 1, struggled: 0, refused: 0 } },
      { activity: "Math worksheet", counts: { engaged: 1, okay: 3, struggled: 2, refused: 0 } },
    ];
    const result = compressEngagement(summaries);
    expect(result).toContain("ACTIVITY ENGAGEMENT SUMMARY");
    expect(result).toContain("Reading Eggs");
    expect(result).toContain("Math worksheet");
    expect(result).toContain("mostly positive");
    expect(result).toContain("mixed");
  });

  it("highlights best and lowest engagement activities", () => {
    const summaries = [
      { activity: "Art project", counts: { engaged: 6, okay: 0, struggled: 0, refused: 0 } },
      { activity: "Read-aloud", counts: { engaged: 4, okay: 1, struggled: 0, refused: 0 } },
      { activity: "Phonics drill", counts: { engaged: 0, okay: 1, struggled: 3, refused: 1 } },
    ];
    const result = compressEngagement(summaries);
    expect(result).toContain("Best engagement:");
    expect(result).toContain("Art project");
    expect(result).toContain("Lowest engagement:");
    expect(result).toContain("Phonics drill");
  });

  it("skips best/lowest when fewer than 2 activities have enough data", () => {
    const summaries = [
      { activity: "Solo activity", counts: { engaged: 1, okay: 0, struggled: 0, refused: 0 } },
    ];
    const result = compressEngagement(summaries);
    expect(result).not.toContain("Best engagement");
    expect(result).not.toContain("Lowest engagement");
  });
});

// ── formatChildProfile ─────────────────────────────────────────

describe("formatChildProfile", () => {
  it("includes name and grade", () => {
    const result = formatChildProfile({ name: "Lincoln", grade: "3rd" });
    expect(result).toContain("Name: Lincoln");
    expect(result).toContain("Grade: 3rd");
  });

  it("omits grade when not provided", () => {
    const result = formatChildProfile({ name: "London" });
    expect(result).toContain("Name: London");
    expect(result).not.toContain("Grade:");
  });

  it("includes priority skills", () => {
    const result = formatChildProfile({
      name: "Lincoln",
      prioritySkills: [{ tag: "reading.phonics", label: "Phonics", level: "Developing" }],
    });
    expect(result).toContain("Phonics (reading.phonics): Developing");
  });

  it("includes supports and stop rules", () => {
    const result = formatChildProfile({
      name: "Lincoln",
      supports: [{ label: "Visual checklist", description: "Step-by-step" }],
      stopRules: [{ label: "Frustration", trigger: "3 misses", action: "Switch" }],
    });
    expect(result).toContain("Visual checklist: Step-by-step");
    expect(result).toContain('Frustration: when "3 misses" → Switch');
  });
});

// ── CHARTER_PREAMBLE ───────────────────────────────────────────

describe("CHARTER_PREAMBLE", () => {
  it("contains core values", () => {
    expect(CHARTER_PREAMBLE).toContain("Formation first");
    expect(CHARTER_PREAMBLE).toContain("Lincoln teaches London");
    expect(CHARTER_PREAMBLE).toContain("First Principles Engine");
  });
});
