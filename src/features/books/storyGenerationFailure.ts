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
 * Kid-and-parent-readable copy, one per failure. Each names what failed, says
 * nothing was lost, and gives the next step that fits *that* failure — a story
 * that ran out of room wants a shorter book; a reply that never arrived wants
 * the connection checked and a plain retry.
 */
export const STORY_GENERATION_FAILURE_MESSAGES: Readonly<
  Record<StoryGenerationFailure, string>
> = {
  [StoryGenerationFailure.NoReply]:
    "The story didn't come back — it may not have reached the story writer, or the connection dropped on the way. Nothing was lost: your idea is still here. Check your connection and tap \"Yes, start my story!\" again.",
  [StoryGenerationFailure.CutShort]:
    'The story came back too long to finish — it ran out of room before the last page. Nothing was lost: your idea is still here. Try a Short book, then tap "Yes, start my story!" again.',
  [StoryGenerationFailure.Unreadable]:
    "The story came back in a shape I couldn't read. Nothing was lost: your idea is still here. Tap \"Yes, start my story!\" again — a second try usually works.",
}

export function storyGenerationFailureMessage(kind: StoryGenerationFailure): string {
  return STORY_GENERATION_FAILURE_MESSAGES[kind]
}
