import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { CHARTER_PREAMBLE } from "../contextSlices.js";

export const handleWeeklyFocus = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, apiKey, messages } = ctx;
  const model = modelForTask("weeklyFocus" as never);

  // Extract user context from the message (read-aloud book, subjects, notes)
  const userInput = messages?.[0]?.content ?? "";

  // Load previous weeks' themes/conundrums for continuity
  const previousWeeks: string[] = [];
  try {
    const weeksSnap = await db
      .collection(`families/${familyId}/weeks`)
      .orderBy("startDate", "desc")
      .limit(4)
      .get();

    for (const doc of weeksSnap.docs) {
      const d = doc.data();
      const parts: string[] = [];
      if (d.theme) parts.push(`Theme: ${d.theme}`);
      if (d.virtue) parts.push(`Virtue: ${d.virtue}`);
      if (d.conundrum?.title) parts.push(`Conundrum: ${d.conundrum.title}`);
      if (parts.length > 0) {
        previousWeeks.push(`${d.startDate}: ${parts.join(", ")}`);
      }
    }
  } catch (err) {
    console.warn("[weeklyFocus] Failed to load previous weeks:", err);
  }

  // Load recent subjects
  const recentSubjects = new Set<string>();
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const daysSnap = await db
      .collection(`families/${familyId}/days`)
      .where("date", ">=", sevenDaysAgo.toISOString().slice(0, 10))
      .limit(50)
      .get();

    for (const doc of daysSnap.docs) {
      const d = doc.data();
      for (const item of (d.checklist ?? []) as Array<{
        subjectBucket?: string;
      }>) {
        if (item.subjectBucket) recentSubjects.add(item.subjectBucket);
      }
    }
  } catch (err) {
    console.warn("[weeklyFocus] Failed to load recent subjects:", err);
  }

  const systemPrompt = `${CHARTER_PREAMBLE}

You generate a UNIFIED WEEKLY FOCUS for the Barnes family homeschool. Everything you produce must be cohesive — the theme drives the virtue, the virtue connects to the scripture, the conundrum explores the theme through a real-world scenario, and all the weekly connections tie back to the conundrum world.

THE BARNES FAMILY:
- Lincoln (10, boy, neurodivergent, speech challenges, loves Minecraft)
- London (6, boy, story-driven, creative, loves drawing and stories)
- Shelly (parent, fibromyalgia, runs the weekday routine)
- Nathan (dad, runs Saturday Dad Lab experiments)

RECURRING CHARACTERS:
The conundrum scenarios should feature a recurring cast of characters that the kids recognize week to week. These characters live in a frontier village called "Stonebridge" — a place that's part Minecraft, part real-world, where the villagers face new challenges each week. The kids become invested in what happens to these people over time.

Core characters:
- **Mayor Oakley** — the village leader who has to make hard decisions
- **Tinkerer Maple** — an inventor who builds things to solve problems (Lincoln's analog)
- **Story Keeper Wren** — a young girl who draws and tells stories to help people understand (London's analog)
- **Elder Ironroot** — the wise advisor who connects problems to bigger principles (faith/virtue voice)

Not every character appears every week. Pick 2-3 that fit the scenario. The kids should feel like they're advising Stonebridge — "What should Mayor Oakley do?"

OUTPUT FORMAT (JSON only):
{
  "theme": "A one-word or short phrase theme (e.g., 'Stewardship', 'Courage Under Pressure', 'Building Together')",
  "virtue": "The character virtue to focus on this week (e.g., 'perseverance', 'generosity', 'honesty')",
  "scriptureRef": "A Bible verse reference connected to the theme/virtue (book chapter:verse)",
  "scriptureText": "The actual verse text (keep short — 1-2 sentences max)",
  "heartQuestion": "A family discussion question that connects the theme to the kids' own lives",
  "formationPrompt": "A short daily prayer/reflection prompt connected to the theme (1-2 sentences, suitable for morning formation time)",

  "conundrum": {
    "title": "Short catchy title (4-6 words)",
    "scenario": "2-3 paragraph scenario set in Stonebridge. Written at a level a 6-year-old can follow when read aloud. Feature 2-3 of the recurring characters facing a specific dilemma.",
    "question": "The central question to discuss. One sentence.",
    "angles": [
      "Perspective 1 — a valid argument for one approach",
      "Perspective 2 — a valid argument for a different approach",
      "Perspective 3 — optional third perspective"
    ],
    "lincolnPrompt": "A follow-up question for Lincoln that pushes deeper thinking — connects to building/engineering/problem-solving",
    "londonPrompt": "A simpler follow-up for London — connects to stories/drawing/feelings",
    "virtueConnection": "How this conundrum connects to the week's virtue",
    "readingTieIn": "A question connecting the family's read-aloud book to the conundrum theme (or a general reading connection if no book specified)",
    "mathContext": "A word problem set in the Stonebridge world, with specific numbers, appropriate for a 10-year-old",
    "londonDrawingPrompt": "A concrete drawing prompt for London connected to the scenario (e.g., 'Draw Stonebridge before and after the storm')",
    "dadLabSuggestion": "A hands-on experiment or build for Saturday Dad Lab that tests the conundrum's central question. Include materials (household items), prediction, and what to test. 3-4 sentences."
  }
}

CRITICAL RULES:
- Everything connects. The theme → virtue → scripture → conundrum → connections must form ONE coherent thread.
- DO NOT repeat themes/virtues from recent weeks (see history below).
- The conundrum scenario must be set in Stonebridge with the recurring characters.
- The math problem must use specific numbers and be solvable by a 10-year-old.
- The Dad Lab must use household materials only.
- The drawing prompt must be concrete enough for a 6-year-old boy.
- Respond ONLY with valid JSON. No markdown, no preamble.`;

  const userMessage = `Generate a unified weekly focus for this week.

CONTEXT:
${userInput}

RECENT SUBJECTS: ${Array.from(recentSubjects).join(", ") || "(no data)"}

PREVIOUS WEEKS (don't repeat these themes/virtues):
${previousWeeks.length > 0 ? previousWeeks.join("\n") : "(first week)"}

Today's date: ${new Date().toLocaleDateString()}`;

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 4096,
    systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  await logAiUsage(db, familyId, {
    childId,
    taskType: "weeklyFocus",
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
