import { describe, expect, it } from "vitest";
import {
  buildFrictionCaptureAddendum,
  buildShellyChatRoleSection,
  buildSightWordActionAddendum,
  buildSnapshotActionAddendum,
  formatConundrumTitle,
  formatDispositionProfile,
  formatRecentTeachBacks,
  formatRecentWeeklyReviews,
} from "./shellyChat.js";
import type {
  DispositionCacheDoc,
  DispositionOverridesDoc,
  TeachBackArtifactInput,
  WeeklyReviewRow,
} from "./shellyChat.js";

// ── Test fixtures (Lincoln-shaped, deliberately realistic) ────────

function lincolnDispositionCache(): DispositionCacheDoc {
  return {
    generatedAt: "2026-05-20T18:00:00.000Z",
    result: {
      profileDate: "2026-05-20",
      dispositions: {
        curiosity: {
          level: "growing",
          trend: "up",
          narrative: "Asks more follow-up questions during Narnia read-alouds, especially about Edmund.",
        },
        persistence: {
          level: "steady",
          trend: "stable",
          narrative: "Sticks with multisyllable phonics for the full 20 minutes most days.",
        },
        articulation: {
          level: "emerging",
          trend: "up",
          narrative: "Teach-backs are getting longer and more structured — three-step explanations are common.",
        },
        selfAwareness: {
          level: "emerging",
          trend: "stable",
          narrative: "Names which parts felt hard when prompted, not yet unprompted.",
        },
        ownership: {
          level: "growing",
          trend: "up",
          narrative: "Chooses booster cards over reading workbook when given the choice — picks the harder option.",
        },
      },
      celebration: "Three teach-backs this week that he initiated himself.",
      nudge: "Try a one-question conundrum at the dinner table mid-week.",
    },
  };
}

function lincolnWeeklyReviews(): WeeklyReviewRow[] {
  return [
    {
      weekKey: "2026-05-18",
      status: "draft",
      summary: "Big week for fluency — Lincoln moved through three pages of the GATB reader at pace and the audio teach-backs got noticeably more confident.",
      celebration: "Three confident audio teach-backs in a row.",
      growthAreas: ["multisyllable phonics", "comprehension follow-up Qs", "handwriting endurance"],
      createdAt: "2026-05-18T19:00:00.000Z",
    },
    {
      weekKey: "2026-05-11",
      status: "draft",
      summary: "Mixed week. Strong math (place value clicking) but reading endurance dropped on Thursday/Friday.",
      celebration: "Place value clicking.",
      growthAreas: ["reading endurance"],
      createdAt: "2026-05-11T19:00:00.000Z",
    },
    {
      weekKey: "2026-05-04",
      status: "draft",
      summary: "Recovery week after the lab field trip. Fewer items completed but high engagement on the ones that were.",
      createdAt: "2026-05-04T19:00:00.000Z",
    },
    {
      weekKey: "2026-04-27",
      status: "draft",
      summary: "First week using the new sight-word pool. Engagement was high, mastery still emerging.",
      createdAt: "2026-04-27T19:00:00.000Z",
    },
    {
      weekKey: "2026-04-20",
      status: "draft",
      summary: "Steady. Most-likely-skipped item this week: handwriting on Friday.",
      createdAt: "2026-04-20T19:00:00.000Z",
    },
  ];
}

function lincolnTeachBackArtifacts(): TeachBackArtifactInput[] {
  return [
    {
      title: "Teach-back: syllables",
      type: "Audio",
      content: "I told London that big words have parts called syllables and you clap them out.",
      mediaUrl: "https://storage.example.com/audio/tb-001.m4a",
      createdAt: "2026-05-22T14:00:00.000Z",
      tags: { subjectBucket: "Reading", engineStage: "Explain" },
    },
    {
      title: "Teach-back: counting by 5s",
      type: "Audio",
      content: "5, 10, 15, 20 — you just add five each time.",
      mediaUrl: "https://storage.example.com/audio/tb-002.m4a",
      createdAt: "2026-05-21T15:00:00.000Z",
      tags: { subjectBucket: "Math", engineStage: "Explain" },
    },
    {
      title: "Teach-back: plot of Narnia chapter 6",
      type: "Text",
      content: "Edmund eats Turkish Delight and the witch tricks him.",
      notes: "Wrote his own — no help.",
      createdAt: "2026-05-20T18:00:00.000Z",
      tags: { subjectBucket: "LanguageArts", engineStage: "Explain" },
    },
    {
      title: "Teach-back: place value",
      type: "Audio",
      content: "The 3 in 30 is worth thirty because it's in the tens place.",
      mediaUrl: "https://storage.example.com/audio/tb-003.m4a",
      createdAt: "2026-05-19T16:00:00.000Z",
      tags: { subjectBucket: "Math", engineStage: "Explain" },
    },
  ];
}

// ── 1. Disposition populates from dispositionCache with overrides applied ──

describe("formatDispositionProfile", () => {
  it("populates from dispositionCache with override text winning over AI narrative", () => {
    const cache = lincolnDispositionCache();
    const overrides: DispositionOverridesDoc = {
      persistence: {
        text: "Shelly's edit: actually he's been bailing on the second 10-minute block lately.",
      },
    };

    const out = formatDispositionProfile("Lincoln", cache, overrides);

    // Header present, dated.
    expect(out).toContain("DISPOSITION PROFILE for Lincoln (generated ");
    // All five dimensions in fixed order.
    const curiosityIdx = out.indexOf("Curiosity:");
    const persistenceIdx = out.indexOf("Persistence:");
    const articulationIdx = out.indexOf("Articulation:");
    const selfAwarenessIdx = out.indexOf("Self-Awareness:");
    const ownershipIdx = out.indexOf("Ownership:");
    expect(curiosityIdx).toBeGreaterThan(0);
    expect(persistenceIdx).toBeGreaterThan(curiosityIdx);
    expect(articulationIdx).toBeGreaterThan(persistenceIdx);
    expect(selfAwarenessIdx).toBeGreaterThan(articulationIdx);
    expect(ownershipIdx).toBeGreaterThan(selfAwarenessIdx);

    // Override text wins for persistence.
    expect(out).toContain("Shelly's edit: actually he's been bailing");
    expect(out).not.toContain("Sticks with multisyllable phonics");

    // AI text wins for non-overridden dimensions.
    expect(out).toContain("Asks more follow-up questions during Narnia");
    expect(out).toContain("Teach-backs are getting longer");
    expect(out).toContain("Names which parts felt hard when prompted");
    expect(out).toContain("Chooses booster cards over reading workbook");

    // Level and trend included.
    expect(out).toContain("growing, trend up");
    expect(out).toContain("emerging, trend stable");

    // Celebration + nudge included.
    expect(out).toContain("Celebration: Three teach-backs");
    expect(out).toContain("Nudge: Try a one-question conundrum");
  });

  // ── 2. Disposition omits cleanly when cache absent ──
  it("returns empty string when dispositionCache is absent (omit, don't explain absence)", () => {
    const out = formatDispositionProfile("Lincoln", undefined, {});
    expect(out).toBe("");
  });

  it("returns empty string when dispositionCache.result.dispositions is empty", () => {
    const out = formatDispositionProfile(
      "Lincoln",
      { generatedAt: "2026-05-20T18:00:00.000Z", result: { dispositions: {} } },
      {},
    );
    expect(out).toBe("");
  });

  it("omits the block when every disposition has empty narrative and no override", () => {
    const out = formatDispositionProfile(
      "Lincoln",
      {
        generatedAt: "2026-05-20T18:00:00.000Z",
        result: {
          dispositions: {
            curiosity: { level: "growing", trend: "up", narrative: "" },
            persistence: { level: "steady", trend: "stable", narrative: "" },
          },
        },
      },
      {},
    );
    expect(out).toBe("");
  });
});

// ── 3. Weekly-review strip surfaces ≤5 rows, skips no-data, extras on most-recent only ──

describe("formatRecentWeeklyReviews", () => {
  it("surfaces 5 rows in most-recent-first order, attaches celebration + top-2 growth areas to most-recent only", () => {
    const out = formatRecentWeeklyReviews("Lincoln", lincolnWeeklyReviews());

    // Header.
    expect(out).toContain("RECENT WEEKLY REVIEWS for Lincoln (most recent first):");

    // 5 row markers (each row starts with "- " under the header).
    const rowMatches = out.match(/^- /gm) || [];
    expect(rowMatches.length).toBe(5);

    // Most-recent week is first, oldest is last.
    const recentIdx = out.indexOf("2026-05-18");
    const oldestIdx = out.indexOf("2026-04-20");
    expect(recentIdx).toBeGreaterThan(0);
    expect(oldestIdx).toBeGreaterThan(recentIdx);

    // Most-recent row carries celebration + top 2 growth areas (bracketed).
    expect(out).toContain("celebration: Three confident audio teach-backs in a row.");
    expect(out).toContain("growth areas: multisyllable phonics; comprehension follow-up Qs");
    // The third growth area on the most-recent row is dropped (cap at 2).
    expect(out).not.toContain("handwriting endurance");

    // Older rows do NOT carry extras even though they have them.
    expect(out).not.toContain("celebration: Place value clicking");
    expect(out).not.toContain("growth areas: reading endurance");
  });

  it("filters out status='no-data' rows", () => {
    const rows: WeeklyReviewRow[] = [
      {
        weekKey: "2026-05-18",
        status: "no-data",
        summary: "Should NOT appear because status is no-data.",
        createdAt: "2026-05-18T19:00:00.000Z",
      },
      {
        weekKey: "2026-05-11",
        status: "draft",
        summary: "Should appear.",
        createdAt: "2026-05-11T19:00:00.000Z",
      },
    ];
    const out = formatRecentWeeklyReviews("Lincoln", rows);
    expect(out).toContain("Should appear");
    expect(out).not.toContain("Should NOT appear");
    expect((out.match(/^- /gm) || []).length).toBe(1);
  });

  it("truncates summaries longer than 140 chars and appends an ellipsis", () => {
    const longSummary = "a".repeat(200);
    const out = formatRecentWeeklyReviews("Lincoln", [
      { weekKey: "2026-05-18", status: "draft", summary: longSummary, createdAt: "2026-05-18T19:00:00.000Z" },
    ]);
    // 140 'a's followed by an ellipsis (single char), not 200 'a's.
    expect(out).toContain("a".repeat(140) + "…");
    expect(out).not.toContain("a".repeat(141));
  });

  // ── 4. Weekly-review strip omits cleanly ──
  it("returns empty string when no reviews are provided", () => {
    expect(formatRecentWeeklyReviews("Lincoln", [])).toBe("");
  });

  it("returns empty string when every row is filtered out (all no-data or no summary)", () => {
    const out = formatRecentWeeklyReviews("Lincoln", [
      { weekKey: "2026-05-18", status: "no-data", summary: "x", createdAt: "2026-05-18T19:00:00.000Z" },
      { weekKey: "2026-05-11", status: "draft", summary: undefined, createdAt: "2026-05-11T19:00:00.000Z" },
    ]);
    expect(out).toBe("");
  });
});

// ── Conundrum title fix (third dead-read) — round-trip on the new helper ──

describe("formatConundrumTitle", () => {
  it("formats from the nested conundrum.title field", () => {
    expect(formatConundrumTitle({ conundrum: { title: "Should we share the last cookie?" } }))
      .toBe("\n\nCONUNDRUM THIS WEEK: Should we share the last cookie?");
  });
  it("returns empty string when conundrum or title is absent", () => {
    expect(formatConundrumTitle(undefined)).toBe("");
    expect(formatConundrumTitle({})).toBe("");
    expect(formatConundrumTitle({ conundrum: {} })).toBe("");
  });
});

// ── 5. Teach-back loader respects title filter + summarizer pass-through ──

describe("formatRecentTeachBacks", () => {
  it("renders count, audio/text breakdown, by-subject, and up to 3 example excerpts", () => {
    const out = formatRecentTeachBacks(lincolnTeachBackArtifacts());

    // Header line — 4 total artifacts (3 audio, 1 text per fixture).
    expect(out).toContain("RECENT TEACH-BACKS (last 14 days): 4 total (audio: 3, text: 1).");

    // By-subject line includes each subject with its count.
    expect(out).toContain("By subject:");
    expect(out).toMatch(/Reading 1/);
    expect(out).toMatch(/Math 2/);
    expect(out).toMatch(/LanguageArts 1/);

    // Examples header + exactly 3 example rows (cap from summarizeTeachBacks).
    expect(out).toContain("Examples:");
    const exampleLines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(exampleLines.length).toBe(3);

    // Each example carries subject, an excerpt in quotes, and (audio|text).
    for (const line of exampleLines) {
      expect(line).toMatch(/^- \S+ — ".+" \((audio|text)\)$/);
    }
  });

  it("filters out artifacts whose title does not start with 'teach-back' (case-insensitive)", () => {
    const mixed: TeachBackArtifactInput[] = [
      {
        title: "Teach-back: syllables",
        type: "Audio",
        content: "real teach-back",
        mediaUrl: "https://x/a.m4a",
        createdAt: "2026-05-22T14:00:00.000Z",
        tags: { subjectBucket: "Reading", engineStage: "Explain" },
      },
      {
        title: "Other Explain artifact",
        type: "Text",
        content: "not a teach-back — should be filtered out",
        createdAt: "2026-05-21T14:00:00.000Z",
        tags: { subjectBucket: "Reading", engineStage: "Explain" },
      },
    ];
    const out = formatRecentTeachBacks(mixed);
    expect(out).toContain("1 total");
    expect(out).not.toContain("not a teach-back");
  });

  // ── 6. Teach-back block omits cleanly ──
  it("returns empty string when zero artifacts match the title filter", () => {
    expect(formatRecentTeachBacks([])).toBe("");
    expect(
      formatRecentTeachBacks([
        {
          title: "Other Explain artifact",
          type: "Text",
          content: "x",
          createdAt: "2026-05-21T14:00:00.000Z",
          tags: { subjectBucket: "Reading", engineStage: "Explain" },
        },
      ]),
    ).toBe("");
  });
});

// ── 7. PLANNING-PARTNER MODE addendum is child-scoped only ──

describe("buildShellyChatRoleSection", () => {
  it("includes the PLANNING-PARTNER MODE addendum when a child is selected", () => {
    const out = buildShellyChatRoleSection("Lincoln");
    expect(out).toContain("PLANNING-PARTNER MODE:");
    // Names the upstream section headers so the model can ground claims.
    expect(out).toContain("EVALUATION HISTORY BY DOMAIN");
    expect(out).toContain("DISPOSITION PROFILE");
    expect(out).toContain("CURRICULUM MAP / COVERAGE");
    expect(out).toContain("RECENT WEEKLY REVIEWS");
    expect(out).toContain("RECENT TEACH-BACKS");
    // Names the child throughout (no stray placeholder).
    expect(out).toContain("She selected Lincoln's tab");
    expect(out).toContain("Use them to help Shelly see patterns over time");
    // Nathan's preserved framing.
    expect(out).toContain("don't argue with it, build on it");
    expect(out).not.toContain("${childName}");
  });

  it("omits the addendum on the general (no-child) branch", () => {
    const out = buildShellyChatRoleSection(undefined);
    expect(out).not.toContain("PLANNING-PARTNER MODE");
    expect(out).not.toContain("EVALUATION HISTORY BY DOMAIN");
    expect(out).toContain("This is a general conversation");
  });

  it("treats an empty-string childName as the no-child branch", () => {
    const out = buildShellyChatRoleSection("");
    expect(out).not.toContain("PLANNING-PARTNER MODE");
    expect(out).toContain("This is a general conversation");
  });
});

// ── 7b. Sight-word <action> grammar addendum (Build Step 3b) ──

describe("buildSightWordActionAddendum", () => {
  it("teaches the add/remove grammar and binds to the active childId on a child tab", () => {
    const out = buildSightWordActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("SIGHT-WORD ACTIONS");
    // Uses the literal childId so the model addresses the right child.
    expect(out).toContain('"childId":"lincoln123"');
    expect(out).toContain('"kind":"addSightWord"');
    expect(out).toContain('"kind":"removeSightWord"');
    expect(out).toContain("Lincoln");
    // Conservative + propose-only guardrails are present.
    expect(out).toContain("NEVER say the change is done");
    expect(out).toContain("do NOT emit an action");
    // No stray template placeholder leaked.
    expect(out).not.toContain("${");
  });

  it("returns empty string on the general (no-child) branch", () => {
    expect(buildSightWordActionAddendum(undefined, undefined)).toBe("");
    expect(buildSightWordActionAddendum("", "")).toBe("");
  });

  it("falls back to a generic noun when childName is absent but a childId exists", () => {
    const out = buildSightWordActionAddendum("london456", undefined);
    expect(out).toContain('"childId":"london456"');
    expect(out).toContain("this child");
  });
});

// ── 7b-ii. Additive snapshot <action> grammar addendum (Build Step 6b) ──

describe("buildSnapshotActionAddendum", () => {
  it("returns empty string when childId is missing (general tab)", () => {
    expect(buildSnapshotActionAddendum(undefined, "Lincoln")).toBe("");
    expect(buildSnapshotActionAddendum("", "")).toBe("");
  });

  it("emits all four additive snapshot kinds bound to the active childId", () => {
    const out = buildSnapshotActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("SKILL-SNAPSHOT ACTIONS");
    expect(out).toContain('"childId":"lincoln123"');
    expect(out).toContain('"kind":"addPrioritySkill"');
    expect(out).toContain('"kind":"addSupport"');
    expect(out).toContain('"kind":"addStopRule"');
    expect(out).toContain('"kind":"markSkillProgress"');
    // No stray template placeholder leaked.
    expect(out).not.toContain("${");
  });

  it("teaches additive-only — never a removal or downgrade", () => {
    const out = buildSnapshotActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("ADDITIVE ONLY");
    expect(out.toLowerCase()).toContain("cannot remove");
  });

  it("frames it as propose→confirm, never claiming the write is done", () => {
    const out = buildSnapshotActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("confirm");
    expect(out).toContain("NEVER claim it's done");
  });

  it("falls back to a generic noun when childName is absent but a childId exists", () => {
    const out = buildSnapshotActionAddendum("london456", undefined);
    expect(out).toContain('"childId":"london456"');
    expect(out).toContain("this child");
  });
});

// ── 7c. Silent friction-capture grammar addendum (Build Step 5a) ──

describe("buildFrictionCaptureAddendum", () => {
  it("teaches the <friction> grammar with the interpretedWant field", () => {
    const out = buildFrictionCaptureAddendum();
    expect(out).toContain("FRICTION CAPTURE");
    expect(out).toContain("<friction>");
    expect(out).toContain("</friction>");
    expect(out).toContain("interpretedWant");
    expect(out).toContain('"quote"');
  });

  it("instructs the model to keep it silent and conservative", () => {
    const out = buildFrictionCaptureAddendum().toLowerCase();
    // Invisible plumbing: never surfaced to Shelly.
    expect(out).toContain("do not");
    expect(out).toContain("silent");
    // One block per turn, only on genuine signal.
    expect(out).toContain("one");
  });

  it("takes no arguments and is stable (no leaked template placeholder)", () => {
    expect(buildFrictionCaptureAddendum()).toBe(buildFrictionCaptureAddendum());
    expect(buildFrictionCaptureAddendum()).not.toContain("${");
  });
});

// ── 8. Token-budget sanity bound on the Phase 1 additions ──

describe("Phase 1 supplemental-block token-budget sanity", () => {
  it("realistic Lincoln-shaped data keeps the Phase 1 additions under 8000 chars (≈ 2000 tokens)", () => {
    const childName = "Lincoln";
    const disposition = formatDispositionProfile(childName, lincolnDispositionCache(), {});
    const weeklyReviews = formatRecentWeeklyReviews(childName, lincolnWeeklyReviews());
    const conundrum = formatConundrumTitle({ conundrum: { title: "Should we share the last cookie?" } });
    const teachBacks = formatRecentTeachBacks(lincolnTeachBackArtifacts());
    const roleSection = buildShellyChatRoleSection(childName);

    const totalChars = disposition.length + weeklyReviews.length + conundrum.length + teachBacks.length + roleSection.length;

    // Bound (8000 chars ≈ 2000 tokens) covers all Phase 1 supplemental additions
    // plus the new addendum-bearing role section. Stays comfortably below the
    // +25-29% headroom budgeted in Step 1.
    expect(totalChars).toBeLessThan(8000);

    // All Phase 1 sections actually populated under realistic fixtures.
    expect(disposition).not.toBe("");
    expect(weeklyReviews).not.toBe("");
    expect(conundrum).not.toBe("");
    expect(teachBacks).not.toBe("");
    expect(roleSection).toContain("PLANNING-PARTNER MODE");
  });
});
