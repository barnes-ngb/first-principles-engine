import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

// Import plan-specific prompt pieces from chat.ts
import { buildPlanOutputInstructions } from "../chat.js";

/** Load per-child subject time defaults from plannerDefaults doc. */
async function loadSubjectTimeDefaults(
  db: import("firebase-admin/firestore").Firestore,
  familyId: string,
  childId: string,
): Promise<Record<string, number> | null> {
  const snap = await db
    .doc(`families/${familyId}/settings/plannerDefaults_${childId}`)
    .get();
  if (!snap.exists) return null;
  const data = snap.data();
  return (data?.subjectTimeDefaults as Record<string, number>) ?? null;
}

export const handlePlan = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, snapshotData, messages, apiKey } = ctx;

  // Build only the context slices needed for plan task
  const sections = await buildContextForTask("plan", {
    db, familyId, childId, childData, snapshotData,
  });

  // Load per-child subject time defaults and inject into system prompt
  const subjectDefaults = await loadSubjectTimeDefaults(db, familyId, childId);
  if (subjectDefaults && Object.keys(subjectDefaults).length > 0) {
    const lines = [
      "── SUBJECT TIME DEFAULTS ──",
      "Use these as the baseline for estimatedMinutes on each item:",
    ];
    for (const [subject, minutes] of Object.entries(subjectDefaults)) {
      const label = subject === "Other" ? "Formation/Prayer"
        : subject === "LanguageArts" ? "Language Arts"
        : subject === "SocialStudies" ? "Social Studies"
        : subject;
      lines.push(`- ${label}: ${minutes} min/day`);
    }
    lines.push("Only adjust from these baselines when energy level, daily routine, or special notes suggest otherwise.");
    lines.push("If the user specified a daily routine with specific times, those times take priority over these defaults.");
    sections.push(lines.join("\n"));
  }

  // Append plan-specific output format instructions
  sections.push(buildPlanOutputInstructions());

  // Promote daily routine from user message into system prompt for emphasis
  const lastUserContent = messages[messages.length - 1]?.content ?? "";
  const routineMatch = lastUserContent.match(
    /Daily routine[^:]*:\n([\s\S]*?)(?=\n\n(?:Subject time|Notes:|Generate|$))/i
  );
  if (routineMatch) {
    const routineSection = [
      "═══════════════════════════════════════════════════",
      "CRITICAL INSTRUCTION: USE MOM'S EXACT DAILY ROUTINE",
      "═══════════════════════════════════════════════════",
      "",
      "The following routine items MUST appear on EVERY day with their EXACT names and times.",
      'Use category "must-do" for all routine items. Do NOT rename, merge, or skip any.',
      "",
      routineMatch[1].trim(),
      "",
      "═══════════════════════════════════════════════════",
    ].join("\n");
    // Insert before the last section (plan output instructions)
    sections.splice(sections.length - 1, 0, routineSection);
  }

  const systemPrompt = sections.join("\n\n");
  const model = modelForTask("plan");

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 8192,
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
