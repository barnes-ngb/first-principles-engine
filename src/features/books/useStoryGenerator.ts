import { useCallback } from 'react'

import { useAI, TaskType } from '../../core/ai/useAI'

export interface GeneratedStory {
  title: string
  pages: Array<{
    pageNumber: number
    text: string
    sightWordsOnPage: string[]
  }>
  allSightWordsUsed: string[]
  missedWords: string[]
}

export function useStoryGenerator() {
  const { chat, loading, error } = useAI()

  const generateStory = useCallback(async (
    familyId: string,
    childId: string,
    sightWords: string[],
    theme: string,
    pageCount?: number,
  ): Promise<GeneratedStory | null> => {
    const result = await chat({
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

    if (!result?.message) return null

    // Parse the JSON story — clean up any markdown fences
    const cleaned = result.message.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned) as GeneratedStory
  }, [chat])

  return { generateStory, loading, error }
}
