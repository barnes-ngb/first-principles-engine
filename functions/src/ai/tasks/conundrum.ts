import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { CHARTER_PREAMBLE } from "../contextSlices.js";

/**
 * Task: conundrum
 * Context: CHARTER_PREAMBLE (direct import) + week focus + recent subjects + child ages
 *          Family-level generator, not child-specific — does not use buildContextForTask
 * Model: Sonnet
 */

export const handleConundrum = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, apiKey } = ctx;
  const model = modelForTask("conundrum" as never);

  // Load week focus (theme, virtue, scripture, heartQuestion)
  let weekTheme = "";
  let weekVirtue = "";
  let weekScripture = "";
  let weekHeartQuestion = "";
  try {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diff = day; // Sunday is 0, so diff=0 on Sunday, diff=1 on Monday, etc.
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - diff);
    const weekKey = sunday.toISOString().slice(0, 10);

    const weeksSnap = await db
      .collection(`families/${familyId}/weeks`)
      .where("startDate", "==", weekKey)
      .limit(1)
      .get();

    if (!weeksSnap.empty) {
      const weekData = weeksSnap.docs[0].data();
      weekTheme = weekData.theme ?? "";
      weekVirtue = weekData.virtue ?? "";
      weekScripture = weekData.scriptureRef ?? "";
      weekHeartQuestion = weekData.heartQuestion ?? "";
    }
  } catch (err) {
    console.warn("[conundrum] Failed to load week focus:", err);
  }

  // Load recent subjects from last week's day logs
  const recentSubjects = new Set<string>();
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startStr = sevenDaysAgo.toISOString().slice(0, 10);

    const daysSnap = await db
      .collection(`families/${familyId}/days`)
      .where("date", ">=", startStr)
      .limit(50)
      .get();

    for (const doc of daysSnap.docs) {
      const d = doc.data();
      const checklist = (d.checklist ?? []) as Array<{ subjectBucket?: string }>;
      for (const item of checklist) {
        if (item.subjectBucket) recentSubjects.add(item.subjectBucket);
      }
    }
  } catch (err) {
    console.warn("[conundrum] Failed to load recent subjects:", err);
  }

  // Load child profiles for age context
  let childAges = `${childData.name} (age unknown)`;
  try {
    const childrenSnap = await db
      .collection(`families/${familyId}/children`)
      .get();
    childAges = childrenSnap.docs
      .map((doc) => {
        const d = doc.data();
        return `${d.name}${d.grade ? ` (${d.grade})` : ""}`;
      })
      .join(", ");
  } catch (err) {
    console.warn("[conundrum] Failed to load children:", err);
  }

  const systemPrompt = `${CHARTER_PREAMBLE}

You generate Conundrums for the Barnes family homeschool. A Conundrum is an open-ended scenario that has NO single right answer. It's designed for a family discussion between Lincoln (10) and London (6) with Shelly moderating.

CONUNDRUM DESIGN PRINCIPLES:
- Based on real-world situations, simplified for kids
- Multiple valid perspectives — no "correct" answer
- Encourages constructive disagreement
- Connects to something they're currently learning (see context)
- Accessible to a 6-year-old AND engaging for a 10-year-old
- Takes 10-15 minutes of family discussion
- Includes a faith/virtue angle that connects to the weekly virtue (see context)

OUTPUT FORMAT (JSON only):
{
  "title": "Short catchy title (4-6 words)",
  "scenario": "2-3 paragraph scenario describing the situation. Written at a level a 6-year-old can follow when read aloud. Include named characters and a specific dilemma.",
  "question": "The central question to discuss. One sentence.",
  "angles": [
    "Perspective 1 — a valid argument for one approach",
    "Perspective 2 — a valid argument for a different approach",
    "Perspective 3 — a valid argument for a third approach (optional)"
  ],
  "lincolnPrompt": "A follow-up question specifically for Lincoln that pushes deeper thinking",
  "londonPrompt": "A simpler follow-up for London that's still meaningful",
  "virtueConnection": "One sentence connecting the conundrum to this week's virtue",
  "subjectConnection": "Which subject area this relates to and how"
}

Respond ONLY with valid JSON. No markdown, no preamble.`;

  const userMessage = `Generate one conundrum for this week.

WEEK CONTEXT:
- Theme: ${weekTheme || "(none set)"}
- Virtue: ${weekVirtue || "(none set)"}
- Scripture: ${weekScripture || "(none set)"}
- Heart Question: ${weekHeartQuestion || "(none set)"}
- Children: ${childAges}
- Recent subjects studied: ${Array.from(recentSubjects).join(", ") || "(no data)"}`;

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 2048,
    systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  await logAiUsage(db, familyId, {
    childId,
    taskType: "conundrum",
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
