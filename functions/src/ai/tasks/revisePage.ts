import { HttpsError } from "firebase-functions/v2/https";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { buildRevisePagePrompt, modelForTask } from "../chat.js";
import type { RevisePageInput, RevisePageOutput } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../sanitizeJson.js";

/**
 * Task: revisePage
 * Context: childProfile + sightWords + wordMastery + skillSnapshot
 * Model: Sonnet
 *
 * Surgical single-page revision used during the Per-Page Review (§5.B of
 * docs/DESIGN_STORY_GENERATION_V2.md). Receives one page + the full story for
 * consistency context + the listener's transcribed feedback. Returns the
 * revised page text, scene description, sight words, and a model decision on
 * whether the illustration needs regenerating.
 *
 * Page revisions are small, so maxTokens is kept low (2048).
 */
export const handleRevisePage = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;

  let payload: RevisePageInput;
  try {
    payload = JSON.parse(messages[0].content) as RevisePageInput;
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "revisePage requires JSON with pageNumber, currentText, currentSceneDescription, feedback, fullStoryContext, and childCalibration.",
    );
  }

  if (typeof payload.pageNumber !== "number") {
    throw new HttpsError(
      "invalid-argument",
      "revisePage: pageNumber must be a number.",
    );
  }
  if (typeof payload.feedback !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "revisePage: feedback must be a string.",
    );
  }
  if (
    !payload.fullStoryContext ||
    !Array.isArray(payload.fullStoryContext.allPages)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "revisePage: fullStoryContext.allPages must be an array.",
    );
  }
  if (!payload.childCalibration) {
    throw new HttpsError(
      "invalid-argument",
      "revisePage: childCalibration is required.",
    );
  }

  // Normalize defensively — strip unknown fields, coerce types.
  const normalizedInput: RevisePageInput = {
    pageNumber: Number(payload.pageNumber),
    currentText: String(payload.currentText ?? ""),
    currentSceneDescription: String(payload.currentSceneDescription ?? ""),
    feedback: payload.feedback,
    fullStoryContext: {
      title: String(payload.fullStoryContext.title ?? ""),
      allPages: payload.fullStoryContext.allPages.map((p) => ({
        pageNumber: Number(p.pageNumber),
        text: String(p.text ?? ""),
      })),
      characterNames: Array.isArray(payload.fullStoryContext.characterNames)
        ? payload.fullStoryContext.characterNames.map((n) => String(n))
        : [],
    },
    childCalibration: {
      childAge: Number(payload.childCalibration.childAge ?? 10),
      childName: String(
        payload.childCalibration.childName ?? childData.name ?? "",
      ),
      sentenceTarget: String(payload.childCalibration.sentenceTarget ?? ""),
      vocabularyLevel: String(payload.childCalibration.vocabularyLevel ?? ""),
    },
  };

  const revisePrompt = buildRevisePagePrompt(normalizedInput);

  const contextSections = await buildContextForTask("revisePage", {
    db,
    familyId,
    childId,
    childData,
    snapshotData: ctx.snapshotData,
  });
  const familyContext = contextSections.join("\n\n");
  const systemPrompt = `${familyContext}\n\n${revisePrompt}`;

  const model = modelForTask("revisePage");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 2048,
    temperature: 0.7,
    systemPrompt,
    messages: [{ role: "user", content: "Revise the page now." }],
  });

  // Validate the response parses into the expected shape. On success we
  // re-serialize so the client gets clean JSON; on failure we return the raw
  // text and let the client's parser surface the error gracefully.
  try {
    const parsed = sanitizeAndParseJson<RevisePageOutput>(result.text);
    if (typeof parsed.newText !== "string") {
      throw new Error("revisePage response missing newText");
    }
    result.text = JSON.stringify(parsed);
  } catch (err) {
    console.error("[revisePage] Failed to parse response", {
      childId,
      pageNumber: normalizedInput.pageNumber,
      error: String(err),
      responsePreview: result.text.substring(0, 200),
    });
  }

  console.log(
    `[AI] taskType=revisePage inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId,
    taskType: "revisePage",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
};
