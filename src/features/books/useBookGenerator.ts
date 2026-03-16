import { useCallback, useState } from 'react'
import { addDoc } from 'firebase/firestore'

import { useAI } from '../../core/ai/useAI'
import type { TaskType } from '../../core/ai/useAI'
import { booksCollection } from '../../core/firebase/firestore'
import type { Book, BookPage, PageImage } from '../../core/types/domain'
import type { SubjectBucket } from '../../core/types/enums'
import { generateImageId, generatePageId } from './bookTypes'

export interface GenerationProgress {
  phase: 'writing' | 'illustrating' | 'saving' | 'done' | 'error'
  currentPage: number
  totalPages: number
  message: string
  /** URL of the most recently completed illustration (for preview) */
  lastImageUrl?: string
}

interface StoryPage {
  pageNumber: number
  text: string
  sceneDescription: string
  wordsOnPage?: string[]
}

interface StoryResult {
  title: string
  pages: StoryPage[]
}

export function useBookGenerator() {
  const { chat, generateImage } = useAI()
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [generating, setGenerating] = useState(false)

  const generateBook = useCallback(
    async (
      familyId: string,
      childId: string,
      storyIdea: string,
      words: string[],
      style: string,
      pageCount: number,
    ): Promise<string | null> => {
      setGenerating(true)

      // Phase 1: Generate story text
      setProgress({
        phase: 'writing',
        currentPage: 0,
        totalPages: pageCount,
        message: 'Writing your story...',
      })

      const storyResult = await chat({
        familyId,
        childId,
        taskType: 'generateStory' as TaskType,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ storyIdea, words, pageCount }),
          },
        ],
      })

      if (!storyResult?.message) {
        setProgress({
          phase: 'error',
          currentPage: 0,
          totalPages: 0,
          message: 'Failed to generate story',
        })
        setGenerating(false)
        return null
      }

      let story: StoryResult
      try {
        const cleaned = storyResult.message.replace(/```json|```/g, '').trim()
        story = JSON.parse(cleaned)
      } catch {
        setProgress({
          phase: 'error',
          currentPage: 0,
          totalPages: 0,
          message: 'Failed to parse story — please try again',
        })
        setGenerating(false)
        return null
      }

      // Phase 2: Generate illustrations for each page
      const illustratedPages: BookPage[] = []
      const illustrationStyle = `book-illustration-${style}` as
        | 'book-illustration-minecraft'
        | 'book-illustration-storybook'
        | 'book-illustration-comic'
        | 'book-illustration-realistic'

      for (let i = 0; i < story.pages.length; i++) {
        const page = story.pages[i]
        setProgress({
          phase: 'illustrating',
          currentPage: i + 1,
          totalPages: story.pages.length,
          message: `Illustrating page ${i + 1} of ${story.pages.length}...`,
          lastImageUrl:
            illustratedPages.length > 0
              ? illustratedPages[illustratedPages.length - 1].images[0]?.url
              : undefined,
        })

        let images: PageImage[] = []

        if (page.sceneDescription) {
          try {
            const imgResult = await generateImage({
              familyId,
              prompt: page.sceneDescription,
              style: illustrationStyle,
              size: '1024x1024',
            })

            if (imgResult) {
              images = [
                {
                  id: generateImageId(),
                  url: imgResult.url,
                  storagePath: imgResult.storagePath,
                  type: 'ai-generated',
                  prompt: page.sceneDescription,
                },
              ]
            }
          } catch {
            console.warn(`Illustration failed for page ${i + 1}`)
          }
        }

        illustratedPages.push({
          id: generatePageId(),
          pageNumber: i + 1,
          text: page.text,
          images,
          layout: images.length > 0 ? 'image-top' : 'text-only',
          sightWordsOnPage: page.wordsOnPage ?? [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }

      // Phase 3: Save to Firestore
      setProgress({
        phase: 'saving',
        currentPage: 0,
        totalPages: 0,
        message: 'Saving your book...',
      })

      const now = new Date().toISOString()
      const coverUrl = illustratedPages[0]?.images[0]?.url ?? undefined

      const newBook: Omit<Book, 'id'> = {
        childId,
        title: story.title,
        coverImageUrl: coverUrl,
        coverStyle: style as Book['coverStyle'],
        pages: illustratedPages,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['LanguageArts' as SubjectBucket],
        bookType: 'generated',
        source: 'ai-generated',
        sightWords: words.length > 0 ? words : undefined,
        generationConfig: {
          storyIdea,
          words,
          style,
          pageCount,
        },
      }

      try {
        const docRef = await addDoc(booksCollection(familyId), newBook as Book)

        setProgress({
          phase: 'done',
          currentPage: 0,
          totalPages: 0,
          message: 'Your book is ready!',
          lastImageUrl: coverUrl,
        })
        setGenerating(false)
        return docRef.id
      } catch (err) {
        console.error('Failed to save generated book:', err)
        setProgress({
          phase: 'error',
          currentPage: 0,
          totalPages: 0,
          message: 'Failed to save book',
        })
        setGenerating(false)
        return null
      }
    },
    [chat, generateImage],
  )

  const resetProgress = useCallback(() => {
    setProgress(null)
  }, [])

  return { generateBook, progress, generating, resetProgress }
}
