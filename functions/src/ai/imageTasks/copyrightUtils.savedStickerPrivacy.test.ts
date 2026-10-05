import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rewriter's own failure log, for the one caller whose prompt is private
 * (SAVED-STICKER-EDIT-CONTRACT-002, repair round 1).
 *
 * `rewriteForCopyright` catches an SDK failure, logs it and returns the regex
 * fallback. That is the right behaviour for a caption — the SDK's message is the
 * only clue to why the rewriter is down. But the saved-picture edit path sends
 * the person's own instruction as the prompt, an SDK error quotes the request it
 * failed on, and a line already written cannot be redacted by the handler that
 * called it. So this file drives the REAL helper with a synthetic SDK rejection
 * and asserts two things: the static mode writes nothing about the prompt, and
 * the legacy default is exactly what it was.
 *
 * Everything else about the helper is held still — same system prompt, same
 * call, same regex fallback, same return value — which the cases below assert
 * rather than assume.
 */

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
    constructor(_options: unknown) {}
  },
}));

import { fallbackCopyrightStrip, rewriteForCopyright } from "./copyrightUtils.js";

const MARKER = "zigglewump";
const INSTRUCTION = `remove the ${MARKER} hat`;
const KEY = "test-claude-key";

/** An SDK rejection shaped like a real one: it quotes the request it failed on. */
const sdkRejection = () =>
  Object.assign(
    new Error(
      `400 invalid_request_error — body: {"messages":[{"role":"user","content":"${INSTRUCTION}"}]}`,
    ),
    { status: 400, request_id: "req_9" },
  );

/** The same failure as a bare object, which is how a transport error can arrive. */
const bareRejection = () => ({
  status: 500,
  message: `upstream error on prompt: ${INSTRUCTION}`,
  toString: () => `upstream error on prompt: ${INSTRUCTION}`,
});

const warnings: unknown[][] = [];

beforeEach(() => {
  warnings.length = 0;
  create.mockReset();
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const warned = () => JSON.stringify(warnings.map((args) => args.map(String)));

describe("staticDiagnostics keeps a failed rewrite's error out of the log", () => {
  it.each([
    ["an SDK error", sdkRejection],
    ["a bare transport error", bareRejection],
  ])("logs a fixed line instead of %s", async (_shape, make) => {
    create.mockRejectedValue(make());
    const result = await rewriteForCopyright(INSTRUCTION, "sketch", KEY, {
      staticDiagnostics: true,
    });

    expect(warnings).toHaveLength(1);
    expect(warned()).not.toContain(MARKER);
    expect(warned()).not.toContain("invalid_request_error");
    expect(warned()).not.toContain("upstream error");
    expect(warned()).toContain("Copyright rewriter failed");
    // The fallback is untouched: same answer the legacy call would have given.
    expect(result).toBe(fallbackCopyrightStrip(INSTRUCTION));
  });

  it("still strips a copyrighted name on the fallback path", async () => {
    create.mockRejectedValue(sdkRejection());
    const result = await rewriteForCopyright("remove Mario's hat", "sketch", KEY, {
      staticDiagnostics: true,
    });
    expect(result).toBe("remove character's hat");
    expect(warned()).not.toContain("Mario");
  });

  it("changes nothing when the rewrite succeeds", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: ` ${INSTRUCTION} ` }],
    });
    const result = await rewriteForCopyright(INSTRUCTION, "sketch", KEY, {
      staticDiagnostics: true,
    });
    expect(result).toBe(INSTRUCTION);
    expect(warnings).toEqual([]);
    // Same model call as any other caller: the flag is about the catch, nothing else.
    expect(create).toHaveBeenCalledTimes(1);
    const [args] = create.mock.calls[0] as [
      { system: string; messages: Array<{ content: string }> },
    ];
    expect(args.messages[0]?.content).toBe(INSTRUCTION);
    expect(args.system).toContain("You rewrite children's sketch captions");
  });

  it("falls back on an empty answer without warning, as it always has", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "   " }] });
    const result = await rewriteForCopyright(INSTRUCTION, "sketch", KEY, {
      staticDiagnostics: true,
    });
    expect(result).toBe(fallbackCopyrightStrip(INSTRUCTION));
    expect(warnings).toEqual([]);
  });
});

describe("the legacy default is unchanged", () => {
  it("still logs the caught error for a caption", async () => {
    create.mockRejectedValue(sdkRejection());
    const result = await rewriteForCopyright("my Mario drawing", "sketch", KEY);
    expect(warnings).toHaveLength(1);
    expect(warned()).toContain("Copyright rewriter failed, using fallback strip:");
    expect(warned()).toContain("invalid_request_error");
    expect(result).toBe("my character drawing");
  });

  it("logs the caught error when options are passed without the flag", async () => {
    create.mockRejectedValue(sdkRejection());
    await rewriteForCopyright("my Mario drawing", "sketch", KEY, {});
    expect(warned()).toContain("invalid_request_error");
  });
});
