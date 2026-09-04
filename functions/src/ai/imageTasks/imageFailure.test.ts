import { describe, expect, it, vi } from "vitest";
import {
  ImageFailureKind,
  PROVIDER_ERROR_KIND,
  ProviderErrorReason,
  imageFailureDetails,
  imageFailureDetailsFor,
  readProviderError,
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

/**
 * The one ladder both image handlers read (Codex P2, PR #1768). They each used
 * to carry a copy, and `enhanceSketch`'s copy had no configuration branches at
 * all — so an unset API key was declared `no-image`, and since the client trusts
 * the DECLARED kind ahead of the message text, every sketch door told a child to
 * try again forever for something only a grown-up could fix.
 */
describe("readProviderError", () => {
  it("reads a safety refusal, however the provider words it", () => {
    for (const msg of [
      "content_policy_violation",
      "request rejected by safety system",
      "the prompt was blocked",
    ]) {
      expect(readProviderError(msg)).toBe(ProviderErrorReason.Blocked);
    }
  });

  it("reads a rate limit", () => {
    expect(readProviderError("rate_limit exceeded")).toBe(
      ProviderErrorReason.RateLimited,
    );
    expect(readProviderError("HTTP 429 Too Many Requests")).toBe(
      ProviderErrorReason.RateLimited,
    );
  });

  it("reads BOTH configuration cases — the branches enhanceSketch was missing", () => {
    expect(readProviderError("invalid_api_key")).toBe(
      ProviderErrorReason.MissingKey,
    );
    expect(readProviderError("HTTP 401 Unauthorized")).toBe(
      ProviderErrorReason.MissingKey,
    );
    expect(readProviderError("HTTP 403: organization must complete verification")).toBe(
      ProviderErrorReason.OrgUnverified,
    );
  });

  it("a refusal wins over everything — order is load-bearing", () => {
    // A 403 that is really a content refusal must not read as a config problem.
    expect(readProviderError("403 content_policy_violation")).toBe(
      ProviderErrorReason.Blocked,
    );
  });

  it("anything else is unknown, which reports as a plain retry", () => {
    expect(readProviderError("socket hang up")).toBe(ProviderErrorReason.Unknown);
    expect(readProviderError("")).toBe(ProviderErrorReason.Unknown);
  });

  it("both configuration reasons report as not-configured, never as no-image", () => {
    expect(PROVIDER_ERROR_KIND[ProviderErrorReason.MissingKey]).toBe(
      ImageFailureKind.NotConfigured,
    );
    expect(PROVIDER_ERROR_KIND[ProviderErrorReason.OrgUnverified]).toBe(
      ImageFailureKind.NotConfigured,
    );
  });

  it("only a refusal maps to the kind that spends the suggester", () => {
    const blockedReasons = Object.values(ProviderErrorReason).filter(
      (r) => PROVIDER_ERROR_KIND[r] === ImageFailureKind.Blocked,
    );
    expect(blockedReasons).toEqual([ProviderErrorReason.Blocked]);
  });
});
