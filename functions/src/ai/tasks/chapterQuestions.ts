import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { CHARTER_PREAMBLE } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../sanitizeJson.js";

/**
 * Task: chapterQuestions
 * Generates one discussion question per chapter for a family read-aloud book.
 * Context: CHARTER_PREAMBLE + book/chapter info + child age + optional week theme/virtue
 * Model: Sonnet
 */

interface ChapterInput {
  number: number;
  title?: string;
  summary?: string;
}

interface ChapterQuestionOutput {
  chapter: number;
  questionType: string;
  question: string;
}

export const handleChapterQuestions = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;
  const model = modelForTask("chapterQuestions" as never);

  // Parse input from the user message
  let bookTitle = "";
  let author = "";
  let chapters: ChapterInput[] = [];
  let childName = childData.name;
  let childAge = "";
  let weekTheme = "";
  let weekVirtue = "";

  try {
    const userMsg = messages[messages.length - 1]?.content ?? "{}";
    const input = sanitizeAndParseJson<{
      bookTitle?: string;
      author?: string;
      chapters?: ChapterInput[];
      childName?: string;
      childAge?: string | number;
      weekTheme?: string;
      weekVirtue?: string;
    }>(userMsg);

    bookTitle = input.bookTitle ?? "";
    author = input.author ?? "";
    chapters = input.chapters ?? [];
    if (input.childName) childName = input.childName;
    childAge = String(input.childAge ?? "");
    weekTheme = input.weekTheme ?? "";
    weekVirtue = input.weekVirtue ?? "";
  } catch {
    // Fall through — will use defaults or empty values
  }

  // If no week context provided, try loading from current week
  if (!weekTheme || !weekVirtue) {
    try {
      const now = new Date();
      const day = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - day);
      const weekKey = sunday.toISOString().slice(0, 10);

      const weeksSnap = await db
        .collection(`families/${familyId}/weeks`)
        .where("startDate", "==", weekKey)
        .limit(1)
        .get();

      if (!weeksSnap.empty) {
        const weekData = weeksSnap.docs[0].data();
        if (!weekTheme) weekTheme = weekData.theme ?? "";
        if (!weekVirtue) weekVirtue = weekData.virtue ?? "";
      }
    } catch (err) {
      console.warn("[chapterQuestions] Failed to load week focus:", err);
    }
  }

  // If no child age provided, try loading from child profile
  if (!childAge) {
    try {
      const childDoc = await db
        .collection(`families/${familyId}/children`)
        .doc(childId)
        .get();
      if (childDoc.exists) {
        const data = childDoc.data();
        childAge = String(data?.grade ?? data?.age ?? "");
      }
    } catch (err) {
      console.warn("[chapterQuestions] Failed to load child profile:", err);
    }
  }

  const chapterList = chapters
    .map((ch) => {
      let line = `- Chapter ${ch.number}`;
      if (ch.title) line += `: ${ch.title}`;
      if (ch.summary) line += ` — ${ch.summary}`;
      return line;
    })
    .join("\n");

  const systemPrompt = `${CHARTER_PREAMBLE}

You are generating discussion questions for a family read-aloud book.

Book: ${bookTitle} by ${author}
Child: ${childName}${childAge ? `, age ${childAge}` : ""}
${weekTheme ? `Family theme this week: ${weekTheme}` : ""}
${weekVirtue ? `Virtue focus: ${weekVirtue}` : ""}

Generate ONE discussion question for each of these chapters:
${chapterList}

Rules:
- Age-appropriate language${childAge ? ` for a ${childAge}-year-old` : ""}
- Vary questionType across: comprehension, application, connection, opinion, prediction
- Never use the same questionType two chapters in a row
- When possible, connect questions to the family virtue
- Keep questions conversational — these are parent-child discussions, not tests
- Each question should be 1-2 sentences

Return ONLY a JSON array, no prose, no code fences:
[{"chapter": 1, "questionType": "comprehension", "question": "..."}, ...]`;

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 4096,
    systemPrompt,
    messages: [{ role: "user", content: `Generate discussion questions for all ${chapters.length} chapters.` }],
  });

  // Validate the response is a valid JSON array
  try {
    const parsed = sanitizeAndParseJson<ChapterQuestionOutput[]>(result.text);
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not an array");
    }
    // Re-serialize to ensure clean JSON in the response
    result.text = JSON.stringify(parsed);
  } catch (err) {
    console.warn("[chapterQuestions] Failed to parse response, returning raw:", err);
    // Return raw text — caller can handle parse errors
  }

  await logAiUsage(db, familyId, {
    childId,
    taskType: "chapterQuestions",
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
