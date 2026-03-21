import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage, loadRecentEvalContext } from "../chatTypes.js";
import {
  buildSystemPrompt,
  loadEnrichedContext,
  loadSightWordSummary,
  modelForTask,
} from "../chat.js";

export const handleQuest = async (
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

  // Load recent evaluation
  const recentEvalContext = await loadRecentEvalContext(db, familyId, childId);

  const systemPrompt =
    buildSystemPrompt(
      {
        name: childData.name,
        grade: childData.grade,
        prioritySkills: snapshotData?.prioritySkills,
        supports: snapshotData?.supports,
        stopRules: snapshotData?.stopRules,
      },
      "quest",
      enriched,
      domain,
    ) + recentEvalContext + (sightWordContext ? `\n\n${sightWordContext}` : "");

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
