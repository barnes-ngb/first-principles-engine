import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGenerate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    images: { generate: mockGenerate },
  })),
}));

import { createOpenAiProvider } from "./openai.js";

describe("createOpenAiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates an image and returns url", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [
        {
          url: "https://example.com/image.png",
          revised_prompt: "A colorful illustration of a cat",
        },
      ],
    });

    const provider = createOpenAiProvider("test-key");
    const response = await provider.generateImage("a cat");

    expect(response.url).toBe("https://example.com/image.png");
    expect(response.revisedPrompt).toBe(
      "A colorful illustration of a cat",
    );
  });

  it("uses dall-e-3 model by default", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ url: "https://example.com/img.png" }],
    });

    const provider = createOpenAiProvider("test-key");
    await provider.generateImage("a dog");

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "dall-e-3" }),
    );
  });

  it("uses default size 1024x1024 and standard quality", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ url: "https://example.com/img.png" }],
    });

    const provider = createOpenAiProvider("test-key");
    await provider.generateImage("a landscape");

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "1024x1024",
        quality: "standard",
        n: 1,
      }),
    );
  });

  it("passes custom size and quality options", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ url: "https://example.com/img.png" }],
    });

    const provider = createOpenAiProvider("test-key");
    await provider.generateImage("a portrait", {
      size: "1024x1792",
      quality: "hd",
    });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "1024x1792",
        quality: "hd",
      }),
    );
  });

  it("returns empty url when response data is empty", async () => {
    mockGenerate.mockResolvedValueOnce({ data: [] });

    const provider = createOpenAiProvider("test-key");
    const response = await provider.generateImage("nothing");

    expect(response.url).toBe("");
    expect(response.revisedPrompt).toBeUndefined();
  });
});
