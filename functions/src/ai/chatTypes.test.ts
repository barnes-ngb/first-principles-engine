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

  it("extracts the text block from a [thinking, text] response (FEAT-77 — thinking is skipped, not returned)", async () => {
    // With adaptive thinking on, the response can be [thinking, text]. Extraction
    // must return the text block, never the thinking block or an empty string.
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "thinking", thinking: "let me reason about this at length…" },
        { type: "text", text: '{"narrative":"ok"}' },
      ],
      usage: { input_tokens: 5, output_tokens: 9 },
      stop_reason: "end_turn",
    });

    const result = await callClaude({
      apiKey: "k",
      model: "claude-sonnet-5",
      maxTokens: 4000,
      systemPrompt: "SYS",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe('{"narrative":"ok"}');
  });
});

// ── callClaude — temperature gating (FEAT-58 follow-up) ───────
// `temperature` is deprecated/rejected on the Sonnet-5 / Opus-4.6+ generation and
// must never appear in a request to those models, even when a caller supplies it.
// Haiku 4.5 still accepts it, so the gate is conditional (Option B), not a blanket
// removal.

describe("callClaude temperature gating", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "end_turn",
    });
  });

  it("omits temperature for a book-generation request on Sonnet 5 even when provided (0.7)", async () => {
    // The generateStory / reviseStory / revisePage book paths pass temperature: 0.7
    // and run on Sonnet 5 — the exact request that was 503-ing in production.
    await callClaude({
      apiKey: "k",
      model: "claude-sonnet-5",
      maxTokens: 6144,
      temperature: 0.7,
      systemPrompt: "SYS",
      messages: [{ role: "user", content: "Generate the story now." }],
    });

    const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("temperature");
  });

  it("omits temperature for chat / learnerSynthesis-shaped requests (none supplied)", async () => {
    await callClaude({
      apiKey: "k",
      model: "claude-sonnet-5",
      maxTokens: 2000,
      systemPrompt: "SYS",
      messages: [{ role: "user", content: "hi" }],
    });

    const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("temperature");
  });

  it("still sends temperature to Haiku 4.5, which accepts it (conditional gate, not blanket removal)", async () => {
    await callClaude({
      apiKey: "k",
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
      temperature: 0.7,
      systemPrompt: "SYS",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 }),
    );
  });
});
