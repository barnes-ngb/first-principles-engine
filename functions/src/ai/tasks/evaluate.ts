import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

// Import evaluation-specific prompt builder from chat.ts
import { buildEvaluationPrompt } from "../chat.js";

export const handleEvaluate = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, domain, apiKey } = ctx;

  // Evaluate only needs charter + childProfile + sightWords (no enriched context)
  const sections = await buildContextForTask("evaluate", {
    db, familyId, childId, childData, snapshotData,
  });

  // Append evaluation-specific diagnostic prompt
  sections.push(buildEvaluationPrompt(domain || "reading"));

  const systemPrompt = sections.join("\n\n");
  const model = modelForTask("evaluate");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 4096,
    systemPrompt,
    messages,
  });

  if (!result.text) {
    console.warn("Claude returned empty response", { model, taskType: "evaluate" });
  }

  console.log(`[AI] taskType=evaluate inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "evaluate",
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
