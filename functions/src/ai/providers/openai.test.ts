import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGenerate = vi.fn();
const mockEdit = vi.fn();
const mockToFile = vi.fn(async (buf: Buffer) => buf);

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    images: { generate: mockGenerate, edit: mockEdit },
  })),
  toFile: mockToFile,
}));

import { createOpenAiProvider } from "./openai.js";

describe("createOpenAiProvider.generateImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns b64Data from gpt-image-1.5 response", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ b64_json: "BASE64DATA" }],
    });

    const provider = createOpenAiProvider("test-key");
    const response = await provider.generateImage("a cat");

    expect(response.b64Data).toBe("BASE64DATA");
    expect(response.url).toBe("");
    expect(response.revisedPrompt).toBeUndefined();
  });

  it("uses gpt-image-1.5 model by default", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ b64_json: "BASE64DATA" }],
    });

    const provider = createOpenAiProvider("test-key");
    await provider.generateImage("a dog");

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-1.5" }),
    );
  });

  it("uses default size 1024x1024 and medium quality", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ b64_json: "BASE64DATA" }],
    });

    const provider = createOpenAiProvider("test-key");
    await provider.generateImage("a landscape");

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "1024x1024",
        quality: "medium",
        n: 1,
      }),
    );
  });

  it("passes custom size and quality options", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ b64_json: "BASE64DATA" }],
    });

    const provider = createOpenAiProvider("test-key");
    await provider.generateImage("a portrait", {
      size: "1024x1536",
      quality: "high",
    });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "1024x1536",
        quality: "high",
      }),
    );
  });

  it("passes background and output_format on every generate call", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ b64_json: "BASE64DATA" }],
    });

    const provider = createOpenAiProvider("test-key");
    await provider.generateImage("a sticker", {
      background: "transparent",
      outputFormat: "png",
    });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        background: "transparent",
        output_format: "png",
      }),
    );
  });

  it("defaults background to auto and output_format to png", async () => {
    mockGenerate.mockResolvedValueOnce({
      data: [{ b64_json: "BASE64DATA" }],
    });

    const provider = createOpenAiProvider("test-key");
    await provider.generateImage("default opts");

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        background: "auto",
        output_format: "png",
      }),
    );
  });

  it("returns empty data shape when response data is empty", async () => {
    mockGenerate.mockResolvedValueOnce({ data: [] });

    const provider = createOpenAiProvider("test-key");
    const response = await provider.generateImage("nothing");

    expect(response.url).toBe("");
    expect(response.b64Data).toBeUndefined();
    expect(response.revisedPrompt).toBeUndefined();
  });
});

describe("createOpenAiProvider.editImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses gpt-image-1.5 model on the edit endpoint", async () => {
    mockEdit.mockResolvedValueOnce({
      data: [{ b64_json: "EDITED_BASE64" }],
    });

    const provider = createOpenAiProvider("test-key");
    const buf = Buffer.from("fake-png-bytes");
    await provider.editImage(buf, "make it shinier");

    expect(mockEdit).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-1.5" }),
    );
  });

  it("returns b64Data from edit response", async () => {
    mockEdit.mockResolvedValueOnce({
      data: [{ b64_json: "EDITED_BASE64" }],
    });

    const provider = createOpenAiProvider("test-key");
    const buf = Buffer.from("fake-png-bytes");
    const response = await provider.editImage(buf, "make it shinier", {
      background: "transparent",
    });

    expect(response.b64Data).toBe("EDITED_BASE64");
    expect(response.url).toBe("");
  });
});
