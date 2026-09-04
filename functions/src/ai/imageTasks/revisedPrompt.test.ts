import { describe, expect, it } from "vitest";
import { resolveRevisedPrompt } from "./generateImage.js";

describe("resolveRevisedPrompt (FEAT-195)", () => {
  it("reports the copyright rewrite when it changed the ask", () => {
    expect(
      resolveRevisedPrompt("Mario", "a stocky man in red overalls with a mustache"),
    ).toBe("a stocky man in red overalls with a mustache");
  });

  it("says nothing when the ask went through unchanged", () => {
    expect(resolveRevisedPrompt("a cute puppy", "a cute puppy")).toBeUndefined();
  });

  it("ignores a reformat — case and whitespace are not a rewrite", () => {
    expect(
      resolveRevisedPrompt("A Cute   Puppy", "a cute puppy"),
    ).toBeUndefined();
  });

  it("prefers the provider's own revision where it reports one", () => {
    expect(
      resolveRevisedPrompt("a cute puppy", "a cute puppy", "a golden retriever puppy, sunlit"),
    ).toBe("a golden retriever puppy, sunlit");
  });

  it("says nothing when the rewrite came back empty", () => {
    expect(resolveRevisedPrompt("a cute puppy", "   ")).toBeUndefined();
  });
});
