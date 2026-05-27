import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { requireApprovedUser, checkRateLimit } from "../authGuard.js";
import { openaiApiKey } from "../aiConfig.js";

// ── Request / Response types ────────────────────────────────────

export interface TranscribeAudioRequest {
  audioBase64: string;
  mimeType: string;
  familyId: string;
  childId: string;
  durationMs: number;
  sourceSurface: string;
  language?: string;
  replacesEventId?: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  avg_logprob: number;
}

export interface TranscribeAudioResponse {
  eventId: string;
  text: string;
  durationSec: number;
  language: string;
  segments?: TranscriptSegment[];
}

// ── Constants ────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/wav",
  "audio/mpeg",
  "audio/m4a",
]);

/** Max raw audio size = 7 MB. Base64 inflates ~33% → ~9.3 MB request, under
 *  Firebase callable's 10 MB limit. */
const MAX_AUDIO_BYTES = 7 * 1024 * 1024;

/** Whisper-1 pricing: $0.006 per minute of audio. */
const WHISPER_COST_PER_MINUTE = 0.006;

/** Rate limit: 30 transcriptions per rolling hour per uid. */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MIN = 60;

/** Pick the filename extension OpenAI's format detection wants. */
function filenameForMime(mimeType: string): string {
  if (mimeType.startsWith("audio/webm")) return "audio.webm";
  if (mimeType === "audio/mp4") return "audio.mp4";
  if (mimeType === "audio/wav") return "audio.wav";
  if (mimeType === "audio/mpeg") return "audio.mp3";
  if (mimeType === "audio/m4a") return "audio.m4a";
  return "audio.webm";
}

// ── Handler (exported separately so tests can call it directly) ──

interface RawSegment {
  start?: number;
  end?: number;
  text?: string;
  avg_logprob?: number;
}

interface WhisperResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: RawSegment[];
}

export async function transcribeAudioHandler(
  request: CallableRequest<TranscribeAudioRequest>,
  deps: {
    apiKey: string;
    /** Override OpenAI factory for tests. */
    createOpenAiClient?: () => {
      audio: {
        transcriptions: {
          create: (opts: Record<string, unknown>) => Promise<WhisperResult>;
        };
      };
    };
  },
): Promise<TranscribeAudioResponse> {
  // ── Auth gate ──────────────────────────────────────────────
  const { uid } = requireApprovedUser(request);

  const {
    audioBase64,
    mimeType,
    familyId,
    childId,
    durationMs,
    sourceSurface,
    language,
    replacesEventId,
  } = request.data ?? ({} as TranscribeAudioRequest);

  // ── Input validation ───────────────────────────────────────
  if (!familyId || typeof familyId !== "string") {
    throw new HttpsError("invalid-argument", "familyId is required.");
  }
  if (!childId || typeof childId !== "string") {
    throw new HttpsError("invalid-argument", "childId is required.");
  }
  if (!audioBase64 || typeof audioBase64 !== "string") {
    throw new HttpsError("invalid-argument", "audioBase64 is required.");
  }
  if (!mimeType || typeof mimeType !== "string") {
    throw new HttpsError("invalid-argument", "mimeType is required.");
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new HttpsError(
      "invalid-argument",
      `mimeType must be one of: ${Array.from(ALLOWED_MIME_TYPES).join(", ")}`,
    );
  }
  if (typeof durationMs !== "number" || durationMs < 0) {
    throw new HttpsError("invalid-argument", "durationMs is required.");
  }
  if (!sourceSurface || typeof sourceSurface !== "string") {
    throw new HttpsError("invalid-argument", "sourceSurface is required.");
  }

  // ── Authorization: caller must own the family ──────────────
  if (uid !== familyId) {
    throw new HttpsError(
      "permission-denied",
      "You do not have access to this family.",
    );
  }

  // ── Rate limit ─────────────────────────────────────────────
  await checkRateLimit(
    uid,
    "transcribeAudio",
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MIN,
  );

  // ── Decode + size validation ───────────────────────────────
  // Compute the *decoded* size from the base64 length so we reject before
  // allocating the buffer.
  const base64Len = audioBase64.length;
  const padding = audioBase64.endsWith("==")
    ? 2
    : audioBase64.endsWith("=")
      ? 1
      : 0;
  const decodedSize = Math.floor((base64Len * 3) / 4) - padding;
  if (decodedSize > MAX_AUDIO_BYTES) {
    throw new HttpsError(
      "invalid-argument",
      `Audio too large: ${decodedSize} bytes (max ${MAX_AUDIO_BYTES}).`,
    );
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");

  // ── Call Whisper ───────────────────────────────────────────
  let result: WhisperResult;
  try {
    let client: {
      audio: {
        transcriptions: {
          create: (opts: Record<string, unknown>) => Promise<WhisperResult>;
        };
      };
    };
    if (deps.createOpenAiClient) {
      client = deps.createOpenAiClient();
    } else {
      const openaiModule = await import("openai");
      const OpenAI = openaiModule.default;
      const toFile = openaiModule.toFile;
      const realClient = new OpenAI({ apiKey: deps.apiKey });
      const file = await toFile(audioBuffer, filenameForMime(mimeType), {
        type: mimeType,
      });
      client = {
        audio: {
          transcriptions: {
            create: (opts) =>
              realClient.audio.transcriptions.create({
                ...opts,
                file,
              } as Parameters<typeof realClient.audio.transcriptions.create>[0]) as unknown as Promise<WhisperResult>,
          },
        },
      };
    }

    result = await client.audio.transcriptions.create({
      model: "whisper-1",
      response_format: "verbose_json",
      ...(language ? { language } : {}),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Transcription failed:", {
      sourceSurface,
      childId,
      mimeType,
      durationMs,
      error: errMsg,
    });

    if (errMsg.includes("rate_limit") || errMsg.includes("429")) {
      throw new HttpsError(
        "resource-exhausted",
        "Transcription is busy right now. Wait a moment and try again.",
      );
    }
    if (errMsg.includes("invalid_api_key") || errMsg.includes("401")) {
      throw new HttpsError(
        "failed-precondition",
        "Transcription is not configured correctly. Ask Dad to check the API key.",
      );
    }
    throw new HttpsError(
      "internal",
      `Transcription failed: ${errMsg.slice(0, 200)}`,
    );
  }

  const text = result.text ?? "";
  const durationSec = result.duration ?? durationMs / 1000;
  const detectedLanguage = result.language ?? language ?? "en";
  const segments: TranscriptSegment[] = (result.segments ?? []).map(
    (s: RawSegment) => ({
      start: s.start ?? 0,
      end: s.end ?? 0,
      text: s.text ?? "",
      avg_logprob: s.avg_logprob ?? 0,
    }),
  );

  // ── Persist usage + event docs in parallel ─────────────────
  const db = getFirestore();
  const cost = WHISPER_COST_PER_MINUTE * (durationSec / 60);

  const eventRef = db
    .collection(`families/${familyId}/children/${childId}/transcriptionEvents`)
    .doc();

  await Promise.all([
    db.collection(`families/${familyId}/aiUsage`).add({
      taskType: "transcribeAudio",
      model: "whisper-1",
      childId,
      sourceSurface,
      inputTokens: 0,
      outputTokens: 0,
      durationSec,
      cost,
      createdAt: new Date().toISOString(),
    }),
    eventRef.set({
      transcriptText: text,
      finalText: text,
      language: detectedLanguage,
      durationSec,
      segments,
      mimeType,
      sourceSurface,
      replacesEventId: replacesEventId ?? null,
      childId,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  return {
    eventId: eventRef.id,
    text,
    durationSec,
    language: detectedLanguage,
    segments: segments.length > 0 ? segments : undefined,
  };
}

// ── Callable Cloud Function ─────────────────────────────────────

export const transcribeAudio = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 60 },
  async (request): Promise<TranscribeAudioResponse> => {
    return transcribeAudioHandler(
      request as CallableRequest<TranscribeAudioRequest>,
      { apiKey: openaiApiKey.value() },
    );
  },
);
