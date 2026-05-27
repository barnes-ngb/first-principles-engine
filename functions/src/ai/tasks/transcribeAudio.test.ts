import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { TranscribeAudioRequest } from "./transcribeAudio.js";

// ── Mocks ─────────────────────────────────────────────────────────

const mockTranscribe = vi.fn();
const mockOpenAi = vi.fn(() => ({
  audio: { transcriptions: { create: mockTranscribe } },
}));
const mockToFile = vi.fn(async (buf: Buffer) => buf);

vi.mock("openai", () => ({
  default: mockOpenAi,
  toFile: mockToFile,
}));

const mockAdd = vi.fn(
  async (_data: Record<string, unknown>) => ({ id: "usage-1" }),
);
const mockSet = vi.fn(
  async (_data: Record<string, unknown>) => undefined,
);
const mockEventDoc = vi.fn(() => ({ id: "event-1", set: mockSet }));
const mockCountGet = vi.fn(async () => ({ data: () => ({ count: 0 }) }));

const mockCollection = vi.fn((path: string) => {
  if (path.endsWith("/transcriptionEvents")) {
    return { doc: mockEventDoc };
  }
  if (path.endsWith("/aiUsage")) {
    return {
      add: mockAdd,
      where: () => ({
        where: () => ({
          count: () => ({ get: mockCountGet }),
        }),
      }),
    };
  }
  return { add: mockAdd };
});

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({ collection: mockCollection }),
  FieldValue: { serverTimestamp: () => "__SERVER_TS__" },
}));

vi.mock("../aiConfig.js", () => ({
  openaiApiKey: { value: () => "test-key" },
  claudeApiKey: { value: () => "test-claude" },
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

// Import AFTER mocks are set up.
import { transcribeAudioHandler } from "./transcribeAudio.js";

// ── Test helpers ──────────────────────────────────────────────────

interface AuthOverride {
  uid?: string;
  email?: string;
  provider?: string;
}

function makeRequest(
  data: Record<string, unknown>,
  auth?: AuthOverride | null,
): CallableRequest<TranscribeAudioRequest> {
  if (auth === null) {
    return { data } as unknown as CallableRequest<TranscribeAudioRequest>;
  }
  return {
    data,
    auth: {
      uid: auth?.uid ?? "fam-1",
      token: {
        email: auth?.email ?? "nathan.xb9753@gmail.com",
        firebase: { sign_in_provider: auth?.provider ?? "password" },
      },
    },
  } as unknown as CallableRequest<TranscribeAudioRequest>;
}

function validRequestData(overrides?: Record<string, unknown>) {
  return {
    audioBase64: Buffer.from("fake-audio-bytes").toString("base64"),
    mimeType: "audio/webm",
    familyId: "fam-1",
    childId: "child-lincoln",
    durationMs: 12_000,
    sourceSurface: "generate-chat",
    ...overrides,
  };
}

const whisperHappy = {
  text: "I want to write a story about a dragon.",
  language: "en",
  duration: 12,
  segments: [
    {
      start: 0,
      end: 6,
      text: "I want to write a story",
      avg_logprob: -0.2,
    },
    {
      start: 6,
      end: 12,
      text: "about a dragon.",
      avg_logprob: -0.35,
    },
  ],
};

const fakeOpenAiClient = () => ({
  audio: { transcriptions: { create: mockTranscribe } },
});

// ── Tests ─────────────────────────────────────────────────────────

describe("transcribeAudioHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventDoc.mockReturnValue({ id: "event-1", set: mockSet });
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });
    mockTranscribe.mockResolvedValue(whisperHappy);
  });

  it("happy path returns TranscribeAudioResponse with eventId and segments", async () => {
    const result = await transcribeAudioHandler(
      makeRequest(validRequestData()),
      { apiKey: "test-key", createOpenAiClient: fakeOpenAiClient },
    );

    expect(result.eventId).toBe("event-1");
    expect(result.text).toBe("I want to write a story about a dragon.");
    expect(result.language).toBe("en");
    expect(result.durationSec).toBe(12);
    expect(result.segments).toHaveLength(2);
    expect(result.segments?.[0].avg_logprob).toBe(-0.2);
  });

  it("happy path writes aiUsage doc with correct cost", async () => {
    await transcribeAudioHandler(makeRequest(validRequestData()), {
      apiKey: "test-key",
      createOpenAiClient: fakeOpenAiClient,
    });

    expect(mockCollection).toHaveBeenCalledWith("families/fam-1/aiUsage");
    const aiUsageCall = mockAdd.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).taskType === "transcribeAudio",
    );
    expect(aiUsageCall).toBeDefined();
    const payload = aiUsageCall![0] as Record<string, unknown>;
    expect(payload.model).toBe("whisper-1");
    expect(payload.childId).toBe("child-lincoln");
    expect(payload.sourceSurface).toBe("generate-chat");
    expect(payload.durationSec).toBe(12);
    // 0.006 * 12 / 60 = 0.0012
    expect(payload.cost).toBeCloseTo(0.0012, 6);
  });

  it("happy path writes transcriptionEvents doc with segments and avg_logprob", async () => {
    await transcribeAudioHandler(makeRequest(validRequestData()), {
      apiKey: "test-key",
      createOpenAiClient: fakeOpenAiClient,
    });

    expect(mockCollection).toHaveBeenCalledWith(
      "families/fam-1/children/child-lincoln/transcriptionEvents",
    );
    expect(mockSet).toHaveBeenCalledTimes(1);
    const eventPayload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(eventPayload.transcriptText).toBe(
      "I want to write a story about a dragon.",
    );
    expect(eventPayload.finalText).toBe(
      "I want to write a story about a dragon.",
    );
    expect(eventPayload.language).toBe("en");
    expect(eventPayload.durationSec).toBe(12);
    expect(eventPayload.sourceSurface).toBe("generate-chat");
    expect(eventPayload.replacesEventId).toBeNull();
    expect(eventPayload.mimeType).toBe("audio/webm");
    const seg = (
      eventPayload.segments as Array<{ avg_logprob: number; text: string }>
    )[0];
    expect(seg.avg_logprob).toBe(-0.2);
  });

  it("persists replacesEventId on the event doc when provided", async () => {
    await transcribeAudioHandler(
      makeRequest(validRequestData({ replacesEventId: "prior-event-id" })),
      { apiKey: "test-key", createOpenAiClient: fakeOpenAiClient },
    );

    const eventPayload = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(eventPayload.replacesEventId).toBe("prior-event-id");
  });

  it("rejects requests with no auth context (unauthenticated)", async () => {
    await expect(
      transcribeAudioHandler(makeRequest(validRequestData(), null), {
        apiKey: "test-key",
        createOpenAiClient: fakeOpenAiClient,
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects when caller's uid does not match familyId (permission-denied)", async () => {
    await expect(
      transcribeAudioHandler(
        makeRequest(validRequestData({ familyId: "other-family" })),
        { apiKey: "test-key", createOpenAiClient: fakeOpenAiClient },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects when rate limit exceeded (resource-exhausted)", async () => {
    mockCountGet.mockResolvedValueOnce({ data: () => ({ count: 30 }) });

    await expect(
      transcribeAudioHandler(makeRequest(validRequestData()), {
        apiKey: "test-key",
        createOpenAiClient: fakeOpenAiClient,
      }),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("rejects audio larger than 7MB (invalid-argument)", async () => {
    // 8MB of base64-decoded audio.
    const bigBuffer = Buffer.alloc(8 * 1024 * 1024, 0);
    const bigB64 = bigBuffer.toString("base64");

    await expect(
      transcribeAudioHandler(
        makeRequest(validRequestData({ audioBase64: bigB64 })),
        { apiKey: "test-key", createOpenAiClient: fakeOpenAiClient },
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects disallowed mime types (invalid-argument)", async () => {
    await expect(
      transcribeAudioHandler(
        makeRequest(validRequestData({ mimeType: "audio/wma" })),
        { apiKey: "test-key", createOpenAiClient: fakeOpenAiClient },
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("does NOT write aiUsage or transcriptionEvents on Whisper API error", async () => {
    mockTranscribe.mockRejectedValueOnce(new Error("Whisper went boom"));

    await expect(
      transcribeAudioHandler(makeRequest(validRequestData()), {
        apiKey: "test-key",
        createOpenAiClient: fakeOpenAiClient,
      }),
    ).rejects.toMatchObject({ code: "internal" });

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("maps Whisper 429 to resource-exhausted", async () => {
    mockTranscribe.mockRejectedValueOnce(new Error("rate_limit hit (429)"));

    await expect(
      transcribeAudioHandler(makeRequest(validRequestData()), {
        apiKey: "test-key",
        createOpenAiClient: fakeOpenAiClient,
      }),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("rejects missing childId (invalid-argument)", async () => {
    await expect(
      transcribeAudioHandler(
        makeRequest(validRequestData({ childId: "" })),
        { apiKey: "test-key", createOpenAiClient: fakeOpenAiClient },
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("passes language hint through to Whisper when provided", async () => {
    await transcribeAudioHandler(
      makeRequest(validRequestData({ language: "es" })),
      { apiKey: "test-key", createOpenAiClient: fakeOpenAiClient },
    );

    expect(mockTranscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-1",
        response_format: "verbose_json",
        language: "es",
      }),
    );
  });
});
