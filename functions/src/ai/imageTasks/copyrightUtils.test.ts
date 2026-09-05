import { describe, expect, it } from "vitest";
import {
  COPYRIGHT_NAMES,
  fallbackCopyrightStrip,
  parsePromptAlternatives,
} from "./copyrightUtils.js";

describe("COPYRIGHT_NAMES regex", () => {
  it("matches common character names", () => {
    expect("Mario").toMatch(COPYRIGHT_NAMES);
    expect("pikachu").toMatch(COPYRIGHT_NAMES);
    expect("Spider-Man").toMatch(COPYRIGHT_NAMES);
    expect("spiderman").toMatch(COPYRIGHT_NAMES);
    expect("elsa").toMatch(COPYRIGHT_NAMES);
    expect("minecraft").toMatch(COPYRIGHT_NAMES);
    expect("spongebob").toMatch(COPYRIGHT_NAMES);
    expect("bluey").toMatch(COPYRIGHT_NAMES);
  });

  it("does not match generic words", () => {
    // Reset lastIndex since regex is global
    expect("a cute puppy".match(COPYRIGHT_NAMES)).toBeNull();
    expect("a dragon in a castle".match(COPYRIGHT_NAMES)).toBeNull();
    expect("rainbow flower garden".match(COPYRIGHT_NAMES)).toBeNull();
  });
});

describe("fallbackCopyrightStrip", () => {
  it("replaces copyrighted names with 'character'", () => {
    const result = fallbackCopyrightStrip("my Mario drawing");
    expect(result).toBe("my character drawing");
    expect(result).not.toContain("Mario");
  });

  it("replaces multiple names", () => {
    const result = fallbackCopyrightStrip("Mario and Luigi play with Pikachu");
    expect(result).not.toContain("Mario");
    expect(result).not.toContain("Luigi");
    expect(result).not.toContain("Pikachu");
    expect(result).toContain("character");
  });

  it("leaves clean prompts unchanged", () => {
    const clean = "a cute puppy playing in a garden";
    expect(fallbackCopyrightStrip(clean)).toBe(clean);
  });

  it("collapses extra whitespace after stripping", () => {
    const result = fallbackCopyrightStrip("a  Mario  drawing");
    expect(result).not.toMatch(/\s{2,}/);
  });
});

describe("parsePromptAlternatives (FEAT-195)", () => {
  it("reads three plain lines", () => {
    const raw = "a red dragon in a cave\na blue dragon over the sea\na tiny dragon on a rock";
    expect(parsePromptAlternatives(raw)).toEqual([
      "a red dragon in a cave",
      "a blue dragon over the sea",
      "a tiny dragon on a rock",
    ]);
  });

  it("strips bullets, numbering and wrapping quotes however the model formats them", () => {
    const raw = '1. a red dragon\n- a blue dragon\n• "a tiny dragon"';
    expect(parsePromptAlternatives(raw)).toEqual([
      "a red dragon",
      "a blue dragon",
      "a tiny dragon",
    ]);
  });

  it("drops a line that still names a franchise character — it would just be refused again", () => {
    const raw = "Mario jumping over a pit\na stocky man in red overalls\na cheerful plumber";
    expect(parsePromptAlternatives(raw)).toEqual([
      "a stocky man in red overalls",
      "a cheerful plumber",
    ]);
  });

  it("caps at three and ignores blank lines", () => {
    const raw = "one\n\ntwo\n\nthree\n\nfour";
    expect(parsePromptAlternatives(raw)).toEqual(["one", "two", "three"]);
  });

  it("drops a paragraph — a tappable choice is one line, not an essay", () => {
    expect(parsePromptAlternatives("x".repeat(400))).toEqual([]);
  });

  it("returns [] for an empty reply rather than throwing", () => {
    expect(parsePromptAlternatives("")).toEqual([]);
    expect(parsePromptAlternatives("   \n  \n ")).toEqual([]);
  });
});
