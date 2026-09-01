import { describe, expect, it } from "vitest";
import { describeStoryStop, MAX_TOKENS_STOP_REASON } from "./generateStory.js";

describe("describeStoryStop (FEAT-169 — the CF log names which failure it was)", () => {
  it("is silent for a clean end_turn with text", () => {
    expect(describeStoryStop("end_turn", '{"title":"T","pages":[]}', 900)).toEqual({
      cutShort: false,
      noVisibleText: false,
      note: "",
    });
  });

  it("names a budget-truncated story", () => {
    const d = describeStoryStop(MAX_TOKENS_STOP_REASON, '{"title":"T","pages":[{"pageNumber":1,"te', 7168);
    expect(d.cutShort).toBe(true);
    expect(d.noVisibleText).toBe(false);
    expect(d.note).toContain("stop_reason=max_tokens");
    expect(d.note).toContain("7168 output/thinking tokens");
  });

  it("names the FEAT-77/78 shape: max_tokens with zero visible text", () => {
    const d = describeStoryStop(MAX_TOKENS_STOP_REASON, "", 7168);
    expect(d).toMatchObject({ cutShort: true, noVisibleText: true });
    expect(d.note).toMatch(/reasoning consumed the whole budget/);
  });

  it("names an empty reply that was not a budget stop, with the stop reason it did carry", () => {
    const d = describeStoryStop("end_turn", "   ", 12);
    expect(d).toMatchObject({ cutShort: false, noVisibleText: true });
    expect(d.note).toContain("stop_reason=end_turn");
    const unknown = describeStoryStop(undefined, "", 0);
    expect(unknown.note).toContain("stop_reason=unknown");
  });
});
