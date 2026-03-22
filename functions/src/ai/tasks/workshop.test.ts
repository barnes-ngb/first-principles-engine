import { describe, it, expect } from "vitest";
import { buildWorkshopPrompt, extractGameJson } from "./workshop.js";
import type { WorkshopInput } from "./workshop.js";

const sampleInput: WorkshopInput = {
  theme: "dragons",
  players: [
    { id: "child-london", name: "London", isCreator: true },
    { id: "child-lincoln", name: "Lincoln", isCreator: false },
    { id: "parent-shelly", name: "Mom", isCreator: false },
  ],
  goal: "find_treasure",
  challenges: [
    { type: "reading" },
    { type: "math" },
    { type: "story" },
    { type: "custom", idea: "Talk like a pirate!" },
  ],
  boardStyle: "winding",
  boardLength: "medium",
};

describe("buildWorkshopPrompt", () => {
  it("includes the child's name and theme", () => {
    const prompt = buildWorkshopPrompt("London", "kindergarten", undefined, sampleInput);
    expect(prompt).toContain("London");
    expect(prompt).toContain("dragons");
  });

  it("includes player names", () => {
    const prompt = buildWorkshopPrompt("London", "kindergarten", undefined, sampleInput);
    expect(prompt).toContain("London");
    expect(prompt).toContain("Lincoln");
    expect(prompt).toContain("Mom");
  });

  it("includes skill snapshot when available", () => {
    const snapshot = {
      prioritySkills: [
        { tag: "reading.phonics.cvc", label: "CVC Words", level: "developing" },
        { tag: "math.addition.single", label: "Single-digit Addition", level: "emerging" },
      ],
    };
    const prompt = buildWorkshopPrompt("London", "kindergarten", snapshot, sampleInput);
    expect(prompt).toContain("CVC Words: developing");
    expect(prompt).toContain("Single-digit Addition: emerging");
  });

  it("sets correct space count based on board length", () => {
    const shortInput = { ...sampleInput, boardLength: "short" as const };
    const prompt = buildWorkshopPrompt("London", "kindergarten", undefined, shortInput);
    expect(prompt).toContain("15 total spaces");

    const longInput = { ...sampleInput, boardLength: "long" as const };
    const longPrompt = buildWorkshopPrompt("London", "kindergarten", undefined, longInput);
    expect(longPrompt).toContain("35 total spaces");
  });

  it("includes custom challenge ideas", () => {
    const prompt = buildWorkshopPrompt("London", "kindergarten", undefined, sampleInput);
    expect(prompt).toContain('custom: "Talk like a pirate!"');
  });

  it("includes the <game> JSON schema in the prompt", () => {
    const prompt = buildWorkshopPrompt("London", "kindergarten", undefined, sampleInput);
    expect(prompt).toContain("<game>");
    expect(prompt).toContain("challengeCards");
    expect(prompt).toContain("readAloudText");
  });

  it("instructs AI to use real player names in narrative", () => {
    const prompt = buildWorkshopPrompt("London", "kindergarten", undefined, sampleInput);
    expect(prompt).toContain("real family members");
    expect(prompt).toContain("real player names");
  });
});

describe("extractGameJson", () => {
  it("extracts JSON from <game> tags", () => {
    const input = `Here is your game!\n<game>\n{"title": "Dragon Race"}\n</game>\nEnjoy!`;
    const result = extractGameJson(input);
    expect(result).toBe('{"title": "Dragon Race"}');
    expect(JSON.parse(result)).toEqual({ title: "Dragon Race" });
  });

  it("throws when no <game> tags found", () => {
    const input = "Here is some text without game tags.";
    expect(() => extractGameJson(input)).toThrow("did not contain <game> tags");
  });

  it("handles multiline JSON in <game> tags", () => {
    const input = `<game>
{
  "title": "Dragon Race",
  "board": { "spaces": [], "totalSpaces": 25 }
}
</game>`;
    const result = extractGameJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.title).toBe("Dragon Race");
    expect(parsed.board.totalSpaces).toBe(25);
  });
});
