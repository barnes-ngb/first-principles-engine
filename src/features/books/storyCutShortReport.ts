/**
 * A story reply cut short by the output budget reaches the error log as its
 * SHAPE (UX-455).
 *
 * The owner's *"this keeps coming up"* arrived as a screenshot, because a
 * cut-short story was a handled failure — a banner on screen and nothing in any
 * sink — so nobody could say how often, on which door, or at what length. This
 * is the one path from that failure to the handled-error sink (`UX-276`'s
 * `ErrorSource.Handled`), and it carries only what makes the next report a
 * count: which story call, how many pages, how many practice words, and the
 * stop reason the server reported. **Never** the idea, a page, a word, the
 * child's name or the model's text — the note is built from numbers and two
 * closed vocabularies, so there is nothing in it to scrub.
 */
import { ErrorSource, reportError } from '../../core/observability'
import { classifyStoryGenerationFailure, StoryGenerationFailure } from './storyGenerationFailure'
import type { StoryReplyShape } from './storyGenerationFailure'

/** The story calls the client makes — the server's task names. */
export const StoryCallTask = {
  GenerateStory: 'generateStory',
  ReviseStory: 'reviseStory',
  RevisePage: 'revisePage',
} as const
export type StoryCallTask = (typeof StoryCallTask)[keyof typeof StoryCallTask]

export interface StoryCutShortShape {
  task: StoryCallTask
  /** Pages the call was sized for (a page revise is 1). */
  pageCount: number
  /** Practice words sent with the call (0 for a revise, which sends none). */
  wordCount: number
  /** The stop reason the server reported; `undefined` from an older deploy. */
  stopReason: string | undefined
}

/** Server stop reasons this note may print — anything else reads `other`. */
const KNOWN_STOP_REASONS = new Set(['max_tokens', 'end_turn', 'stop_sequence', 'refusal', 'unknown'])

function count(n: number): number {
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0
}

/** The one-line note — numbers and closed vocabularies only. */
export function storyCutShortNote(shape: StoryCutShortShape): string {
  const stop =
    shape.stopReason === undefined
      ? 'unreported'
      : KNOWN_STOP_REASONS.has(shape.stopReason)
        ? shape.stopReason
        : 'other'
  return (
    `story reply cut short (task=${shape.task} pages=${count(shape.pageCount)}` +
    ` words=${count(shape.wordCount)} stopReason=${stop})`
  )
}

/**
 * Report the reply when — and only when — the shared classifier reads it as cut
 * short. Returns whether it reported, so a caller's test can assert the gate.
 */
export function reportStoryIfCutShort(
  result: StoryReplyShape | null | undefined,
  parsed: unknown,
  shape: Omit<StoryCutShortShape, 'stopReason'>,
): boolean {
  if (classifyStoryGenerationFailure(result, parsed) !== StoryGenerationFailure.CutShort) {
    return false
  }
  void reportError({
    name: 'StoryReplyCutShort',
    message: storyCutShortNote({ ...shape, stopReason: result?.stopReason }),
    stack: null,
    route: typeof window !== 'undefined' ? window.location.pathname : null,
    section: `books-${shape.task}`,
    source: ErrorSource.Handled,
  })
  return true
}
