import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { buildContextForTask } from "../contextSlices.js";

/**
 * Task: plan
 * Context: charter + childProfile + workbookPaces + weekFocus + hoursProgress
 *          + engagement + gradeResults + bookStatus + sightWords + recentEval
 *          + wordMastery + generatedContent + workshopGames (via buildContextForTask)
 * Model: Sonnet
 */

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

  // Append evaluation scheduling instructions
  sections.push([
    "EVALUATION SCHEDULING:",
    "Include Knowledge Mine sessions and Fluency Practice as checklist items in the weekly plan.",
    "These are REAL school activities that count toward hours.",
    "",
    "Based on the child's Skill Snapshot and current focus areas:",
    "",
    "IF reading has emerging/not-yet skills:",
    '  → Schedule 2 "Knowledge Mine — Reading" sessions per week (15m each)',
    '  → If fluency is a focus → schedule 2 "Fluency Practice" sessions per week (10m each)',
    "  → Alternate days: don't put both on the same day",
    "",
    "IF comprehension skills are the frontier (phonics mastered):",
    '  → Schedule "Knowledge Mine — Comprehension" instead of basic "Reading"',
    "",
    "IF math has emerging/not-yet skills:",
    '  → Schedule 1-2 "Knowledge Mine — Math" sessions per week (15m each)',
    "",
    "Spread evaluation sessions across the week. Maximum 1 quest + 1 fluency per day.",
    "Don't schedule evaluations on days that are already heavy (230m+).",
    "",
    "FORMAT for evaluation items:",
    '{',
    '  "title": "Knowledge Mine — Comprehension",',
    '  "estimatedMinutes": 15,',
    '  "subjectBucket": "Reading",',
    '  "itemType": "evaluation",',
    '  "evaluationMode": "comprehension",',
    '  "link": "/quest",',
    '  "skipGuidance": null,',
    '  "category": "choose",',
    '  "accepted": true,',
    '  "mvdEssential": false,',
    '  "skillTags": []',
    '}',
    "",
    '{',
    '  "title": "Fluency Practice",',
    '  "estimatedMinutes": 10,',
    '  "subjectBucket": "Reading",',
    '  "itemType": "evaluation",',
    '  "evaluationMode": "fluency",',
    '  "link": "/quest",',
    '  "skipGuidance": null,',
    '  "category": "choose",',
    '  "accepted": true,',
    '  "mvdEssential": false,',
    '  "skillTags": []',
    '}',
    "",
    '{',
    '  "title": "Knowledge Mine — Math",',
    '  "estimatedMinutes": 15,',
    '  "subjectBucket": "Math",',
    '  "itemType": "evaluation",',
    '  "evaluationMode": "math",',
    '  "link": "/quest",',
    '  "skipGuidance": null,',
    '  "category": "choose",',
    '  "accepted": true,',
    '  "mvdEssential": false,',
    '  "skillTags": []',
    '}',
    "",
    'Place evaluation items in the CHOOSE section (not Must-Do) so Shelly has flexibility.',
    'Include the "link" field so the UI can create a direct navigation button.',
    'Include "itemType": "evaluation" and the appropriate "evaluationMode" on every evaluation item.',
  ].join("\n"));

  // Append skip guidance instructions
  sections.push([
    "SKIP GUIDANCE — IMPORTANT:",
    "You have the child's Skill Snapshot showing mastered, emerging, and not-yet skills.",
    "For EVERY workbook-based checklist item in the plan, include a \"skipGuidance\" field:",
    "",
    "RULES:",
    "1. If the workbook lesson covers skills the child has MASTERED:",
    '   → skipGuidance: "[Child] has [skill] mastered — skim this lesson or skip to [next lesson number]."',
    "2. If the lesson covers skills the child is still EMERGING on:",
    '   → skipGuidance: "This is [Child]\'s frontier — spend full time here. Focus on [specific skill]."',
    "3. If the lesson covers skills NOT YET started:",
    '   → skipGuidance: "New material — go slow, this is first exposure to [topic]."',
    "4. If you don't know what specific content the lesson covers:",
    '   → skipGuidance: "Check lesson content. If it covers [list of mastered skills], skip ahead."',
    "5. For non-workbook items (Prayer, Handwriting, etc.):",
    "   → skipGuidance: null (these don't need skip guidance)",
    "",
    "INCLUDE skipGuidance ON EVERY WORKBOOK ITEM in the JSON output.",
  ].join("\n"));

  // Append daily item ordering rules
  sections.push([
    "DAILY ITEM ORDERING — FOLLOW THIS EXACTLY:",
    "",
    "Every day's ROUTINE section must follow this order:",
    "1. FORMATION FIRST: Prayer and Scripture (always first, every day)",
    "2. CORE READING: Good and the Beautiful reading or primary reading workbook (always second)",
    "3. CORE MATH: Good and the Beautiful Math or primary math workbook (third)",
    "4. READ-ALOUD: Family read-aloud book placed after core academics but before support skills (see READ-ALOUD PLACEMENT below)",
    "5. SUPPORT SKILLS: Handwriting, sight word games, booster cards, memory cards, language arts workbook (rotate — see DAILY VARIATION below)",
    "6. TABLET/APP TIME: Reading Eggs, Math apps, Typing (if scheduled for this day)",
    "7. ENRICHMENT: Any choose items, creative time, evaluation sessions",
    "",
    "This order reflects the family's priorities:",
    "- Formation is non-negotiable and sets the tone",
    "- Reading is Lincoln's biggest growth area — do it when energy is highest (right after formation)",
    "- Math next while focus is still strong",
    "- Support skills when attention naturally dips",
    "- Apps and enrichment as the day winds down",
    "",
    "DO NOT put Handwriting or Booster Cards before Reading.",
    "DO NOT put apps before core workbook time.",
  ].join("\n"));

  // Append daily variation / rotation rules
  sections.push([
    "DAILY VARIATION — NOT EVERY ITEM EVERY DAY:",
    "",
    "These items appear EVERY day (5 days/week):",
    "- Prayer and Scripture (10m)",
    "- Primary reading workbook (30m)",
    "- Primary math workbook (30m)",
    "- Read-aloud / chapter reading (15m)",
    "",
    "These items ROTATE across the week (2-3 days each):",
    "- Handwriting (3x/week — MWF is typical)",
    "- Sight word games (2-3x/week)",
    "- Booster cards (2-3x/week)",
    "- Memory cards (2x/week)",
    "- Language arts workbook (3x/week — TTh + one other day)",
    "",
    "These items appear 1-2 days per week:",
    "- Knowledge Mine quests (2x/week, different days)",
    "- Fluency Practice (2-3x/week)",
    "",
    "ROTATION RULES:",
    "- Monday should be a FULL day (all core + most support) — start of week energy",
    "- Wednesday can be lighter on support skills",
    "- Friday should be lighter overall — end of week",
    "- Never put ALL support skills on the same day — spread them out",
    "- Each support skill should appear on at least 2 different days",
    "",
    "EXAMPLE ROTATION:",
    "Monday: Prayer → Reading → Math → Handwriting → Sight Words → Booster Cards → Apps → Knowledge Mine",
    "Tuesday: Prayer → Reading → Math → Language Arts → Memory Card → Fluency Practice → Apps",
    "Wednesday: Prayer → Reading → Math → Handwriting → Sight Words → Apps",
    "Thursday: Prayer → Reading → Math → Language Arts → Booster Cards → Knowledge Mine → Apps",
    "Friday: Prayer → Reading → Math → Handwriting → Fluency Practice → Apps (lighter day)",
    "",
    "The point: each day feels slightly different, not copy-paste.",
  ].join("\n"));

  // Append per-day time budgets
  sections.push([
    "TIME BUDGETS BY DAY:",
    "- Monday: Full day (3-3.5 hours) — fresh start",
    "- Tuesday: Full day (3-3.5 hours)",
    "- Wednesday: Standard (2.5-3 hours)",
    "- Thursday: Standard (2.5-3 hours)",
    "- Friday: Lighter (2-2.5 hours) — review and wrap up",
    "",
    "Adjust item count and minutes to fit the day's budget.",
    "Don't exceed the budget — if adding a support skill pushes over, drop it to another day.",
  ].join("\n"));

  // Append read-aloud placement rules
  sections.push([
    "READ-ALOUD PLACEMENT:",
    "The family read-aloud book (e.g. Chronicles of Narnia) should appear as a distinct item:",
    "- Placed AFTER core academics (Reading + Math) but BEFORE support skills",
    '- Labeled clearly: "Read Aloud: [Book Title] — Chapter [N]"',
    "- Include the chapter question in the item's contentGuide field",
    "- Duration: 15-20m (reading + discussion)",
    '- Use subjectBucket: "Reading" and itemType: "readaloud"',
    "",
    "Example item:",
    '{',
    '  "title": "Read Aloud: Narnia Ch 6",',
    '  "estimatedMinutes": 20,',
    '  "subjectBucket": "Reading",',
    '  "category": "must-do",',
    '  "mvdEssential": false,',
    '  "skipGuidance": null',
    '}',
  ].join("\n"));

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
