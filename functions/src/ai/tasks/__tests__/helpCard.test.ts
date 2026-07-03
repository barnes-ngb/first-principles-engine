import { describe, expect, it } from "vitest";
import {
  buildHelpCardSystemPrompt,
  buildHelpCardUserMessage,
  parseHelpCardInput,
  parseHelpCardOutput,
} from "../helpCard.js";

// ── parseHelpCardInput ────────────────────────────────────────────

describe("parseHelpCardInput", () => {
  it("parses a full checklist-item input", () => {
    const input = parseHelpCardInput(
      JSON.stringify({
        label: "Phonics — short i",
        subjectBucket: "Reading",
        contentGuide: "Lesson 35 — CVC short-i words",
        skillTags: ["phonics.short-vowels", ""],
      }),
    );
    expect(input.label).toBe("Phonics — short i");
    expect(input.subjectBucket).toBe("Reading");
    expect(input.contentGuide).toBe("Lesson 35 — CVC short-i words");
    // empty tag filtered out
    expect(input.skillTags).toEqual(["phonics.short-vowels"]);
  });

  it("tolerates code fences around the JSON", () => {
    const input = parseHelpCardInput('```json\n{"label":"Math facts"}\n```');
    expect(input.label).toBe("Math facts");
    expect(input.subjectBucket).toBeUndefined();
  });

  it("throws when label is missing", () => {
    expect(() => parseHelpCardInput(JSON.stringify({ subjectBucket: "Math" }))).toThrow(
      /label is required/i,
    );
  });
});

// ── parseHelpCardOutput ───────────────────────────────────────────

const VALID_BODY = {
  playIt: {
    title: "Sound Box Slam",
    howTo: ["Draw 3 boxes", "Say a short-i word", "Tap a box per sound"],
    minutes: 6,
    materials: ["paper", "a pencil"],
  },
  twoKid: "Lincoln teaches London to tap out the sounds.",
  sayThis: [
    "Let's build some words with sound boxes.",
    "If it's tricky, tap the sounds slowly together.",
    "Good for today: reads 3 of 4 short-i words.",
  ],
  attentionRescue: "Switch to hopping one hop per sound across the room.",
  mvdVersion: "Just tap out 3 words on your fingers, no boxes.",
  skipSignal: "If he misreads two in a row, drop to review words and end on a win.",
};

describe("parseHelpCardOutput", () => {
  it("parses and normalizes a valid body", () => {
    const out = parseHelpCardOutput(JSON.stringify(VALID_BODY));
    expect(out.playIt.title).toBe("Sound Box Slam");
    expect(out.playIt.howTo).toHaveLength(3);
    expect(out.sayThis).toHaveLength(3);
    expect(out.attentionRescue).toMatch(/hopping/);
  });

  it("clamps minutes into the 2-10 band", () => {
    const hot = parseHelpCardOutput(
      JSON.stringify({ ...VALID_BODY, playIt: { ...VALID_BODY.playIt, minutes: 45 } }),
    );
    expect(hot.playIt.minutes).toBe(10);
    const cold = parseHelpCardOutput(
      JSON.stringify({ ...VALID_BODY, playIt: { ...VALID_BODY.playIt, minutes: 0 } }),
    );
    expect(cold.playIt.minutes).toBe(2);
  });

  it("accepts sayThis as a single string and wraps it", () => {
    const out = parseHelpCardOutput(
      JSON.stringify({ ...VALID_BODY, sayThis: "Just one line." }),
    );
    expect(out.sayThis).toEqual(["Just one line."]);
  });

  it("throws when playIt is missing", () => {
    const { playIt: _drop, ...rest } = VALID_BODY;
    void _drop;
    expect(() => parseHelpCardOutput(JSON.stringify(rest))).toThrow(/playIt/);
  });

  it("throws when required fields are empty", () => {
    expect(() =>
      parseHelpCardOutput(
        JSON.stringify({ ...VALID_BODY, playIt: { ...VALID_BODY.playIt, howTo: [] } }),
      ),
    ).toThrow(/missing required/i);
  });
});

// ── buildHelpCardSystemPrompt ─────────────────────────────────────

describe("buildHelpCardSystemPrompt", () => {
  const prompt = buildHelpCardSystemPrompt("CHARTER + SNAPSHOT CONTEXT", "Lincoln");

  it("leads with the assembled family context (charter first)", () => {
    expect(prompt.startsWith("CHARTER + SNAPSHOT CONTEXT")).toBe(true);
  });

  it("names the child", () => {
    expect(prompt).toContain("Lincoln");
  });

  it("enforces the no-shame / no-scores rails", () => {
    expect(prompt).toMatch(/NEVER reference a logging gap/i);
    expect(prompt).toMatch(/NO scores/i);
  });

  it("requires a genuinely different attention-rescue, not a reword", () => {
    expect(prompt).toMatch(/attentionRescue/);
    expect(prompt).toMatch(/GENUINELY DIFFERENT/i);
  });

  it("requires a two-kid variant and an MVD floor", () => {
    expect(prompt).toMatch(/two-kid variant/i);
    expect(prompt).toMatch(/mvdVersion/);
  });

  it("sources the skip signal from existing stop rules, not invented ones", () => {
    expect(prompt).toMatch(/Do NOT invent new stop rules/i);
  });
});

// ── buildHelpCardUserMessage ──────────────────────────────────────

describe("buildHelpCardUserMessage", () => {
  it("includes only the fields present", () => {
    const msg = buildHelpCardUserMessage({ label: "Math facts" });
    expect(msg).toContain("Checklist item: Math facts");
    expect(msg).not.toContain("Subject:");
    expect(msg).not.toContain("What to cover");
  });

  it("includes subject, content guide, and skill tags when present", () => {
    const msg = buildHelpCardUserMessage({
      label: "Phonics",
      subjectBucket: "Reading",
      contentGuide: "short-i",
      skillTags: ["phonics.short-vowels"],
    });
    expect(msg).toContain("Subject: Reading");
    expect(msg).toContain("What to cover today: short-i");
    expect(msg).toContain("Skill tags: phonics.short-vowels");
  });
});
