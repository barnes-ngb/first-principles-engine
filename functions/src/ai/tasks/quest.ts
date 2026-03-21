import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

// Import quest-specific prompt builder from chat.ts
import { buildQuestPrompt } from "../chat.js";

export const handleQuest = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, domain, apiKey } = ctx;

  // Quest only needs childProfile + sightWords + recentEval (no charter, no enriched)
  const sections = await buildContextForTask("quest", {
    db, familyId, childId, childData, snapshotData,
  });

  // Append quest-specific interactive prompt
  sections.push(buildQuestPrompt(domain || "reading"));

  const systemPrompt = sections.join("\n\n");
  const model = modelForTask("quest");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 1024,
    systemPrompt,
    messages,
  });

  if (!result.text) {
    console.warn("Claude returned empty response", { model, taskType: "quest" });
  }

  console.log(`[AI] taskType=quest inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "quest",
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
