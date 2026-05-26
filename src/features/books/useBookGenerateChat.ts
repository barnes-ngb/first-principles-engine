import { useCallback, useEffect, useRef, useState } from 'react'
import { addDoc, doc, getDoc, setDoc } from 'firebase/firestore'

import { useAI } from '../../core/ai/useAI'
import type { TaskType } from '../../core/ai/useAI'
import { booksCollection } from '../../core/firebase/firestore'
import type { Book, BookPage, BookTheme, ChatTurn } from '../../core/types'
import type { SubjectBucket } from '../../core/types/enums'
import { generatePageId } from './bookTypes'
import { inferBookTheme } from './useBookGenerator'

// ── Types ────────────────────────────────────────────────────────

export interface GeneratedStoryPage {
  pageNumber: number
  text: string
  sceneDescription: string
  wordsOnPage?: string[]
}

export interface GeneratedStory {
  title: string
  pages: GeneratedStoryPage[]
}

interface ReviseStoryResult {
  humanResponse: string
  storyUpdated: boolean
  updatedStory?: GeneratedStory
  pagesNeedingImageRegen?: number[]
  qualityNotes?: string
}

export interface UseBookGenerateChatOptions {
  familyId: string
  childId: string
  childName: string
  childAge: number
  pageCount: number
  defaultIllustrationStyle: string
  /** Parent attribution to apply when a draft is committed. */
  attribution?: { createdBy: 'parent' | string; createdFor: string }
  /** When set, the hook loads the existing draft from Firestore and continues it. */
  resumeBookId?: string
}

export interface UseBookGenerateChat {
  chatHistory: ChatTurn[]
  currentStory: GeneratedStory | null
  illustrationStyle: string
  isLoading: boolean
  error: string | null
  bookId: string | null

  sendKidMessage: (text: string) => Promise<void>
  setIllustrationStyle: (style: string) => void
  commitAndClose: () => Promise<string | null>
  abandonDraft: () => Promise<void>
}

// ── Helpers ──────────────────────────────────────────────────────

function cleanJson(raw: string): string {
  return raw.replace(/```json|```/g, '').trim()
}

function parseGeneratedStory(raw: string): GeneratedStory | null {
  try {
    const parsed = JSON.parse(cleanJson(raw)) as GeneratedStory
    if (!parsed.title || !Array.isArray(parsed.pages)) return null
    return parsed
  } catch {
    return null
  }
}

function parseReviseResult(raw: string): ReviseStoryResult | null {
  try {
    const parsed = JSON.parse(cleanJson(raw)) as ReviseStoryResult
    if (typeof parsed.humanResponse !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function storyToPages(story: GeneratedStory): BookPage[] {
  const now = new Date().toISOString()
  return story.pages.map((p, i) => ({
    id: generatePageId(),
    pageNumber: i + 1,
    text: p.text,
    images: [],
    layout: 'text-only' as const,
    sightWordsOnPage: p.wordsOnPage ?? [],
    createdAt: now,
    updatedAt: now,
  }))
}

// ── Hook ─────────────────────────────────────────────────────────

export function useBookGenerateChat(
  opts: UseBookGenerateChatOptions,
): UseBookGenerateChat {
  const {
    familyId,
    childId,
    childName,
    childAge,
    pageCount,
    defaultIllustrationStyle,
    attribution,
    resumeBookId,
  } = opts

  const { chat } = useAI()

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [currentStory, setCurrentStory] = useState<GeneratedStory | null>(null)
  const [illustrationStyle, setIllustrationStyle] = useState<string>(
    defaultIllustrationStyle,
  )
  const [bookId, setBookId] = useState<string | null>(resumeBookId ?? null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track whether we've initialized from a resume so we don't keep refetching.
  const initializedRef = useRef(false)

  // Hydrate from Firestore when resuming an existing draft.
  useEffect(() => {
    if (!resumeBookId || initializedRef.current) return
    initializedRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const snap = await getDoc(doc(booksCollection(familyId), resumeBookId))
        if (!snap.exists() || cancelled) return
        const data = snap.data() as Book
        const state = data.reviewState
        if (state?.chatHistory) setChatHistory(state.chatHistory)
        if (state?.illustrationStyle) setIllustrationStyle(state.illustrationStyle)
        // Reconstruct currentStory from persisted pages.
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          setCurrentStory({
            title: data.title ?? '',
            pages: data.pages.map((p) => ({
              pageNumber: p.pageNumber,
              text: p.text ?? '',
              sceneDescription: p.images?.[0]?.prompt ?? '',
              wordsOnPage: p.sightWordsOnPage,
            })),
          })
        }
      } catch (err) {
        console.warn('Failed to resume book draft:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [familyId, resumeBookId])

  // ── Persistence ──────────────────────────────────────────────

  const persist = useCallback(
    async (
      story: GeneratedStory,
      nextHistory: ChatTurn[],
      style: string,
      generateChatState: 'in-progress' | 'completed',
    ): Promise<string | null> => {
      const now = new Date().toISOString()
      const pages = storyToPages(story)

      if (bookId) {
        const ref = doc(booksCollection(familyId), bookId)
        try {
          const snap = await getDoc(ref)
          if (snap.exists()) {
            const current = snap.data() as Book
            // Preserve existing images on pages that already have them; only
            // overwrite pages whose text changed.
            const mergedPages: BookPage[] = pages.map((p, i) => {
              const prior = current.pages?.[i]
              if (!prior) return p
              return {
                ...prior,
                text: p.text,
                sightWordsOnPage: p.sightWordsOnPage,
                updatedAt: now,
              }
            })
            await setDoc(ref, {
              ...current,
              title: story.title,
              pages: mergedPages,
              coverStyle: style as Book['coverStyle'],
              updatedAt: now,
              reviewState: {
                ...(current.reviewState ?? {}),
                generateChatState,
                chatHistory: nextHistory,
                illustrationStyle: style,
              },
            })
            return bookId
          }
        } catch (err) {
          console.warn('Failed to update draft book:', err)
        }
      }

      // First save — create the book doc.
      const newBook: Omit<Book, 'id'> = {
        childId: attribution?.createdFor ?? childId,
        title: story.title,
        coverStyle: style as Book['coverStyle'],
        pages,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        subjectBuckets: ['LanguageArts' as SubjectBucket],
        bookType: 'generated',
        source: 'ai-generated',
        theme: inferBookTheme('', [], style) as BookTheme,
        createdBy: attribution?.createdBy ?? childId,
        createdFor: attribution?.createdFor ?? childId,
        generationConfig: {
          storyIdea: '',
          words: [],
          style,
          pageCount,
        },
        reviewState: {
          generateChatState,
          chatHistory: nextHistory,
          illustrationStyle: style,
        },
      }
      try {
        const ref = await addDoc(booksCollection(familyId), newBook as Book)
        setBookId(ref.id)
        return ref.id
      } catch (err) {
        console.error('Failed to create draft book:', err)
        return null
      }
    },
    [familyId, childId, bookId, attribution, pageCount],
  )

  // ── Send a kid message ───────────────────────────────────────

  const sendKidMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const ts = Date.now()
      const kidTurn: ChatTurn = { role: 'kid', content: trimmed, ts }
      const historyWithKid: ChatTurn[] = [...chatHistory, kidTurn]
      setChatHistory(historyWithKid)
      setIsLoading(true)
      setError(null)

      try {
        // First AI turn → generateStory; subsequent → reviseStory.
        const isFirstTurn = currentStory === null

        if (isFirstTurn) {
          const result = await chat({
            familyId,
            childId,
            taskType: 'generateStory' as TaskType,
            messages: [
              {
                role: 'user',
                content: JSON.stringify({
                  storyIdea: trimmed,
                  words: [],
                  pageCount,
                  theme: inferBookTheme(trimmed, [], illustrationStyle),
                }),
              },
            ],
          })
          if (!result?.message) {
            setError('I had trouble writing that. Try again?')
            return
          }
          const story = parseGeneratedStory(result.message)
          if (!story) {
            setError('I had trouble writing that. Try again?')
            return
          }
          const aiTurn: ChatTurn = {
            role: 'ai',
            content: `Here's your story! "${story.title}"`,
            ts: Date.now(),
          }
          const nextHistory: ChatTurn[] = [...historyWithKid, aiTurn]
          setCurrentStory(story)
          setChatHistory(nextHistory)
          await persist(story, nextHistory, illustrationStyle, 'in-progress')
        } else {
          const result = await chat({
            familyId,
            childId,
            taskType: 'reviseStory' as TaskType,
            messages: [
              {
                role: 'user',
                content: JSON.stringify({
                  chatHistory: historyWithKid.map((t) => ({
                    role: t.role,
                    content: t.content,
                  })),
                  currentStory,
                  childCalibration: {
                    childAge,
                    childName,
                    illustrationStyle,
                    pageCount,
                  },
                  newFeedback: trimmed,
                }),
              },
            ],
          })
          if (!result?.message) {
            setError('I had trouble with that. Try again?')
            return
          }
          const parsed = parseReviseResult(result.message)
          if (!parsed) {
            setError('I had trouble with that. Try again?')
            return
          }
          const aiTurn: ChatTurn = {
            role: 'ai',
            content: parsed.humanResponse,
            ts: Date.now(),
          }
          const nextHistory: ChatTurn[] = [...historyWithKid, aiTurn]
          const nextStory = parsed.storyUpdated && parsed.updatedStory
            ? parsed.updatedStory
            : currentStory
          setChatHistory(nextHistory)
          if (parsed.storyUpdated && parsed.updatedStory) {
            setCurrentStory(parsed.updatedStory)
          }
          if (nextStory) {
            await persist(nextStory, nextHistory, illustrationStyle, 'in-progress')
          }
        }
      } finally {
        setIsLoading(false)
      }
    },
    [
      chat,
      chatHistory,
      currentStory,
      familyId,
      childId,
      childName,
      childAge,
      illustrationStyle,
      pageCount,
      persist,
    ],
  )

  // ── Commit + abandon ─────────────────────────────────────────

  const commitAndClose = useCallback(async (): Promise<string | null> => {
    if (!currentStory) return null
    const finalId = await persist(currentStory, chatHistory, illustrationStyle, 'completed')
    return finalId ?? bookId
  }, [currentStory, chatHistory, illustrationStyle, persist, bookId])

  const abandonDraft = useCallback(async (): Promise<void> => {
    // Only valid before any AI turn has produced a story. After that, the draft
    // persists for resumption — see design doc §5.A.4.
    if (currentStory !== null) return
    // Clear local state. We never persisted a book yet, so nothing to delete.
    setChatHistory([])
    setError(null)
  }, [currentStory])

  return {
    chatHistory,
    currentStory,
    illustrationStyle,
    isLoading,
    error,
    bookId,
    sendKidMessage,
    setIllustrationStyle,
    commitAndClose,
    abandonDraft,
  }
}
