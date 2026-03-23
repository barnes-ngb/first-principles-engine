import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaudeWithVision, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";

const WORKBOOK_ANALYSIS_PROMPT = `You are an expert homeschool curriculum analyst. Analyze this workbook/worksheet photo and extract structured information.

RULES:
- Identify the subject, specific lesson/unit number, and topic
- Estimate how long it will take the child to complete
- Note any difficulty concerns (too many problems, above grade level, etc.)
- Suggest modifications if needed for a neurodivergent learner
- Map to specific skills being practiced

Respond ONLY with valid JSON (no markdown fences, no commentary):
{
  "subject": "math|reading|phonics|writing|science|social_studies|language_arts|other",
  "lessonNumber": "lesson/unit number if visible, or empty string",
  "topic": "specific topic (e.g., 'subtraction with regrouping', 'CVC word families')",
  "estimatedMinutes": 15,
  "difficulty": "observations about difficulty level and any concerns",
  "modifications": "suggested modifications for neurodivergent learner, or empty string if none needed",
  "rawDescription": "brief description of what's on the page",
  "skillTags": ["dot.delimited.skill.tags"],
  "problemCount": 0,
  "pageRange": "page numbers if visible, or empty string"
}`;

export const handleAnalyzeWorkbook = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;

  // The first message content should be JSON with imageBase64 and optional textLabel
  const firstMsg = messages[0];
  if (!firstMsg) {
    return {
      message: JSON.stringify({ error: "No message provided" }),
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  let imageBase64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  let textLabel = "";

  try {
    const parsed = JSON.parse(firstMsg.content) as {
      imageBase64?: string;
      mediaType?: string;
      textLabel?: string;
    };
    if (!parsed.imageBase64) {
      return {
        message: JSON.stringify({ error: "imageBase64 is required" }),
        model: "none",
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    imageBase64 = parsed.imageBase64;
    if (parsed.mediaType) {
      mediaType = parsed.mediaType as typeof mediaType;
    }
    if (parsed.textLabel) {
      textLabel = parsed.textLabel;
    }
  } catch {
    // If not JSON, treat the whole content as a text-only request (backwards compat)
    return {
      message: JSON.stringify({ error: "Expected JSON with imageBase64 field" }),
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const model = modelForTask("plan"); // Use Sonnet for vision analysis
  const systemPrompt = `${WORKBOOK_ANALYSIS_PROMPT}\n\nChild context: ${childData.name}${childData.grade ? `, grade ${childData.grade}` : ""}.`;
  const textPrompt = textLabel
    ? `Analyze this workbook page. The parent labeled it: "${textLabel}"`
    : "Analyze this workbook page and extract the structured information.";

  const result = await callClaudeWithVision({
    apiKey,
    model,
    maxTokens: 1024,
    systemPrompt,
    imageBase64,
    mediaType,
    textPrompt,
  });

  console.log(
    `[AI] taskType=analyzeWorkbook inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId,
    taskType: "analyzeWorkbook",
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
  };
};
