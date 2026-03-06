import { describe, expect, it } from "vitest";
import { sanitizeAndParseJson } from "./sanitizeJson.js";

describe("sanitizeAndParseJson", () => {
  it("parses valid JSON as-is", () => {
    const result = sanitizeAndParseJson<{ a: number }>(
      '{"a": 1}',
    );
    expect(result).toEqual({ a: 1 });
  });

  it("strips markdown json fences", () => {
    const result = sanitizeAndParseJson<{ a: number }>(
      '```json\n{"a": 1}\n```',
    );
    expect(result).toEqual({ a: 1 });
  });

  it("strips bare markdown fences", () => {
    const result = sanitizeAndParseJson<{ a: number }>(
      '```\n{"a": 1}\n```',
    );
    expect(result).toEqual({ a: 1 });
  });

  it("removes trailing commas in arrays", () => {
    const result = sanitizeAndParseJson<{ items: string[] }>(
      '{"items": ["a", "b", "c",]}',
    );
    expect(result).toEqual({ items: ["a", "b", "c"] });
  });

  it("removes trailing commas in objects", () => {
    const result = sanitizeAndParseJson<{ a: number; b: number }>(
      '{"a": 1, "b": 2,}',
    );
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("removes trailing commas with whitespace before bracket", () => {
    const input = `{
  "steps": [
    "Step one",
    "Step two",
  ]
}`;
    const result = sanitizeAndParseJson<{ steps: string[] }>(input);
    expect(result.steps).toEqual(["Step one", "Step two"]);
  });

  it("handles nested trailing commas", () => {
    const input = `{
  "title": "Test",
  "materials": ["item1", "item2",],
  "steps": ["step1",],
}`;
    const result = sanitizeAndParseJson<{
      title: string;
      materials: string[];
      steps: string[];
    }>(input);
    expect(result.title).toBe("Test");
    expect(result.materials).toEqual(["item1", "item2"]);
    expect(result.steps).toEqual(["step1"]);
  });

  it("escapes literal newlines inside string values", () => {
    const input = '{"text": "line one\nline two"}';
    const result = sanitizeAndParseJson<{ text: string }>(input);
    expect(result.text).toBe("line one\nline two");
  });

  it("preserves already-escaped newlines", () => {
    const input = '{"text": "line one\\nline two"}';
    const result = sanitizeAndParseJson<{ text: string }>(input);
    expect(result.text).toBe("line one\nline two");
  });

  it("handles the realistic LLM output scenario", () => {
    // Simulates a typical LLM response with trailing commas and markdown fences
    const input = `\`\`\`json
{
  "title": "CVC Word Builders",
  "objective": "Blend and read 5 CVC words using letter tiles.",
  "materials": [
    "Letter tiles",
    "Whiteboard",
    "Marker",
  ],
  "steps": [
    "Lay out vowel tiles in a row.",
    "Add consonants to build CVC words.",
    "Read each word aloud.",
  ],
  "successCriteria": [
    "Reads 4 out of 5 CVC words correctly",
    "Can segment sounds before blending",
  ],
}
\`\`\``;
    const result = sanitizeAndParseJson<{
      title: string;
      steps: string[];
    }>(input);
    expect(result.title).toBe("CVC Word Builders");
    expect(result.steps).toHaveLength(3);
  });

  it("throws on completely invalid content", () => {
    expect(() => sanitizeAndParseJson("not json at all")).toThrow();
  });
});
