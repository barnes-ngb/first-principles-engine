/**
 * Name the failure when "Generate a Book" (the chat flow) comes back without a
 * story (FEAT-169).
 *
 * Before this, `useBookGenerateChat.confirmStartStory` set the same string —
 * "I had trouble writing that. Try again?" — for two different outcomes: the
 * call returned nothing (network / timeout / a thrown callable) and the story
 * would not parse (a reply cut short by the output budget, or malformed). A
 * parent reading that line could not tell a dropped connection from a story
 * that ran out of room, and neither could we from her screenshot. These are
 * different problems with different next steps, so they get different words.
 *
 * Pure: the classifier reads the callable's reply shape and the parse result
 * and never throws; the copy is in the house shape (FEAT-156 → 162 → 168):
 * what failed, that nothing was lost, what to do.
 */

export const StoryGenerationFailure = {
  /** Nothing usable came back at all — the call threw, timed out, or returned no text. */
  NoReply: 'no-reply',
  /** A reply came back but the output budget ended it before the story did. */
  CutShort: 'cut-short',
  /** A reply came back, complete, but not in a shape we can read as a story. */
  Unreadable: 'unreadable',
} as const
export type StoryGenerationFailure =
  (typeof StoryGenerationFailure)[keyof typeof StoryGenerationFailure]

/** The Messages API stop reason for "hit `max_tokens`" — mirrored from `generateStory.ts`. */
export const MAX_TOKENS_STOP_REASON = 'max_tokens'

/** The subset of the callable's reply this module reads. */
export interface StoryReplyShape {
  message?: string
  /** Reported by `generateStory` since FEAT-169; `undefined` from an older deploy. */
  stopReason?: string
}

function stripFences(raw: string): string {
  return raw.replace(/```json|```/g, '').trim()
}

/**
 * Does this text look like a JSON object that was cut off mid-stream? Used as
 * the fallback signal when the reply carries no `stopReason` (an older deployed
 * function): a story JSON that opens but never closes was cut short, not
 * malformed. A reply that never opened `{` is unreadable, not cut short.
 */
export function looksCutShort(raw: string): boolean {
  const text = stripFences(raw)
  return text.startsWith('{') && !text.endsWith('}')
}

/**
 * Classify why a generateStory round produced no story. Returns `null` when
 * `parsedStory` is present — a story that parsed is a success whatever the
 * stop reason said (the client derives the book from the pages it got).
 */
export function classifyStoryGenerationFailure(
  result: StoryReplyShape | null | undefined,
  parsedStory: unknown,
): StoryGenerationFailure | null {
  if (parsedStory) return null
  if (!result) return StoryGenerationFailure.NoReply
  if (result.stopReason === MAX_TOKENS_STOP_REASON) return StoryGenerationFailure.CutShort
  const message = result.message ?? ''
  if (message.trim().length === 0) return StoryGenerationFailure.NoReply
  if (looksCutShort(message)) return StoryGenerationFailure.CutShort
  return StoryGenerationFailure.Unreadable
}

/**
 * What the reader on ONE surface calls the thing that failed, what is still
 * safe, and the control they tap to try again (UX-112).
 *
 * FEAT-169 wrote three honest messages for the Generate chat and hard-coded
 * that surface's nouns and button into them, so the three sibling paths that
 * make the same call — the chat's revise loop, the Story Guide, the review
 * chat's per-page revise — kept their older, vaguer strings rather than say
 * "tap Yes, start my story!" on a screen with no such button. Naming those
 * four words per surface is what lets all four share one set of messages
 * instead of one honest set and three vague ones.
 */
export interface StoryFailureSurface {
  /** What did not come back, as the reader would name it — "The story". */
  subject: string
  /** What is still safe, as a clause — "your idea is still here". */
  kept: string
  /** The control they tap to try again, named EXACTLY as it appears on screen. */
  retryLabel: string
  /**
   * What to change before retrying a reply that ran out of room — "Try a Short
   * book". `''` on a surface with no length to shorten, which then just says
   * to tap again rather than advise something the screen cannot do.
   */
  shorten: string
  /** What the reply ran out of room before reaching — "the last page". */
  cutShortEnd: string
}

/**
 * The Generate chat's own words — FEAT-169's originals, unchanged. The default,
 * so every existing caller reads exactly as it did.
 */
export const STORY_CHAT_SURFACE: StoryFailureSurface = {
  subject: 'The story',
  kept: 'your idea is still here',
  retryLabel: 'Yes, start my story!',
  shorten: 'Try a Short book',
  cutShortEnd: 'the last page',
}

/** The Generate chat's revise loop: a change to a story that already exists. */
export const STORY_REVISE_SURFACE: StoryFailureSurface = {
  subject: 'The change',
  kept: 'your story is unchanged',
  retryLabel: 'Send',
  shorten: 'Ask for a smaller change',
  cutShortEnd: 'the end',
}

// The Story Guide had a fourth surface here ("your answers are still here",
// retry on "Make my book \u2192"). FEAT-187 retired that wizard \u2014 one "Make a book"
// door, two choices \u2014 so the surface went with its only caller. The three
// below are the live ones.

/** The review chat ("Read it to me"): one page rewritten from a voice note. */
export const PAGE_REVISE_SURFACE: StoryFailureSurface = {
  subject: 'The new page',
  kept: 'your page is unchanged',
  retryLabel: 'Try again',
  shorten: 'Ask for a smaller change',
  cutShortEnd: 'the end',
}

/**
 * Kid-and-parent-readable copy, one per failure. Each names what failed, says
 * nothing was lost, and gives the next step that fits *that* failure — a story
 * that ran out of room wants a shorter book; a reply that never arrived wants
 * the connection checked and a plain retry.
 */
const FAILURE_TEMPLATES: Readonly<
  Record<StoryGenerationFailure, (s: StoryFailureSurface) => string>
> = {
  [StoryGenerationFailure.NoReply]: (s) =>
    `${s.subject} didn't come back \u2014 it may not have reached the story writer, or the connection dropped on the way. Nothing was lost: ${s.kept}. Check your connection and tap "${s.retryLabel}" again.`,
  [StoryGenerationFailure.CutShort]: (s) =>
    `${s.subject} came back too long to finish \u2014 it ran out of room before ${s.cutShortEnd}. Nothing was lost: ${s.kept}. ${
      s.shorten ? `${s.shorten}, then tap` : 'Tap'
    } "${s.retryLabel}" again.`,
  [StoryGenerationFailure.Unreadable]: (s) =>
    `${s.subject} came back in a shape I couldn't read. Nothing was lost: ${s.kept}. Tap "${s.retryLabel}" again \u2014 a second try usually works.`,
}

/**
 * The message for one failure on one surface. Defaults to the Generate chat,
 * so FEAT-169's three strings are byte-identical to what they were.
 */
export function storyGenerationFailureMessage(
  kind: StoryGenerationFailure,
  surface: StoryFailureSurface = STORY_CHAT_SURFACE,
): string {
  return FAILURE_TEMPLATES[kind](surface)
}

/**
 * The Generate chat's three messages, as FEAT-169 published them. Derived from
 * the templates rather than written twice, so a change to the wording cannot
 * leave this behind.
 */
export const STORY_GENERATION_FAILURE_MESSAGES: Readonly<
  Record<StoryGenerationFailure, string>
> = {
  [StoryGenerationFailure.NoReply]: storyGenerationFailureMessage(StoryGenerationFailure.NoReply),
  [StoryGenerationFailure.CutShort]: storyGenerationFailureMessage(StoryGenerationFailure.CutShort),
  [StoryGenerationFailure.Unreadable]: storyGenerationFailureMessage(
    StoryGenerationFailure.Unreadable,
  ),
}
