import { describe, expect, it, vi } from "vitest";
import {
  ImageFailureKind,
  imageFailureDetails,
  imageFailureDetailsFor,
} from "./imageFailure.js";

describe("imageFailureDetails", () => {
  it("carries the alternatives when there are any", () => {
    expect(imageFailureDetails(ImageFailureKind.Blocked, ["a", "b"])).toEqual({
      failure: "blocked",
      alternatives: ["a", "b"],
    });
  });

  it("omits an empty list rather than sending an empty array", () => {
    expect(imageFailureDetails(ImageFailureKind.Blocked, [])).toEqual({
      failure: "blocked",
    });
    expect(imageFailureDetails(ImageFailureKind.Busy)).toEqual({
      failure: "busy",
    });
  });
});

describe("imageFailureDetailsFor — the FEAT-195 cost rail", () => {
  it("spends the suggester on a refusal and returns its three alternatives", async () => {
    const suggest = vi
      .fn()
      .mockResolvedValue(["a red plumber", "a mustached hero", "an overalls guy"]);

    const details = await imageFailureDetailsFor(ImageFailureKind.Blocked, suggest);

    expect(suggest).toHaveBeenCalledTimes(1);
    expect(details).toEqual({
      failure: "blocked",
      alternatives: ["a red plumber", "a mustached hero", "an overalls guy"],
    });
  });

  it("spends NOTHING on any other failure — a rewording fixes none of them", async () => {
    const suggest = vi.fn().mockResolvedValue(["never asked for"]);

    for (const kind of [
      ImageFailureKind.Busy,
      ImageFailureKind.NotConfigured,
      ImageFailureKind.NoImage,
    ] as const) {
      const details = await imageFailureDetailsFor(kind, suggest);
      expect(details).toEqual({ failure: kind });
    }

    expect(suggest).not.toHaveBeenCalled();
  });

  it("still returns the failure when the suggester itself fails", async () => {
    // The client then shows its own written tips — the card is never empty
    // because a helper failed.
    const details = await imageFailureDetailsFor(ImageFailureKind.Blocked, () =>
      Promise.reject(new Error("Haiku is down")),
    );
    expect(details).toEqual({ failure: "blocked" });
  });

  it("treats an empty suggestion list as no alternatives, not an empty card", async () => {
    const details = await imageFailureDetailsFor(ImageFailureKind.Blocked, async () => []);
    expect(details).toEqual({ failure: "blocked" });
  });
});
