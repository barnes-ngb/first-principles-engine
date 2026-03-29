import { describe, expect, it } from "vitest";
import {
  buildEvaluationPrompt,
  lastWeekKey,
  parseReviewResponse,
} from "./evaluate.js";
import type { WeekContext } from "./evaluate.js";

// ── lastWeekKey ─────────────────────────────────────────────────

describe("lastWeekKey", () => {
  it("returns the previous Sunday when called on a Sunday", () => {
    // Sunday March 1, 2026 — previous week started Sunday Feb 22
    const sunday = new Date(2026, 2, 1); // month is 0-indexed
    expect(lastWeekKey(sunday)).toBe("2026-02-22");
  });

  it("returns the previous Sunday when called on a Wednesday", () => {
    // Wednesday March 4, 2026
    // Previous week's Sunday = Feb 22
    const wednesday = new Date(2026, 2, 4);
    expect(lastWeekKey(wednesday)).toBe("2026-02-22");
  });

  it("returns the previous Sunday when called on a Monday", () => {
    // Monday March 2, 2026 — previous week started Sunday Feb 22
    const monday = new Date(2026, 2, 2);
    expect(lastWeekKey(monday)).toBe("2026-02-22");
  });

  it("returns the previous Sunday when called on a Saturday", () => {
    // Saturday March 7, 2026 — current week started Sunday Mar 1,
    // so previous week started Sunday Feb 22
    const saturday = new Date(2026, 2, 7);
    expect(lastWeekKey(saturday)).toBe("2026-02-22");
  });
});

// ── buildEvaluationPrompt ───────────────────────────────────────

function makeContext(overrides?: Partial<WeekContext>): WeekContext {
  return {
    child: { id: "child-1", name: "Lincoln", grade: "3rd" },
    weekKey: "2026-02-23",
    dayLogs: [
      {
        date: "2026-02-23",
        totalItems: 5,
        completedItems: 4,
        engagement: { engaged: 3, okay: 1 },
        minutesBySubject: { Reading: 60, Math: 45 },
        gradeResults: ["Phonics: 5/6 correct"],
        evidenceCount: 1,
      },
      {
        date: "2026-02-24",
        totalItems: 4,
        completedItems: 3,
        engagement: { engaged: 2, struggled: 1 },
        minutesBySubject: { Reading: 30 },
        gradeResults: [],
        evidenceCount: 0,
      },
    ],
    hours: [
      { minutes: 60, subjectBucket: "Reading", date: "2026-02-23" },
      { minutes: 45, subjectBucket: "Math", date: "2026-02-23" },
      { minutes: 30, subjectBucket: "Reading", date: "2026-02-24" },
    ],
    dailyPlans: [
      {
        date: "2026-02-23",
        energy: "normal",
        planType: "normal",
        sessions: [],
      },
      {
        date: "2026-02-24",
        energy: "low",
        planType: "mvd",
        sessions: [],
      },
      {
        date: "2026-02-25",
        energy: "normal",
        planType: "normal",
        sessions: [],
      },
    ],
    missedDays: 2,
    ...overrides,
  };
}

describe("buildEvaluationPrompt", () => {
  it("includes child name and week key", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("Lincoln");
    expect(prompt).toContain("2026-02-23");
  });

  it("includes day log completion data", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("7/9 items");
  });

  it("includes total hours logged", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    // 60 + 45 + 30 = 135 min = 2.3 hours
    expect(prompt).toContain("2.3 hours (135 min)");
  });

  it("includes hours breakdown by subject", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("Reading: 90 min");
    expect(prompt).toContain("Math: 45 min");
  });

  it("includes energy state summary", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("normal: 2 days");
    expect(prompt).toContain("low: 1 days");
  });

  it("includes plan type summary", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("normal: 2 days");
    expect(prompt).toContain("mvd: 1 days");
  });

  it("includes missed days count", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("Missed school days (Sun–Thu): 2");
  });

  it("requests JSON output format", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("Respond ONLY with valid JSON");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("paceAdjustments");
    expect(prompt).toContain("wins");
    expect(prompt).toContain("energyPattern");
    expect(prompt).toContain("celebration");
  });

  it("handles empty data gracefully", () => {
    const prompt = buildEvaluationPrompt(
      makeContext({
        dayLogs: [],
        hours: [],
        dailyPlans: [],
        missedDays: 5,
      }),
    );
    expect(prompt).toContain("Day logs recorded: 0");
    expect(prompt).toContain("(none)");
    expect(prompt).toContain("Missed school days (Sun–Thu): 5");
  });
});

// ── parseReviewResponse ─────────────────────────────────────────

describe("parseReviewResponse", () => {
  const validPayload = {
    celebration:
      "Lincoln decoded two new CVC words without prompting on Tuesday!",
    summary:
      "Lincoln had a solid week with consistent math work and growing reading confidence.",
    wins: ["Decoded two new CVC words", "Completed all math sessions"],
    growthAreas: ["Reading stamina could use a gentle push"],
    paceAdjustments: [
      {
        id: "adj-0",
        area: "Reading",
        currentPace: "2 sessions/week",
        suggestedPace: "We might try adding a short third session.",
        rationale: "His confidence is growing and he seems ready.",
      },
    ],
    recommendations: ["Keep math blocks under 15 minutes"],
    energyPattern:
      "Energy dipped mid-week; consider scheduling lighter tasks on Wednesdays.",
  };

  it("parses a valid JSON response", () => {
    const result = parseReviewResponse(JSON.stringify(validPayload));
    expect(result.summary).toBe(validPayload.summary);
    expect(result.celebration).toBe(validPayload.celebration);
    expect(result.wins).toEqual(validPayload.wins);
    expect(result.growthAreas).toEqual(validPayload.growthAreas);
    expect(result.paceAdjustments).toHaveLength(1);
    expect(result.recommendations).toEqual(validPayload.recommendations);
    expect(result.energyPattern).toBe(validPayload.energyPattern);
  });

  it("strips markdown code fences", () => {
    const wrapped = "```json\n" + JSON.stringify(validPayload) + "\n```";
    const result = parseReviewResponse(wrapped);
    expect(result.summary).toBe(validPayload.summary);
  });

  it("falls back to progressSummary for old data", () => {
    const old = JSON.stringify({
      progressSummary: "Good week.",
      energyPattern: "Stable.",
      celebration: "Great job!",
    });
    const result = parseReviewResponse(old);
    expect(result.summary).toBe("Good week.");
  });

  it("defaults missing arrays to empty arrays", () => {
    const minimal = JSON.stringify({
      summary: "Good week.",
      energyPattern: "Stable.",
      celebration: "Great job!",
    });
    const result = parseReviewResponse(minimal);
    expect(result.paceAdjustments).toEqual([]);
    expect(result.wins).toEqual([]);
    expect(result.growthAreas).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it("coerces missing string fields to empty strings", () => {
    const result = parseReviewResponse("{}");
    expect(result.summary).toBe("");
    expect(result.energyPattern).toBe("");
    expect(result.celebration).toBe("");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseReviewResponse("not json")).toThrow();
  });
});
