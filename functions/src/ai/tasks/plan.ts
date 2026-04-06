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

  // Append block-based daily schedule structure
  sections.push([
    "DAILY SCHEDULE STRUCTURE — Shelly's actual teaching flow:",
    "",
    "BLOCK 1 — FORMATION (first, every day)",
    'Prayer and Scripture — 10m. block: "formation", aspirational: true.',
    "This is aspirational. Include it but don't mark as required.",
    "",
    "BLOCK 2 — READ-ALOUD + HANDWRITING (paired — happen simultaneously)",
    "Narnia read-aloud — 15-20m (Shelly reads, Lincoln does handwriting during this).",
    "After reading: Narnia discussion question — Lincoln records his answer.",
    "These are ONE time block (~20m), not two separate 20m + 15m items.",
    'In the plan, show handwriting with block: "readaloud", pairedWith: "narnia".',
    'The read-aloud item also gets block: "readaloud".',
    "Only count the LONGER item's time toward the day total (they overlap).",
    "",
    "BLOCK 3 — LINCOLN'S CHOICE (both get done, he picks the order)",
    "Booster cards — 15m",
    "Language Arts workbook — 20m",
    'Both items get block: "choice", choiceGroup: "lincoln-choice-1".',
    "",
    "BLOCK 4 — CORE READING",
    'GATB Reading — 30m. block: "core-reading".',
    "",
    "BLOCK 5 — CORE MATH",
    'GATB Math — 30m. block: "core-math".',
    "",
    "BLOCK 6 — FLEX (usually end of day, can float)",
    "Sight word games — 15m (2-3x/week, not daily)",
    "Memory card — 10m (2-3x/week, not daily)",
    'Both items get block: "flex", droppableOnLightDay: true.',
    "These are droppable on light days.",
    "",
    "BLOCK 7 — INDEPENDENT (tablet, Lincoln does alone)",
    "Knowledge Mine — 15m (2x/week)",
    "Fluency Practice — 10m (2x/week)",
    'Both items get block: "independent".',
    "",
    "ORDERING RULES:",
    "- Blocks go in order 1→7, never rearrange",
    "- Within Block 3, Lincoln chooses the order (plan shows both)",
    "- Block 6 items rotate across the week (not every day)",
    "- Block 7 items are scheduled on specific days (not every day)",
    "",
    "TIME CALCULATION:",
    "- Block 2 counts as ONE block of ~20m (paired activities overlap)",
    "  NOT as handwriting 15m + Narnia 20m = 35m",
    "- Full day total should be ~155-175m, not 210m+",
    "",
    "INCLUDE these fields on EVERY item in the JSON output:",
    '- "block": one of "formation", "readaloud", "choice", "core-reading", "core-math", "flex", "independent"',
    '- "aspirational": true ONLY for Prayer/Scripture',
    '- "droppableOnLightDay": true for flex items',
    '- "pairedWith": activity ID string when paired (e.g., handwriting during read-aloud)',
    '- "choiceGroup": group ID when items are pick-your-order (e.g., "lincoln-choice-1")',
  ].join("\n"));

  // Append light day and MVD rules
  sections.push([
    "LIGHT DAY RULES:",
    "When a day is marked 'light' or the week is 'lighter':",
    "1. DROP Block 6 entirely (sight words + memory card)",
    "2. Block 3 becomes single-choice: Lincoln does ONE of booster cards or language arts, not both",
    "3. Keep Blocks 1, 2, 4, 5 (formation, read-aloud, core reading, core math) — these are core",
    "4. Keep Block 7 if scheduled for this day (tablet time is independent, doesn't tire Shelly)",
    "",
    "REDISTRIBUTION:",
    "When items are dropped from a light day, add a SMALL amount to adjacent days:",
    "- If sight word games (15m) dropped from Friday → add 5m to Thursday's sight word block",
    "- If memory card (10m) dropped from Friday → add to Wednesday if it doesn't have memory card",
    "- DON'T fully redistribute — just nudge. The goal is less total work on the light day.",
    "- Never push a normal day over 185m total",
    "",
    "LIGHT DAY TOTAL: ~120-140m (vs normal ~165m)",
    "",
    "TOUGH WEEK (MVD) RULES:",
    "1. Only Blocks 2, 4, 5 (read-aloud, core reading, core math)",
    "2. Drop Blocks 3, 6, 7 entirely",
    "3. Formation (Block 1) is optional but encouraged",
    "4. Total: ~80-100m",
    "5. This is REAL school. The app never makes Shelly feel like failing.",
  ].join("\n"));

  // Append daily variation / rotation rules
  sections.push([
    "DAILY VARIATION — NOT EVERY ITEM EVERY DAY:",
    "",
    "IF ACTIVITY CONFIGS ARE PROVIDED (see ACTIVITY CONFIGS section above), use those as the source of truth:",
    '- "daily" frequency → every day',
    '- "3x" frequency → 3 days/week (e.g., MWF)',
    '- "2x" frequency → 2 days/week (e.g., TTh)',
    '- "1x" frequency → 1 day/week',
    '- "as-needed" frequency → optional, include if time allows',
    "- Activity configs include exact names, times, and sort order. Use those instead of the defaults below.",
    "",
    "FALLBACK DEFAULTS (when no activity configs exist):",
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
    "EXAMPLE ROTATION (using block order):",
    "Monday: Formation → Read-Aloud+Handwriting → Choice(both) → GATB Reading → GATB Math → Sight Words → Knowledge Mine",
    "Tuesday: Formation → Read-Aloud+Handwriting → Choice(both) → GATB Reading → GATB Math → Memory Card → Fluency Practice",
    "Wednesday: Formation → Read-Aloud+Handwriting → Choice(both) → GATB Reading → GATB Math → Sight Words",
    "Thursday: Formation → Read-Aloud+Handwriting → Choice(both) → GATB Reading → GATB Math → Memory Card → Knowledge Mine",
    "Friday (light): Formation → Read-Aloud+Handwriting → Choice(one) → GATB Reading → GATB Math",
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
    "- Part of Block 2 (readaloud) — paired with handwriting",
    '- Labeled clearly: "Read Aloud: [Book Title] — Chapter [N]"',
    "- Include the chapter question in the item's contentGuide field",
    "- Duration: 15-20m (reading + discussion)",
    '- Use subjectBucket: "Reading", itemType: "readaloud", block: "readaloud"',
    "",
    "Example item:",
    '{',
    '  "title": "Read Aloud: Narnia Ch 6",',
    '  "estimatedMinutes": 20,',
    '  "subjectBucket": "Reading",',
    '  "category": "must-do",',
    '  "mvdEssential": false,',
    '  "skipGuidance": null,',
    '  "block": "readaloud",',
    '  "contentGuide": "Read chapter 6 aloud. Discussion question: Why did Edmund keep Narnia a secret?"',
    '}',
  ].join("\n"));

  // Append content guide instructions for workbook items
  sections.push([
    "CONTENT GUIDES:",
    "For workbook-based checklist items, include a \"contentGuide\" field with:",
    "- What lesson/content to cover today (based on recent scans or workbook position)",
    "- Whether this is review, frontier, or new material",
    "- A brief note on what Shelly should watch for",
    "",
    "Example:",
    '{',
    '  "title": "Good and the Beautiful reading",',
    '  "estimatedMinutes": 30,',
    '  "subjectBucket": "Reading",',
    '  "contentGuide": "Continue from lesson 53. Content: multisyllable words — this is Lincoln\'s frontier. Watch for him breaking words into parts.",',
    '  "skipGuidance": null',
    '}',
    "",
    "If you don't know the exact lesson number (no scan data), say:",
    '"contentGuide": "Continue where you left off. Current focus area: [skill from Skill Snapshot]."',
    "",
    "Keep contentGuide to 1-2 sentences. Shelly reads this on her phone while teaching.",
    "For routine items (Prayer, Handwriting, etc.) set contentGuide to null.",
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
