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

    let story: GeneratedStory | null = null
    if (result?.message) {
      try {
        // Clean up any markdown fences before parsing.
        const cleaned = result.message.replace(/```json|```/g, '').trim()
        story = JSON.parse(cleaned) as GeneratedStory
      } catch {
        story = null
      }
    }
    if (!story) {
      throw new Error(
        storyGenerationFailureMessage(
          classifyStoryGenerationFailure(result, story) ?? StoryGenerationFailure.Unreadable,
          SIGHT_WORD_STORY_SURFACE,
        ),
      )
    }
    // The measurement rides on the reply, not inside the story JSON.
    return { ...story, readability: result?.readability }
  }, [chat])

  return { generateStory, loading, error }
}
