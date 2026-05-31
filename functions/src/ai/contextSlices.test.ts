import { describe, expect, it } from "vitest";
import {
  compressEngagement,
  formatChildProfile,
  formatChildSkillMap,
  formatConceptualBlocks,
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

  it("chat task slice list is unchanged by chat-link Phase 1 (cross-task isolation)", () => {
    // Phase 1 added context only to shellyChat. The `chat` task is used by
    // kid-facing utilities (StoryGuidePage, useComprehensionQuestions) — it
    // must not gain Lincoln's eval trajectory, disposition cache, or
    // teach-back history. If this test fails, a shellyChat change leaked.
    expect(TASK_CONTEXT.chat).toEqual(["charter", "childProfile"]);
    expect(TASK_CONTEXT.chat).not.toContain("recentHistoryByDomain");
    expect(TASK_CONTEXT.chat).not.toContain("skillSnapshot");
    expect(TASK_CONTEXT.chat).not.toContain("dayToday");
    expect(TASK_CONTEXT.chat).not.toContain("dadLabReports");
    expect(TASK_CONTEXT.chat).not.toContain("recentEval");
    expect(TASK_CONTEXT.chat).not.toContain("engagement");
    // `generate` is dispatched through handleChat too — keep it at parity.
    expect(TASK_CONTEXT.generate).toEqual(["charter", "childProfile"]);
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

  it("plan adds recentHistoryByDomain while keeping recentEval (G50: additive migration)", () => {
    expect(TASK_CONTEXT.plan).toContain("recentEval");
    expect(TASK_CONTEXT.plan).toContain("recentHistoryByDomain");
  });

  it("scan adds recentHistoryByDomain while keeping recentEval (G50: additive migration)", () => {
    expect(TASK_CONTEXT.scan).toContain("recentEval");
    expect(TASK_CONTEXT.scan).toContain("recentHistoryByDomain");
  });

  it("weeklyReview uses recentHistoryByDomain (G50 closure)", () => {
    expect(TASK_CONTEXT.weeklyReview).toContain("recentHistoryByDomain");
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

  it("shellyChat wires the childSkillMap coverage slice (FUNC-03 Tier A)", () => {
    expect(TASK_CONTEXT.shellyChat).toContain("childSkillMap");
  });

  it("childSkillMap is shellyChat-only — no other task reads coverage directly (FUNC-01 authority table)", () => {
    for (const [task, slices] of Object.entries(TASK_CONTEXT)) {
      if (task === "shellyChat") continue;
      expect(slices).not.toContain("childSkillMap");
    }
  });

  // ── Story Generation V2 Phase 1: generateStory slice list ──

  it("generateStory wires childProfile, sightWords, wordMastery, and skillSnapshot", () => {
    expect(TASK_CONTEXT.generateStory).toContain("childProfile");
    expect(TASK_CONTEXT.generateStory).toContain("sightWords");
    expect(TASK_CONTEXT.generateStory).toContain("wordMastery");
    // Phase 1 adds skillSnapshot so the AI can calibrate vocabulary from
    // the child's actual reading level rather than the old binary isYounger.
    expect(TASK_CONTEXT.generateStory).toContain("skillSnapshot");
  });

  it("generateStory cross-task isolation guard: does not pull planner-scoped slices", () => {
    // Story generation should NOT see engagement history, hours, weekly focus,
    // workbook paces, or recent eval — those are planner/shellyChat scope.
    // If this test fails, a slice from another task leaked into generateStory.
    expect(TASK_CONTEXT.generateStory).not.toContain("engagement");
    expect(TASK_CONTEXT.generateStory).not.toContain("hoursProgress");
    expect(TASK_CONTEXT.generateStory).not.toContain("weekFocus");
    expect(TASK_CONTEXT.generateStory).not.toContain("workbookPaces");
    expect(TASK_CONTEXT.generateStory).not.toContain("recentEval");
  });

  // ── Story Generation V2 Phase 2 PR-A: reviseStory slice list ──

  it("reviseStory wires childProfile, sightWords, wordMastery, and skillSnapshot", () => {
    // Matches generateStory — same per-child calibration needs.
    expect(TASK_CONTEXT.reviseStory).toContain("childProfile");
    expect(TASK_CONTEXT.reviseStory).toContain("sightWords");
    expect(TASK_CONTEXT.reviseStory).toContain("wordMastery");
    expect(TASK_CONTEXT.reviseStory).toContain("skillSnapshot");
  });

  it("reviseStory cross-task isolation guard: does not pull planner-scoped slices", () => {
    // If this test fails, a slice from another task leaked into reviseStory.
    expect(TASK_CONTEXT.reviseStory).not.toContain("engagement");
    expect(TASK_CONTEXT.reviseStory).not.toContain("hoursProgress");
    expect(TASK_CONTEXT.reviseStory).not.toContain("weekFocus");
    expect(TASK_CONTEXT.reviseStory).not.toContain("workbookPaces");
    expect(TASK_CONTEXT.reviseStory).not.toContain("recentEval");
  });

  // ── Story Generation V2 Phase 2 PR-B: revisePage slice list ──

  it("revisePage wires childProfile, sightWords, wordMastery, and skillSnapshot", () => {
    // Matches generateStory + reviseStory — same per-child calibration needs.
    expect(TASK_CONTEXT.revisePage).toContain("childProfile");
    expect(TASK_CONTEXT.revisePage).toContain("sightWords");
    expect(TASK_CONTEXT.revisePage).toContain("wordMastery");
    expect(TASK_CONTEXT.revisePage).toContain("skillSnapshot");
  });

  it("revisePage cross-task isolation guard: does not pull planner-scoped slices", () => {
    // If this test fails, a slice from another task leaked into revisePage.
    expect(TASK_CONTEXT.revisePage).not.toContain("engagement");
    expect(TASK_CONTEXT.revisePage).not.toContain("hoursProgress");
    expect(TASK_CONTEXT.revisePage).not.toContain("weekFocus");
    expect(TASK_CONTEXT.revisePage).not.toContain("workbookPaces");
    expect(TASK_CONTEXT.revisePage).not.toContain("recentEval");
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

  it("includes soft-profile fields (motivators / interests / strengths)", () => {
    const result = formatChildProfile({
      name: "Lincoln",
      motivators: "Minecraft, Lego, art",
      interests: "dinosaurs, building",
      strengths: "persistence, visual memory",
    });
    expect(result).toContain("Motivators: Minecraft, Lego, art");
    expect(result).toContain("Interests: dinosaurs, building");
    expect(result).toContain("Strengths: persistence, visual memory");
  });

  it("omits soft-profile fields when absent or blank (no-migration guarantee)", () => {
    // A child doc without the new fields still formats cleanly.
    const result = formatChildProfile({ name: "London" });
    expect(result).toContain("Name: London");
    expect(result).not.toContain("Motivators:");
    expect(result).not.toContain("Interests:");
    expect(result).not.toContain("Strengths:");

    // Blank/whitespace strings are treated as absent.
    const blank = formatChildProfile({
      name: "London",
      motivators: "   ",
      interests: "",
    });
    expect(blank).not.toContain("Motivators:");
    expect(blank).not.toContain("Interests:");
  });
});

// ── formatChildSkillMap ────────────────────────────────────────

describe("formatChildSkillMap", () => {
  function lincolnSkillMap() {
    return {
      childId: "lincoln",
      updatedAt: "2026-05-28T18:00:00.000Z",
      skills: {
        "reading.phonics.letterSounds": {
          nodeId: "reading.phonics.letterSounds",
          status: "mastered",
          source: "program",
          updatedAt: "2026-04-10T18:00:00.000Z",
        },
        "reading.phonics.cvc": {
          nodeId: "reading.phonics.cvc",
          status: "mastered",
          source: "evaluation",
          updatedAt: "2026-05-01T18:00:00.000Z",
        },
        "reading.phonics.blends": {
          nodeId: "reading.phonics.blends",
          status: "in-progress",
          source: "evaluation",
          updatedAt: "2026-05-27T18:00:00.000Z",
        },
        "math.numberSense.placeValue": {
          nodeId: "math.numberSense.placeValue",
          status: "mastered",
          source: "evaluation",
          updatedAt: "2026-05-28T18:00:00.000Z",
        },
        "math.operations.multiDigitAddition": {
          nodeId: "math.operations.multiDigitAddition",
          status: "in-progress",
          source: "manual",
          updatedAt: "2026-05-20T18:00:00.000Z",
        },
        "writing.handwriting.letterFormation": {
          nodeId: "writing.handwriting.letterFormation",
          status: "not-started",
          source: "manual",
          updatedAt: "2026-03-01T18:00:00.000Z",
        },
      },
    };
  }

  it("emits a compact coverage summary: totals, per-domain, frontier, recently advanced", () => {
    const out = formatChildSkillMap(lincolnSkillMap());

    // Header.
    expect(out).toContain("CURRICULUM MAP / COVERAGE:");
    // Totals line (6 tracked: 3 mastered, 2 in progress, 1 not started).
    expect(out).toContain("6 curriculum nodes tracked: 3 mastered, 2 in progress, 1 not yet started.");
    // Per-domain breakdown with mastered counts.
    expect(out).toMatch(/reading 3 \(2 mastered\)/);
    expect(out).toMatch(/math 2 \(1 mastered\)/);
    expect(out).toMatch(/writing 1 \(0 mastered\)/);
    // Frontier — in-progress node leaf labels (humanized).
    expect(out).toContain("Currently working on:");
    expect(out).toContain("blends");
    expect(out).toContain("multi digit addition");
    // Recently advanced — most-recent first (place value May 28 leads).
    expect(out).toContain("Recently advanced:");
    const placeValueIdx = out.indexOf("place value");
    const blendsIdx = out.lastIndexOf("blends");
    expect(placeValueIdx).toBeGreaterThan(0);
    expect(placeValueIdx).toBeLessThan(blendsIdx);
  });

  it("is coverage-only — never emits per-skill grades / working levels", () => {
    const out = formatChildSkillMap(lincolnSkillMap());
    // The SKILL SNAPSHOT slice owns levels; coverage must not duplicate them.
    expect(out).not.toMatch(/Level \d/);
    expect(out).not.toContain("Working level");
    expect(out).not.toContain("Priority Skills");
  });

  it("returns empty string when the doc is missing (omit, don't explain absence)", () => {
    expect(formatChildSkillMap(undefined)).toBe("");
  });

  it("returns empty string when the map has no nodes", () => {
    expect(formatChildSkillMap({ childId: "lincoln", skills: {}, updatedAt: "x" })).toBe("");
    expect(formatChildSkillMap({})).toBe("");
  });

  it("falls back to the record key as nodeId when the entry omits nodeId", () => {
    const out = formatChildSkillMap({
      skills: {
        "reading.fluency.phrasing": { status: "in-progress", source: "manual", updatedAt: "2026-05-10T00:00:00.000Z" },
      },
    });
    expect(out).toContain("1 curriculum nodes tracked: 0 mastered, 1 in progress, 0 not yet started.");
    expect(out).toContain("phrasing");
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
