import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The REAL callable, executed — because this is the write nobody could see.
 *
 * `chat.ts` runs `ensureWorkbookActivityConfigsForChild` for every child on
 * every task **before the handler is chosen**, and that backfill creates and
 * updates workbook `activityConfigs` — a learning record. The before-work page
 * check rides the `scan` task, so declaring the intent inside the message
 * payload was not enough: independent execution of this dispatcher showed the
 * backfill running once for a legacy scan AND once for a prospective one.
 *
 * These cases run the exported callable's handler itself (the
 * `firebase-functions/v2/https` mock hands the handler back), with every
 * module-load dependency narrowly stubbed. A source grep or a prompt assertion
 * could not have caught the original bug and cannot catch its return.
 */

const { backfillMock, handlerMock, rateLimitMock } = vi.hoisted(() => ({
  backfillMock: vi.fn(async () => ({ created: 0, updated: 0, skipped: 0 })),
  handlerMock: vi.fn(async () => ({
    message: "{}",
    model: "test",
    usage: { inputTokens: 0, outputTokens: 0 },
  })),
  rateLimitMock: vi.fn(async () => undefined),
}));

vi.mock("./workbookActivityConfigBackfill.js", () => ({
  ensureWorkbookActivityConfigsForChild: backfillMock,
}));

// The registry, stubbed to the two tasks these cases need. That the REAL
// registry maps `pageCheck` to the prospective handler is asserted in
// `tasks/pageCheck.test.ts`.
vi.mock("./tasks/index.js", () => ({
  CHAT_TASKS: { scan: handlerMock, plan: handlerMock, pageCheck: handlerMock },
}));

vi.mock("./aiConfig.js", () => ({
  claudeApiKey: { value: () => "key" },
  openaiApiKey: { value: () => "key" },
}));

vi.mock("./authGuard.js", () => ({
  requireEmailAuth: () => ({ uid: "fam-1", email: "parent@example.com" }),
  checkRateLimit: rateLimitMock,
}));

// The child profile read and the skill snapshot read are the only other things
// the callable does before dispatch, and both are reads.
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    doc: () => ({
      get: async () => ({ exists: true, data: () => ({ name: "Lincoln", grade: "3" }) }),
    }),
    collection: () => ({
      where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }),
      get: async () => ({ empty: true, docs: [] }),
    }),
  }),
  FieldValue: { serverTimestamp: () => "TS" },
  Timestamp: { now: () => ({ toMillis: () => 0 }) },
}));

vi.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Imported AFTER the mocks: `chat` IS the handler here.
import { chat } from "./chat.js";
import { PAGE_CHECK_TASK } from "./prospectiveCheck.js";

type Callable = (request: unknown) => Promise<unknown>;
const callable = chat as unknown as Callable;

function request(data: Record<string, unknown>) {
  return { data, auth: { uid: "fam-1", token: { email: "parent@example.com" } } };
}

function scanPayload(extra: Record<string, unknown> = {}) {
  return JSON.stringify({ imageBase64: "AAAA", mediaType: "image/jpeg", ...extra });
}

const base = { familyId: "fam-1", childId: "lincoln" };

beforeEach(() => {
  backfillMock.mockClear();
  handlerMock.mockClear();
  rateLimitMock.mockClear();
});

describe("the dispatcher's pre-handler backfill", () => {
  it("CONTROL: a legacy scan still gets the workbook backfill", async () => {
    await callable(
      request({ ...base, taskType: "scan", messages: [{ role: "user", content: scanPayload() }] }),
    );

    expect(backfillMock).toHaveBeenCalledTimes(1);
    expect(backfillMock).toHaveBeenCalledWith(expect.anything(), "fam-1", "lincoln");
    expect(handlerMock).toHaveBeenCalledTimes(1);
  });

  it("the pageCheck TASK does not: zero backfill calls, handler still runs", async () => {
    await callable(
      request({
        ...base,
        taskType: PAGE_CHECK_TASK,
        messages: [{ role: "user", content: scanPayload() }],
      }),
    );

    expect(backfillMock).not.toHaveBeenCalled();
    expect(handlerMock).toHaveBeenCalledTimes(1);
  });

  it("the handler still receives the payload it was sent", async () => {
    await callable(
      request({
        ...base,
        taskType: PAGE_CHECK_TASK,
        messages: [{ role: "user", content: scanPayload({ captureContext: { itemLabel: "GATB Math" } }) }],
      }),
    );

    const ctx = handlerMock.mock.calls[0][0] as unknown as {
      familyId: string;
      childId: string;
      messages: Array<{ content: string }>;
    };
    expect(ctx.familyId).toBe("fam-1");
    expect(ctx.childId).toBe("lincoln");
    expect(JSON.parse(ctx.messages[0].content).captureContext).toEqual({ itemLabel: "GATB Math" });
  });

  it("operational records are NOT bypassed — the rate limit still runs", async () => {
    // The disclosure says the call is logged like any other. That has to be
    // true: the bypass is for the learning record only.
    await callable(
      request({ ...base, taskType: PAGE_CHECK_TASK, messages: [{ role: "user", content: scanPayload() }] }),
    );
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a forged intent flag", scanPayload({ checkPurpose: "before-work-page-check" })],
    ["an unknown purpose", scanPayload({ checkPurpose: "something-else" })],
    ["a malformed payload", "not json at all"],
    ["a plain payload", scanPayload()],
  ])("a SCAN with %s keeps the backfill — legacy behaviour unchanged", async (_label, content) => {
    // The payload is not an intent channel any more. Only the task name is.
    await callable(request({ ...base, taskType: "scan", messages: [{ role: "user", content }] }));
    expect(backfillMock).toHaveBeenCalledTimes(1);
  });

  it("another task keeps the backfill too", async () => {
    await callable(
      request({ ...base, taskType: "plan", messages: [{ role: "user", content: scanPayload() }] }),
    );
    expect(backfillMock).toHaveBeenCalledTimes(1);
  });
});

describe("release skew — an old dispatcher meeting the new client", () => {
  it("rejects a task it does not know, before the backfill and before the rate limit", async () => {
    // This is the OLD dispatcher's behaviour, reproduced by asking this one for
    // a task that is not in its registry. Hosting deploys before functions, so
    // this is the real window: the request must fail CLOSED, writing nothing.
    await expect(
      callable(
        request({
          ...base,
          taskType: "pageCheckThatDoesNotExistYet",
          messages: [{ role: "user", content: scanPayload() }],
        }),
      ),
    ).rejects.toThrow(/taskType must be one of/i);

    expect(backfillMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("and the message it rejects with is the one the client recognises as a skew", async () => {
    // `useProspectivePageCheck.isUnsupportedTask` matches on this sentence to
    // tell "the service is older than the app" from a network failure.
    const error = await callable(
      request({ ...base, taskType: "nope", messages: [{ role: "user", content: scanPayload() }] }),
    ).catch((err: Error) => err);
    expect((error as Error).message).toMatch(/taskType must be one of/i);
  });
});
