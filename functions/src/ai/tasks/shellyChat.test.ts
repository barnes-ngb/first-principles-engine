import { describe, expect, it } from "vitest";
import {
  extractImageUrls,
  buildAllChildrenLearnerModels,
  buildFrictionCaptureAddendum,
  buildPlanAdjustmentActionAddendum,
  buildShellyChatRoleSection,
  buildSightWordActionAddendum,
  buildSnapshotActionAddendum,
  buildWebSearchAddendum,
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
    expect(out).toContain("HOURS PROGRESS");
    expect(out).toContain("RECENT WEEKLY REVIEWS");
    expect(out).toContain("RECENT TEACH-BACKS");
    // Names the child throughout (no stray placeholder).
    expect(out).toContain("The Lincoln tab is selected");
    expect(out).toContain("Use them to help the parent see patterns over time");
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

  it("invites cross-child comparison grounded in PER-CHILD LEARNER MODELS on the general branch (FEAT-60)", () => {
    const out = buildShellyChatRoleSection(undefined);
    expect(out).toContain("Cross-child comparison is welcome here");
    // Points at the section the general handler loads for every child.
    expect(out).toContain("PER-CHILD LEARNER MODELS");
    // Same honesty rails as the child tabs — never guess a missing level.
    expect(out.toLowerCase()).toContain("no data");
    expect(out).toContain("reading & math only");
  });

  it("treats an empty-string childName as the no-child branch", () => {
    const out = buildShellyChatRoleSection("");
    expect(out).not.toContain("PLANNING-PARTNER MODE");
    expect(out).toContain("This is a general conversation");
  });

  it("never assumes a parent's name and addresses the user as 'you' on both branches (FEAT-60)", () => {
    const child = buildShellyChatRoleSection("Lincoln");
    const general = buildShellyChatRoleSection(undefined);
    // No parent name hardcoded (mirrors the FEAT-53 child-agnostic pattern).
    expect(child).not.toContain("Shelly");
    expect(general).not.toContain("Shelly");
    // Addresses the user directly, refers to "the parent" in third person.
    expect(child.toLowerCase()).toContain("never assume or use the parent's name");
    expect(general.toLowerCase()).toContain("never assume or use the parent's name");
    // Parent-neutral ROLE line.
    expect(child).toContain("You are the family's homeschool assistant");
    expect(general).toContain("You are the family's homeschool assistant");
  });
});

// ── 7a-ii. Cross-child learner models on the general branch (FEAT-60) ──

describe("buildAllChildrenLearnerModels", () => {
  it("concatenates every child's slice under a per-child header (fixture with 2)", () => {
    const out = buildAllChildrenLearnerModels([
      { name: "Lincoln", slice: "LEARNER MODEL — Lincoln.\nWorking edge: multisyllable words." },
      { name: "London", slice: "LEARNER MODEL — London.\nWorking edge: letter sounds." },
    ]);
    // Both children present, each under a clear header.
    expect(out).toContain("PER-CHILD LEARNER MODELS");
    expect(out).toContain("── Lincoln ──");
    expect(out).toContain("── London ──");
    expect(out).toContain("multisyllable words");
    expect(out).toContain("letter sounds");
    // Lincoln's block precedes London's (iteration order preserved).
    expect(out.indexOf("── Lincoln ──")).toBeLessThan(out.indexOf("── London ──"));
    // No hardcoded child count baked into the wording.
    expect(out).not.toContain("${");
  });

  it("skips children with an empty slice (no usable model) but keeps the populated ones", () => {
    const out = buildAllChildrenLearnerModels([
      { name: "Lincoln", slice: "LEARNER MODEL — Lincoln." },
      { name: "London", slice: "" },
    ]);
    expect(out).toContain("── Lincoln ──");
    expect(out).not.toContain("── London ──");
  });

  it("scales past two children without hardcoding names or count (post-ARCH-40 discipline)", () => {
    const out = buildAllChildrenLearnerModels([
      { name: "A", slice: "model A" },
      { name: "B", slice: "model B" },
      { name: "C", slice: "model C" },
    ]);
    expect((out.match(/── \w ──/g) || []).length).toBe(3);
  });

  it("returns empty string when no child has a usable model (omit-on-empty)", () => {
    expect(buildAllChildrenLearnerModels([])).toBe("");
    expect(
      buildAllChildrenLearnerModels([
        { name: "Lincoln", slice: "" },
        { name: "London", slice: "   " },
      ]),
    ).toBe("");
  });
});

// ── 7a-iii. No writes from general mode — every action addendum stays child-only ──

describe("no-writes-from-general guard (FEAT-60)", () => {
  it("every <action>/handoff addendum returns '' on the general (no-child) branch", () => {
    // Comparison is read-only in general mode: no action grammar is emitted.
    expect(buildSightWordActionAddendum(undefined, undefined)).toBe("");
    expect(buildSnapshotActionAddendum(undefined, undefined)).toBe("");
    expect(buildPlanAdjustmentActionAddendum(undefined, undefined)).toBe("");
    // The general role section teaches comparison but no write grammar.
    const general = buildShellyChatRoleSection(undefined);
    expect(general).not.toContain("<action>");
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

// ── 7b-bis. Plan-adjustment HANDOFF grammar addendum (chunk 2A/2) ──

describe("buildPlanAdjustmentActionAddendum", () => {
  it("returns empty string when childId is missing (general tab)", () => {
    expect(buildPlanAdjustmentActionAddendum(undefined, "Lincoln")).toBe("");
    expect(buildPlanAdjustmentActionAddendum("", "")).toBe("");
  });

  it("emits the proposePlanAdjustment grammar bound to the active childId", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("PLAN-ADJUSTMENT HANDOFF");
    expect(out).toContain('"kind":"proposePlanAdjustment"');
    expect(out).toContain('"childId":"lincoln123"');
    expect(out).toContain('"summary"');
    expect(out).toContain('"rationale"');
    // No stray template placeholder leaked.
    expect(out).not.toContain("${");
  });

  it("frames it as a handoff that never writes the plan", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("HANDOFF");
    expect(out).toContain("do NOT write the plan");
    expect(out).toContain("NEVER claim the plan is changed");
  });

  it("routes snapshot/friction elsewhere — only for next-week plan changes", () => {
    const out = buildPlanAdjustmentActionAddendum("lincoln123", "Lincoln");
    expect(out).toContain("additive snapshot actions");
    expect(out).toContain("silent friction capture");
  });

  it("falls back to a generic noun when childName is absent but a childId exists", () => {
    const out = buildPlanAdjustmentActionAddendum("london456", undefined);
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

// ── 7d. Web-search guidance addendum (FEAT-12 Phase 1) ──

describe("buildWebSearchAddendum", () => {
  it("tells the assistant it may search the web for planning info and cite links", () => {
    const out = buildWebSearchAddendum();
    expect(out).toContain("WEB SEARCH");
    // Names the planning use cases, including videos.
    expect(out.toLowerCase()).toContain("activities");
    expect(out.toLowerCase()).toContain("videos");
    // Requires cited markdown links.
    expect(out).toContain("[title](url)");
    // Keeps it planning-oriented and conservative about when to search.
    expect(out.toLowerCase()).toContain("planning");
    expect(out.toLowerCase()).toContain("don't search for things you already know");
  });

  it("is stable with no leaked template placeholder (general + child-scoped)", () => {
    expect(buildWebSearchAddendum()).toBe(buildWebSearchAddendum());
    expect(buildWebSearchAddendum()).not.toContain("${");
    expect(buildWebSearchAddendum("Lincoln")).not.toContain("${");
  });

  it("omits the teaching-video block on the general (no-child) branch", () => {
    const out = buildWebSearchAddendum();
    expect(out).not.toContain("TEACHING VIDEOS");
    expect(out.toLowerCase()).not.toContain("which child is this for");
  });

  it("scopes teaching videos to the child by age and soft interest preference when child-scoped (FEAT-20)", () => {
    const out = buildWebSearchAddendum("Lincoln");
    expect(out).toContain("TEACHING VIDEOS for Lincoln");
    // Age/level pitch.
    expect(out.toLowerCase()).toContain("age");
    // Soft preference, never a hard filter.
    expect(out.toLowerCase()).toContain("softly prefer");
    expect(out.toLowerCase()).toContain("tiebreaker, never a filter");
    expect(out.toLowerCase()).toContain("best plain video");
    // Doesn't ask which child when already child-scoped.
    expect(out.toLowerCase()).toContain("don't ask");
    // Still includes the base web-search guidance.
    expect(out).toContain("WEB SEARCH");
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

describe("extractImageUrls — multi-image vision parity (FEAT-59)", () => {
  it("pulls a single leading marker (unchanged single-image behavior)", () => {
    const r = extractImageUrls("[IMAGE_URL:https://x/a.jpg]\nwhat is this?");
    expect(r.urls).toEqual(["https://x/a.jpg"]);
    expect(r.text).toBe("what is this?");
  });

  it("pulls N leading markers and returns the shared context text once", () => {
    const r = extractImageUrls(
      "[IMAGE_URL:https://x/a.jpg][IMAGE_URL:https://x/b.jpg][IMAGE_URL:https://x/c.jpg]\nthese are Fast Phonics",
    );
    expect(r.urls).toEqual(["https://x/a.jpg", "https://x/b.jpg", "https://x/c.jpg"]);
    expect(r.text).toBe("these are Fast Phonics");
  });

  it("returns no urls for a plain text message (text path)", () => {
    const r = extractImageUrls("just a question, no image");
    expect(r.urls).toEqual([]);
    expect(r.text).toBe("just a question, no image");
  });
});
