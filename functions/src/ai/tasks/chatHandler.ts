import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

/**
 * Task: chat / generate
 * Context: charter + childProfile (via buildContextForTask)
 * Model: Haiku by default; honors an allowlisted per-request `modelOverride`
 *   (ETHOS-03 uses this to run Dad Lab suggestion generation on Sonnet).
 */
export const handleChat = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, apiKey, modelOverride } = ctx;

  const sections = await buildContextForTask("chat", {
    db, familyId, childId, childData, snapshotData,
  });

  const systemPrompt = sections.join("\n\n");
  const model = modelOverride ?? modelForTask("chat");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 1024,
    systemPrompt,
    messages,
  });

  if (!result.text) {
    console.warn("Claude returned empty response", { model, taskType: "chat" });
  }

  console.log(`[AI] taskType=chat inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "chat",
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
