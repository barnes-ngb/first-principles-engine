/**
 * What a refused picture returns, so the client can offer a way forward
 * (FEAT-195).
 *
 * **The problem this closes.** Every paid image door ended a refusal the same
 * way: one static sentence and nothing to tap. `generateImage` threw *"That
 * prompt was blocked… avoid character names like Mario, Elsa, etc."*;
 * `enhanceSketch` threw its own near-twin; the client then showed one of four
 * unrelated strings depending on which door you were standing at. A person who
 * asked for a picture of Mario was told no, told why in general terms, and left
 * to guess the wording that would work.
 *
 * The server already knows more than it says. It runs `rewriteForCopyright`
 * before every image call, so it has a model wired up that is good at exactly
 * the rewording the person now has to do by hand. This module is the shape that
 * carries that help back: a declared failure `kind` plus, on a refusal only, up
 * to three alternative descriptions of what they actually asked for.
 *
 * **Why a declared kind and not message-sniffing.** The client can and does fall
 * back to reading the callable's `code` and message text, but a string match on
 * "blocked" is a rule two files apart from the branch that decided it. Naming
 * the kind here means the door renders what the handler *meant*, and a reworded
 * error message can never silently turn a blocked prompt into a generic retry.
 *
 * Attached as an `HttpsError` details payload. No `offline` kind: a dropped
 * connection never reaches a handler, so that one is the client's to classify.
 */

export const ImageFailureKind = {
  /** The image model's safety / content policy refused. The only kind with alternatives. */
  Blocked: "blocked",
  /** Rate limited upstream. Nothing to reword — wait. */
  Busy: "busy",
  /** API key missing or the org is unverified. A grown-up thing to fix. */
  NotConfigured: "not-configured",
  /** The call came back with nothing usable. A plain retry. */
  NoImage: "no-image",
} as const;
export type ImageFailureKind =
  (typeof ImageFailureKind)[keyof typeof ImageFailureKind];

/** The `HttpsError` details payload every image failure carries. */
export interface ImageFailureDetails {
  failure: ImageFailureKind;
  /**
   * Up to three tappable rewordings of what the person asked for. Present only
   * on {@link ImageFailureKind.Blocked}, and only when the suggester answered —
   * an empty or absent list means the client shows its own static tips instead,
   * never an empty card.
   */
  alternatives?: string[];
}

/** Build the details payload for one failure. Omits an empty alternatives list. */
export function imageFailureDetails(
  failure: ImageFailureKind,
  alternatives?: string[],
): ImageFailureDetails {
  return alternatives && alternatives.length > 0
    ? { failure, alternatives }
    : { failure };
}

/** Asks the model for rewordings. Injected, so the rule below can be tested. */
export type AlternativesSuggester = () => Promise<string[]>;

/**
 * The details payload for one failure, spending the suggester **only** on a
 * refusal.
 *
 * This is where the cost rail lives, rather than in where each handler happens
 * to put the call: a rate limit, an unset API key and a download that came back
 * empty pay for nothing, because no rewording would fix any of them. Both image
 * handlers route every branch through here, so a new branch cannot quietly
 * start buying suggestions.
 *
 * A suggester that fails is not a failure of this function — the client falls
 * back to its own written tips, so the card is never empty. Never throws.
 */
export async function imageFailureDetailsFor(
  failure: ImageFailureKind,
  suggest: AlternativesSuggester,
): Promise<ImageFailureDetails> {
  if (failure !== ImageFailureKind.Blocked) return { failure };
  try {
    return imageFailureDetails(failure, await suggest());
  } catch {
    return { failure };
  }
}

// ── Reading the provider's error ───────────────────────────────────

/**
 * Why the image provider rejected, at the granularity the HANDLERS need — one
 * step finer than {@link ImageFailureKind}, because a missing key and an
 * unverified org are the same *kind* to a reader but want different words.
 */
export const ProviderErrorReason = {
  Blocked: "blocked",
  RateLimited: "rate-limited",
  MissingKey: "missing-key",
  OrgUnverified: "org-unverified",
  Unknown: "unknown",
} as const;
export type ProviderErrorReason =
  (typeof ProviderErrorReason)[keyof typeof ProviderErrorReason];

/** Which failure kind each reason is reported as. */
export const PROVIDER_ERROR_KIND: Record<ProviderErrorReason, ImageFailureKind> =
  {
    [ProviderErrorReason.Blocked]: ImageFailureKind.Blocked,
    [ProviderErrorReason.RateLimited]: ImageFailureKind.Busy,
    [ProviderErrorReason.MissingKey]: ImageFailureKind.NotConfigured,
    [ProviderErrorReason.OrgUnverified]: ImageFailureKind.NotConfigured,
    [ProviderErrorReason.Unknown]: ImageFailureKind.NoImage,
  };

/**
 * Read an image provider's error message into one reason. Pure.
 *
 * **Why this is shared** (Codex P2, PR #1768): `generateImage` and
 * `enhanceSketch` each carried their own copy of this ladder, and the copies
 * had drifted — `enhanceSketch` had no configuration branches at all, so an
 * unset API key fell through to `no-image`. That was survivable while the
 * client sniffed the message text, but FEAT-195 made it trust the kind the
 * handler DECLARES, which meant every sketch door told a child to try again,
 * forever, for something only a grown-up could fix. Two ladders where one
 * decision lives is how that happens; this is the one ladder.
 *
 * The order matters and matches the original: a refusal wins over everything,
 * then a rate limit, then the two configuration cases. Unknown is the honest
 * default — it offers a plain retry and claims nothing.
 */
export function readProviderError(errMsg: string): ProviderErrorReason {
  if (
    errMsg.includes("content_policy") ||
    errMsg.includes("safety") ||
    errMsg.includes("blocked")
  ) {
    return ProviderErrorReason.Blocked;
  }
  if (errMsg.includes("rate_limit") || errMsg.includes("429")) {
    return ProviderErrorReason.RateLimited;
  }
  if (errMsg.includes("invalid_api_key") || errMsg.includes("401")) {
    return ProviderErrorReason.MissingKey;
  }
  if (
    errMsg.includes("403") ||
    errMsg.includes("organization") ||
    errMsg.includes("verification")
  ) {
    return ProviderErrorReason.OrgUnverified;
  }
  return ProviderErrorReason.Unknown;
}
