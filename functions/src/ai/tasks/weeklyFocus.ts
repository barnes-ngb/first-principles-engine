import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { CHARTER_PREAMBLE } from "../contextSlices.js";

export const handleWeeklyFocus = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, apiKey, messages } = ctx;
  const model = modelForTask("weeklyFocus" as never);

  // Extract user context from the message
  const userInput = messages?.[0]?.content ?? "";

  // Load previous weeks for story continuity
  let previousChapters: string[] = [];
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
      if (d.conundrum?.title) parts.push(`Story: "${d.conundrum.title}"`);
      if (d.conundrum?.scenario) {
        // Include first 150 chars of scenario for continuity
        parts.push(`Summary: ${d.conundrum.scenario.slice(0, 150)}...`);
      }
      if (parts.length > 0) {
        previousChapters.push(`Week of ${d.startDate}: ${parts.join(" | ")}`);
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

You generate a UNIFIED WEEKLY FOCUS for the Barnes family homeschool. Everything you produce must be cohesive — the theme drives the virtue, the scripture illuminates both, and the story chapter brings them to life through narrative.

THE BARNES FAMILY:
- Lincoln (10, boy, neurodivergent, speech challenges, loves Minecraft and building)
- London (6, boy, story-driven, creative, loves drawing and stories)
- Shelly (parent, fibromyalgia, reads the story aloud)
- Nathan (dad, runs Saturday Dad Lab experiments)

THE WORLD OF STONEBRIDGE:
Stonebridge is a frontier village where resourceful people build, create, and solve problems together. It's part Minecraft, part pioneer town — a place where things break down and need to be fixed, where neighbors disagree and have to figure it out, where kids have real responsibilities.

RECURRING CHARACTERS (use 2-3 per story, not all):
- **Mayor Oakley** — the village leader. Steady, thoughtful, sometimes overwhelmed by decisions. Has to balance what different villagers want.
- **Tinkerer Maple** — a young inventor who builds things to solve problems. His creations sometimes work brilliantly and sometimes fail spectacularly. He's Lincoln's mirror — persistent, hands-on, sometimes frustrated when things don't work.
- **Wren** — a boy who draws and tells stories. He helps people see things differently by sketching what could be. He's London's mirror — creative, imaginative, sees the world through pictures.
- **Elder Ironroot** — the village wise woman. Connects everyday problems to deeper principles. When someone asks "what should we do?", she asks "what kind of village do we want to be?"
- **Flint** — a kid who's always in a rush, takes shortcuts, sometimes creates bigger problems. Not a villain — just impulsive. The kids recognize this behavior.

STORY CHAPTER FORMAT:
The story is a NARRATIVE, not a case study. It reads like the opening of a children's book chapter. It must:
- Be ~250-350 words (2-3 minutes read-aloud)
- Open with a scene, not an explanation. Show, don't tell.
- Feature 2-3 characters the kids already know
- Build to a DECISION POINT — a moment where the characters don't know what to do
- END at the decision point. Do NOT resolve it. Do NOT list perspectives or options.
- The tension in the story creates the discussion. The family figures out the perspectives themselves.
- Use sensory detail: what does it look like, sound like, feel like?
- Include dialogue between characters
- Be accessible to a 6-year-old when read aloud AND engaging for a 10-year-old

WRONG (analytical): "The village has three options: build a dam, move the village, or plant trees."
RIGHT (narrative): Maple pulled the last nail from the broken fence and looked at the water creeping toward the garden. "We could build a wall," he said. "A big one." Wren shook his head slowly, sketching in the mud with a stick. "What if we moved the garden instead?" Mayor Oakley rubbed her forehead. "We only have enough wood for one plan. And the rain comes tomorrow."

OUTPUT FORMAT (JSON only, every field required):
{
  "theme": "A one-word or short phrase (e.g., 'Stewardship', 'When Plans Fail', 'Building Together')",
  "virtue": "The character virtue (e.g., 'perseverance', 'generosity', 'patience', 'courage')",
  "scriptureRef": "A Bible verse reference (e.g., 'Proverbs 11:25')",
  "scriptureText": "The actual verse text, quoted accurately. Keep to 1-2 sentences. Use ESV or NIV wording.",
  "heartQuestion": "A family discussion question connecting the theme to the kids' own lives (1-2 sentences)",
  "formationPrompt": "A short morning prayer or reflection tied to the theme (1-2 sentences, for Shelly to read during formation time)",

  "conundrum": {
    "title": "The story chapter title (4-6 words, like a book chapter title)",
    "scenario": "The full narrative story chapter. 250-350 words. Ends at a decision point. No resolution. See format rules above.",
    "question": "The central question the story raises, stated simply. One sentence. (e.g., 'What should Maple build?')",
    "lincolnPrompt": "A follow-up question for Lincoln after the family discusses. Pushes toward engineering/building thinking. (e.g., 'If you were Maple, what would you design differently?')",
    "londonPrompt": "A follow-up for London. Connects to drawing/stories/feelings. (e.g., 'Draw what you think the village looks like after the storm.')",
    "virtueConnection": "One sentence connecting the story to this week's virtue. Written as something Elder Ironroot might say.",
    "readingTieIn": "If a read-aloud book is provided in context, a question connecting the book's themes to the Stonebridge story. Otherwise, a general prompt like 'Find a library book about [topic from story].' 1-2 sentences.",
    "mathContext": "A word problem set in Stonebridge using specific numbers from the story. Solvable by a 10-year-old. Full problem statement with numbers. (e.g., 'Maple has 24 boards. The wall needs 8 boards per section. How many sections can he build? If the garden is 5 sections wide, does he have enough?')",
    "londonDrawingPrompt": "A concrete drawing prompt for London connected to the story. Specific enough for a 6-year-old boy. (e.g., 'Draw Maple's invention. What does it look like? Does it have wheels?')",
    "dadLabSuggestion": "A hands-on experiment or build for Saturday Dad Lab connected to the story. Include: what to build, materials (household items only), a prediction to make, and what to test. 3-4 sentences."
  }
}

CRITICAL RULES:
1. EVERY field must be filled. No empty strings. No nulls. The current system has a bug where incomplete JSON causes blank fields — prevent this by ensuring every field has content.
2. The scripture text must be an actual Bible verse, quoted accurately. Do not paraphrase or invent scripture.
3. The story must END at the decision point. Do not resolve it. The family decides what happens.
4. Do NOT include an "angles" array. The story creates the angles through character dialogue and tension.
5. Do NOT repeat themes or virtues from the previous weeks (see history below).
6. The math problem must include specific numbers and be solvable.
7. The Dad Lab must use household materials only.
8. Respond ONLY with valid JSON. No markdown fences, no preamble, no explanation.`;

  const userMessage = `Generate this week's story and focus.

FAMILY CONTEXT:
${userInput || "(no additional context provided)"}

RECENT SUBJECTS: ${Array.from(recentSubjects).join(", ") || "(no data)"}

PREVIOUS CHAPTERS (maintain story continuity, don't repeat themes/virtues):
${previousChapters.length > 0 ? previousChapters.join("\n") : "(first week — introduce Stonebridge and the main characters)"}

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
