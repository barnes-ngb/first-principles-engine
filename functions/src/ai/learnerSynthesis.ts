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

/** A model needs synthesis when it has none yet OR a writer marked it stale. */
export function isSynthesisStale(model: StoredLearnerModel & { synthesis?: unknown; synthesisStaleAt?: unknown }): boolean {
  return !model.synthesis || Boolean(model.synthesisStaleAt);
}

export interface SynthesisRunResult {
  status: "written" | "skipped-no-model" | "skipped-no-data" | "failed";
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
  const model = snap.data() as StoredLearnerModel & { status?: string };
  if (model.status === "no-data") return { status: "skipped-no-data" };

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

  // Merge-only write; clear the stale mark so consumers read fresh.
  await ref.set({ synthesis, synthesisStaleAt: null, updatedAt: generatedAt }, { merge: true });

  await logAiUsage(db, familyId, {
    childId,
    taskType: "learnerSynthesis",
    model: modelId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  console.log(
    `[AI] taskType=learnerSynthesis child=${childId} inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens} moves=${parsed.whatMattersNext.length}`,
  );

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
