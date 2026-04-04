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

  return `You are analyzing a photo of a workbook page, worksheet, certificate, or progress document for a homeschool student.

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
  "teacherNotes": "string — tips for the parent on how to present this page",
  "curriculumDetected": {
    "provider": "gatb|reading-eggs|other|null",
    "name": "string — full curriculum name if identifiable (e.g., 'The Good and the Beautiful Language Arts Level 1'), or null",
    "lessonNumber": "number — the lesson number if visible, or null",
    "pageNumber": "number — the page number if visible, or null",
    "levelDesignation": "string — e.g., 'Level 1', 'Level K', 'Level 4', or null"
  }
}

CERTIFICATE / PROGRESS DOCUMENT DETECTION:
If the image is NOT a workbook page but IS a curriculum certificate, progress report, or completion document, respond with this alternative JSON format:

{
  "pageType": "certificate",
  "curriculum": "reading-eggs|gatb|other",
  "curriculumName": "string — full name (e.g., 'Reading Eggs', 'The Good and the Beautiful Language Arts Level 1')",
  "level": "string — level designation (e.g., 'Level 4', 'Level 1')",
  "milestone": "string — what was achieved (e.g., 'Map 13 complete — 100% Gold')",
  "lessonRange": "string — lesson numbers if visible (e.g., 'Lessons 121-130')",
  "skillsCovered": [
    "string — each skill or phonics pattern visible on the certificate"
  ],
  "wordsRead": ["string — any specific words listed"],
  "date": "string — date on the certificate if visible (e.g., '2026-03-11'), or empty string if not visible",
  "childName": "string — child name on the certificate, or empty string if not visible",
  "suggestedSnapshotUpdate": {
    "masteredSkills": ["string — skills to mark as mastered based on this certificate"],
    "recommendedStartLevel": number | null,
    "notes": "string — what this means for the child's current level"
  },
  "curriculumDetected": {
    "provider": "gatb|reading-eggs|other|null",
    "name": "string — full curriculum name, or null",
    "lessonNumber": "number — the last lesson number from the range, or null",
    "pageNumber": null,
    "levelDesignation": "string — e.g., 'Level 1', or null"
  }
}

Look for indicators like: award logos, "is awarded to", "for achieving", level/map/lesson numbers, skills lists, completion dates, curriculum branding (Reading Eggs mascot, GATB nature imagery).

CURRICULUM IDENTIFICATION:
When analyzing a workbook page, also try to identify which curriculum it belongs to.
Look for:
- "The Good and the Beautiful" or TGTB branding, level indicators, lesson numbers in headers/footers
- "Reading Eggs" branding, map/lesson numbers
- Any other curriculum branding with identifiable lesson/page numbers

If you can identify the curriculum, fill in the curriculumDetected object.
The lessonNumber is the most important field — look for "Lesson 47", "L47", page headers with lesson numbers, etc.
If you can only identify the curriculum but not the exact lesson, set lessonNumber to null.
If you cannot identify any curriculum, set all curriculumDetected fields to null.

RULES:
- Be specific about skills. Don't say "math" — say "two-digit addition with regrouping" or "consonant blends: bl, cl, fl."
- Compare against the student's skill snapshot to determine if this is review, at-level, or advancement work.
- If the image is blurry, upside-down, or not a workbook page or certificate, set pageType to "other" and explain in recommendationReason.
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
    maxTokens: 1536,
    systemPrompt,
    imageBase64,
    mediaType,
    textPrompt: "Analyze this image. It may be a workbook page, certificate, or progress document. Identify the skills it targets or certifies and compare against the student's current skill levels.",
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
