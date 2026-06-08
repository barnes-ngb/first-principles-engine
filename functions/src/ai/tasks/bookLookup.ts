import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { CHARTER_PREAMBLE } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../sanitizeJson.js";

/**
 * Task: bookLookup
 * Given a raw chapter-book title (optionally a child name/age for an
 * age-pitched summary), returns the corrected title + author, chapter count,
 * a book-level summary, best-effort per-chapter titles/summaries, and whether
 * a well-known film adaptation exists. Used to pre-fill the "Add a new book"
 * form in Plan My Week (parent surface only). Web search is enabled with a
 * small budget for accuracy on chapter counts / lesser-known titles.
 * Context: CHARTER_PREAMBLE + raw title + optional child name/age
 * Model: Sonnet
 */

interface BookLookupChapter {
  number: number;
  title?: string;
  summary?: string;
}

interface BookLookupOutput {
  title: string;
  author: string;
  totalChapters: number;
  summary?: string;
  chapters?: BookLookupChapter[];
  movie?: { exists: boolean; title?: string; notes?: string };
}

export const handleBookLookup = async (
  ctx: ChatTaskContext,
): Promise<ChatTaskResult> => {
  const { db, familyId, childId, childData, messages, apiKey } = ctx;
  const model = modelForTask("bookLookup" as never);

  // Parse input from the user message
  let rawTitle = "";
  let childName = childData.name;
  let childAge = "";

  try {
    const userMsg = messages[messages.length - 1]?.content ?? "{}";
    const input = sanitizeAndParseJson<{
      title?: string;
      childName?: string;
      childAge?: string | number;
    }>(userMsg);
    rawTitle = (input.title ?? "").trim();
    if (input.childName) childName = input.childName;
    if (input.childAge != null) childAge = String(input.childAge);
  } catch {
    // Fall through — will validate rawTitle below
  }

  if (!rawTitle) {
    throw new Error("A book title is required to look it up.");
  }

  console.log(`[bookLookup] Starting lookup`, { rawTitle, childId, childName });

  const audience = childName
    ? `${childName}${childAge ? `, age ${childAge}` : ""}`
    : "a young child";

  const systemPrompt = `${CHARTER_PREAMBLE}

You are helping a homeschooling parent add a chapter book to their read-aloud
library. Given a (possibly misspelled or partial) book title, identify the book
and return accurate metadata.

The read-aloud audience is ${audience}, so pitch the book summary at that level.

Rules:
- Correct the spelling and return the canonical title and the author's full name.
- "totalChapters" = the actual number of chapters in the book. Be accurate — the
  parent will generate one discussion question per chapter from this count.
- "summary" = 2-4 sentences describing the book, pitched for the audience above.
- For "chapters", provide per-chapter "title" and a 1-2 sentence "summary" when you
  know them. Best-effort only: OMIT a chapter's title or summary (or omit chapters
  entirely) rather than inventing details you are unsure of.
- "movie" = whether a well-known film adaptation exists. If it does, set
  exists:true, give the film "title", and 1-2 sentences in "notes" on notable
  book-vs-film differences. If no well-known adaptation exists, set exists:false.
- If you cannot identify the book at all, return your best guess for title/author
  with totalChapters:0 and a brief summary noting the uncertainty.

Return ONLY a single JSON object, no prose, no code fences:
{"title": "...", "author": "...", "totalChapters": N, "summary": "...",
 "chapters": [{"number": 1, "title": "...", "summary": "..."}],
 "movie": {"exists": true, "title": "...", "notes": "..."}}`;

  const result = await callClaude({
    apiKey,
    model,
    maxTokens: 4096,
    systemPrompt,
    messages: [{ role: "user", content: `Look up this book: ${rawTitle}` }],
    webSearch: { maxUses: 2 },
  });

  // Validate the response parses to an object with at least a title.
  try {
    const parsed = sanitizeAndParseJson<BookLookupOutput>(result.text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Response is not a JSON object");
    }
    if (!parsed.title) {
      throw new Error("Response missing title");
    }
    // Re-serialize to ensure clean JSON in the response
    result.text = JSON.stringify(parsed);
    console.log(`[bookLookup] Success`, {
      rawTitle,
      resolvedTitle: parsed.title,
      author: parsed.author,
      totalChapters: parsed.totalChapters,
      chaptersReturned: parsed.chapters?.length ?? 0,
      movieExists: parsed.movie?.exists ?? false,
    });
  } catch (err) {
    console.error("[bookLookup] Failed to parse response", {
      rawTitle,
      childId,
      error: String(err),
      responsePreview: result.text.substring(0, 200),
    });
    throw new Error("Couldn't read the book details. Please type them in.");
  }

  console.log(`[AI] taskType=bookLookup inputTokens=${result.inputTokens} outputTokens=${result.outputTokens} stopReason=${result.stopReason}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "bookLookup",
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
