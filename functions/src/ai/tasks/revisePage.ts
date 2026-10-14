import { HttpsError } from "firebase-functions/v2/https";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { buildRevisePagePrompt, modelForTask } from "../chat.js";
import type { RevisePageInput, RevisePageOutput } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../../shared/sanitizeJson.js";
import { loadBookLevelStretch, resolveStoryLevelContext } from "../storyLevelContext.js";
import { resolveEffortForTask } from "../models.js";
import { maxTokensForPageCount } from "../storyPageBudget.js";

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
    ...(typeof payload.bookId === "string" && payload.bookId
      ? { bookId: payload.bookId }
      : {}),
  };

  // Server-injected READING LEVEL block (FEAT-176) — see reviseStory.ts. A
  // per-page rewrite is the easiest place for the vocabulary to creep back up,
  // and (FEAT-191) the easiest place for a stretched book to be quietly pulled
  // back down: the stretch is read off the book's own record, like the level.
  const levelContext = await resolveStoryLevelContext({
    db,
    familyId,
    childId,
    childName: normalizedInput.childCalibration.childName || childData.name || "the reader",
    age: normalizedInput.childCalibration.childAge,
    workingLevels: ctx.snapshotData?.workingLevels,
    levelStretch: await loadBookLevelStretch(db, familyId, normalizedInput.bookId),
  });
  normalizedInput.readingLevelBlock = levelContext.block;

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

  // LOW effort (UX-455), and a budget sized from the page rather than a flat
  // 2,048. At the API default (high) a single-page revise could spend all
  // 2,048 tokens thinking — thinking counts against `max_tokens` on this model
  // generation — and come back with no page at all; that is the likeliest
  // reading of "just about any modification". The one-page shape of the story
  // budget is 8,192 + 512 × 1 = 8,704: the same thinking headroom a story gets,
  // for the one page this call returns. A ceiling, not a spend — a page that
  // finishes early bills what it emitted.
  const maxTokens = maxTokensForPageCount(1);
  const effort = resolveEffortForTask("revisePage");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens,
    effort,
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
    `[AI] taskType=revisePage inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}` +
      ` maxTokens=${maxTokens} effort=${effort ?? "default"} stopReason=${result.stopReason}`,
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
    // So the client can name a reply cut short by the budget (UX-455) — additive.
    stopReason: result.stopReason,
  };
};
