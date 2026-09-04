import { useCallback } from 'react'

import { useAI, TaskType } from '../../core/ai/useAI'

import {
  classifyStoryGenerationFailure,
  storyGenerationFailureMessage,
  StoryGenerationFailure,
  type StoryFailureSurface,
} from './storyGenerationFailure'
import type { StoryReadabilityNote } from './storyPracticeWords'

export interface GeneratedStory {
  title: string
  pages: Array<{
    pageNumber: number
    text: string
    sightWordsOnPage: string[]
  }>
  /**
   * The words the model says it used. **The server calls this `allWordsUsed`**
   * (`chat.ts` builds that key into the story JSON it asks for); this client
   * type has always called it `allSightWordsUsed`, and the parse was a bare
   * cast, so on a real reply the field was simply **absent** — a lie the type
   * told, and the one that let a `.length` read crash the preview (Codex P1,
   * PR #1748). `normalizeStory` below now fills it from either key and
   * defaults it to `[]`, so the type is true of every value that leaves here.
   *
   * It remains the model's own CLAIM. Nothing that has to be right may read it
   * — the requested list is `wordList`, and which words actually landed is
   * measured against the page text (UX-119).
   */
  allSightWordsUsed: string[]
  missedWords: string[]
  /**
   * What the server measured the finished story at (FEAT-176). `generateStory`
   * has always returned it on this path too; this hook simply threw it away, so
   * a story the server measured as above the child's level was previewed with
   * no honest line at all (UX-117). Absent means "not measured", never "fine".
   */
  readability?: StoryReadabilityNote
}

/**
 * What Create a Sight Word Story reports when the call comes back without a
 * story — the same three named failures the Generate chat gives, in this
 * screen's own words (UX-112/117).
 */
export const SIGHT_WORD_STORY_SURFACE: StoryFailureSurface = {
  subject: 'The story',
  kept: 'your words are still here',
  retryLabel: 'Make the story',
  shorten: 'Try fewer pages',
  cutShortEnd: 'the last page',
}

/**
 * The story as it actually arrives: every field optional, and the used-words
 * list under either name. A cast cannot make an absent key present, so the
 * parse is typed for what the wire really carries and `normalizeStory` is the
 * one place that turns it into a `GeneratedStory`.
 */
interface RawGeneratedStory {
  title?: string
  pages?: Array<{
    pageNumber?: number
    text?: string
    /** The server's name for the per-page list (`chat.ts` asks for this key). */
    wordsOnPage?: string[]
    /** The name this client's own type uses. Accepted so a fixture still reads. */
    sightWordsOnPage?: string[]
  }>
  /** The server's name for it. */
  allWordsUsed?: string[]
  /** The name this client has always used. Accepted so a fixture still reads. */
  allSightWordsUsed?: string[]
  missedWords?: string[]
}

/**
 * Is this parsed value actually a story? (Codex P1, PR #1749.)
 *
 * Valid JSON that is not a story — `{}`, or `{"error": "..."}` — is truthy, so
 * a truthiness check let it through; normalizing it then produced a preview
 * with an empty title and no pages, and the screen's "Finish book" would
 * happily persist that as a `status: 'complete'` book. A reply we cannot read
 * as a story belongs on the Unreadable failure path, which already says so
 * honestly and keeps the parent's words.
 *
 * The bar is deliberately the minimum that makes a book: at least one page
 * carrying text. A missing title is survivable — it defaults, and the editor
 * can rename — but a book with no words in it is not a book.
 */
function isUsableStory(raw: RawGeneratedStory | null): raw is RawGeneratedStory {
  if (!raw || !Array.isArray(raw.pages) || raw.pages.length === 0) return false
  return raw.pages.some((p) => (p?.text ?? '').trim() !== '')
}

/** Fill in what the wire may omit, so the exported type is true of the result. */
function normalizeStory(raw: RawGeneratedStory): GeneratedStory {
  return {
    title: raw.title ?? '',
    pages: (raw.pages ?? []).map((p, i) => ({
      pageNumber: p.pageNumber ?? i + 1,
      text: p.text ?? '',
      // The server emits `wordsOnPage`; this client's type calls it
      // `sightWordsOnPage`. Reading only the client name silently replaced a
      // populated list with `[]` — and this value is persisted and then used by
      // the reader to record each word's `seen` interaction, so a book made
      // here would have logged zero sight-word encounters (Codex P1, PR #1749).
      // `useBookGenerator` and `useBookGenerateChat` already map it this way.
      sightWordsOnPage: p.wordsOnPage ?? p.sightWordsOnPage ?? [],
    })),
    allSightWordsUsed: raw.allWordsUsed ?? raw.allSightWordsUsed ?? [],
    missedWords: raw.missedWords ?? [],
  }
}

export function useStoryGenerator() {
  const { chat, loading, error } = useAI()

  const generateStory = useCallback(async (
    familyId: string,
    childId: string,
    sightWords: string[],
    theme: string,
    pageCount?: number,
  ): Promise<GeneratedStory> => {
    // Every failure below leaves the screen unchanged and throws a message the
    // caller shows (UX-117). Before this the parse ran outside any `try` and
    // `handleGenerate` had no `catch`, so a reply cut short by the output
    // budget — the exact failure Shelly hit twice — became an unhandled
    // rejection: the button un-spun and nothing on the page said a word.
    let result: { message?: string; stopReason?: string; readability?: StoryReadabilityNote } | null =
      null
    try {
      result = await chat({
        familyId,
        childId,
        taskType: TaskType.GenerateStory,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            sightWords,
            theme,
            pageCount: pageCount ?? 10,
          }),
        }],
      })
    } catch {
      throw new Error(
        storyGenerationFailureMessage(StoryGenerationFailure.NoReply, SIGHT_WORD_STORY_SURFACE),
      )
    }

    let story: RawGeneratedStory | null = null
    if (result?.message) {
      try {
        // Clean up any markdown fences before parsing.
        const cleaned = result.message.replace(/```json|```/g, '').trim()
        story = JSON.parse(cleaned) as RawGeneratedStory
      } catch {
        story = null
      }
    }
    if (!isUsableStory(story)) {
      // `null`, not `story`: the classifier treats any truthy parsed value as a
      // success and returns `null`, so handing it a `{}` that we have just
      // rejected would throw away the reply's own `stopReason` and call a
      // cut-short reply unreadable.
      throw new Error(
        storyGenerationFailureMessage(
          classifyStoryGenerationFailure(result, null) ?? StoryGenerationFailure.Unreadable,
          SIGHT_WORD_STORY_SURFACE,
        ),
      )
    }
    // The measurement rides on the reply, not inside the story JSON.
    return { ...normalizeStory(story), readability: result?.readability }
  }, [chat])

  return { generateStory, loading, error }
}
