import { describe, expect, it } from "vitest";

import { foldHoursForPrompt, hoursLoggedBlock } from "./promptHours.js";
import { computeMonthHours } from "./tasks/monthlyHours.js";

/**
 * UX-410 — what a prompt may be told about hours.
 *
 * Two properties, and they are different in kind. The NUMBER must be the shared
 * fold's (asserted against the rule's other fold, so a second definition here
 * would have to disagree with the monthly book to land), and the SENTENCE must
 * never state a target, a quota, a percentage or a share — the owner's
 * 2026-09-06 decision, which the retired `HOURS PROGRESS` slice was telling two
 * models the opposite of.
 */

const DAY_LOGS = [
  {
    childId: "lincoln",
    date: "2026-09-07",
    checklist: [
      { label: "Phonics", completed: true, subjectBucket: "Reading", estimatedMinutes: 20 },
      { label: "Math", completed: false, subjectBucket: "Math", estimatedMinutes: 30 },
    ],
  },
  {
    childId: "london",
    date: "2026-09-07",
    checklist: [
      { label: "Letters", completed: true, subjectBucket: "Reading", estimatedMinutes: 99 },
    ],
  },
];

const ENTRIES = [
  { childId: "lincoln", date: "2026-09-08", minutes: 45, subjectBucket: "Math" },
  // `hours` not `minutes` — the shared rule reads it, the retired reader added
  // both and this one used to drop it entirely on the weekly path.
  { childId: "lincoln", date: "2026-09-09", hours: 1.5, subjectBucket: "PracticalArts" },
  { childId: "lincoln", date: "2026-09-09", minutes: 0, subjectBucket: "Other" },
];

const ADJUSTMENTS = [
  { childId: "both", date: "2026-09-10", minutes: 60, subjectBucket: "Science" },
  { childId: "lincoln", date: "2026-09-11", minutes: -20, subjectBucket: "Math" },
];

describe("foldHoursForPrompt", () => {
  it("counts all three sources for one child, and never his brother's", () => {
    const totals = foldHoursForPrompt(DAY_LOGS, ENTRIES, ADJUSTMENTS, "lincoln");
    // 20 (day log) + 45 + 90 (1.5h) + 0 + 60 ('both') − 20 = 195
    expect(totals.totalMinutes).toBe(195);
    expect(totals.minutesBySubject).toEqual({
      Reading: 20,
      Math: 25,
      PracticalArts: 90,
      Science: 60,
    });
  });

  it("is the same answer the monthly book's fold gives — one rule, not two", () => {
    expect(foldHoursForPrompt(DAY_LOGS, ENTRIES, ADJUSTMENTS, "lincoln")).toEqual(
      computeMonthHours(DAY_LOGS, ENTRIES, ADJUSTMENTS, "lincoln"),
    );
  });

  it("skips a non-positive entry, which the retired reader admitted", () => {
    expect(
      foldHoursForPrompt([], [{ childId: "l", minutes: 0 }], [], "l").totalMinutes,
    ).toBe(0);
  });
});

describe("hoursLoggedBlock", () => {
  const totals = { totalMinutes: 195, minutesBySubject: { Reading: 20, Math: 25 } };

  it("states the period's hours and the per-subject split", () => {
    const block = hoursLoggedBlock("HOURS LOGGED", "this week", totals);
    expect(block).toContain("HOURS LOGGED:");
    expect(block).toContain("Hours logged this week: 3.3 hours (195 min)");
    expect(block).toContain("- Reading: 20 min");
  });

  it("states NO target, quota, percentage or share (UX-410)", () => {
    const block = hoursLoggedBlock("HOURS LOGGED", "so far this school year", totals);
    expect(block).not.toMatch(/%/);
    for (const word of ["target", "goal", "quota", "complete", "of 1000", "remaining"]) {
      expect(block.toLowerCase()).not.toContain(word);
    }
  });

  it("says a period with nothing in it is empty, rather than printing a zero row", () => {
    const block = hoursLoggedBlock("HOURS LOGGED", "this week", {
      totalMinutes: 0,
      minutesBySubject: {},
    });
    expect(block).toContain("No hours logged this week.");
  });

  it("reports a negative total as none, never as a negative duration", () => {
    const block = hoursLoggedBlock("HOURS LOGGED", "this week", {
      totalMinutes: -30,
      minutesBySubject: { Math: -30 },
    });
    expect(block).toContain("No hours logged this week.");
    expect(block).not.toContain("-30");
  });

  it("drops a subject that folded to zero rather than naming it", () => {
    const block = hoursLoggedBlock("HOURS LOGGED", "this week", {
      totalMinutes: 20,
      minutesBySubject: { Reading: 20, Other: 0 },
    });
    expect(block).toContain("Reading: 20 min");
    expect(block).not.toContain("Other");
  });
});

describe("a legacy day log is still this child's day (Codex round 3, P2)", () => {
  it("counts a document whose child is only in its id, once it is normalised", () => {
    // `deriveChildIdFromDocId` is the shared rule; the readers resolve the id on
    // read and the fold's own safety-net filter then sees a child. What is
    // asserted here is the consequence: a normalised legacy document counts
    // exactly like a modern one, so a reader that drops it undercounts.
    const legacy = {
      date: "2026-09-07",
      checklist: [
        { label: "Phonics", completed: true, subjectBucket: "Reading", estimatedMinutes: 20 },
      ],
    };
    expect(foldHoursForPrompt([legacy], [], [], "lincoln").totalMinutes).toBe(0);
    expect(
      foldHoursForPrompt([{ ...legacy, childId: "lincoln" }], [], [], "lincoln")
        .totalMinutes,
    ).toBe(20);
  });
});
