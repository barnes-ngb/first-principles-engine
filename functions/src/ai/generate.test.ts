import { describe, expect, it } from "vitest";
import {
  buildGenerateSystemPrompt,
  buildGenerateUserMessage,
  parseActivityJson,
} from "./generate.js";
import type { PromptContext } from "./generate.js";

// ── Fixtures ────────────────────────────────────────────────────

const lincolnCtx: PromptContext = {
  child: { name: "Lincoln", grade: "3rd" },
  activityType: "phonics",
  skillTag: "reading.phonics.cvc",
  estimatedMinutes: 15,
  snapshot: {
    prioritySkills: [
      { tag: "reading.phonics.cvc", label: "CVC words", level: "emerging" },
    ],
    supports: [
      { label: "Finger tracking", description: "Track words with finger" },
    ],
    stopRules: [
      {
        label: "Frustration",
        trigger: "3 consecutive errors",
        action: "Switch to easier task",
      },
    ],
  },
  currentRung: {
    title: "CVC Blending",
    description: "Blend consonant-vowel-consonant words",
  },
  ladderTitle: "Phonics Ladder",
  weekTheme: "Ocean Explorers",
  weekVirtue: undefined,
  weekStoryTitle: undefined,
  weekReadAloud: undefined,
};

const londonCtx: PromptContext = {
  child: { name: "London", grade: "K" },
  activityType: "story-prompt",
  skillTag: "writing.creative.narrative",
  estimatedMinutes: 20,
  snapshot: undefined,
  currentRung: undefined,
  ladderTitle: undefined,
  weekTheme: undefined,
  weekVirtue: undefined,
  weekStoryTitle: undefined,
  weekReadAloud: undefined,
};

const minimalCtx: PromptContext = {
  child: { name: "Test Child" },
  activityType: "science",
  skillTag: "science.observation",
  estimatedMinutes: 10,
  snapshot: undefined,
  currentRung: undefined,
  ladderTitle: undefined,
  weekTheme: undefined,
  weekVirtue: undefined,
  weekStoryTitle: undefined,
  weekReadAloud: undefined,
};

// ── buildGenerateSystemPrompt ───────────────────────────────────

describe("buildGenerateSystemPrompt", () => {
  it("includes charter preamble", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("First Principles Engine");
    expect(prompt).toContain("CHARTER VALUES");
  });

  it("includes child name and activity type", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("Lincoln");
    expect(prompt).toContain("phonics");
    expect(prompt).toContain("reading.phonics.cvc");
    expect(prompt).toContain("15 minutes");
  });

  it("includes grade level when provided", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("Grade level: 3rd");
  });

  it("omits grade level when not provided", () => {
    const prompt = buildGenerateSystemPrompt(minimalCtx);
    expect(prompt).not.toContain("Grade level:");
  });

  it("includes ladder context when available", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("Phonics Ladder");
    expect(prompt).toContain("CVC Blending");
    expect(prompt).toContain(
      "Blend consonant-vowel-consonant words",
    );
  });

  it("omits ladder context when not available", () => {
    const prompt = buildGenerateSystemPrompt(londonCtx);
    expect(prompt).not.toContain("Current Skill Ladder Position");
  });

  it("includes matching priority skills from snapshot", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("CVC words");
    expect(prompt).toContain("level=emerging");
  });

  it("includes supports from snapshot", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("Finger tracking");
  });

  it("includes stop rules from snapshot", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("Frustration");
    expect(prompt).toContain("3 consecutive errors");
  });

  it("omits snapshot sections when not available", () => {
    const prompt = buildGenerateSystemPrompt(londonCtx);
    expect(prompt).not.toContain("Matching Priority Skills");
    expect(prompt).not.toContain("Available Supports");
    expect(prompt).not.toContain("Stop Rules");
  });

  it("includes weekly theme when available", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("Ocean Explorers");
    expect(prompt).toContain("Weave it in naturally");
  });

  it("omits weekly theme when not available", () => {
    const prompt = buildGenerateSystemPrompt(londonCtx);
    expect(prompt).not.toContain("Weekly Theme");
  });

  it("includes output schema", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"objective"');
    expect(prompt).toContain('"materials"');
    expect(prompt).toContain('"steps"');
    expect(prompt).toContain('"successCriteria"');
  });

  it("includes phonics-specific guidance for phonics type", () => {
    const prompt = buildGenerateSystemPrompt(lincolnCtx);
    expect(prompt).toContain("phonemic awareness");
    expect(prompt).toContain("multi-sensory");
  });

  it("includes story-specific guidance for story-prompt type", () => {
    const prompt = buildGenerateSystemPrompt(londonCtx);
    expect(prompt).toContain("story starter");
    expect(prompt).toContain("drawing elements");
  });

  it("includes math-specific guidance for math type", () => {
    const mathCtx: PromptContext = {
      ...minimalCtx,
      activityType: "math",
      skillTag: "math.addition",
    };
    const prompt = buildGenerateSystemPrompt(mathCtx);
    expect(prompt).toContain("manipulatives");
    expect(prompt).toContain("practice problems");
  });

  it("includes reading-specific guidance for reading type", () => {
    const readingCtx: PromptContext = {
      ...minimalCtx,
      activityType: "reading",
      skillTag: "reading.comprehension",
    };
    const prompt = buildGenerateSystemPrompt(readingCtx);
    expect(prompt).toContain("comprehension questions");
    expect(prompt).toContain("narration");
  });

  it("includes science-specific guidance for science activity types", () => {
    const prompt = buildGenerateSystemPrompt(minimalCtx);
    expect(prompt).toContain("hands-on science");
    expect(prompt).toContain("observation");
  });

  it("includes generic guidance for truly unknown activity types", () => {
    const unknownCtx: PromptContext = {
      ...minimalCtx,
      activityType: "custom-xyz",
      skillTag: "misc.unknown",
    };
    const prompt = buildGenerateSystemPrompt(unknownCtx);
    expect(prompt).toContain("hands-on activity");
    expect(prompt).toContain("success criteria");
  });
});

// ── buildGenerateUserMessage ────────────────────────────────────

describe("buildGenerateUserMessage", () => {
  it("includes child name, duration, activity type, and skill tag", () => {
    const msg = buildGenerateUserMessage(lincolnCtx);
    expect(msg).toContain("15-minute");
    expect(msg).toContain("phonics");
    expect(msg).toContain("Lincoln");
    expect(msg).toContain("reading.phonics.cvc");
    expect(msg).toContain("JSON only");
  });

  it("works for London story prompt", () => {
    const msg = buildGenerateUserMessage(londonCtx);
    expect(msg).toContain("20-minute");
    expect(msg).toContain("story-prompt");
    expect(msg).toContain("London");
  });
});

// ── parseActivityJson ───────────────────────────────────────────

describe("parseActivityJson", () => {
  const validJson = JSON.stringify({
    title: "CVC Word Builders",
    objective: "Blend and read 5 CVC words using letter tiles.",
    materials: ["Letter tiles", "Whiteboard", "Marker"],
    steps: [
      "Lay out vowel tiles in a row.",
      "Add consonants to build CVC words.",
      "Read each word aloud.",
    ],
    successCriteria: [
      "Reads 4 out of 5 CVC words correctly",
      "Can segment sounds before blending",
    ],
  });

  it("parses valid JSON", () => {
    const result = parseActivityJson(validJson);
    expect(result.title).toBe("CVC Word Builders");
    expect(result.objective).toContain("CVC words");
    expect(result.materials).toHaveLength(3);
    expect(result.steps).toHaveLength(3);
    expect(result.successCriteria).toHaveLength(2);
  });

  it("strips markdown fences", () => {
    const wrapped = "```json\n" + validJson + "\n```";
    const result = parseActivityJson(wrapped);
    expect(result.title).toBe("CVC Word Builders");
  });

  it("strips bare markdown fences", () => {
    const wrapped = "```\n" + validJson + "\n```";
    const result = parseActivityJson(wrapped);
    expect(result.title).toBe("CVC Word Builders");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseActivityJson("not json")).toThrow();
  });

  it("throws when title is missing", () => {
    const noTitle = JSON.stringify({
      objective: "test",
      materials: [],
      steps: ["step"],
      successCriteria: [],
    });
    expect(() => parseActivityJson(noTitle)).toThrow("title");
  });

  it("throws when objective is missing", () => {
    const noObjective = JSON.stringify({
      title: "test",
      materials: [],
      steps: ["step"],
      successCriteria: [],
    });
    expect(() => parseActivityJson(noObjective)).toThrow("objective");
  });

  it("throws when steps is empty", () => {
    const noSteps = JSON.stringify({
      title: "test",
      objective: "test",
      materials: [],
      steps: [],
      successCriteria: [],
    });
    expect(() => parseActivityJson(noSteps)).toThrow("steps");
  });

  it("throws when materials is not an array", () => {
    const badMaterials = JSON.stringify({
      title: "test",
      objective: "test",
      materials: "not array",
      steps: ["step"],
      successCriteria: [],
    });
    expect(() => parseActivityJson(badMaterials)).toThrow("materials");
  });

  it("throws when successCriteria is not an array", () => {
    const badCriteria = JSON.stringify({
      title: "test",
      objective: "test",
      materials: [],
      steps: ["step"],
      successCriteria: "not array",
    });
    expect(() => parseActivityJson(badCriteria)).toThrow("successCriteria");
  });
});
