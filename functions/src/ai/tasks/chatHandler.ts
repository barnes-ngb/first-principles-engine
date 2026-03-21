import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { buildSystemPrompt, modelForTask } from "../chat.js";

/**
 * Handles both "chat" and "generate" task types.
 * These share the same code path — no enriched context, haiku model.
 */
export const handleChat = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, domain, apiKey } = ctx;

  const systemPrompt = buildSystemPrompt(
    {
      name: childData.name,
      grade: childData.grade,
      prioritySkills: snapshotData?.prioritySkills,
      supports: snapshotData?.supports,
      stopRules: snapshotData?.stopRules,
    },
    "chat",
    undefined,
    domain,
  );

  const model = modelForTask("chat");

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
