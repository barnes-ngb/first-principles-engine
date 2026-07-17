import { describe, expect, it } from "vitest";
import {
  buildSynthesisInput,
  buildSynthesisPrompt,
  computeFanOut,
  orderMoveCandidates,
  parseSynthesisResponse,
  SYNTHESIS_DISPLAY_RULES,
  type StoredLearnerModel,
} from "./learnerSynthesis.js";
import { summaryNodesForDomain } from "../data/foundationsGraphSummary.js";

/** A Lincoln-shaped fixture: spiky reading, ~3rd-grade math. */
const LINCOLN_MODEL: StoredLearnerModel = {
  childId: "lincoln",
  status: "seeded",
  conceptStates: {
    "reading.phonics.blends": { state: "solid", evidence: [{ kind: "workingLevel", note: "Below reading working level 4" }] },
    "reading.phonics.digraphs": { state: "forming", evidence: [{ kind: "curriculumPosition", note: "Fast Phonics Peak 13", source: "fastPhonics" }] },
    "reading.phonics.longVowels": { state: "frontier", evidence: [{ kind: "workingLevel", note: "At reading working level 4" }] },
    "reading.phonics.sightWords": { state: "forming", evidence: [{ kind: "sightWordShare", note: "some sight words mastered" }] },
    "math.operations.regrouping": { state: "frontier", evidence: [{ kind: "workingLevel", note: "At math working level 7" }] },
  },
  modalityCalibration: {
    reading: { level: 4, note: "Reads around working level 4 — put short reading in activities at this level." },
    writing: { level: 2, note: "Scribe by default; tiles and dictation count fully." },
    math: { level: 7, note: "Works math around level 7 — heard-aloud word problems count fully." },
  },
  changeFeed: [
    { conceptId: "reading.phonics.digraphs", from: "not-yet", to: "forming", cause: "covered: Fast Phonics", at: "2026-07-01" },
    { conceptId: "reading.phonics.longVowels", from: "not-yet", to: "frontier", cause: "quest: 3/3 correct in the Mine → frontier", at: "2026-07-02" },
  ],
  openQuestions: [
    { conceptId: "reading.phonics.digraphs", question: "verify digraphs with a quick quest?", routedTo: "quest" },
    { conceptId: "reading.phonics.vowelTeams", question: "ready for vowel teams?", routedTo: "quest", resolvedAt: "2026-07-03" },
  ],
};

describe("computeFanOut / orderMoveCandidates", () => {
  it("counts transitive downstream nodes and excludes solid concepts, frontier-first", () => {
    const nodes = summaryNodesForDomain("reading");
    const fanOut = computeFanOut(nodes);
    // longVowels underlies vowelTeams + rControlled (+ their descendants), so > 0.
    expect(fanOut["reading.phonics.longVowels"]).toBeGreaterThan(0);

    const ordered = orderMoveCandidates(nodes, LINCOLN_MODEL.conceptStates!);
    const ids = ordered.map((n) => n.id);
    expect(ids).not.toContain("reading.phonics.blends"); // solid → excluded
    // The one frontier concept ranks ahead of any forming concept.
    expect(ids.indexOf("reading.phonics.longVowels")).toBeLessThan(
      ids.indexOf("reading.phonics.digraphs"),
    );
  });
});

describe("buildSynthesisInput", () => {
  it("groups per-domain terrain with kid-names and orders candidates", () => {
    const input = buildSynthesisInput(LINCOLN_MODEL, "Lincoln");
    const reading = input.domains.find((d) => d.domain === "reading")!;
    expect(reading.frontier.map((c) => c.conceptId)).toContain("reading.phonics.longVowels");
    expect(reading.forming.map((c) => c.conceptId)).toContain("reading.phonics.digraphs");
    expect(reading.recentSolid.map((c) => c.conceptId)).toContain("reading.phonics.blends");
    expect(reading.moveCandidates[0].kidName).toBeTruthy();
    // Math frontier picked up too.
    const math = input.domains.find((d) => d.domain === "math")!;
    expect(math.frontier.map((c) => c.conceptId)).toContain("math.operations.regrouping");
  });

  it("caps the change feed and drops resolved open questions", () => {
    const input = buildSynthesisInput(LINCOLN_MODEL, "Lincoln", { maxRecentChanges: 1 });
    expect(input.recentChanges).toHaveLength(1);
    // Only the unresolved ask survives.
    expect(input.openQuestions.map((q) => q.conceptId)).toEqual(["reading.phonics.digraphs"]);
    expect(input.openQuestions[0].kidName).toBeTruthy();
  });
});

describe("buildSynthesisPrompt", () => {
  const input = buildSynthesisInput(LINCOLN_MODEL, "Lincoln");
  const prompt = buildSynthesisPrompt(input);

  it("carries the charter + the locked §14 display rules", () => {
    expect(prompt).toContain("First Principles Engine");
    expect(prompt).toContain(SYNTHESIS_DISPLAY_RULES);
    expect(prompt).toContain("NEVER write a band number");
    expect(prompt).toContain("NEVER write a percentage");
  });

  it("never leaks a band number or percentage into the derived terrain", () => {
    // §14 governs generated/derived text, not the immutable charter preamble
    // (which legitimately contains a "%"). Scope the number check to the terrain.
    const terrain = prompt.slice(prompt.indexOf("THE TERRAIN"));
    expect(terrain).not.toMatch(/band\s+\d/i);
    expect(terrain).not.toMatch(/level\s+\d/i);
    expect(terrain).not.toMatch(/\d+\s*%/);
  });

  it("hands candidates pre-ordered and instructs the LLM not to reorder", () => {
    expect(prompt).toContain("DO NOT reorder");
    expect(prompt).toContain("[reading.phonics.longVowels]");
  });
});

describe("parseSynthesisResponse", () => {
  it("parses a well-formed reply, filling kidName deterministically", () => {
    const json = JSON.stringify({
      whatMattersNext: [
        { conceptId: "reading.phonics.longVowels", why: "Blends are solid; long vowels are the next unlock.", suggestedVehicle: "quest" },
      ],
      narrative: "He's reading with real momentum. Two sources agree on digraphs.",
      openQuestionsSummary: ["Worth a quick check on digraphs."],
    });
    const parsed = parseSynthesisResponse(json)!;
    expect(parsed.whatMattersNext).toHaveLength(1);
    expect(parsed.whatMattersNext[0].kidName).toBe("Read long-vowel words");
    expect(parsed.whatMattersNext[0].suggestedVehicle).toBe("quest");
    expect(parsed.narrative).toContain("momentum");
  });

  it("drops moves with unknown conceptIds and defaults a bad vehicle", () => {
    const json = JSON.stringify({
      whatMattersNext: [
        { conceptId: "not.a.real.concept", why: "nope", suggestedVehicle: "quest" },
        { conceptId: "reading.phonics.digraphs", why: "emerging", suggestedVehicle: "banana" },
      ],
      narrative: "story",
      openQuestionsSummary: [],
    });
    const parsed = parseSynthesisResponse(json)!;
    expect(parsed.whatMattersNext).toHaveLength(1);
    expect(parsed.whatMattersNext[0].conceptId).toBe("reading.phonics.digraphs");
    expect(parsed.whatMattersNext[0].suggestedVehicle).toBe("routine"); // invalid → default
  });

  it("caps at 3 moves", () => {
    const many = Array.from({ length: 5 }, () => ({
      conceptId: "reading.phonics.digraphs",
      why: "x",
      suggestedVehicle: "routine",
    }));
    const parsed = parseSynthesisResponse(JSON.stringify({ whatMattersNext: many, narrative: "n", openQuestionsSummary: [] }))!;
    expect(parsed.whatMattersNext.length).toBeLessThanOrEqual(3);
  });

  it("parses a reply wrapped in ```json fences", () => {
    const body = JSON.stringify({
      whatMattersNext: [
        { conceptId: "reading.phonics.longVowels", why: "Blends are solid; long vowels are next.", suggestedVehicle: "quest" },
      ],
      narrative: "Reading with real momentum.",
      openQuestionsSummary: [],
    });
    const parsed = parseSynthesisResponse("```json\n" + body + "\n```")!;
    expect(parsed).not.toBeNull();
    expect(parsed.narrative).toContain("momentum");
    expect(parsed.whatMattersNext[0].conceptId).toBe("reading.phonics.longVowels");
  });

  it("parses a reply with a one-line preamble before the object", () => {
    const body = JSON.stringify({
      whatMattersNext: [
        { conceptId: "reading.phonics.digraphs", why: "Two letters, one sound — worth confirming.", suggestedVehicle: "routine" },
      ],
      narrative: "Steady progress across the board.",
      openQuestionsSummary: ["Worth a quick check on digraphs."],
    });
    const parsed = parseSynthesisResponse("Here is the synthesis JSON:\n" + body)!;
    expect(parsed).not.toBeNull();
    expect(parsed.narrative).toContain("Steady progress");
    expect(parsed.whatMattersNext[0].conceptId).toBe("reading.phonics.digraphs");
    expect(parsed.openQuestionsSummary).toEqual(["Worth a quick check on digraphs."]);
  });

  it("returns null on unparseable or empty-narrative replies (deterministic fallback)", () => {
    expect(parseSynthesisResponse("not json at all {{{")).toBeNull();
    expect(parseSynthesisResponse(JSON.stringify({ whatMattersNext: [], narrative: "" }))).toBeNull();
  });
});
