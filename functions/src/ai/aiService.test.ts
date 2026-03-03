import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatMessage, ChatResponse, ImageResponse } from "./aiService.js";
import { AiModel } from "./aiService.js";

const mockChat = vi.fn();
const mockGenerateImage = vi.fn();

vi.mock("./providers/claude.js", () => ({
  createClaudeProvider: vi.fn(() => ({ chat: mockChat })),
}));

vi.mock("./providers/openai.js", () => ({
  createOpenAiProvider: vi.fn(() => ({
    generateImage: mockGenerateImage,
  })),
}));

import { createAiService } from "./aiService.js";

describe("createAiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates chat() to the Claude provider", async () => {
    const mockResponse: ChatResponse = {
      content: "Hello!",
      model: "claude-haiku-4-5-20251001",
      usage: { inputTokens: 5, outputTokens: 10 },
    };
    mockChat.mockResolvedValueOnce(mockResponse);

    const service = createAiService({
      claudeKey: "ck",
      openaiKey: "ok",
    });
    const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];
    const result = await service.chat(messages, { model: AiModel.Haiku });

    expect(result).toEqual(mockResponse);
    expect(mockChat).toHaveBeenCalledWith(messages, {
      model: AiModel.Haiku,
    });
  });

  it("delegates generateImage() to the OpenAI provider", async () => {
    const mockResponse: ImageResponse = {
      url: "https://example.com/img.png",
      revisedPrompt: "A pretty picture",
    };
    mockGenerateImage.mockResolvedValueOnce(mockResponse);

    const service = createAiService({
      claudeKey: "ck",
      openaiKey: "ok",
    });
    const result = await service.generateImage("a picture", {
      quality: "hd",
    });

    expect(result).toEqual(mockResponse);
    expect(mockGenerateImage).toHaveBeenCalledWith("a picture", {
      quality: "hd",
    });
  });

  it("can call chat with sonnet model", async () => {
    mockChat.mockResolvedValueOnce({
      content: "Deep analysis",
      model: "claude-sonnet-4-6",
      usage: { inputTokens: 100, outputTokens: 500 },
    });

    const service = createAiService({
      claudeKey: "ck",
      openaiKey: "ok",
    });
    const result = await service.chat(
      [
        { role: "system", content: "You are a planner." },
        { role: "user", content: "Plan my week" },
      ],
      { model: AiModel.Sonnet, maxTokens: 4096 },
    );

    expect(result.content).toBe("Deep analysis");
    expect(mockChat).toHaveBeenCalledWith(
      [
        { role: "system", content: "You are a planner." },
        { role: "user", content: "Plan my week" },
      ],
      { model: "sonnet", maxTokens: 4096 },
    );
  });
});
