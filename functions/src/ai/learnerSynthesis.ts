/**
 * Learner Model synthesis — orchestrator + callable (FEAT-57, Phase 3a).
 *
 * The Firestore read/write + Claude call around the pure synthesis layer
 * (`tasks/learnerSynthesis.ts`). Two entry points:
 *   - {@link synthesizeLearnerModelForChild} — the worker. Loads the stored model,
 *     runs one Sonnet call, and writes `synthesis` + clears `synthesisStaleAt`. On
 *     any failure it writes NOTHING (the prior synthesis stands) — a synthesis
 *     failure never breaks a consumer (D6 deterministic fallback).
 *   - {@link generateLearnerSynthesisNow} — an on-demand callable (the diag panel's
 *     manual trigger + the client regenerate-on-read path).
 *
 * The **weekly beat** calls the worker from `evaluate.ts`'s existing Sunday loop
 * (no new scheduled function — D4). Consumers (shellyChat / plan slices) NEVER call
 * the worker inline: they serve the stored synthesis and never block (see
 * `contextSlices.ts` / the run's async-vs-blocking note).
 */
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireEmailAuth } from "./authGuard.js";
import { claudeApiKey } from "./aiConfig.js";
import { callClaude, logAiUsage } from "./chatTypes.js";
import { modelForTask } from "./chat.js";
import { resolveEffortForTask } from "./models.js";
import {
  buildSynthesisInput,
  buildSynthesisPrompt,
  parseSynthesisResponse,
  rawResponseHead,
  type StoredLearnerModel,
} from "./tasks/learnerSynthesis.js";

/**
 * A comparable stamp for a revision field (FEAT-242).
 *
 * `synthesisStaleAt` and `updatedAt` are ISO strings today, but a Firestore
 * document can hold a `Timestamp` or `null` in either, and a comparison that
 * threw (or that compared two object identities) would silently decide "nothing
 * moved". So both are reduced to a string, and absence to the empty string.
 */
function stampOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    const millis = (value as { toMillis: () => number }).toMillis();
    return String(millis);
  }
  return String(value);
}

/**
 * The document's own REVISION, as an exact token — or `null` when the snapshot
 * does not carry one (FEAT-242 review item 1).
 *
 * The app's `updatedAt` / `synthesisStaleAt` strings are not enough: two
 * distinct writes can leave both equal (a concept-state change that reuses the
 * same ISO second, or a writer that touches neither field) while the evidence
 * underneath has moved. Firestore's `updateTime` is the only value that
 * changes on every commit, so it is compared EXACTLY — seconds *and*
 * nanoseconds, never milliseconds alone, because two commits inside one
 * millisecond would compare equal.
 *
 * Unknown ⇒ `null`, and the caller then fails closed rather than assuming
 * nothing moved.
 */
function revisionOf(snap: unknown): string | null {
  const value = (snap as { updateTime?: unknown } | null | undefined)?.updateTime;
  if (value == null || typeof value !== "object") return null;
  const ts = value as Record<string, unknown>;
  // Seconds AND nanoseconds, or nothing. A `toMillis()` reading would collapse
  // two commits inside one millisecond into one revision, and a lossy value
  // must never license a write — the admin SDK's `Timestamp` always carries
  // both fields (`_seconds` / `_nanoseconds` before serialization).
  const seconds = typeof ts.seconds === "number" ? ts.seconds
    : typeof ts._seconds === "number" ? ts._seconds : null;
  const nanos = typeof ts.nanoseconds === "number" ? ts.nanoseconds
    : typeof ts._nanoseconds === "number" ? ts._nanoseconds : null;
  if (seconds === null || nanos === null) return null;
  return `ts:${seconds}.${String(nanos).padStart(9, "0")}`;
}

/** A model needs synthesis when it has none yet OR a writer marked it stale. */
export function isSynthesisStale(model: StoredLearnerModel & { synthesis?: unknown; synthesisStaleAt?: unknown }): boolean {
  return !model.synthesis || Boolean(model.synthesisStaleAt);
}

export interface SynthesisRunResult {
  /**
   * `skipped-stale` (FEAT-242) — the model moved while the call was in flight,
   * so this result was DISCARDED rather than stored over a newer one.
   */
  status: "written" | "skipped-no-model" | "skipped-no-data" | "skipped-stale" | "failed";
  /**
   * On `failed`, the underlying error class + message (or parse-failure reason).
   * Surfaced verbatim to the diag panel so a failure is never opaque (DOC-09).
   */
  detail?: string;
  synthesis?: {
    whatMattersNext: Array<{ conceptId: string; kidName: string; why: string; suggestedVehicle: string }>;
    narrative: string;
    openQuestionsSummary: string[];
    generatedAt: string;
  };
}

/**
 * Synthesize one child's Learner Model. Reads `learnerModels/{childId}`, runs the
 * Sonnet beat, writes `synthesis` (merge) and clears `synthesisStaleAt`. Returns a
 * status; never throws for an ordinary miss (no model / no-data / parse failure).
 */
export async function synthesizeLearnerModelForChild(
  db: Firestore,
  familyId: string,
  childId: string,
  childName: string,
  apiKey: string,
): Promise<SynthesisRunResult> {
  const ref = db.doc(`families/${familyId}/learnerModels/${childId}`);
  const snap = await ref.get();
  if (!snap.exists) return { status: "skipped-no-model" };
  const model = snap.data() as StoredLearnerModel & {
    status?: string;
    synthesisStaleAt?: unknown;
    updatedAt?: unknown;
  };
  if (model.status === "no-data") return { status: "skipped-no-data" };

  // The REVISION this synthesis is about to be computed from (FEAT-242). A
  // Sonnet call takes seconds and a learner-model write takes none, so a
  // confirmed program completion (or an eval, or a quest close) can land while
  // this one is in flight — and the write below used to clear
  // `synthesisStaleAt` unconditionally, which marked the model fresh for prose
  // generated before that evidence existed. The next weekly beat then skipped
  // it, so the newer evidence stayed out of the parent's advice indefinitely.
  //
  // The document revision is the authority (`revisionOf`); the two app stamps
  // are kept as a second, weaker check, because a mock or a legacy snapshot
  // without `updateTime` would otherwise compare on nothing.
  const sourceRevision = {
    staleAt: stampOf(model.synthesisStaleAt),
    updatedAt: stampOf(model.updatedAt),
    revision: revisionOf(snap),
  };

  const input = buildSynthesisInput(model, childName);
  const systemPrompt = buildSynthesisPrompt(input);
  const modelId = modelForTask("learnerSynthesis" as never);
  const effort = resolveEffortForTask("learnerSynthesis");

  let result: { text: string; inputTokens: number; outputTokens: number };
  try {
    result = await callClaude({
      apiKey,
      model: modelId,
      // Output ceiling (FEAT-57/D6, twice amended). D6 first set ~1k (seeded ~6
      // concepts); position-sync multiplied that (~42 concepts) and the first
      // amendment doubled to 2000. Two consecutive truncation-class failures
      // later, the second amendment raises it to 4000 — headroom for the JSON
      // contract (up to 3 moves + a 3–5 sentence narrative + one line per open
      // question) plus any residual reasoning overhead the low-effort setting
      // still leaves. Still one Sonnet call per child per regen (~2x the prior
      // ceiling). The INPUT is not the pressure: even a fully-evidenced model
      // renders a ~4k-token prompt — well within Sonnet's budget — so the
      // synthesis context is left at its design summary shape, untrimmed.
      maxTokens: 4000,
      // Structured summarization against provided evidence — run at LOW effort so
      // Sonnet 5's default adaptive-thinking-at-HIGH can't burn the whole output
      // budget on reasoning and emit zero visible text (FEAT-77, second D6).
      effort,
      systemPrompt,
      messages: [{ role: "user", content: "Synthesize the judgment layer now. Return only the JSON." }],
    });
  } catch (err) {
    // Surface the underlying error class + message so the diag panel can render
    // it alongside the failure line — "failed" alone is never shown (DOC-09).
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[learnerSynthesis] Claude call failed for ${familyId}/${childId}: ${detail}`, err);
    return { status: "failed", detail };
  }

  // Empty-reply guard (FEAT-77): the model call can succeed yet return zero
  // visible text when reasoning consumes the whole output budget (Sonnet 5's
  // default adaptive-thinking-at-HIGH). That is NOT a parse failure — fail with
  // its own named message carrying the usage numbers, so an empty reply never
  // masquerades as unparseable JSON (empty raw head) again. `outputTokens` counts
  // thinking + visible text; with no visible text, all of it was reasoning.
  if (!result.text.trim()) {
    const detail = `Model returned no text (${result.outputTokens} output/thinking tokens consumed, 0 visible text) — likely reasoning consumed the budget; check effort/maxTokens.`;
    console.warn(`[learnerSynthesis] Empty synthesis reply for ${familyId}/${childId} — prior synthesis kept. ${detail}`);
    return { status: "failed", detail };
  }

  const parsed = parseSynthesisResponse(result.text);
  if (!parsed) {
    // Include the first ~200 chars of the raw reply (whitespace collapsed) so a
    // third failure mode — a refusal, a truncation past 2000, a wrong shape —
    // names itself in the diag panel on the next tap (DOC-09).
    const detail = `Synthesis response could not be parsed as JSON. Raw head: ${rawResponseHead(result.text)}`;
    console.warn(`[learnerSynthesis] Unparseable synthesis for ${familyId}/${childId} — prior synthesis kept. ${detail}`);
    return { status: "failed", detail };
  }

  const generatedAt = new Date().toISOString();
  const synthesis = {
    whatMattersNext: parsed.whatMattersNext,
    narrative: parsed.narrative,
    openQuestionsSummary: parsed.openQuestionsSummary,
    generatedAt,
    model: modelId,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };

  // Merge-only write, inside a transaction that COMPARES the revision this
  // synthesis was computed from (FEAT-242). On any movement — a different
  // document revision, a moved app stamp, a deleted document, or a revision
  // neither side can read exactly — the prose is **discarded**: it was computed
  // from evidence that is no longer what is stored, and storing it would
  // overwrite a newer run's advice while marking the model fresh. The stale mark
  // the other writer set stands, so the next beat regenerates against the
  // evidence this run could not have seen.
  //
  // The commit can also REJECT outright (contention, a permission error, a
  // network failure). That is captured rather than thrown here, because the
  // provider call above has already been paid for and the accounting below must
  // still run; the original failure is re-thrown afterwards, unchanged.
  let commit: "written" | "stale" | "unknown-revision" | "gone" | undefined;
  let commitError: unknown;
  let commitFailed = false;
  try {
    commit = await db.runTransaction<"written" | "stale" | "unknown-revision" | "gone">(
      async (tx) => {
        const current = await tx.get(ref);
        // A model deleted during the AI call must not be RECREATED as a
        // synthesis-only document.
        if (!current.exists) return "gone";
        const data = (current.data() ?? {}) as {
          synthesisStaleAt?: unknown;
          updatedAt?: unknown;
        };
        // ── The document revision, exactly ──
        //
        // A write this run could not have seen may leave both app stamps equal
        // (same ISO second, or a writer that touched neither), and the prose
        // would then be stored as though it had read that evidence. `updateTime`
        // moves on every commit, so it decides — and a revision this code cannot
        // read on either side fails CLOSED, because "we could not tell" must
        // never resolve to "nothing moved".
        const currentRevision = revisionOf(current);
        if (sourceRevision.revision === null || currentRevision === null) {
          return "unknown-revision";
        }
        if (currentRevision !== sourceRevision.revision) return "stale";
        // Moved underneath us ⇒ write NOTHING. Storing this prose would overwrite
        // a synthesis another run has already produced from newer evidence, and
        // would do it while the model reads fresh. The stale mark the other
        // writer set stands, so the next beat regenerates.
        if (
          stampOf(data.synthesisStaleAt) !== sourceRevision.staleAt ||
          stampOf(data.updatedAt) !== sourceRevision.updatedAt
        ) {
          return "stale";
        }
        tx.set(ref, { synthesis, synthesisStaleAt: null, updatedAt: generatedAt }, { merge: true });
        return "written";
      },
    );
  } catch (err) {
    commitFailed = true;
    commitError = err;
  }

  // ── The call was PAID for, whatever happened to the prose ──
  //
  // Usage accounting is about money spent, not about whether a graph write
  // landed: a run whose result is discarded as stale — or whose commit REJECTED
  // entirely — still cost its tokens, and logging it only on success
  // under-reported every one of those runs. Logged exactly once, here, before
  // the outcome is branched on, and it is not a provider call, so nothing extra
  // is sent anywhere.
  try {
    await logAiUsage(db, familyId, {
      childId,
      taskType: "learnerSynthesis",
      model: modelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch (usageErr) {
    // A failure to RECORD must never mask the failure to WRITE: when the commit
    // already rejected, that error is the one the caller needs, so this one is
    // logged and dropped. With a healthy commit the accounting error still
    // propagates, exactly as it did before.
    if (!commitFailed) throw usageErr;
    const detail = usageErr instanceof Error ? `${usageErr.name}: ${usageErr.message}` : String(usageErr);
    console.error(
      `[learnerSynthesis] ${familyId}/${childId}: usage accounting failed after a failed commit (${detail}) — reporting the commit error.`,
      usageErr,
    );
  }

  if (commitFailed) {
    // Nothing was stored and nothing is faked: the caller sees the original
    // transaction error, with the usage of the paid call already recorded.
    console.error(
      `[learnerSynthesis] ${familyId}/${childId}: the synthesis write failed — nothing written, prior synthesis and stale mark left as they are. The call's usage is still recorded.`,
      commitError,
    );
    throw commitError;
  }

  console.log(
    `[AI] taskType=learnerSynthesis child=${childId} inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens} moves=${parsed.whatMattersNext.length} commit=${commit}`,
  );

  if (commit !== "written") {
    const why =
      commit === "gone"
        ? "the model was deleted while synthesizing"
        : commit === "unknown-revision"
          ? "we could not read the model's exact revision, so it was treated as changed"
          : "the model changed while synthesizing";
    console.warn(
      `[learnerSynthesis] ${familyId}/${childId}: ${why} — nothing written, prior synthesis and stale mark left as they are. The call's usage is still recorded.`,
    );
    return { status: commit === "gone" ? "skipped-no-model" : "skipped-stale", detail: why };
  }

  return { status: "written", synthesis: { whatMattersNext: parsed.whatMattersNext, narrative: parsed.narrative, openQuestionsSummary: parsed.openQuestionsSummary, generatedAt } };
}

/**
 * Regenerate synthesis for a child only if the model is stale (weekly beat guard).
 * Reads the doc once to decide; skips silently when fresh or absent. Used by the
 * `weeklyReview` Sunday loop so a stale model is refreshed without a new schedule.
 */
export async function synthesizeIfStale(
  db: Firestore,
  familyId: string,
  childId: string,
  childName: string,
  apiKey: string,
): Promise<SynthesisRunResult> {
  const ref = db.doc(`families/${familyId}/learnerModels/${childId}`);
  const snap = await ref.get();
  if (!snap.exists) return { status: "skipped-no-model" };
  const model = snap.data() as StoredLearnerModel & { status?: string; synthesis?: unknown; synthesisStaleAt?: unknown };
  if (model.status === "no-data") return { status: "skipped-no-data" };
  if (!isSynthesisStale(model)) return { status: "skipped-no-data" };
  return synthesizeLearnerModelForChild(db, familyId, childId, childName, apiKey);
}

// ── On-demand callable (manual trigger + client regenerate-on-read) ──

export const generateLearnerSynthesisNow = onCall(
  { secrets: [claudeApiKey] },
  async (request) => {
    const { uid } = requireEmailAuth(request);
    const { familyId, childId } = request.data as { familyId?: string; childId?: string };
    if (!familyId || !childId) {
      throw new HttpsError("invalid-argument", "familyId and childId are required.");
    }
    if (uid !== familyId) {
      throw new HttpsError("permission-denied", "You do not have access to this family.");
    }
    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "Missing CLAUDE_API_KEY secret.");
    }

    const db = getFirestore();
    // Read the child's name for the prompt (best-effort; tone only).
    let childName = "";
    try {
      const childSnap = await db.doc(`families/${familyId}/children/${childId}`).get();
      childName = (childSnap.data()?.name as string) || "";
    } catch {
      /* name is tone-only; proceed without it */
    }

    try {
      const result = await synthesizeLearnerModelForChild(db, familyId, childId, childName, apiKey);
      return { success: result.status === "written", ...result };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("generateLearnerSynthesisNow failed:", { familyId, childId, error: errMsg });
      throw new HttpsError("internal", `Learner synthesis failed: ${errMsg}`);
    }
  },
);
