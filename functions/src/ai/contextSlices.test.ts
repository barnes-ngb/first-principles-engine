import { describe, expect, it } from "vitest";
import {
  buildMasterySummary,
  compressEngagement,
  formatChildProfile,
  formatMasterySummary,
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

// ── TASK_CONTEXT additional coverage ──────────────────────────

describe("TASK_CONTEXT — additional task types", () => {
  it("shellyChat includes charter, childProfile, engagement, and weekFocus", () => {
    expect(TASK_CONTEXT.shellyChat).toContain("charter");
    expect(TASK_CONTEXT.shellyChat).toContain("childProfile");
    expect(TASK_CONTEXT.shellyChat).toContain("engagement");
    expect(TASK_CONTEXT.shellyChat).toContain("weekFocus");
    expect(TASK_CONTEXT.shellyChat).toContain("gradeResults");
    expect(TASK_CONTEXT.shellyChat).toContain("workbookPaces");
  });

  it("scan includes childProfile, recentEval, skillSnapshot, activityConfigs", () => {
    expect(TASK_CONTEXT.scan).toContain("childProfile");
    expect(TASK_CONTEXT.scan).toContain("recentEval");
    expect(TASK_CONTEXT.scan).toContain("skillSnapshot");
    expect(TASK_CONTEXT.scan).toContain("activityConfigs");
    expect(TASK_CONTEXT.scan).not.toContain("charter");
    expect(TASK_CONTEXT.scan).not.toContain("weekFocus");
  });

  it("disposition includes charter, childProfile, engagement, and gradeResults", () => {
    expect(TASK_CONTEXT.disposition).toContain("charter");
    expect(TASK_CONTEXT.disposition).toContain("childProfile");
    expect(TASK_CONTEXT.disposition).toContain("engagement");
    expect(TASK_CONTEXT.disposition).toContain("gradeResults");
    expect(TASK_CONTEXT.disposition).not.toContain("workbookPaces");
    expect(TASK_CONTEXT.disposition).not.toContain("sightWords");
  });

  it("workshop includes charter, childProfile, and workshopGames", () => {
    expect(TASK_CONTEXT.workshop).toContain("charter");
    expect(TASK_CONTEXT.workshop).toContain("childProfile");
    expect(TASK_CONTEXT.workshop).toContain("workshopGames");
    expect(TASK_CONTEXT.workshop).not.toContain("engagement");
  });

  it("generate has same slices as chat (charter + childProfile)", () => {
    expect(TASK_CONTEXT.generate).toEqual(["charter", "childProfile"]);
  });

  it("generateStory includes childProfile and sightWords", () => {
    expect(TASK_CONTEXT.generateStory).toContain("childProfile");
    expect(TASK_CONTEXT.generateStory).toContain("sightWords");
    expect(TASK_CONTEXT.generateStory).toContain("wordMastery");
    expect(TASK_CONTEXT.generateStory).not.toContain("workbookPaces");
  });

  it("analyzePatterns includes only childProfile", () => {
    expect(TASK_CONTEXT.analyzePatterns).toEqual(["childProfile"]);
  });

  it("quest includes skillSnapshot and workbookPaces but not charter", () => {
    expect(TASK_CONTEXT.quest).toContain("skillSnapshot");
    expect(TASK_CONTEXT.quest).toContain("workbookPaces");
    expect(TASK_CONTEXT.quest).not.toContain("charter");
  });

  it("plan is the most comprehensive (has the most slices)", () => {
    const planSliceCount = TASK_CONTEXT.plan.length;
    for (const [taskType, slices] of Object.entries(TASK_CONTEXT)) {
      if (taskType === "plan") continue;
      expect(slices.length).toBeLessThanOrEqual(planSliceCount);
    }
  });
});

// ── buildMasterySummary ───────────────────────────────────────

describe("buildMasterySummary", () => {
  it("returns empty array for empty day logs", () => {
    expect(buildMasterySummary([])).toEqual([]);
  });

  it("returns empty array when no items have mastery feedback", () => {
    const logs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Math (20m)", completed: true },
          { label: "Reading (15m)", completed: false },
        ],
      },
    ];
    expect(buildMasterySummary(logs)).toEqual([]);
  });

  it("counts got-it, working, and stuck mastery levels", () => {
    const logs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Math drills", completed: true, mastery: "got-it", subjectBucket: "Math" },
        ],
      },
      {
        date: "2026-01-11",
        checklist: [
          { label: "Math drills", completed: true, mastery: "got-it", subjectBucket: "Math" },
        ],
      },
      {
        date: "2026-01-12",
        checklist: [
          { label: "Math drills", completed: true, mastery: "stuck", subjectBucket: "Math" },
        ],
      },
    ];
    const result = buildMasterySummary(logs);
    expect(result).toHaveLength(1);
    expect(result[0].activity).toBe("Math drills");
    expect(result[0].gotIt).toBe(2);
    expect(result[0].stuck).toBe(1);
    expect(result[0].working).toBe(0);
  });

  it("strips time notation from label for grouping", () => {
    const logs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Reading practice (15m)", completed: true, mastery: "got-it" },
        ],
      },
      {
        date: "2026-01-11",
        checklist: [
          { label: "Reading practice (15m)", completed: true, mastery: "working" },
        ],
      },
    ];
    const result = buildMasterySummary(logs);
    expect(result).toHaveLength(1);
    expect(result[0].activity).toBe("Reading practice");
    expect(result[0].gotIt).toBe(1);
    expect(result[0].working).toBe(1);
  });

  it("ignores incomplete checklist items", () => {
    const logs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Skipped task", completed: false, mastery: "stuck" },
        ],
      },
    ];
    expect(buildMasterySummary(logs)).toEqual([]);
  });

  it("tracks lastSeen date correctly (most recent wins)", () => {
    const logs = [
      {
        date: "2026-01-08",
        checklist: [
          { label: "Phonics", completed: true, mastery: "working" },
        ],
      },
      {
        date: "2026-01-12",
        checklist: [
          { label: "Phonics", completed: true, mastery: "got-it" },
        ],
      },
    ];
    const result = buildMasterySummary(logs);
    expect(result[0].lastSeen).toBe("2026-01-12");
  });

  it("sorts by struggle score descending (stuck * 3 + working * 2 + gotIt)", () => {
    const logs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Easy task", completed: true, mastery: "got-it", subjectBucket: "Reading" },
          { label: "Hard task", completed: true, mastery: "stuck", subjectBucket: "Math" },
        ],
      },
    ];
    const result = buildMasterySummary(logs);
    expect(result).toHaveLength(2);
    // Hard task (stuck=1, score=3) should come before Easy task (gotIt=1, score=1)
    expect(result[0].activity).toBe("Hard task");
    expect(result[1].activity).toBe("Easy task");
  });

  it("handles missing checklist gracefully", () => {
    const logs = [
      { date: "2026-01-10", checklist: [] },
      { date: "2026-01-11" } as { date: string; checklist: never[] },
    ];
    expect(buildMasterySummary(logs)).toEqual([]);
  });

  it("defaults subjectBucket to Other when not provided", () => {
    const logs = [
      {
        date: "2026-01-10",
        checklist: [
          { label: "Mystery activity", completed: true, mastery: "got-it" },
        ],
      },
    ];
    const result = buildMasterySummary(logs);
    expect(result[0].subjectBucket).toBe("Other");
  });
});

// ── formatMasterySummary ──────────────────────────────────────

describe("formatMasterySummary", () => {
  it("returns empty string for empty summaries", () => {
    expect(formatMasterySummary([])).toBe("");
  });

  it("categorizes mastered activities (gotIt >= 2, no stuck/working) as CAN SKIP", () => {
    const summaries = [
      { activity: "Sight words", subjectBucket: "Reading", gotIt: 3, working: 0, stuck: 0, lastSeen: "2026-01-12" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("CAN SKIP: Sight words");
  });

  it("categorizes activities with working or mixed as CONTINUE", () => {
    const summaries = [
      { activity: "Phonics", subjectBucket: "Reading", gotIt: 1, working: 2, stuck: 0, lastSeen: "2026-01-12" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("CONTINUE: Phonics");
  });

  it("categorizes activities with stuck >= 2 as FOCUS HERE", () => {
    const summaries = [
      { activity: "Subtraction", subjectBucket: "Math", gotIt: 0, working: 0, stuck: 3, lastSeen: "2026-01-12" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("FOCUS HERE: Subtraction");
  });

  it("includes header line", () => {
    const summaries = [
      { activity: "Reading", subjectBucket: "Reading", gotIt: 2, working: 0, stuck: 0, lastSeen: "2026-01-12" },
    ];
    const result = formatMasterySummary(summaries);
    expect(result).toContain("MASTERY OBSERVATIONS (parent feedback, last 4 weeks):");
  });

  it("handles activity appearing in multiple categories", () => {
    const summaries = [
      // This activity has both gotIt and stuck, so it's "developing" (CONTINUE)
      // but also has stuck >= 2, so it's also FOCUS HERE
      { activity: "Math facts", subjectBucket: "Math", gotIt: 2, working: 0, stuck: 2, lastSeen: "2026-01-12" },
    ];
    const result = formatMasterySummary(summaries);
    // gotIt >= 2 but stuck > 0, so not CAN SKIP
    // gotIt > 0 and stuck > 0 → CONTINUE
    // stuck >= 2 → FOCUS HERE
    expect(result).toContain("CONTINUE: Math facts");
    expect(result).toContain("FOCUS HERE: Math facts");
  });
});
