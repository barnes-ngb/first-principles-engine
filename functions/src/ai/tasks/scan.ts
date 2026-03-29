import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaudeWithVision, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

/**
 * Task: scan
 * Context: childProfile + recentEval (via buildContextForTask)
 * Model: Sonnet (vision)
 */

function buildScanSystemPrompt(
  childName: string,
  childGrade: string | undefined,
  contextSections: string[],
): string {
  const childLine = `Student: ${childName}${childGrade ? `, grade ${childGrade}` : ""}`;

  return `You are analyzing a photo of a workbook or worksheet page for a homeschool student.

${childLine}

${contextSections.join("\n\n")}

Analyze this page and respond ONLY with valid JSON (no markdown fences, no commentary):

{
  "pageType": "worksheet|textbook|test|activity|other",
  "subject": "math|reading|writing|spelling|phonics|science|other",
  "specificTopic": "string — e.g. 'two-digit addition with regrouping'",
  "skillsTargeted": [
    {
      "skill": "string — specific skill name",
      "level": "introductory|practice|mastery|review",
      "alignsWithSnapshot": "ahead|at-level|behind|unknown"
    }
  ],
  "estimatedDifficulty": "easy|appropriate|challenging|too-hard",
  "recommendation": "do|skip|quick-review|modify",
  "recommendationReason": "string — why this recommendation based on student's current level",
  "estimatedMinutes": number,
  "teacherNotes": "string — tips for the parent on how to present this page"
}

RULES:
- Be specific about skills. Don't say "math" — say "two-digit addition with regrouping" or "consonant blends: bl, cl, fl."
- Compare against the student's skill snapshot to determine if this is review, at-level, or advancement work.
- If the image is blurry, upside-down, or not a workbook page, set pageType to "other" and explain in recommendationReason.
- For neurodivergent learners, note if the page has too many problems, dense text, or other potential barriers in teacherNotes.`;
}

export const handleScan = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, apiKey } = ctx;

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

  try {
    const parsed = JSON.parse(firstMsg.content) as {
      imageBase64?: string;
      mediaType?: string;
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
  } catch {
    return {
      message: JSON.stringify({ error: "Expected JSON with imageBase64 field" }),
      model: "none",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  // Build context sections (child profile + skill snapshot)
  const contextSections = await buildContextForTask("scan", {
    db,
    familyId,
    childId,
    childData,
    snapshotData,
  });

  const model = modelForTask("plan"); // Sonnet for vision analysis
  const systemPrompt = buildScanSystemPrompt(
    childData.name,
    childData.grade,
    contextSections,
  );

  const result = await callClaudeWithVision({
    apiKey,
    model,
    maxTokens: 1024,
    systemPrompt,
    imageBase64,
    mediaType,
    textPrompt: "Analyze this workbook page. Identify the skills it targets and compare against the student's current skill levels to make a recommendation.",
  });

  console.log(
    `[AI] taskType=scan childId=${childId} inputTokens≈${result.inputTokens} outputTokens≈${result.outputTokens}`,
  );

  await logAiUsage(db, familyId, {
    childId,
    taskType: "scan",
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
