import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaudeWithVision, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";
import { buildProspectiveCheckPrompt, type ScanCaptureContext } from "./scan.js";

/**
 * Task: `pageCheck` — the before-work page check. PROSPECTIVE, and unforgeable.
 *
 * ── Why this is a task and not a flag ────────────────────────────────────────
 * The first version sent the image down the `scan` task with a `checkPurpose`
 * field in the payload. Two independent findings killed that design:
 *
 *  1. `chat.ts` runs the workbook `activityConfigs` backfill for every child
 *     before the handler is chosen. A payload flag is invisible to a dispatcher
 *     that is reading the task name.
 *  2. **Release skew.** `deploy.yml` ships hosting before functions, so for a
 *     window the new client talks to the OLD dispatcher. Against the old
 *     dispatcher a `scan` + `checkPurpose` request is a perfectly ordinary scan:
 *     it runs the backfill and gets the retrospective prompt back, which is the
 *     exact failure the feature exists to prevent — silently, with no error for
 *     anyone to see.
 *
 * A distinct task name fails CLOSED on both counts. The old dispatcher does not
 * know `pageCheck`, so it rejects the request with `invalid-argument` **before**
 * the backfill and before any handler, writing nothing; the client says the
 * check is unavailable (see `BEFORE_WORK_CHECK_UNAVAILABLE`). The new dispatcher
 * knows it, excludes it from the backfill by name, and routes it HERE.
 *
 * ── Unforgeable in both directions ──────────────────────────────────────────
 * This handler reads no purpose field at all: arriving here IS the intent, so a
 * missing or forged `checkPurpose` changes nothing. And `handleScan` has no
 * prospective branch, so a `scan` request carrying the string gets the ordinary
 * retrospective behaviour. Neither request can be mistaken for the other.
 *
 * ── What it reads and writes ────────────────────────────────────────────────
 * Reads: the same context slices as `scan` (`buildContextForTask("scan", …)`) —
 * deliberately reused rather than invented, and **unchanged**, which also means
 * there is no `learnerModel` in it and nothing here pretends otherwise.
 * Writes: the AI usage row every AI call writes, labelled with this task's own
 * name. No learning or progress record of any kind.
 */
export const handlePageCheck = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, apiKey } = ctx;

  const firstMsg = messages[0];
  if (!firstMsg) {
    return {
      message: JSON.stringify({ error: "No message provided" }),
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  let imageBase64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  let captureContext: ScanCaptureContext | undefined;

  try {
    // Note what is NOT read: `checkPurpose`. The task name already said it.
    const parsed = JSON.parse(firstMsg.content) as {
      imageBase64?: string;
      mediaType?: string;
      captureContext?: ScanCaptureContext;
    };
    if (!parsed.imageBase64) {
      return {
        message: JSON.stringify({ error: "imageBase64 is required" }),
        model: "none",
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    imageBase64 = parsed.imageBase64;
    if (parsed.mediaType) {
      mediaType = parsed.mediaType as typeof mediaType;
    }
    if (parsed.captureContext && typeof parsed.captureContext === "object") {
      captureContext = {
        ...(typeof parsed.captureContext.itemLabel === "string"
          ? { itemLabel: parsed.captureContext.itemLabel }
          : {}),
        ...(typeof parsed.captureContext.subjectBucket === "string"
          ? { subjectBucket: parsed.captureContext.subjectBucket }
          : {}),
      };
    }
  } catch {
    return {
      message: JSON.stringify({ error: "Expected JSON with imageBase64 field" }),
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  // The scan task's read context, reused as-is. Reads only.
  const contextSections = await buildContextForTask("scan", {
    db,
    familyId,
    childId,
    childData,
    snapshotData,
  });

  // Sonnet for vision, exactly as the scan door picks it — asked for by the
  // same name, so no entry in the central model table changes.
  const model = modelForTask("plan");

  // Always the prospective prompt. There is no other branch in this handler.
  const systemPrompt = buildProspectiveCheckPrompt(
    childData.grade,
    contextSections,
    captureContext,
  );

  const result = await callClaudeWithVision({
    apiKey,
    model,
    maxTokens: 1024,
    systemPrompt,
    imageBase64,
    mediaType,
    textPrompt:
      "This is a page the student has NOT done yet. Does it look about right for them today, why, and what would you change? Claim nothing about what the student knows or has finished. If you cannot tell, say so in \"limits\" and return \"unclear\".",
  });

  console.log(
    `[AI] taskType=pageCheck childId=${childId} inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  // Operational, and disclosed to the parent before the photo is taken. The
  // label is this task's own: `aiUsage.taskType` is a free-form string that the
  // usage panel groups by, so a new value adds a row and changes no arithmetic.
  await logAiUsage(db, familyId, {
    childId,
    taskType: "pageCheck",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
    stopReason: result.stopReason,
  };
};
