import { describe, expect, it } from "vitest";
import {
  buildKnownBlockersSection,
  buildQuestPrompt,
  buildRecentCurriculumSection,
  getWeekMonday,
} from "./chat.js";

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

// ── Phase 2: KNOWN BLOCKERS prompt section ─────────────────────

describe("buildKnownBlockersSection", () => {
  it("returns empty string when no blockers are provided", () => {
    expect(buildKnownBlockersSection(undefined)).toBe("");
    expect(buildKnownBlockersSection([])).toBe("");
  });

  it("emits ADDRESS_NOW and RESOLVING sections with ids and example words", () => {
    const section = buildKnownBlockersSection([
      {
        id: "short-i-vs-e",
        name: "Short vowel i vs e",
        status: "ADDRESS_NOW",
        affectedSkills: ["phonics.short-i-vs-e"],
        rationale: "2 wrong on bed/bid in last session",
        specificWords: ["bed", "bid", "ten", "tin"],
      },
      {
        id: "digraph-oo",
        name: "Digraph /oo/",
        status: "RESOLVING",
        affectedSkills: ["phonics.digraphs"],
        rationale: "Trending up after practice",
        specificWords: ["moon", "zoo"],
      },
    ]);

    expect(section).toContain("## KNOWN BLOCKERS");
    expect(section).toContain("ADDRESS_NOW blockers");
    expect(section).toContain("RESOLVING blockers");
    expect(section).toContain('id="short-i-vs-e"');
    expect(section).toContain('id="digraph-oo"');
    expect(section).toContain("bed, bid");
    expect(section).toContain("targetedBlockerId");
    // Distribution rules must be present so the AI scales with count
    expect(section).toContain("2 targeted questions");
  });

  it("handles ADDRESS_NOW-only lists (no RESOLVING header)", () => {
    const section = buildKnownBlockersSection([
      {
        id: "cvc-blending",
        name: "CVC blending",
        status: "ADDRESS_NOW",
        affectedSkills: ["phonics.cvc"],
      },
    ]);
    expect(section).toContain("ADDRESS_NOW blockers");
    expect(section).not.toContain("RESOLVING blockers");
  });
});

describe("buildRecentCurriculumSection", () => {
  it("returns empty string when there are no recent scans", () => {
    expect(buildRecentCurriculumSection(false)).toBe("");
  });

  it("emits the RECENT CURRICULUM framing when scans are present", () => {
    const section = buildRecentCurriculumSection(true);
    expect(section).toContain("## RECENT CURRICULUM");
    expect(section).toContain("RECENT WORKBOOK SCANS");
    expect(section).toContain("NOT mandatory");
    expect(section).toContain("targetedBlockerId");
  });
});

describe("buildQuestPrompt — phase 2 extras", () => {
  it("appends KNOWN BLOCKERS and RECENT CURRICULUM for reading phonics quests", () => {
    const prompt = buildQuestPrompt("reading", 4, "phonics", {
      activeBlockers: [
        {
          id: "short-i-vs-e",
          name: "Short vowel i vs e",
          status: "ADDRESS_NOW",
          affectedSkills: ["phonics.short-i-vs-e"],
          specificWords: ["bed", "bid"],
        },
      ],
      hasRecentScans: true,
    });
    expect(prompt).toContain("## KNOWN BLOCKERS");
    expect(prompt).toContain("## RECENT CURRICULUM");
    expect(prompt).toContain('"targetedBlockerId": null');
    expect(prompt).toContain("TARGETED BLOCKER FIELD");
    // KNOWN BLOCKERS should appear before the RESPONSE FORMAT section.
    const blockersIdx = prompt.indexOf("## KNOWN BLOCKERS");
    const responseIdx = prompt.indexOf("RESPONSE FORMAT");
    expect(blockersIdx).toBeGreaterThan(0);
    expect(blockersIdx).toBeLessThan(responseIdx);
  });

  it("appends KNOWN BLOCKERS and RECENT CURRICULUM for math quests", () => {
    const prompt = buildQuestPrompt("math", 3, "math", {
      activeBlockers: [
        {
          id: "multiplication-2s",
          name: "Times tables — 2s",
          status: "ADDRESS_NOW",
          affectedSkills: ["math.multiplication.2s"],
        },
      ],
      hasRecentScans: false,
    });
    expect(prompt).toContain("## KNOWN BLOCKERS");
    expect(prompt).not.toContain("## RECENT CURRICULUM");
    expect(prompt).toContain("TARGETED BLOCKER FIELD");
    expect(prompt).toContain('"targetedBlockerId": null');
  });

  it("omits KNOWN BLOCKERS when no blockers are provided", () => {
    const prompt = buildQuestPrompt("reading", 2, "phonics", {
      activeBlockers: [],
      hasRecentScans: false,
    });
    expect(prompt).not.toContain("## KNOWN BLOCKERS");
    // targetedBlockerId field still appears in RESPONSE FORMAT so the AI knows the schema.
    expect(prompt).toContain("targetedBlockerId");
  });
});
