import { HttpsError } from "firebase-functions/v2/https";
import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { buildStoryPrompt, modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

/**
 * Task: generateStory
 * Context: childProfile + sightWords + wordMastery (via buildContextForTask)
 * Model: Sonnet
 */

export const handleGenerateStory = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;

  // Parse story config from first message
  let storyConfig: {
    storyIdea?: string;
    sightWords?: string[];
    words?: string[];
    theme?: string;
    pageCount?: number;
  };
  try {
    storyConfig = JSON.parse(messages[0].content);
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "generateStory requires JSON with story parameters.",
    );
  }

  const storyWords = storyConfig.words ?? storyConfig.sightWords ?? [];
  const storyIdea = storyConfig.storyIdea ?? storyConfig.theme ?? "";

  // Load child profile for personalized story
  const storyChildName = childData.name ?? "the reader";
  let storyChildAge = 10;
  const childFullDoc = await db
    .doc(`families/${familyId}/children/${childId}`)
    .get();
  const childFullData = childFullDoc.data() as
    | { birthdate?: string }
    | undefined;
  if (childFullData?.birthdate) {
    const birth = new Date(childFullData.birthdate);
    storyChildAge = Math.floor(
      (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
  }

  // Child-specific interests and reading level
  const isLondon = storyChildName.toLowerCase() === "london";
  const childInterests = isLondon
    ? "animals, drawing, fairy tales, colors, nature"
    : "Minecraft, dragons, quests, building, adventures";
  const readingLevel = isLondon ? "pre-K to kindergarten" : "1st grade";

  const storyPrompt = buildStoryPrompt({
    storyIdea,
    words: storyWords,
    pageCount: storyConfig.pageCount ?? 10,
    childName: storyChildName,
    childAge: storyChildAge,
    childInterests,
    readingLevel,
  });

  // Load shared context (child profile + sight words + word mastery)
  const contextSections = await buildContextForTask("generateStory", {
    db,
    familyId,
    childId,
    childData,
    snapshotData: ctx.snapshotData,
  });
  const familyContext = contextSections.join("\n\n");
  const storySystemPrompt = `${familyContext}\n\n${storyPrompt}`;

  const model = modelForTask("generateStory");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 4096,
    systemPrompt: storySystemPrompt,
    messages: [{ role: "user", content: "Generate the story now." }],
  });

  console.log(`[AI] taskType=generateStory inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "generateStory",
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
