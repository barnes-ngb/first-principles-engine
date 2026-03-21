import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

// Import plan-specific prompt pieces from chat.ts
import { buildPlanOutputInstructions } from "../chat.js";

export const handlePlan = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, apiKey } = ctx;

  // Build only the context slices needed for plan task
  const sections = await buildContextForTask("plan", {
    db, familyId, childId, childData, snapshotData,
  });

  // Append plan-specific output format instructions
  sections.push(buildPlanOutputInstructions());

  const systemPrompt = sections.join("\n\n");
  const model = modelForTask("plan");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 4096,
    systemPrompt,
    messages,
  });

  if (!result.text) {
    console.warn("Claude returned empty response", { model, taskType: "plan" });
  }

  console.log(`[AI] taskType=plan inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "plan",
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
