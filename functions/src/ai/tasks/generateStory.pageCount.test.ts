import { describe, expect, it } from "vitest";
import { reconcilePagesFromStory } from "./generateStory.js";

/** A minimal generated-story JSON with `n` pages. */
function storyJson(n: number): string {
  const pages = Array.from({ length: n }, (_, i) => ({
    pageNumber: i + 1,
    text: `page ${i + 1}`,
    sceneDescription: "a scene",
  }));
  return JSON.stringify({ title: "T", pages });
}

describe("reconcilePagesFromStory (validate on parse, FEAT-97)", () => {
  it("reports a matching count", () => {
    const r = reconcilePagesFromStory(10, storyJson(10));
    expect(r).toEqual({ target: 10, actual: 10, delta: 0, wildlyOff: false });
  });

  it("accepts a mismatched count without failing — reports the delta", () => {
    const r = reconcilePagesFromStory(10, storyJson(9));
    expect(r).not.toBeNull();
    expect(r?.actual).toBe(9);
    expect(r?.delta).toBe(-1);
    expect(r?.wildlyOff).toBe(false);
  });

  it("flags a wildly-off count", () => {
    const r = reconcilePagesFromStory(6, storyJson(12));
    expect(r?.wildlyOff).toBe(true);
  });

  it("tolerates markdown fences around the JSON", () => {
    const fenced = "```json\n" + storyJson(6) + "\n```";
    expect(reconcilePagesFromStory(6, fenced)?.actual).toBe(6);
  });

  it("returns null (never throws) for unparseable text so a story still flows", () => {
    expect(reconcilePagesFromStory(10, "not json at all")).toBeNull();
    expect(reconcilePagesFromStory(10, JSON.stringify({ title: "x" }))).toBeNull();
  });
});
