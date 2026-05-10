import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./chat.js", () => ({
  loadWorkbookPaces: vi.fn().mockResolvedValue([]),
  loadWeekContext: vi.fn().mockResolvedValue(null),
  loadHoursSummary: vi.fn().mockResolvedValue({ totalMinutes: 120 }),
  loadEngagementSummary: vi.fn().mockResolvedValue([]),
  loadGradeResults: vi.fn().mockResolvedValue([]),
  loadDraftBooksByChild: vi.fn().mockResolvedValue([]),
  loadSightWordSummary: vi.fn().mockResolvedValue(""),
  loadWordMasterySummary: vi.fn().mockResolvedValue(""),
  buildKnownBlockersSection: vi.fn().mockReturnValue(""),
  buildQuestPrompt: vi.fn(),
  buildRecentCurriculumSection: vi.fn().mockReturnValue(""),
  getWeekMonday: vi.fn(),
}));

vi.mock("./chatTypes.js", () => ({
  loadRecentEvalContext: vi.fn().mockResolvedValue(""),
  loadRecentEvalHistoryByDomain: vi.fn().mockResolvedValue(""),
  formatEvalHistoryByDomain: vi.fn().mockReturnValue(""),
}));

vi.mock("./data/gatbCurriculum.js", () => ({
  getGatbProgress: vi.fn().mockReturnValue(null),
}));

import {
  buildContextForTask,
  compressEngagement,
  formatChildProfile,
  formatConceptualBlocks,
  TASK_CONTEXT,
  CHARTER_PREAMBLE,
} from "./contextSlices.js";
import type { SliceContext } from "./contextSlices.js";
import {
  loadWorkbookPaces,
  loadWeekContext,
  loadHoursSummary,
  loadEngagementSummary,
} from "./chat.js";
import { loadRecentEvalContext } from "./chatTypes.js";

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
    expect(TASK_CONTEXT.plan).toContain("activityConfigs");
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

  it("quest includes recentHistoryByDomain instead of recentEval", () => {
    expect(TASK_CONTEXT.quest).toContain("childProfile");
    expect(TASK_CONTEXT.quest).toContain("sightWords");
    expect(TASK_CONTEXT.quest).toContain("recentHistoryByDomain");
    expect(TASK_CONTEXT.quest).toContain("workbookPaces");
    expect(TASK_CONTEXT.quest).not.toContain("recentEval");
    expect(TASK_CONTEXT.quest).not.toContain("charter");
    expect(TASK_CONTEXT.quest).not.toContain("engagement");
  });

  it("plan still uses recentEval (backward compat)", () => {
    expect(TASK_CONTEXT.plan).toContain("recentEval");
    expect(TASK_CONTEXT.plan).not.toContain("recentHistoryByDomain");
  });

  it("shellyChat still uses recentEval (backward compat)", () => {
    expect(TASK_CONTEXT.shellyChat).toContain("recentEval");
  });

  it("shellyChat wires the added context slices (skillSnapshot, recentHistoryByDomain, recentScans, dayToday, dadLabReports)", () => {
    expect(TASK_CONTEXT.shellyChat).toContain("skillSnapshot");
    expect(TASK_CONTEXT.shellyChat).toContain("recentHistoryByDomain");
    expect(TASK_CONTEXT.shellyChat).toContain("recentScans");
    expect(TASK_CONTEXT.shellyChat).toContain("dayToday");
    expect(TASK_CONTEXT.shellyChat).toContain("dadLabReports");
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

// ── formatConceptualBlocks ────────────────────────────────────

describe("formatConceptualBlocks", () => {
  it("returns an empty array when there are no blocks", () => {
    expect(formatConceptualBlocks([])).toEqual([]);
  });

  it("emits ADDRESS_NOW blocks with strategies", () => {
    const lines = formatConceptualBlocks([
      {
        name: "Short i/e",
        affectedSkills: ["phonics.short-i-e"],
        status: "ADDRESS_NOW",
        rationale: "Confuses bid and bed.",
        strategies: ["Minimal pairs drill"],
      },
    ]);
    expect(lines[0]).toContain("ADDRESS NOW");
    expect(lines[1]).toContain("Short i/e");
    expect(lines[1]).toContain("Minimal pairs drill");
  });

  it("emits RESOLVING blocks in their own section", () => {
    const lines = formatConceptualBlocks([
      {
        name: "Digraph /oo/",
        affectedSkills: ["phonics.digraph-oo"],
        status: "RESOLVING",
        rationale: "4 correct this week.",
      },
    ]);
    expect(lines.some((l) => l.includes("RESOLVING"))).toBe(true);
    expect(lines.some((l) => l.includes("Digraph /oo/"))).toBe(true);
  });

  it("emits DEFER blocks so the AI knows what NOT to push on", () => {
    const lines = formatConceptualBlocks([
      {
        name: "Working memory load",
        affectedSkills: ["math.multi-step"],
        status: "DEFER",
        rationale: "Developmental — expected to resolve.",
        deferNote: "Revisit at age 8.",
      },
    ]);
    expect(lines.some((l) => l.includes("DEFERRED"))).toBe(true);
    expect(lines.some((l) => l.includes("Working memory load"))).toBe(true);
    expect(lines.some((l) => l.includes("Revisit at age 8."))).toBe(true);
  });

  it("falls back to legacy recommendation when status is absent", () => {
    const lines = formatConceptualBlocks([
      {
        name: "Legacy",
        affectedSkills: ["x"],
        recommendation: "DEFER",
        rationale: "Old block.",
        deferNote: "Revisit later.",
      },
    ]);
    expect(lines.some((l) => l.includes("DEFERRED"))).toBe(true);
  });

  it("omits RESOLVED blocks from AI context", () => {
    const lines = formatConceptualBlocks([
      {
        name: "Should not appear",
        affectedSkills: ["x"],
        status: "RESOLVED",
        rationale: "Already fixed.",
      },
    ]);
    expect(lines).toEqual([]);
  });

  it("groups multiple blocks into the correct sections", () => {
    const lines = formatConceptualBlocks([
      { name: "A", affectedSkills: [], status: "ADDRESS_NOW", rationale: "r1" },
      { name: "B", affectedSkills: [], status: "RESOLVING", rationale: "r2" },
      { name: "C", affectedSkills: [], status: "DEFER", rationale: "r3" },
    ]);
    const joined = lines.join("\n");
    expect(joined).toContain("ADDRESS NOW");
    expect(joined).toContain("RESOLVING");
    expect(joined).toContain("DEFERRED");
  });
});

// ── buildContextForTask ───────────────────────────────────────────

describe("buildContextForTask", () => {
  const mockDb = {} as SliceContext["db"];

  function makeCtx(overrides: Partial<SliceContext> = {}): SliceContext {
    return {
      db: mockDb,
      familyId: "fam-1",
      childId: "child-1",
      childData: { name: "Lincoln", grade: "3rd" },
      snapshotData: {
        prioritySkills: [{ tag: "reading.phonics", label: "Phonics", level: "Emerging" }],
        supports: [{ label: "Visual checklist", description: "Step-by-step" }],
        stopRules: [{ label: "Frustration", trigger: "3 misses", action: "Switch" }],
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("'plan' task includes charter + childProfile and fires Firestore fetches", async () => {
    const sections = await buildContextForTask("plan", makeCtx());

    const joined = sections.join("\n");
    expect(joined).toContain("First Principles Engine");
    expect(joined).toContain("Name: Lincoln");
    expect(joined).toContain("Grade: 3rd");
    expect(joined).toContain("Phonics (reading.phonics): Emerging");

    // Verify plan-specific slices were fetched
    expect(loadWorkbookPaces).toHaveBeenCalledWith(mockDb, "fam-1", "child-1");
    expect(loadWeekContext).toHaveBeenCalledWith(mockDb, "fam-1");
    expect(loadHoursSummary).toHaveBeenCalledWith(mockDb, "fam-1", "child-1");
    expect(loadEngagementSummary).toHaveBeenCalledWith(mockDb, "fam-1", "child-1");
  });

  it("'chat' task includes only charter + childProfile (no Firestore fetches)", async () => {
    const sections = await buildContextForTask("chat", makeCtx());

    const joined = sections.join("\n");
    expect(joined).toContain("First Principles Engine");
    expect(joined).toContain("Name: Lincoln");

    // No Firestore slices should be fetched for chat
    expect(loadWorkbookPaces).not.toHaveBeenCalled();
    expect(loadWeekContext).not.toHaveBeenCalled();
    expect(loadHoursSummary).not.toHaveBeenCalled();
    expect(loadEngagementSummary).not.toHaveBeenCalled();
    expect(loadRecentEvalContext).not.toHaveBeenCalled();
  });

  it("unknown task type falls back to 'chat' slices", async () => {
    const sections = await buildContextForTask("nonexistent_task_xyz", makeCtx());

    const joined = sections.join("\n");
    // Falls back to chat = ["charter", "childProfile"]
    expect(joined).toContain("First Principles Engine");
    expect(joined).toContain("Name: Lincoln");

    // No Firestore slices fetched
    expect(loadWorkbookPaces).not.toHaveBeenCalled();
    expect(loadWeekContext).not.toHaveBeenCalled();
  });

  it("generates child profile without skills when snapshotData is undefined", async () => {
    const sections = await buildContextForTask("chat", makeCtx({ snapshotData: undefined }));

    const joined = sections.join("\n");
    expect(joined).toContain("Name: Lincoln");
    expect(joined).toContain("Grade: 3rd");
    // Should not crash or include skill-related content
    expect(joined).not.toContain("Phonics");
  });

  it("gracefully skips a failed Firestore slice (Promise.allSettled)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(loadWorkbookPaces).mockRejectedValueOnce(new Error("Firestore unavailable"));

    const sections = await buildContextForTask("plan", makeCtx());

    // Should still return sections (charter + childProfile + other successful slices)
    expect(sections.length).toBeGreaterThan(0);
    const joined = sections.join("\n");
    expect(joined).toContain("Name: Lincoln");

    // Should log the warning for the failed slice
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("workbookPaces"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
