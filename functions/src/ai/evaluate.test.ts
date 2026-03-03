import { describe, expect, it } from "vitest";
import {
  buildEvaluationPrompt,
  lastWeekKey,
  parseReviewResponse,
} from "./evaluate.js";
import type { WeekContext } from "./evaluate.js";

// ── lastWeekKey ─────────────────────────────────────────────────

describe("lastWeekKey", () => {
  it("returns the previous Monday when called on a Sunday", () => {
    // Sunday March 1, 2026
    const sunday = new Date(2026, 2, 1); // month is 0-indexed
    expect(lastWeekKey(sunday)).toBe("2026-02-23");
  });

  it("returns the previous Monday when called on a Wednesday", () => {
    // Wednesday March 4, 2026
    const wednesday = new Date(2026, 2, 4);
    // Previous week's Monday = Feb 23
    expect(lastWeekKey(wednesday)).toBe("2026-02-23");
  });

  it("returns two Mondays back when called on a Monday", () => {
    // Monday March 2, 2026 — the "last week" is Feb 23–Mar 1
    const monday = new Date(2026, 2, 2);
    expect(lastWeekKey(monday)).toBe("2026-02-23");
  });

  it("returns the previous Monday when called on a Saturday", () => {
    // Saturday March 7, 2026
    const saturday = new Date(2026, 2, 7);
    // Previous week's Monday = Feb 23
    expect(lastWeekKey(saturday)).toBe("2026-02-23");
  });
});

// ── buildEvaluationPrompt ───────────────────────────────────────

function makeContext(overrides?: Partial<WeekContext>): WeekContext {
  return {
    child: { id: "child-1", name: "Lincoln", grade: "3rd" },
    weekKey: "2026-02-23",
    sessions: [
      { streamId: "reading", result: "hit", date: "2026-02-23" },
      { streamId: "reading", result: "near", date: "2026-02-24" },
      { streamId: "math", result: "hit", date: "2026-02-23" },
      { streamId: "math", result: "hit", date: "2026-02-24" },
      { streamId: "math", result: "miss", date: "2026-02-25" },
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

  it("includes session summary by stream", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("reading: 1 hits, 1 nears, 0 misses");
    expect(prompt).toContain("math: 2 hits, 0 nears, 1 misses");
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
    expect(prompt).toContain("Missed school days (Mon–Fri): 2");
  });

  it("requests JSON output format", () => {
    const prompt = buildEvaluationPrompt(makeContext());
    expect(prompt).toContain("Respond ONLY with valid JSON");
    expect(prompt).toContain("progressSummary");
    expect(prompt).toContain("paceAdjustments");
    expect(prompt).toContain("planModifications");
    expect(prompt).toContain("energyPattern");
    expect(prompt).toContain("celebration");
  });

  it("handles empty data gracefully", () => {
    const prompt = buildEvaluationPrompt(
      makeContext({
        sessions: [],
        hours: [],
        dailyPlans: [],
        missedDays: 5,
      }),
    );
    expect(prompt).toContain("Sessions completed: 0");
    expect(prompt).toContain("(none)");
    expect(prompt).toContain("Missed school days (Mon–Fri): 5");
  });
});

// ── parseReviewResponse ─────────────────────────────────────────

describe("parseReviewResponse", () => {
  const validPayload = {
    progressSummary:
      "Lincoln had a solid week with consistent math work and growing reading confidence.",
    paceAdjustments: [
      {
        subject: "Reading",
        currentPace: "2 sessions/week",
        suggestedChange: "We might try adding a short third session.",
      },
    ],
    planModifications: [
      {
        area: "Math block length",
        observation: "One miss after 20-min sessions",
        recommendation: "Keep math blocks under 15 minutes.",
      },
    ],
    energyPattern:
      "Energy dipped mid-week; consider scheduling lighter tasks on Wednesdays.",
    celebration:
      "Lincoln decoded two new CVC words without prompting on Tuesday!",
  };

  it("parses a valid JSON response", () => {
    const result = parseReviewResponse(JSON.stringify(validPayload));
    expect(result.progressSummary).toBe(validPayload.progressSummary);
    expect(result.paceAdjustments).toEqual(validPayload.paceAdjustments);
    expect(result.planModifications).toEqual(validPayload.planModifications);
    expect(result.energyPattern).toBe(validPayload.energyPattern);
    expect(result.celebration).toBe(validPayload.celebration);
  });

  it("strips markdown code fences", () => {
    const wrapped = "```json\n" + JSON.stringify(validPayload) + "\n```";
    const result = parseReviewResponse(wrapped);
    expect(result.progressSummary).toBe(validPayload.progressSummary);
  });

  it("defaults missing arrays to empty arrays", () => {
    const minimal = JSON.stringify({
      progressSummary: "Good week.",
      energyPattern: "Stable.",
      celebration: "Great job!",
    });
    const result = parseReviewResponse(minimal);
    expect(result.paceAdjustments).toEqual([]);
    expect(result.planModifications).toEqual([]);
  });

  it("coerces missing string fields to empty strings", () => {
    const result = parseReviewResponse("{}");
    expect(result.progressSummary).toBe("");
    expect(result.energyPattern).toBe("");
    expect(result.celebration).toBe("");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseReviewResponse("not json")).toThrow();
  });
});
