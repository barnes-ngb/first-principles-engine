import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatMessage } from "../aiService.js";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

import { createClaudeProvider } from "./claude.js";

describe("createClaudeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends messages to Claude and returns formatted response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Hello from Claude!" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const provider = createClaudeProvider("test-key");
    const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];

    const response = await provider.chat(messages, { model: "haiku" });

    expect(response.content).toBe("Hello from Claude!");
    expect(response.model).toBe("claude-haiku-4-5-20251001");
    expect(response.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it("maps model alias 'haiku' to claude-haiku-4-5-20251001", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const provider = createClaudeProvider("test-key");
    await provider.chat([{ role: "user", content: "Hi" }], { model: "haiku" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001" }),
    );
  });

  it("maps model alias 'sonnet' to claude-sonnet-4-6", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const provider = createClaudeProvider("test-key");
    await provider.chat([{ role: "user", content: "Hi" }], {
      model: "sonnet",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
    );
  });

  it("extracts system messages and passes them separately", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Response" }],
      model: "claude-sonnet-4-6",
      usage: { input_tokens: 15, output_tokens: 25 },
    });

    const provider = createClaudeProvider("test-key");
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a helpful tutor." },
      { role: "user", content: "Teach me math" },
    ];

    await provider.chat(messages, { model: "sonnet" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "You are a helpful tutor.",
        messages: [{ role: "user", content: "Teach me math" }],
      }),
    );
  });

  it("joins multiple system messages with double newline", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const provider = createClaudeProvider("test-key");
    const messages: ChatMessage[] = [
      { role: "system", content: "System part 1" },
      { role: "system", content: "System part 2" },
      { role: "user", content: "Hello" },
    ];

    await provider.chat(messages, { model: "haiku" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "System part 1\n\nSystem part 2",
      }),
    );
  });

  it("uses default maxTokens of 1024", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const provider = createClaudeProvider("test-key");
    await provider.chat([{ role: "user", content: "Hi" }], { model: "haiku" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 1024 }),
    );
  });

  it("uses custom maxTokens and temperature when provided", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const provider = createClaudeProvider("test-key");
    await provider.chat([{ role: "user", content: "Hi" }], {
      model: "haiku",
      maxTokens: 2048,
      temperature: 0.7,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 2048,
        temperature: 0.7,
      }),
    );
  });

  it("returns empty content when response has no text block", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [],
      model: "claude-haiku-4-5-20251001",
      usage: { input_tokens: 1, output_tokens: 0 },
    });

    const provider = createClaudeProvider("test-key");
    const response = await provider.chat(
      [{ role: "user", content: "Hi" }],
      { model: "haiku" },
    );

    expect(response.content).toBe("");
  });
});
