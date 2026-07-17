import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}));

import { callClaude, formatEvalHistoryByDomain } from "./chatTypes.js";

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

// ── callClaude — reasoning-effort control (FEAT-77) ───────────

describe("callClaude reasoning-effort", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "end_turn",
    });
  });

  it("sends output_config.effort when a per-task effort is provided", async () => {
    await callClaude({
      apiKey: "k",
      model: "claude-sonnet-5",
      maxTokens: 4000,
      effort: "low",
      systemPrompt: "SYS",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ output_config: { effort: "low" } }),
    );
  });

  it("omits output_config entirely when no effort is provided (chat tasks unchanged)", async () => {
    await callClaude({
      apiKey: "k",
      model: "claude-sonnet-5",
      maxTokens: 2000,
      systemPrompt: "SYS",
      messages: [{ role: "user", content: "hi" }],
    });

    const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("output_config");
  });
});
