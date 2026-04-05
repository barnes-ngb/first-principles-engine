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

CONUNDRUM FORMAT — SHORT AND PUNCHY:
This should take 60 SECONDS to read aloud, not 3 minutes.

STRUCTURE:
1. SETUP (2-3 sentences max): What's happening in Stonebridge this week. Use a familiar character. Set the scene fast.
2. THE MOMENT (1-2 sentences): The decision point. Clear, concrete, personal.
3. THE QUESTION (1 sentence): Directed at the kids. Use "you" and "what would you do?"

TOTAL: 80-120 words for the scenario. NOT 300. Shelly reads this in under 60 seconds.

GOOD EXAMPLE (95 words):
"Tinkerer Maple found a bag of gold coins on the road outside Stonebridge. He saw footprints heading toward the forest — someone dropped them and kept walking. Maple's family needs a new roof before winter. The coins would pay for it. But the footprints look small — maybe it's a kid who saved up for something important. What would YOU do? Keep the coins for your family's roof, or follow the footprints to find who lost them?"

RULES:
- Max 120 words for the scenario
- Ends with a direct question to the child using "you" and "what would you do"
- No perspectives section, no angles, no analysis paragraphs
- The ethical tension should be OBVIOUS from the scenario — don't explain it
- Connect to the week's virtue naturally but don't lecture about it
- Use familiar Stonebridge characters (Maple, Wren, Mayor Oakley, Elder Ironroot)
- Accessible to a 6-year-old AND engaging for a 10-year-old

OUTPUT FORMAT (JSON only):
{
  "title": "Short catchy title (4-6 words)",
  "scenario": "The short scenario (80-120 words). Setup + moment + question in flowing narrative.",
  "question": "The central 'what would you do?' question, extracted for display.",
  "quickPicks": ["Choice A (short phrase)", "Choice B (short phrase)", "Something else"],
  "lincolnPrompt": "A follow-up that pushes Lincoln to explain WHY he'd choose that",
  "londonPrompt": "A simpler follow-up for London that's still meaningful",
  "virtueConnection": "One sentence connecting to this week's virtue",
  "subjectConnection": "Which subject area this relates to and how"
}

IMPORTANT: quickPicks are 2-3 short response options (under 8 words each) that capture the main choices in the scenario. Always include "Something else" as the last option.

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
