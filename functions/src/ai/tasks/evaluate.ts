import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import {
  buildSystemPrompt,
  loadEnrichedContext,
  loadSightWordSummary,
  modelForTask,
} from "../chat.js";

export const handleEvaluate = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, domain, apiKey } = ctx;

  // Load enriched context
  let enriched;
  try {
    enriched = await loadEnrichedContext(db, familyId, childId);
  } catch (err) {
    console.warn("Failed to load enriched context, proceeding without it:", err);
  }

  // Load sight word summary
  let sightWordContext = "";
  try {
    sightWordContext = await loadSightWordSummary(db, familyId, childId);
  } catch (err) {
    console.warn("Failed to load sight word summary:", err);
  }

  const systemPrompt =
    buildSystemPrompt(
      {
        name: childData.name,
        grade: childData.grade,
        prioritySkills: snapshotData?.prioritySkills,
        supports: snapshotData?.supports,
        stopRules: snapshotData?.stopRules,
      },
      "evaluate",
      enriched,
      domain,
    ) + (sightWordContext ? `\n\n${sightWordContext}` : "");

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
