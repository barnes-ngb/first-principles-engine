import { describe, expect, it, vi } from "vitest";
import {
  buildEvaluationPrompt,
  formatBooksEvidence,
  formatTeachBacksEvidence,
  hasAnyEvidence,
  lastWeekKey,
  parseReviewResponse,
  runWeeklyReviewCycleForChild,
  summarizeBooksWeek,
  summarizeTeachBacks,
  WEEKLY_REVIEW_ADDENDUM,
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
    bookActivity: [],
    books: {
      booksCreated: [],
      booksCompleted: [],
      readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
    },
    teachBacks: {
      count: 0,
      bySubject: {},
      audioCount: 0,
      textCount: 0,
      examples: [],
    },
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

// ── summarizeBooksWeek ──────────────────────────────────────────

describe("summarizeBooksWeek", () => {
  const weekStart = "2026-02-23";
  const weekEnd = "2026-03-01T23:59:59";

  it("counts books created within the week", () => {
    const result = summarizeBooksWeek(
      [
        {
          title: "Forest Adventure",
          createdAt: "2026-02-25T10:00:00",
          updatedAt: "2026-02-26T10:00:00",
          pages: [{}, {}, {}],
          status: "draft",
          theme: "fantasy",
          source: "ai-generated",
        },
      ],
      weekStart,
      weekEnd,
    );
    expect(result.booksCreated).toHaveLength(1);
    expect(result.booksCreated[0]).toEqual({
      title: "Forest Adventure",
      pages: 3,
      isAiGenerated: true,
      theme: "fantasy",
    });
  });

  it("counts books completed within the week", () => {
    const result = summarizeBooksWeek(
      [
        {
          title: "Lion the Witch",
          createdAt: "2026-01-01T10:00:00",
          updatedAt: "2026-02-26T10:00:00",
          status: "complete",
          pages: [],
        },
      ],
      weekStart,
      weekEnd,
    );
    expect(result.booksCompleted).toEqual([{ title: "Lion the Witch" }]);
    expect(result.booksCreated).toHaveLength(0);
  });

  it("counts touched books with totalMinutes as reading sessions", () => {
    const result = summarizeBooksWeek(
      [
        {
          title: "Read this",
          createdAt: "2026-01-01T10:00:00",
          updatedAt: "2026-02-26T10:00:00",
          status: "draft",
          totalMinutes: 30,
          pages: [],
        },
        {
          title: "Also read",
          createdAt: "2026-01-15T10:00:00",
          updatedAt: "2026-02-27T10:00:00",
          status: "draft",
          totalMinutes: 15,
          pages: [],
        },
      ],
      weekStart,
      weekEnd,
    );
    expect(result.readingSessions.count).toBe(2);
    expect(result.readingSessions.totalMinutes).toBe(45);
    expect(result.readingSessions.booksRead.map((b) => b.title)).toEqual([
      "Read this",
      "Also read",
    ]);
  });

  it("flags hand-built books distinct from AI-generated", () => {
    const result = summarizeBooksWeek(
      [
        {
          title: "Mom's Book",
          createdAt: "2026-02-25T10:00:00",
          updatedAt: "2026-02-25T10:00:00",
          status: "draft",
          source: "manual",
          pages: [],
        },
      ],
      weekStart,
      weekEnd,
    );
    expect(result.booksCreated[0].isAiGenerated).toBe(false);
  });

  it("returns zero counts for empty input", () => {
    const result = summarizeBooksWeek([], weekStart, weekEnd);
    expect(result.booksCreated).toEqual([]);
    expect(result.booksCompleted).toEqual([]);
    expect(result.readingSessions.count).toBe(0);
    expect(result.readingSessions.totalMinutes).toBe(0);
  });
});

// ── summarizeTeachBacks ─────────────────────────────────────────

describe("summarizeTeachBacks", () => {
  it("counts subjects from tags.subjectBucket", () => {
    const result = summarizeTeachBacks([
      {
        title: "Teach-back: Reading",
        type: "Audio",
        mediaUrl: "https://example.com/a.webm",
        createdAt: "2026-02-25T10:00:00",
        tags: { subjectBucket: "Reading", engineStage: "Explain" },
      },
      {
        title: "Teach-back: Reading",
        type: "Audio",
        mediaUrl: "https://example.com/b.webm",
        createdAt: "2026-02-26T10:00:00",
        tags: { subjectBucket: "Reading", engineStage: "Explain" },
      },
      {
        title: "Teach-back: Math",
        type: "Note",
        content: "Teach-back: I told London about adding!",
        createdAt: "2026-02-27T10:00:00",
        tags: { subjectBucket: "Math", engineStage: "Explain" },
      },
    ]);
    expect(result.count).toBe(3);
    expect(result.bySubject).toEqual({ Reading: 2, Math: 1 });
    expect(result.audioCount).toBe(2);
    expect(result.textCount).toBe(1);
  });

  it("falls back to subject parsed from title when tags missing", () => {
    const result = summarizeTeachBacks([
      {
        title: "Teach-back: Science",
        type: "Note",
        createdAt: "2026-02-25T10:00:00",
      },
    ]);
    expect(result.bySubject).toEqual({ Science: 1 });
  });

  it("defaults to Other when subject can't be determined", () => {
    const result = summarizeTeachBacks([
      {
        title: "Teach-back 2026-02-25",
        type: "Note",
        createdAt: "2026-02-25T10:00:00",
      },
    ]);
    expect(result.bySubject).toEqual({ Other: 1 });
  });

  it("caps examples at 3 and uses most recent first", () => {
    const result = summarizeTeachBacks([
      { title: "Teach-back: One", createdAt: "2026-02-23T10:00:00", tags: { subjectBucket: "Reading" } },
      { title: "Teach-back: Two", createdAt: "2026-02-24T10:00:00", tags: { subjectBucket: "Reading" } },
      { title: "Teach-back: Three", createdAt: "2026-02-25T10:00:00", tags: { subjectBucket: "Math" } },
      { title: "Teach-back: Four", createdAt: "2026-02-26T10:00:00", tags: { subjectBucket: "Math" } },
    ]);
    expect(result.examples).toHaveLength(3);
    expect(result.examples[0].subject).toBe("Math");
    expect(result.examples[0].createdAt).toBe("2026-02-26T10:00:00");
  });

  it("returns empty summary when no artifacts", () => {
    const result = summarizeTeachBacks([]);
    expect(result.count).toBe(0);
    expect(result.audioCount).toBe(0);
    expect(result.textCount).toBe(0);
    expect(result.examples).toEqual([]);
  });
});

// ── formatBooksEvidence ─────────────────────────────────────────

describe("formatBooksEvidence", () => {
  it("renders a no-activity line when nothing happened", () => {
    const out = formatBooksEvidence("Lincoln", {
      booksCreated: [],
      booksCompleted: [],
      readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
    });
    expect(out).toContain("Books for Lincoln this week");
    expect(out).toContain("No book activity captured this week");
  });

  it("renders created + completed + reading sessions", () => {
    const out = formatBooksEvidence("London", {
      booksCreated: [
        { title: "Magic Forest", pages: 5, isAiGenerated: true, theme: "fantasy" },
      ],
      booksCompleted: [{ title: "Old Tale" }],
      readingSessions: {
        count: 2,
        totalMinutes: 45,
        booksRead: [
          { title: "Lion the Witch", totalMinutes: 30 },
          { title: "Another", totalMinutes: 15 },
        ],
      },
    });
    expect(out).toContain("1 created (1 AI-generated, 0 hand-built)");
    expect(out).toContain("themes: fantasy");
    expect(out).toContain('"Magic Forest"');
    expect(out).toContain('1 completed: "Old Tale"');
    expect(out).toContain("2 reading sessions");
    expect(out).toContain("45 cumulative min");
  });
});

// ── formatTeachBacksEvidence ────────────────────────────────────

describe("formatTeachBacksEvidence", () => {
  it("renders a no-activity line when nothing happened", () => {
    const out = formatTeachBacksEvidence("Lincoln", {
      count: 0,
      bySubject: {},
      audioCount: 0,
      textCount: 0,
      examples: [],
    });
    expect(out).toContain("No teach-back moments");
  });

  it("renders count, subjects, and highlights with audio markers", () => {
    const out = formatTeachBacksEvidence("Lincoln", {
      count: 4,
      bySubject: { Reading: 3, Math: 1 },
      audioCount: 3,
      textCount: 1,
      examples: [
        { subject: "Reading", hasAudio: true, audioUrl: "https://a", createdAt: "2026-02-26" },
        { subject: "Math", hasAudio: false, excerpt: "1+1 makes 2", createdAt: "2026-02-25" },
      ],
    });
    expect(out).toContain("4 total teach-back moments");
    expect(out).toContain("Reading: 3, Math: 1");
    expect(out).toContain("3 with audio recordings, 1 text-only");
    expect(out).toContain("Reading (audio)");
    expect(out).toContain('Math — "1+1 makes 2"');
  });
});

// ── hasAnyEvidence (empty-week guard) ───────────────────────────

describe("hasAnyEvidence", () => {
  const emptyBooks = {
    booksCreated: [],
    booksCompleted: [],
    readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
  };
  const emptyTeachBacks = {
    count: 0,
    bySubject: {},
    audioCount: 0,
    textCount: 0,
    examples: [],
  };

  function emptyCtx(overrides?: Partial<WeekContext>): WeekContext {
    return {
      child: { id: "c1", name: "Lincoln" },
      weekKey: "2026-02-23",
      dayLogs: [],
      hours: [],
      dailyPlans: [],
      missedDays: 0,
      bookActivity: [],
      books: emptyBooks,
      teachBacks: emptyTeachBacks,
      ...overrides,
    };
  }

  it("returns false when nothing exists across all sources", () => {
    expect(hasAnyEvidence(emptyCtx())).toBe(false);
  });

  it("returns true when a day log exists", () => {
    expect(
      hasAnyEvidence(
        emptyCtx({
          dayLogs: [
            {
              date: "2026-02-23",
              totalItems: 1,
              completedItems: 0,
              engagement: {},
              minutesBySubject: {},
              gradeResults: [],
              evidenceCount: 0,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns true when only hours exist", () => {
    expect(
      hasAnyEvidence(
        emptyCtx({ hours: [{ minutes: 30, date: "2026-02-23" }] }),
      ),
    ).toBe(true);
  });

  it("returns true when only books exist", () => {
    expect(
      hasAnyEvidence(
        emptyCtx({
          books: {
            booksCreated: [{ title: "x", pages: 1, isAiGenerated: false }],
            booksCompleted: [],
            readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns true when only teach-backs exist", () => {
    expect(
      hasAnyEvidence(
        emptyCtx({
          teachBacks: {
            count: 1,
            bySubject: { Reading: 1 },
            audioCount: 1,
            textCount: 0,
            examples: [],
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns true when only completed books exist (no checklist)", () => {
    expect(
      hasAnyEvidence(
        emptyCtx({
          books: {
            booksCreated: [],
            booksCompleted: [{ title: "Lion the Witch" }],
            readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
          },
        }),
      ),
    ).toBe(true);
  });
});

// ── buildEvaluationPrompt — books + teach-backs sections ────────

describe("buildEvaluationPrompt — evidence sections", () => {
  it("includes the books evidence section header", () => {
    const prompt = buildEvaluationPrompt({
      child: { id: "c1", name: "Lincoln", grade: "3rd" },
      weekKey: "2026-02-23",
      dayLogs: [],
      hours: [],
      dailyPlans: [],
      missedDays: 0,
      bookActivity: [],
      books: {
        booksCreated: [{ title: "New Book", pages: 4, isAiGenerated: true }],
        booksCompleted: [],
        readingSessions: { count: 0, totalMinutes: 0, booksRead: [] },
      },
      teachBacks: {
        count: 2,
        bySubject: { Reading: 2 },
        audioCount: 1,
        textCount: 1,
        examples: [],
      },
    });
    expect(prompt).toContain("Books for Lincoln this week");
    expect(prompt).toContain("Teach-backs by Lincoln this week");
    expect(prompt).toContain("1 created (1 AI-generated, 0 hand-built)");
    expect(prompt).toContain("2 total teach-back moments");
  });
});

// ── FEAT-74 (G4): synthesize-before-review ordering + isolation ─

describe("runWeeklyReviewCycleForChild — FEAT-74 ordering + failure isolation", () => {
  const db = {} as never;

  it("synthesizes the learner model BEFORE generating the review", async () => {
    const order: string[] = [];
    const synthesizeIfStale = vi.fn(async () => {
      order.push("synthesize");
      return { status: "skipped-no-model" } as never;
    });
    const assembleWeekContext = vi.fn(async () => {
      order.push("assemble");
      return {} as never;
    });
    const generateReviewForChild = vi.fn(async () => {
      order.push("generate");
      return {} as never;
    });

    await runWeeklyReviewCycleForChild(db, "fam-1", "lincoln", "Lincoln", "2026-07-12", "key", {
      synthesizeIfStale,
      assembleWeekContext,
      generateReviewForChild,
    });

    expect(synthesizeIfStale).toHaveBeenCalledTimes(1);
    expect(generateReviewForChild).toHaveBeenCalledTimes(1);
    // Synthesis must precede the review generation so the review reads a fresh model.
    expect(order.indexOf("synthesize")).toBeLessThan(order.indexOf("generate"));
  });

  it("still generates the review when synthesizeIfStale throws (failure isolation)", async () => {
    const synthesizeIfStale = vi.fn(async () => {
      throw new Error("synthesis boom");
    });
    const assembleWeekContext = vi.fn(async () => ({}) as never);
    const generateReviewForChild = vi.fn(async () => ({}) as never);

    // Must not reject — the helper swallows the synthesis error.
    await expect(
      runWeeklyReviewCycleForChild(db, "fam-1", "lincoln", "Lincoln", "2026-07-12", "key", {
        synthesizeIfStale,
        assembleWeekContext,
        generateReviewForChild,
      }),
    ).resolves.toBeUndefined();

    // The review still ran despite the synthesis failure (served-stale fallback).
    expect(generateReviewForChild).toHaveBeenCalledTimes(1);
  });

  it("does not throw when review generation fails (loop isolation)", async () => {
    const synthesizeIfStale = vi.fn(async () => undefined as never);
    const assembleWeekContext = vi.fn(async () => {
      throw new Error("assemble boom");
    });
    const generateReviewForChild = vi.fn(async () => ({}) as never);

    await expect(
      runWeeklyReviewCycleForChild(db, "fam-1", "lincoln", "Lincoln", "2026-07-12", "key", {
        synthesizeIfStale,
        assembleWeekContext,
        generateReviewForChild,
      }),
    ).resolves.toBeUndefined();

    // Synthesis still ran; review generation never reached (assemble threw).
    expect(synthesizeIfStale).toHaveBeenCalledTimes(1);
    expect(generateReviewForChild).not.toHaveBeenCalled();
  });
});

// ── FEAT-74 (G4): weekly-review addendum frontier-grounding guidance ─

describe("WEEKLY_REVIEW_ADDENDUM — learner-model frontier grounding (FEAT-74)", () => {
  it("names the LEARNER MODEL section as a grounding source", () => {
    expect(WEEKLY_REVIEW_ADDENDUM).toContain("LEARNER MODEL");
    expect(WEEKLY_REVIEW_ADDENDUM).toContain("Working edge");
    expect(WEEKLY_REVIEW_ADDENDUM).toContain("What matters next");
  });

  it("tells the AI to point recommendations/pace toward the frontier, not away", () => {
    expect(WEEKLY_REVIEW_ADDENDUM).toMatch(/point toward that frontier/i);
    // Deviations must be justified in the rationale.
    expect(WEEKLY_REVIEW_ADDENDUM).toMatch(/say why in the rationale/i);
  });

  it("grounds pace adjustments in skill progression, not completion counts", () => {
    expect(WEEKLY_REVIEW_ADDENDUM).toMatch(/Ground pace adjustments in skill progression/i);
  });
});
