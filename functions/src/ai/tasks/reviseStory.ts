import { HttpsError } from "firebase-functions/v2/https";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { buildReviseStoryPrompt, modelForTask } from "../chat.js";
import type {
  ReviseStoryChatTurn,
  ReviseStoryInput,
  ReviseStoryStoryPage,
} from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";
import { maxTokensForPageCount } from "../storyPageBudget.js";
import { loadBookLevelStretch, resolveStoryLevelContext } from "../storyLevelContext.js";

/**
 * Task: reviseStory
 * Context: childProfile + sightWords + wordMastery + skillSnapshot
 * Model: Sonnet
 *
 * Receives the full Generate Chat history + current story draft + latest
 * kid feedback. Returns the AI's chat-thread reply, optionally the updated
 * story, and a list of page numbers whose scene changed enough to warrant
 * a new illustration.
 */
export const handleReviseStory = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;

  let payload: ReviseStoryInput;
  try {
    payload = JSON.parse(messages[0].content) as ReviseStoryInput;
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "reviseStory requires JSON with chatHistory, currentStory, childCalibration, and newFeedback.",
    );
  }

  if (!Array.isArray(payload.chatHistory)) {
    throw new HttpsError(
      "invalid-argument",
      "reviseStory: chatHistory must be an array.",
    );
  }
  if (!payload.currentStory || !Array.isArray(payload.currentStory.pages)) {
    throw new HttpsError(
      "invalid-argument",
      "reviseStory: currentStory.pages must be an array.",
    );
  }
  if (!payload.childCalibration) {
    throw new HttpsError(
      "invalid-argument",
      "reviseStory: childCalibration is required.",
    );
  }
  if (typeof payload.newFeedback !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "reviseStory: newFeedback must be a string.",
    );
  }

  // Normalize chatHistory + pages defensively — strip unknown fields.
  const chatHistory: ReviseStoryChatTurn[] = payload.chatHistory.map((t) => ({
    role: t.role === "kid" ? "kid" : "ai",
    content: String(t.content ?? ""),
  }));
  const pages: ReviseStoryStoryPage[] = payload.currentStory.pages.map((p) => ({
    pageNumber: Number(p.pageNumber),
    text: String(p.text ?? ""),
    sceneDescription: String(p.sceneDescription ?? ""),
    ...(Array.isArray(p.wordsOnPage) ? { wordsOnPage: p.wordsOnPage } : {}),
  }));

  const normalizedInput: ReviseStoryInput = {
    chatHistory,
    currentStory: {
      title: String(payload.currentStory.title ?? ""),
      pages,
    },
    childCalibration: {
      childAge: Number(payload.childCalibration.childAge ?? 10),
      childName: String(payload.childCalibration.childName ?? childData.name ?? ""),
      illustrationStyle: String(payload.childCalibration.illustrationStyle ?? ""),
      pageCount: Number(payload.childCalibration.pageCount ?? pages.length),
    },
    newFeedback: payload.newFeedback,
    ...(typeof payload.bookId === "string" && payload.bookId
      ? { bookId: payload.bookId }
      : {}),
  };

  // The READING LEVEL block is SERVER-injected (FEAT-176), after normalization,
  // from the child's assessed level and their own sight words — never off the
  // client payload. Without it a revise could walk the story back up above the
  // level the generation was held to, one "make it more exciting" at a time.
  //
  // The per-story stretch (FEAT-191) comes off the BOOK's own record, not the
  // payload: a revise of a book written one step up has to stay one step up, or
  // the first "make it more exciting" re-levels it at the child's base and every
  // word the parent asked for comes back flagged.
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

  const revisePrompt = buildReviseStoryPrompt(normalizedInput);

  const contextSections = await buildContextForTask("reviseStory", {
    db,
    familyId,
    childId,
    childData,
    snapshotData: ctx.snapshotData,
  });
  const familyContext = contextSections.join("\n\n");
  const systemPrompt = `${familyContext}\n\n${revisePrompt}`;

  const model = modelForTask("reviseStory");

  const result = await callClaude({
    apiKey,
    model,
    // A revise rewrites the whole story, so scale the budget with the book's
    // page count the same way generation does (FEAT-97).
    maxTokens: maxTokensForPageCount(normalizedInput.childCalibration.pageCount),
    temperature: 0.7,
    systemPrompt,
    messages: [{ role: "user", content: "Revise the story now." }],
  });

  console.log(
    `[AI] taskType=reviseStory inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId,
    taskType: "reviseStory",
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
