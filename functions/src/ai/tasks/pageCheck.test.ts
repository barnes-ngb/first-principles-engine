import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { ChatTaskContext } from "../chatTypes.js";

/**
 * The `pageCheck` task at the HANDLER boundary: the registry routes it to the
 * prospective handler, and that handler cannot be talked out of the prospective
 * prompt by anything in the payload.
 *
 * This is the other half of the fail-closed contract. The dispatcher half —
 * that the task is excluded from the workbook backfill, and that an old
 * dispatcher rejects it outright — is executed in `../chatProspectiveBypass.test.ts`.
 */

// The spies carry the REAL signatures of the functions they stand in for, so a
// changed parameter list fails typecheck here instead of letting an assertion
// read an argument that no longer exists. Inline import types keep these in
// type positions only — no value import runs ahead of `vi.mock`.
type VisionCall = typeof import("../chatTypes.js").callClaudeWithVision;
type VisionOpts = Parameters<VisionCall>[0];
type VisionResult = Awaited<ReturnType<VisionCall>>;
type UsageArgs = Parameters<typeof import("../chatTypes.js").logAiUsage>;
type ContextArgs = Parameters<typeof import("../contextSlices.js").buildContextForTask>;

const { visionMock, usageMock, contextMock } = vi.hoisted(() => ({
  visionMock: vi.fn(
    async (_opts: VisionOpts): Promise<VisionResult> => ({
      text: '{"pageType":"worksheet"}',
      inputTokens: 10,
      outputTokens: 20,
      stopReason: "end_turn",
    }),
  ),
  usageMock: vi.fn(
    async (_db: UsageArgs[0], _familyId: UsageArgs[1], _data: UsageArgs[2]) => undefined,
  ),
  contextMock: vi.fn(async (_taskType: ContextArgs[0], _ctx: ContextArgs[1]) => [
    "SKILL SNAPSHOT: addition to 20",
  ]),
}));

vi.mock("../chatTypes.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../chatTypes.js")>();
  return { ...actual, callClaudeWithVision: visionMock, logAiUsage: usageMock };
});

vi.mock("../contextSlices.js", () => ({ buildContextForTask: contextMock }));

import { CHAT_TASKS } from "./index.js";
import { handlePageCheck } from "./pageCheck.js";
import { handleScan } from "./scan.js";
import { PAGE_CHECK_TASK } from "../prospectiveCheck.js";

const db = {} as unknown as Firestore;

function ctx(payload: Record<string, unknown>): ChatTaskContext {
  return {
    db,
    familyId: "fam-1",
    childId: "lincoln",
    childData: { name: "Lincoln", grade: "3" },
    snapshotData: undefined,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    // Required by the handler contract, and nothing in these paths sets it:
    // the page check has no domain, so the real dispatcher sends `undefined`.
    domain: undefined,
    apiKey: "key",
  };
}

const image = { imageBase64: "AAAA", mediaType: "image/jpeg" };

/** The system prompt the handler actually sent — read off the real call shape. */
function sentPrompt(): string {
  return visionMock.mock.calls[0][0].systemPrompt;
}

beforeEach(() => {
  visionMock.mockClear();
  usageMock.mockClear();
  contextMock.mockClear();
});

describe("the registry is what decides, not the payload", () => {
  it("routes the pageCheck task to the prospective handler", () => {
    expect(CHAT_TASKS[PAGE_CHECK_TASK]).toBe(handlePageCheck);
    expect(PAGE_CHECK_TASK).toBe("pageCheck");
  });

  it("and leaves scan on the retrospective handler", () => {
    expect(CHAT_TASKS.scan).toBe(handleScan);
    expect(CHAT_TASKS.scan).not.toBe(handlePageCheck);
  });
});

describe("handlePageCheck always asks the prospective question", () => {
  it("uses the prospective prompt with no purpose in the payload at all", async () => {
    await handlePageCheck(ctx(image));
    const prompt = sentPrompt();
    expect(prompt).toContain("NOT done yet");
    expect(prompt).not.toContain("CERTIFICATE / PROGRESS DOCUMENT DETECTION");
    expect(prompt).not.toContain("suggestedSnapshotUpdate");
  });

  it.each([
    ["a forged legacy purpose", { checkPurpose: "before-work-page-check" }],
    ["a hostile purpose", { checkPurpose: "retrospective" }],
    ["a non-string purpose", { checkPurpose: 42 }],
  ])("ignores %s — arriving here IS the intent", async (_label, extra) => {
    await handlePageCheck(ctx({ ...image, ...extra }));
    expect(sentPrompt()).toContain("NOT done yet");
  });

  it("reuses the scan read context, unchanged", async () => {
    await handlePageCheck(ctx(image));
    expect(contextMock).toHaveBeenCalledWith("scan", expect.objectContaining({ childId: "lincoln" }));
    // There is no learnerModel slice on that task, and nothing here adds one.
    expect(sentPrompt()).not.toMatch(/learner model/i);
  });

  it("logs the AI usage under its own task name and writes nothing else", async () => {
    await handlePageCheck(ctx(image));
    expect(usageMock).toHaveBeenCalledTimes(1);
    expect(usageMock.mock.calls[0][2]).toMatchObject({ taskType: "pageCheck", childId: "lincoln" });
  });

  it("refuses a payload with no image, without calling the model", async () => {
    const result = await handlePageCheck(ctx({ mediaType: "image/jpeg" }));
    expect(JSON.parse(result.message).error).toMatch(/imageBase64 is required/);
    expect(visionMock).not.toHaveBeenCalled();
    expect(usageMock).not.toHaveBeenCalled();
  });

  it("asks for low reasoning effort so the 1024-token budget reaches the answer", async () => {
    await handlePageCheck(ctx(image));
    const sent = visionMock.mock.calls[0][0];
    // Without this, high-effort reasoning is charged against the same small
    // budget and the call can end at `max_tokens` with no visible response.
    expect(sent.effort).toBe("low");
    expect(sent.maxTokens).toBe(1024);
  });

  it("carries the capture context through as prompt context", async () => {
    await handlePageCheck(ctx({ ...image, captureContext: { itemLabel: "GATB Math" } }));
    expect(sentPrompt()).toContain("Planned activity: GATB Math");
  });
});

describe("handleScan is untouched by the new intent", () => {
  it("gets the retrospective prompt even when the payload carries the old purpose", async () => {
    await handleScan(ctx({ ...image, checkPurpose: "before-work-page-check" }));
    const prompt = sentPrompt();
    expect(prompt).toContain("CERTIFICATE / PROGRESS DOCUMENT DETECTION");
    expect(prompt).toContain("Student: Lincoln, grade 3");
    expect(prompt).not.toContain("NOT done yet");
  });

  it("and still logs its usage as scan", async () => {
    await handleScan(ctx(image));
    expect(usageMock.mock.calls[0][2]).toMatchObject({ taskType: "scan" });
  });
});
