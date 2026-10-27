import type { ChatTaskContext, ChatTaskResult } from "../chatTypes.js";
import { callClaude, logAiUsage } from "../chatTypes.js";
import { modelForTask } from "../chat.js";
import { resolveEffortForTask } from "../models.js";
import { CHARTER_PREAMBLE } from "../contextSlices.js";
import { sanitizeAndParseJson } from "../../shared/sanitizeJson.js";

/**
 * Task: bookLookup
 * Given a raw chapter-book title (optionally a child name/age for an
 * age-pitched summary), returns the corrected title + author, chapter count,
 * a book-level summary, best-effort per-chapter titles/summaries, and whether
 * a well-known film adaptation exists. Used to pre-fill the "Add a new book"
 * form in Plan My Week (parent surface only). Web search is enabled with a
 * small budget for accuracy on chapter counts / lesser-known titles.
 * Context: CHARTER_PREAMBLE + raw title + optional child name/age
 * Model: Sonnet, at LOW effort (UX-464)
 *
 * A long book's per-chapter titles AND summaries are a long reply, and at the
 * default (high) effort the thinking spent the same 4,096 `max_tokens`, so the
 * reply could stop before its closing brace. Two answers (UX-464):
 *   - the call runs at LOW effort, with an 8,192 ceiling (a ceiling, not a
 *     spend: ~60 chapters × ~50 tokens of title + summary is ~3k visible);
 *   - a reply that still stops at `max_tokens` is NEVER parsed as if whole. The
 *     lookup is asked ONCE more in a smaller shape — chapter titles only, no
 *     per-chapter summaries — and the result says so (`chapterSummariesOmitted`)
 *     so the form can tell the parent. Retrying the same shape would stop at the
 *     same place; saving a cut-short list would leave a book with fewer chapters
 *     than it has. If the smaller shape is cut short too, the lookup fails with
 *     the existing "type them in" sentence.
 * The chapter LIST the form saves is built from `totalChapters`, not from this
 * reply's `chapters` array, so a shorter array costs titles, never chapters —
 * and the form names that gap too (`ChapterBookPicker`).
 */

/** The stop reason the Messages API reports when the output budget ran out. */
const MAX_TOKENS_STOP_REASON = "max_tokens";

/** Output ceiling per lookup call (see the header). */
const BOOK_LOOKUP_MAX_TOKENS = 8192;

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
  /**
   * Set when the full reply was cut short and the lookup re-ran asking for
   * chapter titles only (UX-464). Added by this handler, never by the model.
   */
  chapterSummariesOmitted?: boolean;
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

  const fullChaptersRule = `- For "chapters", provide per-chapter "title" and a 1-2 sentence "summary" when you
  know them. Best-effort only: OMIT a chapter's title or summary (or omit chapters
  entirely) rather than inventing details you are unsure of.`;
  const titlesOnlyChaptersRule = `- For "chapters", provide per-chapter "title" ONLY — no per-chapter summary — when
  you know it. Best-effort only: OMIT a chapter's title (or omit chapters entirely)
  rather than inventing one you are unsure of.`;

  const buildSystemPrompt = (chaptersRule: string) => `${CHARTER_PREAMBLE}

You are helping a homeschooling parent add a chapter book to their read-aloud
library. Given a (possibly misspelled or partial) book title, identify the book
and return accurate metadata.

The read-aloud audience is ${audience}, so pitch the book summary at that level.

Rules:
- Correct the spelling and return the canonical title and the author's full name.
- "totalChapters" = the actual number of chapters in the book. Be accurate — the
  parent will generate one discussion question per chapter from this count.
- "summary" = 2-4 sentences describing the book, pitched for the audience above.
${chaptersRule}
- "movie" = whether a well-known film adaptation exists. If it does, set
  exists:true, give the film "title", and 1-2 sentences in "notes" on notable
  book-vs-film differences. If no well-known adaptation exists, set exists:false.
- If you cannot identify the book at all, return your best guess for title/author
  with totalChapters:0 and a brief summary noting the uncertainty.

Return ONLY a single JSON object, no prose, no code fences:
{"title": "...", "author": "...", "totalChapters": N, "summary": "...",
 "chapters": [{"number": 1, "title": "...", "summary": "..."}],
 "movie": {"exists": true, "title": "...", "notes": "..."}}`;

  const effort = resolveEffortForTask("bookLookup");
  const lookup = (systemPrompt: string) =>
    callClaude({
      apiKey,
      model,
      maxTokens: BOOK_LOOKUP_MAX_TOKENS,
      systemPrompt,
      messages: [{ role: "user", content: `Look up this book: ${rawTitle}` }],
      webSearch: { maxUses: 2 },
      effort,
    });

  let result = await lookup(buildSystemPrompt(fullChaptersRule));
  let inputTokens = result.inputTokens;
  let outputTokens = result.outputTokens;
  let chapterSummariesOmitted = false;
  if (result.stopReason === MAX_TOKENS_STOP_REASON) {
    console.warn("[bookLookup] Full reply stopped at max_tokens; retrying titles only", {
      rawTitle,
      childId,
      outputTokens: result.outputTokens,
    });
    result = await lookup(buildSystemPrompt(titlesOnlyChaptersRule));
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    chapterSummariesOmitted = true;
  }

  // Validate the response parses to an object with at least a title.
  try {
    if (result.stopReason === MAX_TOKENS_STOP_REASON) {
      // Never parse a cut-short reply as if it were whole.
      throw new Error("Response stopped at max_tokens");
    }
    const parsed = sanitizeAndParseJson<BookLookupOutput>(result.text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Response is not a JSON object");
    }
    if (!parsed.title) {
      throw new Error("Response missing title");
    }
    if (chapterSummariesOmitted) {
      parsed.chapterSummariesOmitted = true;
      if (parsed.chapters) {
        parsed.chapters = parsed.chapters.map(({ number, title }) => ({
          number,
          ...(title ? { title } : {}),
        }));
      }
    } else {
      delete parsed.chapterSummariesOmitted;
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
      chapterSummariesOmitted,
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

  console.log(`[AI] taskType=bookLookup inputTokens=${inputTokens} outputTokens=${outputTokens} effort=${effort ?? "default"} stopReason=${result.stopReason} chapterSummariesOmitted=${chapterSummariesOmitted}`);

  await logAiUsage(db, familyId, {
    childId,
    taskType: "bookLookup",
    model,
    inputTokens,
    outputTokens,
  });

  return {
    message: result.text,
    model,
    usage: { inputTokens, outputTokens },
    stopReason: result.stopReason,
  };
};
