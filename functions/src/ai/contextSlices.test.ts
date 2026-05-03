import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildMasterySummary,
  formatMasterySummary,
  compressEngagement,
  formatChildProfile,
  formatConceptualBlocks,
  buildContextForTask,
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

// ── buildMasterySummary ──────────────────────────────────────

describe("buildMasterySummary", () => {
  it("returns empty array for no data", () => {
    expect(buildMasterySummary([])).toEqual([]);
  });

  it("returns empty array when no completed items have mastery", () => {
    const dayLogs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Reading Eggs (45m)", completed: true },
          { label: "Math (20m)", completed: false, mastery: "got-it" },
        ],
      },
    ];
    expect(buildMasterySummary(dayLogs)).toEqual([]);
  });

  it("aggregates mastery counts across days", () => {
    const dayLogs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Reading Eggs (45m)", completed: true, mastery: "got-it", subjectBucket: "Reading" },
        ],
      },
      {
        date: "2026-01-11",
        checklist: [
          { label: "Reading Eggs (45m)", completed: true, mastery: "working", subjectBucket: "Reading" },
        ],
      },
      {
        date: "2026-01-12",
        checklist: [
          { label: "Reading Eggs (45m)", completed: true, mastery: "got-it", subjectBucket: "Reading" },
        ],
      },
    ];
    const result = buildMasterySummary(dayLogs);
    expect(result).toHaveLength(1);
    expect(result[0].activity).toBe("Reading Eggs");
    expect(result[0].gotIt).toBe(2);
    expect(result[0].working).toBe(1);
    expect(result[0].stuck).toBe(0);
  });

  it("strips time suffix from labels when grouping", () => {
    const dayLogs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Math Practice (20m)", completed: true, mastery: "stuck", subjectBucket: "Math" },
          { label: "Math Practice (30m)", completed: true, mastery: "working", subjectBucket: "Math" },
        ],
      },
    ];
    const result = buildMasterySummary(dayLogs);
    expect(result).toHaveLength(1);
    expect(result[0].activity).toBe("Math Practice");
    expect(result[0].stuck).toBe(1);
    expect(result[0].working).toBe(1);
  });

  it("tracks lastSeen as the most recent date", () => {
    const dayLogs = [
      {
        date: "2026-01-10",
        checklist: [{ label: "Phonics (15m)", completed: true, mastery: "got-it" }],
      },
      {
        date: "2026-01-15",
        checklist: [{ label: "Phonics (15m)", completed: true, mastery: "got-it" }],
      },
    ];
    const result = buildMasterySummary(dayLogs);
    expect(result[0].lastSeen).toBe("2026-01-15");
  });

  it("sorts by weighted score (stuck * 3 + working * 2 + gotIt) descending", () => {
    const dayLogs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Easy Activity", completed: true, mastery: "got-it" },
          { label: "Hard Activity", completed: true, mastery: "stuck" },
          { label: "Medium Activity", completed: true, mastery: "working" },
        ],
      },
    ];
    const result = buildMasterySummary(dayLogs);
    expect(result[0].activity).toBe("Hard Activity");
    expect(result[1].activity).toBe("Medium Activity");
    expect(result[2].activity).toBe("Easy Activity");
  });

  it("defaults subjectBucket to 'Other' when not provided", () => {
    const dayLogs = [
      {
        date: "2026-01-10",
        checklist: [{ label: "Mystery (10m)", completed: true, mastery: "got-it" }],
      },
    ];
    const result = buildMasterySummary(dayLogs);
    expect(result[0].subjectBucket).toBe("Other");
  });

  it("handles empty checklist arrays gracefully", () => {
    const dayLogs = [
      { date: "2026-01-10", checklist: [] },
      { date: "2026-01-11" } as { date: string; checklist: never[] },
    ];
    expect(buildMasterySummary(dayLogs)).toEqual([]);
  });
});

// ── formatMasterySummary ─────────────────────────────────────

describe("formatMasterySummary", () => {
  it("returns empty string for no summaries", () => {
    expect(formatMasterySummary([])).toBe("");
  });

  it("categorizes mastered activities as CAN SKIP", () => {
    const summaries = [
      { activity: "Reading Eggs", subjectBucket: "Reading", gotIt: 3, working: 0, stuck: 0, lastSeen: "2026-01-15" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("CAN SKIP");
    expect(result).toContain("Reading Eggs");
  });

  it("categorizes developing activities as CONTINUE", () => {
    const summaries = [
      { activity: "Math Drills", subjectBucket: "Math", gotIt: 1, working: 2, stuck: 0, lastSeen: "2026-01-15" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("CONTINUE");
    expect(result).toContain("Math Drills");
  });

  it("categorizes struggling activities as FOCUS HERE", () => {
    const summaries = [
      { activity: "Phonics", subjectBucket: "Reading", gotIt: 0, working: 0, stuck: 3, lastSeen: "2026-01-15" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("FOCUS HERE");
    expect(result).toContain("Phonics");
  });

  it("includes header line", () => {
    const summaries = [
      { activity: "X", subjectBucket: "Other", gotIt: 2, working: 0, stuck: 0, lastSeen: "2026-01-15" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("MASTERY OBSERVATIONS");
  });

  it("categorizes mixed activities into multiple buckets", () => {
    const summaries = [
      { activity: "Mixed", subjectBucket: "Reading", gotIt: 2, working: 0, stuck: 2, lastSeen: "2026-01-15" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("CONTINUE");
    expect(result).toContain("FOCUS HERE");
  });

  it("does not show CAN SKIP for activities with any working or stuck", () => {
    const summaries = [
      { activity: "Almost", subjectBucket: "Math", gotIt: 5, working: 1, stuck: 0, lastSeen: "2026-01-15" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).not.toContain("CAN SKIP");
    expect(result).toContain("CONTINUE");
  });
});

// ── buildContextForTask ──────────────────────────────────────

describe("buildContextForTask", () => {
  // Mock the loader functions used by buildContextForTask
  vi.mock("./chat.js", () => ({
    loadWorkbookPaces: vi.fn().mockResolvedValue([]),
    loadWeekContext: vi.fn().mockResolvedValue(null),
    loadHoursSummary: vi.fn().mockResolvedValue({ totalMinutes: 0 }),
    loadEngagementSummary: vi.fn().mockResolvedValue([]),
    loadGradeResults: vi.fn().mockResolvedValue([]),
    loadDraftBooksByChild: vi.fn().mockResolvedValue([]),
    loadSightWordSummary: vi.fn().mockResolvedValue(""),
    loadWordMasterySummary: vi.fn().mockResolvedValue(""),
  }));

  vi.mock("./chatTypes.js", () => ({
    loadRecentEvalContext: vi.fn().mockResolvedValue(""),
    loadRecentEvalHistoryByDomain: vi.fn().mockResolvedValue(""),
    formatEvalHistoryByDomain: vi.fn((text: string) => text || null),
  }));

  vi.mock("./data/gatbCurriculum.js", () => ({
    getGatbProgress: vi.fn().mockReturnValue(null),
  }));

  const mockDb = {} as never;

  const baseCtx = {
    db: mockDb,
    familyId: "fam-1",
    childId: "child-1",
    childData: { name: "Lincoln", grade: "3rd" },
    snapshotData: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes charter and child profile for 'chat' task", async () => {
    const sections = await buildContextForTask("chat", baseCtx);

    const joined = sections.join("\n");
    expect(joined).toContain("First Principles Engine");
    expect(joined).toContain("Name: Lincoln");
    expect(joined).toContain("Grade: 3rd");
  });

  it("falls back to 'chat' slices for unknown task type", async () => {
    const chatSections = await buildContextForTask("chat", baseCtx);
    const unknownSections = await buildContextForTask("nonexistent_task", baseCtx);

    expect(unknownSections.length).toBe(chatSections.length);
  });

  it("generates child profile without skills when snapshotData is undefined", async () => {
    const sections = await buildContextForTask("chat", baseCtx);
    const joined = sections.join("\n");

    expect(joined).toContain("Name: Lincoln");
    expect(joined).not.toContain("Priority skills:");
  });

  it("includes priority skills when snapshotData is provided", async () => {
    const ctx = {
      ...baseCtx,
      snapshotData: {
        prioritySkills: [
          { tag: "reading.phonics", label: "Phonics", level: "Emerging" },
        ],
        supports: [],
        stopRules: [],
      } as never,
    };
    const sections = await buildContextForTask("chat", ctx);
    const joined = sections.join("\n");

    expect(joined).toContain("Phonics (reading.phonics): Emerging");
  });

  it("does not include charter for 'quest' task", async () => {
    const sections = await buildContextForTask("quest", baseCtx);
    const joined = sections.join("\n");

    expect(joined).not.toContain("CHARTER VALUES");
    expect(joined).toContain("Name: Lincoln");
  });

  it("plan task requests more slices than chat", async () => {
    expect(TASK_CONTEXT["plan"].length).toBeGreaterThan(
      TASK_CONTEXT["chat"].length,
    );
  });
});
