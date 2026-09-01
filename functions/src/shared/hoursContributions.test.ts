import { describe, it, expect } from "vitest";

import {
  collectHoursContributions,
  dayLogMinuteContributions,
  entryMinutes,
  itemMatchesBlock,
} from "./hoursContributions.js";

/**
 * The hours counting rule — ONE definition, so ONE suite (ARCH-47 slice 4).
 *
 * This is the UNION of the two suites that used to test the two copies:
 * `src/features/records/records.logic.test.ts` (the app) and
 * `functions/src/ai/tasks/monthlyHours.test.ts` (the functions-side port). It
 * also carries the cases of the retired PARITY FIXTURE, which was repeated
 * verbatim in both files to pin the copies together: the fixture's parity ROLE
 * is gone — the compiler replaced it — but every case it exercised survives
 * here as a test of the rule itself.
 *
 * Neither old suite was a strict subset of the other. The app suite owned the
 * `plannedMinutes` fallback chain and the fractional-hours rounding; the
 * functions suite owned the malformed-document cases, the no-`childId`
 * pass-through and the `itemMatchesBlock` substring rule. Both are below.
 */

// ─── entryMinutes ────────────────────────────────────────────────────────────

describe("entryMinutes", () => {
  it("returns explicit minutes when present", () => {
    expect(entryMinutes({ date: "2026-01-01", minutes: 45 })).toBe(45);
  });

  it("prefers minutes over hours, including a zero (0 != null)", () => {
    expect(entryMinutes({ minutes: 10, hours: 99 })).toBe(10);
    expect(entryMinutes({ date: "2026-01-01", minutes: 0, hours: 1.5 })).toBe(0);
  });

  it("converts hours to minutes when minutes is absent", () => {
    expect(entryMinutes({ date: "2026-01-01", hours: 1.5 })).toBe(90);
    expect(entryMinutes({ hours: 0.7 })).toBe(42);
  });

  it("rounds fractional hours via Math.round", () => {
    expect(entryMinutes({ hours: 1.3 })).toBe(78); // 78.0 exactly
    expect(entryMinutes({ hours: 0.75 })).toBe(45); // exact
  });

  it("returns 0 when neither is present", () => {
    expect(entryMinutes({ date: "2026-01-01" })).toBe(0);
    expect(entryMinutes({})).toBe(0);
  });
});

// ─── dayLogMinuteContributions — the partial-day rule (DATA-14) ──────────────

describe("dayLogMinuteContributions — the partial-day rule (DATA-14)", () => {
  it("uses block actuals and ignores untracked blocks on a tracked day", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [
          { subjectBucket: "Math", location: "Home", actualMinutes: 30 },
          { subjectBucket: "Reading", location: "Home", plannedMinutes: 20 },
        ],
      }),
    ).toEqual([{ subjectBucket: "Math", minutes: 30, location: "Home" }]);
  });

  it("(a) a matched-only day emits block actuals ALONE — no checklist contribution", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [
          { title: "Reading Eggs", subjectBucket: "Reading", actualMinutes: 45, location: "Home" },
          { title: "Math Practice", subjectBucket: "Math", actualMinutes: 20, location: "Home" },
        ],
        checklist: [
          { label: "Reading Eggs (45m)", completed: true, subjectBucket: "Reading" },
          { label: "Math Practice (20m)", completed: true, subjectBucket: "Math" },
        ],
      }),
    ).toEqual([
      { subjectBucket: "Reading", minutes: 45, location: "Home" },
      { subjectBucket: "Math", minutes: 20, location: "Home" },
    ]);
  });

  it("(b) carries an unmatched completed item at Home, without double-counting the matched one", () => {
    const out = dayLogMinuteContributions({
      blocks: [
        { title: "Reading Eggs", subjectBucket: "Reading", actualMinutes: 45, location: "Home" },
      ],
      checklist: [
        // Matches the block by title — already represented by its actualMinutes.
        { label: "Reading Eggs (45m)", completed: true, subjectBucket: "Reading" },
        // Carried over from a prior day, no corresponding block.
        { label: "Handwriting page (15m)", completed: true, subjectBucket: "LanguageArts" },
      ],
    });
    expect(out).toEqual([
      { subjectBucket: "Reading", minutes: 45, location: "Home" },
      { subjectBucket: "LanguageArts", minutes: 15, location: "Home" },
    ]);
    expect(out.reduce((s, c) => s + c.minutes, 0)).toBe(60);
  });

  it("does NOT double-count an item that matches a tracked block", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [{ title: "Math Workbook", subjectBucket: "Math", actualMinutes: 30 }],
        checklist: [
          { label: "Math Workbook (30m)", completed: true, estimatedMinutes: 30 },
        ],
      }),
    ).toEqual([{ subjectBucket: "Math", minutes: 30, location: undefined }]);
  });

  it("does not carry INCOMPLETE checklist items in block-actuals mode", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [
          { title: "Reading Eggs", subjectBucket: "Reading", actualMinutes: 45, location: "Home" },
        ],
        checklist: [
          { label: "Reading Eggs (45m)", completed: true, subjectBucket: "Reading" },
          { label: "Unfinished art (30m)", completed: false, subjectBucket: "Art" },
        ],
      }),
    ).toEqual([{ subjectBucket: "Reading", minutes: 45, location: "Home" }]);
  });

  it("(d) falls back entirely to completed checklist items when no block tracked time", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [{ subjectBucket: "Math", plannedMinutes: 30 }],
        checklist: [
          { label: "Read aloud (25m)", completed: true, subjectBucket: "Reading" },
          { label: "Skipped (40m)", completed: false, subjectBucket: "Math" },
        ],
      }),
    ).toEqual([{ subjectBucket: "Reading", minutes: 25, location: "Home" }]);
  });

  it("an item matching MORE THAN ONE block-with-actuals is still skipped exactly once", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [
          { title: "Math Workbook", subjectBucket: "Math", actualMinutes: 10 },
          { title: "Math Workbook", subjectBucket: "Math", actualMinutes: 20 },
        ],
        checklist: [{ label: "Math Workbook (30m)", completed: true, estimatedMinutes: 30 }],
      }),
    ).toEqual([
      { subjectBucket: "Math", minutes: 10, location: undefined },
      { subjectBucket: "Math", minutes: 20, location: undefined },
    ]);
  });

  it("a zero or negative block actual does NOT put the day in block-actuals mode", () => {
    // Neither block counts as "tracked", so the day falls back to the checklist.
    expect(
      dayLogMinuteContributions({
        blocks: [
          { title: "A", subjectBucket: "Math", actualMinutes: 0 },
          { title: "B", subjectBucket: "Math", actualMinutes: -5 },
        ],
        checklist: [{ label: "C (5m)", completed: true, subjectBucket: "Reading" }],
      }),
    ).toEqual([{ subjectBucket: "Reading", minutes: 5, location: "Home" }]);
  });

  it("a negative block actual alongside a positive one is dropped, not subtracted", () => {
    expect(
      dayLogMinuteContributions({
        blocks: [
          { title: "A", subjectBucket: "Math", actualMinutes: -5 },
          { title: "B", subjectBucket: "Reading", actualMinutes: 20 },
        ],
        checklist: [],
      }),
    ).toEqual([{ subjectBucket: "Reading", minutes: 20, location: undefined }]);
  });
});

describe("dayLogMinuteContributions — the plannedMinutes fallback chain", () => {
  const only = (item: Record<string, unknown>) =>
    dayLogMinuteContributions({ blocks: [], checklist: [item] });

  it("uses plannedMinutes when estimatedMinutes is absent", () => {
    expect(only({ label: "Reading time", completed: true, subjectBucket: "Reading", plannedMinutes: 20 })).toEqual([
      { subjectBucket: "Reading", minutes: 20, location: "Home" },
    ]);
  });

  it("prefers estimatedMinutes over plannedMinutes", () => {
    expect(
      only({ label: "Math (30m)", completed: true, subjectBucket: "Math", estimatedMinutes: 25, plannedMinutes: 30 })[0]
        .minutes,
    ).toBe(25);
  });

  it("falls back to the label parse when both minute fields are absent", () => {
    expect(only({ label: "Science project (40m)", completed: true, subjectBucket: "Science" })[0].minutes).toBe(40);
  });

  it("returns nothing for a label with no parseable minutes and no planned/estimated", () => {
    expect(only({ label: "Free play", completed: true, subjectBucket: "Other" })).toEqual([]);
  });

  it("keeps a zero estimatedMinutes as zero (?? does not fall through) — so it is dropped", () => {
    expect(only({ label: "X (25m)", completed: true, estimatedMinutes: 0 })).toEqual([]);
    expect(only({ label: "X (25m)", completed: true, plannedMinutes: 0 })).toEqual([]);
  });
});

// ─── Reading raw documents (this module reads unvalidated Firestore data) ────

describe("dayLogMinuteContributions — malformed documents", () => {
  it("defaults a missing subjectBucket to Other", () => {
    expect(dayLogMinuteContributions({ blocks: [{ actualMinutes: 10 }] })).toEqual([
      { subjectBucket: "Other", minutes: 10, location: undefined },
    ]);
  });

  it("reads an empty, absent or off-type blocks/checklist without throwing", () => {
    expect(dayLogMinuteContributions({})).toEqual([]);
    expect(dayLogMinuteContributions({ blocks: "nope", checklist: 7 })).toEqual([]);
    // A day log with NO `blocks` key still counts its completed checklist items.
    expect(
      dayLogMinuteContributions({ checklist: [{ label: "A (5m)", completed: true }] }),
    ).toEqual([{ subjectBucket: "Other", minutes: 5, location: "Home" }]);
  });

  it("treats a non-finite or off-type minute field as absent rather than propagating NaN", () => {
    expect(dayLogMinuteContributions({ blocks: [{ actualMinutes: NaN }], checklist: [] })).toEqual([]);
    expect(dayLogMinuteContributions({ blocks: [{ actualMinutes: "30" }], checklist: [] })).toEqual([]);
    // NaN estimatedMinutes falls through the chain to the label parse.
    expect(
      dayLogMinuteContributions({ blocks: [], checklist: [{ label: "X (7m)", completed: true, estimatedMinutes: NaN }] }),
    ).toEqual([{ subjectBucket: "Other", minutes: 7, location: "Home" }]);
  });

  it("counts an item only when `completed` is literally true", () => {
    for (const completed of [1, "yes", Infinity, {}]) {
      expect(
        dayLogMinuteContributions({ blocks: [], checklist: [{ label: "X (7m)", completed }] }),
      ).toEqual([]);
    }
  });
});

// ─── collectHoursContributions — attribution and the three sources ──────────

describe("collectHoursContributions — the three additive sources (DATA-11)", () => {
  it("emits every source with its kind, skipping non-positive entries and keeping negative adjustments", () => {
    const out = collectHoursContributions(
      [{ childId: "lincoln", date: "2026-01-10", blocks: [{ subjectBucket: "Math", actualMinutes: 30, location: "Home" }] }],
      [
        { childId: "lincoln", date: "2026-01-11", minutes: 25, subjectBucket: "Science", location: "Home" },
        { childId: "lincoln", date: "2026-01-12", minutes: 0, subjectBucket: "Math" },
      ],
      [
        { childId: "lincoln", date: "2026-01-13", minutes: 15, subjectBucket: "Math" },
        { childId: "lincoln", date: "2026-01-14", minutes: -10, subjectBucket: "Reading" },
      ],
      "lincoln",
    );
    expect(out.map((c) => c.kind)).toEqual(["entry", "day-log", "adjustment", "adjustment"]);
    expect(out.find((c) => c.minutes === 0)).toBeUndefined();
    expect(out.find((c) => c.minutes === -10)?.kind).toBe("adjustment");
  });

  it("skips non-positive hours entries (unlike adjustments)", () => {
    expect(
      collectHoursContributions(
        [],
        [
          { childId: "k", date: "2026-08-08", minutes: 0 },
          { childId: "k", date: "2026-08-09", minutes: -5 },
          { childId: "k", date: "2026-08-09", minutes: 5 },
        ],
        [],
        "k",
      ).map((c) => c.minutes),
    ).toEqual([5]);
  });

  it("emits negative and zero adjustments (corrections must subtract)", () => {
    expect(
      collectHoursContributions(
        [],
        [],
        [
          { childId: "k", date: "2026-08-12", minutes: -20 },
          { childId: "k", date: "2026-08-13", minutes: 0 },
        ],
        "k",
      ).map((c) => c.minutes),
    ).toEqual([-20, 0]);
  });
});

describe("collectHoursContributions — DATA-09 attribution", () => {
  it("counts a 'both' adjustment, skips a sibling's, and drops an unattributed one", () => {
    const out = collectHoursContributions(
      [],
      [],
      [
        { childId: "both", date: "2026-08-10", minutes: 60, subjectBucket: "Science" },
        { childId: "c-london", date: "2026-08-11", minutes: 120, subjectBucket: "Math" },
        // Legacy unattributed — counts for NO ONE (the DATA-05 leak, closed).
        { date: "2026-08-11", minutes: 99, subjectBucket: "Science" },
      ],
      "c-lincoln",
    );
    expect(out).toEqual([
      { kind: "adjustment", date: "2026-08-10", subjectBucket: "Science", minutes: 60, location: undefined },
    ]);
  });

  it("counts a 'both' AND a child-tagged adjustment on the SAME day, and only those", () => {
    expect(
      collectHoursContributions(
        [],
        [],
        [
          { childId: "both", date: "2026-08-10", minutes: 60, subjectBucket: "Science" },
          { childId: "c-lincoln", date: "2026-08-10", minutes: 25, subjectBucket: "Science" },
          { childId: "c-london", date: "2026-08-10", minutes: 99, subjectBucket: "Science" },
        ],
        "c-lincoln",
      ).map((c) => c.minutes),
    ).toEqual([60, 25]);
  });

  it("filters day logs and entries belonging to another child", () => {
    expect(
      collectHoursContributions(
        [
          { childId: "c-lincoln", date: "2026-08-03", blocks: [{ subjectBucket: "Math", actualMinutes: 30 }] },
          { childId: "c-london", date: "2026-08-05", blocks: [{ subjectBucket: "Math", location: "Home", actualMinutes: 99 }] },
        ],
        [
          { childId: "c-lincoln", date: "2026-08-06", minutes: 45 },
          { childId: "c-london", date: "2026-08-06", minutes: 60, subjectBucket: "Math" },
        ],
        [],
        "c-london",
      ),
    ).toEqual([
      { kind: "entry", date: "2026-08-06", subjectBucket: "Math", minutes: 60, location: undefined },
      { kind: "day-log", date: "2026-08-05", subjectBucket: "Math", minutes: 99, location: "Home" },
    ]);
  });

  it("passes everything through when no childId is given", () => {
    expect(
      collectHoursContributions(
        [],
        [],
        [
          { childId: "both", date: "d", minutes: 1 },
          { childId: "c-london", date: "d", minutes: 2 },
          { date: "d", minutes: 3 },
        ],
      ),
    ).toHaveLength(3);
  });

  it("substitutes a defined value for an off-type date, bucket or adjustment minutes", () => {
    expect(
      collectHoursContributions([], [], [{ childId: "k", date: null, minutes: undefined, subjectBucket: 7 }], "k"),
    ).toEqual([{ kind: "adjustment", date: "", subjectBucket: "Other", minutes: 0, location: undefined }]);
  });
});

// ─── itemMatchesBlock — the DATA-14 correspondence rule ─────────────────────

describe("itemMatchesBlock — the shared DATA-14 correspondence rule", () => {
  it("matches on a block checklist entry with the same label", () => {
    expect(
      itemMatchesBlock({ label: "Phonics drill" }, { checklist: [{ label: "Phonics drill" }] }),
    ).toBe(true);
    // …even when the block's own title is unrelated.
    expect(
      itemMatchesBlock(
        { label: "Handwriting page (15m)" },
        { title: "Something Else", checklist: [{ label: "Handwriting page (15m)" }] },
      ),
    ).toBe(true);
  });

  it("matches a block title against the label with its (Nm) suffix stripped", () => {
    expect(itemMatchesBlock({ label: "Math Workbook (30m)" }, { title: "Math Workbook" })).toBe(true);
  });

  it("matches case-insensitively when the cleaned label CONTAINS the block title", () => {
    expect(itemMatchesBlock({ label: "Morning Math Workbook (30m)" }, { title: "math" })).toBe(true);
    expect(itemMatchesBlock({ label: "Morning Reading Eggs (30m)" }, { title: "reading eggs" })).toBe(true);
  });

  it("does not match an unrelated block, or a block with no title and no checklist", () => {
    expect(itemMatchesBlock({ label: "Handwriting practice (15m)" }, { title: "Reading" })).toBe(false);
    expect(itemMatchesBlock({ label: "Handwriting practice" }, {})).toBe(false);
    expect(itemMatchesBlock({ label: "Reading Eggs (45m)" }, { subjectBucket: "Reading" })).toBe(false);
  });

  it("reads an off-type label, title or block checklist without throwing", () => {
    expect(itemMatchesBlock({ label: 7 }, { title: "A" })).toBe(false);
    expect(itemMatchesBlock({ label: "A" }, { title: 7 })).toBe(false);
    expect(itemMatchesBlock({ label: "zz" }, { checklist: "nope" })).toBe(false);
  });
});
