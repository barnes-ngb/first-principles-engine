import { describe, expect, it } from "vitest";
import { buildSystemPrompt, getWeekMonday } from "./chat.js";

// ── getWeekMonday ──────────────────────────────────────────────

describe("getWeekMonday", () => {
  it("returns Monday for a Monday input", () => {
    const mon = new Date(2026, 2, 2); // Mon March 2, 2026
    const result = getWeekMonday(mon);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Wednesday input", () => {
    const wed = new Date(2026, 2, 4); // Wed March 4, 2026
    const result = getWeekMonday(wed);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Sunday input", () => {
    const sun = new Date(2026, 2, 1); // Sun March 1, 2026
    const result = getWeekMonday(sun);
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-23");
  });

  it("returns Monday for a Saturday input", () => {
    const sat = new Date(2026, 2, 7); // Sat March 7, 2026
    const result = getWeekMonday(sat);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });

  it("returns Monday for a Friday input", () => {
    const fri = new Date(2026, 2, 6); // Fri March 6, 2026
    const result = getWeekMonday(fri);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-02");
  });
});

// ── buildSystemPrompt ──────────────────────────────────────────

describe("buildSystemPrompt", () => {
  const baseChild = {
    name: "Lincoln",
    grade: "3rd",
    prioritySkills: [
      { tag: "reading.phonics", label: "Phonics", level: "Developing" },
    ],
    supports: [{ label: "Visual checklist", description: "Step-by-step list" }],
    stopRules: [
      {
        label: "Frustration",
        trigger: "3 misses in a row",
        action: "Switch activity",
      },
    ],
  };

  it("includes charter preamble", () => {
    const prompt = buildSystemPrompt(baseChild, "chat");
    expect(prompt).toContain("First Principles Engine");
    expect(prompt).toContain("Formation first");
  });

  it("includes child profile section with name and grade", () => {
    const prompt = buildSystemPrompt(baseChild, "chat");
    expect(prompt).toContain("CHILD PROFILE:");
    expect(prompt).toContain("Name: Lincoln");
    expect(prompt).toContain("Grade: 3rd");
  });

  it("includes priority skills", () => {
    const prompt = buildSystemPrompt(baseChild, "chat");
    expect(prompt).toContain("Phonics (reading.phonics): Developing");
  });

  it("includes supports", () => {
    const prompt = buildSystemPrompt(baseChild, "chat");
    expect(prompt).toContain("Visual checklist: Step-by-step list");
  });

  it("includes stop rules", () => {
    const prompt = buildSystemPrompt(baseChild, "chat");
    expect(prompt).toContain(
      'Frustration: when "3 misses in a row" → Switch activity',
    );
  });

  it("does NOT include enriched sections for chat taskType", () => {
    const prompt = buildSystemPrompt(baseChild, "chat");
    expect(prompt).not.toContain("RECENT PERFORMANCE");
    expect(prompt).not.toContain("WORKBOOK PACE");
    expect(prompt).not.toContain("THIS WEEK");
    expect(prompt).not.toContain("HOURS PROGRESS");
  });

  it("does NOT include plan output instructions for chat taskType", () => {
    const prompt = buildSystemPrompt(baseChild, "chat");
    expect(prompt).not.toContain("OUTPUT FORMAT INSTRUCTIONS");
  });

  it("includes plan output instructions for plan taskType", () => {
    const prompt = buildSystemPrompt(baseChild, "plan");
    expect(prompt).toContain("OUTPUT FORMAT INSTRUCTIONS");
  });

  it("includes enriched context when provided", () => {
    const prompt = buildSystemPrompt(baseChild, "plan", {
      sessions: [
        { streamId: "reading", hits: 3, nears: 1, misses: 0 },
        { streamId: "math", hits: 2, nears: 0, misses: 1 },
      ],
      workbookPaces: [
        {
          name: "Explode the Code",
          unitLabel: "lesson",
          currentPosition: 15,
          totalUnits: 40,
          unitsPerDayNeeded: 1.1,
          targetFinishDate: "2026-05-15",
          status: "on-track",
        },
      ],
      week: {
        theme: "Courage",
        virtue: "Fortitude",
        scriptureRef: "Joshua 1:9",
        heartQuestion: "What does it mean to be brave?",
      },
      hoursTotalMinutes: 18000, // 300 hours
      hoursTarget: 1000,
      engagementSummaries: [],
      gradeResults: [],
      draftBookCount: 0,
    });

    // RECENT PERFORMANCE
    expect(prompt).toContain("RECENT PERFORMANCE (last 14 days):");
    expect(prompt).toContain("reading: 3 hits, 1 nears, 0 misses");
    expect(prompt).toContain("math: 2 hits, 0 nears, 1 misses");

    // WORKBOOK PACE
    expect(prompt).toContain("WORKBOOK PACE:");
    expect(prompt).toContain("Explode the Code");
    expect(prompt).toContain("lesson 15 of 40");
    expect(prompt).toContain("1.1 lessons/day needed to finish by 2026-05-15");
    expect(prompt).toContain("Status: on-track");

    // THIS WEEK
    expect(prompt).toContain("THIS WEEK:");
    expect(prompt).toContain("Theme: Courage");
    expect(prompt).toContain("Virtue: Fortitude");
    expect(prompt).toContain("Scripture: Joshua 1:9");
    expect(prompt).toContain("Heart question: What does it mean to be brave?");

    // HOURS PROGRESS
    expect(prompt).toContain("HOURS PROGRESS:");
    expect(prompt).toContain("300 hours of 1000 target (30% complete)");
  });

  it("handles empty enriched context gracefully", () => {
    const prompt = buildSystemPrompt(baseChild, "evaluate", {
      sessions: [],
      workbookPaces: [],
      week: null,
      hoursTotalMinutes: 0,
      hoursTarget: 1000,
      engagementSummaries: [],
      gradeResults: [],
      draftBookCount: 0,
    });

    expect(prompt).toContain("No recent session data available.");
    expect(prompt).toContain("No workbook data available.");
    expect(prompt).toContain("No weekly plan set yet.");
    expect(prompt).toContain("0 hours of 1000 target (0% complete)");
  });

  it("handles child with no grade or skills", () => {
    const prompt = buildSystemPrompt({ name: "London" }, "chat");
    expect(prompt).toContain("Name: London");
    expect(prompt).not.toContain("Grade:");
    expect(prompt).not.toContain("Priority skills:");
  });
});
