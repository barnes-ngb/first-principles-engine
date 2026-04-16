import { describe, expect, it } from "vitest";
import { formatEvalHistoryByDomain } from "./chatTypes.js";

// ── formatEvalHistoryByDomain ─────────────────────────────────

describe("formatEvalHistoryByDomain", () => {
  it("returns empty string for empty input", () => {
    expect(formatEvalHistoryByDomain("")).toBe("");
  });

  it("wraps non-empty text with header", () => {
    const input =
      "Recent Phonics history (last 2 sessions):\n" +
      "- Apr 8 (quest, L5): 4/6 correct, ended at L5\n" +
      "- Apr 6 (eval, guided): solid through CVCe, shaky vowel teams";
    const result = formatEvalHistoryByDomain(input);
    expect(result).toContain("EVALUATION HISTORY BY DOMAIN:");
    expect(result).toContain("Recent Phonics history");
    expect(result).toContain("Apr 8 (quest, L5)");
    expect(result).toContain("Apr 6 (eval, guided)");
  });
});
