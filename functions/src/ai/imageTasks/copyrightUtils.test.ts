import { describe, expect, it } from "vitest";
import { COPYRIGHT_NAMES, fallbackCopyrightStrip } from "./copyrightUtils.js";

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
