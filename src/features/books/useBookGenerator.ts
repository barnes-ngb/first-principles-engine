import { useCallback, useRef, useState } from 'react'
import { addDoc } from 'firebase/firestore'

import { useAI } from '../../core/ai/useAI'
import type { TaskType } from '../../core/ai/useAI'
import { booksCollection } from '../../core/firebase/firestore'
import type { Book, BookPage, BookTheme } from '../../core/types'
import type { SubjectBucket } from '../../core/types/enums'
import { ART_QUOTA_MESSAGE } from '../business/useArtQuota'
import { generatePageId } from './bookTypes'
import {
  classifyStoryGenerationFailure,
  storyGenerationFailureMessage,
  STORY_GUIDE_SURFACE,
} from './storyGenerationFailure'
import { useBookIllustrator } from './useBookIllustrator'

/**
 * Infer a BookTheme from the story idea text, sight words list, and style.
 * Simple keyword matching — no AI call needed.
 */
export function inferBookTheme(storyIdea: string, words: string[], style: string): BookTheme {
  if (words.length > 0) return 'sight_words'

  const text = (storyIdea + ' ' + style).toLowerCase()

  if (
    text.includes('minecraft') ||
    text.includes('creeper') ||
    text.includes('cave') ||
    text.includes('nether') ||
    text.includes('enderman') ||
    text.includes('pickaxe') ||
    text.includes('diamond') ||
    text.includes('crafting')
  ) return 'minecraft'

  if (
    text.includes('animal') ||
    text.includes('dog') ||
    text.includes('cat') ||
    text.includes('bunny') ||
    text.includes('rabbit') ||
    text.includes('bear') ||
    text.includes('lion') ||
    text.includes('horse') ||
    text.includes('pig') ||
    text.includes('bird') ||
    text.includes('fish') ||
    text.includes('fox') ||
    text.includes('deer') ||
    text.includes('whale') ||
    text.includes('elephant')
  ) return 'animals'

  if (
    text.includes('dragon') ||
    text.includes('fairy') ||
    text.includes('wizard') ||
    text.includes('magic') ||
    text.includes('princess') ||
    text.includes('castle') ||
    text.includes('unicorn') ||
    text.includes('enchant') ||
    text.includes('potion')
  ) return 'fantasy'

  if (
    text.includes('adventure') ||
    text.includes('quest') ||
    text.includes('hero') ||
    text.includes('journey') ||
    text.includes('explore') ||
    text.includes('mission') ||
    text.includes('treasure') ||
    text.includes('sword') ||
    text.includes('knight')
  ) return 'adventure'

  if (
    text.includes('family') ||
    text.includes('mom') ||
    text.includes('dad') ||
    text.includes('brother') ||
    text.includes('sister') ||
    text.includes('grandma') ||
    text.includes('grandpa')
  ) return 'family'

  if (
    text.includes('science') ||
    text.includes('robot') ||
    text.includes('space') ||
    text.includes('planet') ||
    text.includes('experiment') ||
    text.includes('lab')
  ) return 'science'

  if (
    text.includes('faith') ||
    text.includes('god') ||
    text.includes('jesus') ||
    text.includes('prayer') ||
    text.includes('bible') ||
    text.includes('church')
  ) return 'faith'

  return 'other'
}

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
  const { chat } = useAI()
  const { illustrate } = useBookIllustrator()
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [generating, setGenerating] = useState(false)
  /**
   * The named failure from the run that just finished (UX-112), readable the
   * instant `generateBook` resolves. A ref rather than state because the caller
   * needs it in the same tick it sees the `null` return — a state read there is
   * the previous render's value, and the alternative (an effect watching
   * `progress`) is a setState-in-effect the lint rules reject.
   */
  const lastErrorRef = useRef<string | null>(null)

  /** Record an error progress and remember its message for the caller. */
  const failWith = useCallback((message: string) => {
    lastErrorRef.current = message
    setProgress({ phase: 'error', currentPage: 0, totalPages: 0, message })
    setGenerating(false)
  }, [])

  const generateBook = useCallback(
    async (
      familyId: string,
      childId: string,
      storyIdea: string,
      words: string[],
      style: string,
      pageCount: number,
      bookTheme?: BookTheme,
      attribution?: { createdBy: 'parent' | string; createdFor: string },
    ): Promise<string | null> => {
      setGenerating(true)
      // A run starts with no failure, so a null return can never be explained
      // by the previous run's message.
      lastErrorRef.current = null

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
            content: JSON.stringify({ storyIdea, words, pageCount, theme: bookTheme }),
          },
        ],
      })

      // The same three failure shapes the Generate chat names, named here too
      // (UX-112) — "Failed to generate story" / "Failed to parse story" told a
      // parent neither which failure happened nor what to do about it.
      let story: StoryResult | null = null
      if (storyResult?.message) {
        try {
          const cleaned = storyResult.message.replace(/```json|```/g, '').trim()
          story = JSON.parse(cleaned) as StoryResult
        } catch {
          story = null
        }
      }
      if (!story) {
        failWith(
          storyGenerationFailureMessage(
            classifyStoryGenerationFailure(storyResult, story) ?? 'unreadable',
            STORY_GUIDE_SURFACE,
          ),
        )
        return null
      }

      // Phase 2: Save book with TEXT ONLY immediately
      // This ensures the book is persisted before the long illustration phase,
      // which can take 50-80 seconds and may cause Android WebView to suspend.
      setProgress({
        phase: 'saving',
        currentPage: 0,
        totalPages: story.pages.length,
        message: 'Saving your story...',
      })

      const now = new Date().toISOString()
      const textOnlyPages: BookPage[] = story.pages.map((page, i) => ({
        id: generatePageId(),
        pageNumber: i + 1,
        text: page.text,
        images: [],
        layout: 'text-only' as const,
        sightWordsOnPage: page.wordsOnPage ?? [],
        createdAt: now,
        updatedAt: now,
      }))

      const inferredTheme = bookTheme ?? inferBookTheme(storyIdea, words, style)

      const newBook: Omit<Book, 'id'> = {
        childId: attribution?.createdFor ?? childId,
        title: story.title,
        coverStyle: style as Book['coverStyle'],
        pages: textOnlyPages,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['LanguageArts' as SubjectBucket],
        bookType: 'generated',
        source: 'ai-generated',
        theme: inferredTheme,
        createdBy: attribution?.createdBy ?? childId,
        createdFor: attribution?.createdFor ?? childId,
        // Only include optional fields when they have values — Firestore rejects undefined
        ...(words.length > 0 ? { sightWords: words } : {}),
        generationConfig: {
          storyIdea: storyIdea || '',
          words,
          style,
          theme: inferredTheme,
          pageCount,
        },
      }

      let bookId: string
      try {
        const docRef = await addDoc(booksCollection(familyId), newBook as Book)
        bookId = docRef.id
      } catch (err) {
        console.error('Failed to save book text:', err)
        // Not a generation failure — the story was written, the shelf write is
        // what broke — so it gets the house shape rather than the classifier's
        // words, and it does NOT claim nothing was lost (UX-112).
        failWith(
          'The story was written, but saving it failed \u2014 it did not reach your shelf. Nothing else changed. Tap "Make my book \u2192" to try again.',
        )
        return null
      }

      // Phase 3: Generate illustrations and UPDATE the saved book as each completes
      const totalPages = story.pages.length
      let lastImageUrl: string | undefined

      const { failedPages, capReached } = await illustrate({
        bookId,
        familyId,
        style,
        bookTheme,
        pages: story.pages.map((p, i) => ({
          pageNumber: i + 1,
          sceneDescription: p.sceneDescription ?? '',
        })),
        onProgress: (p) => {
          if (p.phase === 'illustrating') {
            lastImageUrl = p.lastImageUrl ?? lastImageUrl
            setProgress({
              phase: 'illustrating',
              currentPage: p.currentPage,
              totalPages,
              message: `Making picture ${p.currentPage} of ${totalPages}…`,
              lastImageUrl,
            })
          } else if (p.phase === 'done') {
            lastImageUrl = p.lastImageUrl ?? lastImageUrl
          }
        },
      })

      setProgress({
        phase: 'done',
        currentPage: 0,
        totalPages: 0,
        message:
          // The day's art budget refused the pictures, or ran out part-way
          // (FEAT-168). The story is written and saved either way — only the
          // paid illustrations have a ceiling — so this reads as a nudge to a
          // grown-up, never as a failure, and it points at what still works.
          capReached
            ? `Your story is saved! ${ART_QUOTA_MESSAGE} You can add photos or drawings in the editor.`
            : failedPages.length > 0
              ? `Book made! ${failedPages.length} page${failedPages.length > 1 ? 's' : ''} still need a picture — you can add photos or drawings in the editor.`
              : 'Your book is ready!',
        lastImageUrl,
      })
      setGenerating(false)
      return bookId
    },
    [chat, illustrate, failWith],
  )

  const resetProgress = useCallback(() => {
    setProgress(null)
  }, [])

  /** The named failure from the last run, or `null` if it did not fail. */
  const lastError = useCallback(() => lastErrorRef.current, [])

  return { generateBook, progress, generating, resetProgress, lastError }
}
