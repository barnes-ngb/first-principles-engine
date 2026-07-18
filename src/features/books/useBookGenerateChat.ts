import { useCallback, useEffect, useRef, useState } from 'react'
import { addDoc, doc, getDoc, setDoc } from 'firebase/firestore'

import { useAI } from '../../core/ai/useAI'
import type { TaskType } from '../../core/ai/useAI'
import { booksCollection } from '../../core/firebase/firestore'
import type { Book, BookPage, BookTheme, ChatTurn } from '../../core/types'
import type { SubjectBucket } from '../../core/types/enums'
import { generatePageId } from './bookTypes'
import { inferBookTheme } from './useBookGenerator'
import { clampTargetPageCount } from './storyPageTargets'
import { useBookIllustrator } from './useBookIllustrator'
import type { IllustrationProgress as IllustratorProgress } from './useBookIllustrator'

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
  /**
   * Initial target page count for a fresh draft (FEAT-97). The hook then owns
   * the live value as state — it's hydrated from the saved `generationConfig`
   * when resuming a draft, and driven by the length selector via `setPageCount`.
   */
  initialPageCount: number
  defaultIllustrationStyle: string
  /** Parent attribution to apply when a draft is committed. */
  attribution?: { createdBy: 'parent' | string; createdFor: string }
  /** When set, the hook loads the existing draft from Firestore and continues it. */
  resumeBookId?: string
}

export type ClarificationPhase = 'clarifying' | 'ready'

export type IllustrationProgress = IllustratorProgress

export interface UseBookGenerateChat {
  chatHistory: ChatTurn[]
  currentStory: GeneratedStory | null
  illustrationStyle: string
  isLoading: boolean
  error: string | null
  bookId: string | null

  clarificationPhase: ClarificationPhase
  pendingIdea: string
  pendingRefinement: string | null
  canStartStory: boolean

  /** Live target page count (FEAT-97) — hydrated from a resumed draft. */
  pageCount: number
  setPageCount: (pages: number) => void

  illustrationProgress: IllustrationProgress

  sendKidMessage: (text: string) => Promise<void>
  setIllustrationStyle: (style: string) => void
  commitAndClose: () => Promise<string | null>
  abandonDraft: () => Promise<void>

  confirmStartStory: () => Promise<void>
  confirmAddRefinement: () => Promise<void>
  confirmChangeRefinement: () => Promise<void>
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

const CHAINING_WORDS = new Set([
  'and',
  'or',
  'with',
  'plus',
  'also',
  'but',
  'then',
])

/**
 * Dumb heuristic to combine the kid's prior idea with a refinement they
 * tapped "+ Add it" for. Trims trailing punctuation off the first part,
 * inserts "and" unless the refinement already starts with a chaining word.
 */
export function joinIdeas(a: string, b: string): string {
  const left = a.replace(/[.!?,\s]+$/u, '').trim()
  const right = b.replace(/^\s+/u, '')
  if (!left) return right
  if (!right) return left
  const firstWord = right.split(/\s+/, 1)[0]?.toLowerCase() ?? ''
  const stripped = firstWord.replace(/[^a-z]/gu, '')
  const naturallyChains = CHAINING_WORDS.has(stripped)
  const joined = naturallyChains ? `${left} ${right}` : `${left} and ${right}`
  return joined.replace(/\s{2,}/gu, ' ')
}

function echoMessage(idea: string): string {
  return `Here's what I heard: "${idea}". Want me to start the story?`
}

function echoUpdatedMessage(idea: string): string {
  return `Here's what I heard now: "${idea}". Want me to start the story?`
}

const ADD_OR_CHANGE_FIRST =
  'Should I ADD that to your story, or CHANGE the idea to that?'

const ADD_OR_CHANGE_OVERWRITE =
  "Got it — that's what you want to add now. Should I ADD this to your story, or CHANGE the idea to this?"

// ── Hook ─────────────────────────────────────────────────────────

export function useBookGenerateChat(
  opts: UseBookGenerateChatOptions,
): UseBookGenerateChat {
  const {
    familyId,
    childId,
    childName,
    childAge,
    initialPageCount,
    defaultIllustrationStyle,
    attribution,
    resumeBookId,
  } = opts

  const { chat } = useAI()
  const { illustrate } = useBookIllustrator()

  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [currentStory, setCurrentStory] = useState<GeneratedStory | null>(null)
  const [illustrationStyle, setIllustrationStyle] = useState<string>(
    defaultIllustrationStyle,
  )
  const [bookId, setBookId] = useState<string | null>(resumeBookId ?? null)
  const [pageCount, setPageCount] = useState<number>(initialPageCount)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [clarificationPhase, setClarificationPhase] =
    useState<ClarificationPhase>('clarifying')
  const [pendingIdea, setPendingIdea] = useState<string>('')
  const [pendingRefinement, setPendingRefinement] = useState<string | null>(null)

  const [illustrationProgress, setIllustrationProgress] =
    useState<IllustrationProgress>({
      phase: 'idle',
      currentPage: 0,
      totalPages: 0,
      failedPages: [],
    })

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
        // Restore the saved target page count so a resumed draft generates at the
        // length the user picked, not the reset default (FEAT-97).
        if (typeof data.generationConfig?.pageCount === 'number') {
          setPageCount(clampTargetPageCount(data.generationConfig.pageCount))
        }
        if (state?.chatHistory) setChatHistory(state.chatHistory)
        if (state?.illustrationStyle) setIllustrationStyle(state.illustrationStyle)
        if (state?.clarificationPhase) setClarificationPhase(state.clarificationPhase)
        if (typeof state?.pendingIdea === 'string') setPendingIdea(state.pendingIdea)
        if (state?.pendingRefinement !== undefined) {
          setPendingRefinement(state.pendingRefinement ?? null)
        }
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
          // If we have a story but no explicit phase, we're in "ready" land.
          if (!state?.clarificationPhase) setClarificationPhase('ready')
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

  const persistStory = useCallback(
    async (
      story: GeneratedStory,
      nextHistory: ChatTurn[],
      style: string,
      generateChatState: 'in-progress' | 'completed',
      phase: ClarificationPhase,
      idea: string,
      refinement: string | null,
    ): Promise<string | null> => {
      const now = new Date().toISOString()
      const pages = storyToPages(story)

      if (bookId) {
        const ref = doc(booksCollection(familyId), bookId)
        try {
          const snap = await getDoc(ref)
          if (snap.exists()) {
            const current = snap.data() as Book
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
                clarificationPhase: phase,
                pendingIdea: idea,
                pendingRefinement: refinement,
              },
            })
            return bookId
          }
        } catch (err) {
          console.warn('Failed to update draft book:', err)
        }
      }

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
          storyIdea: idea,
          words: [],
          style,
          pageCount,
        },
        reviewState: {
          generateChatState,
          chatHistory: nextHistory,
          illustrationStyle: style,
          clarificationPhase: phase,
          pendingIdea: idea,
          pendingRefinement: refinement,
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

  /**
   * Persist clarification-phase state to Firestore before any story exists.
   * Once a story exists we go through persistStory instead.
   */
  const persistClarification = useCallback(
    async (
      nextHistory: ChatTurn[],
      style: string,
      phase: ClarificationPhase,
      idea: string,
      refinement: string | null,
    ): Promise<void> => {
      const now = new Date().toISOString()
      if (bookId) {
        const ref = doc(booksCollection(familyId), bookId)
        try {
          const snap = await getDoc(ref)
          if (snap.exists()) {
            const current = snap.data() as Book
            await setDoc(ref, {
              ...current,
              updatedAt: now,
              reviewState: {
                ...(current.reviewState ?? {}),
                generateChatState: 'in-progress',
                chatHistory: nextHistory,
                illustrationStyle: style,
                clarificationPhase: phase,
                pendingIdea: idea,
                pendingRefinement: refinement,
              },
            })
          }
        } catch (err) {
          console.warn('Failed to update draft clarification state:', err)
        }
        return
      }

      const newBook: Omit<Book, 'id'> = {
        childId: attribution?.createdFor ?? childId,
        title: '',
        pages: [],
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
          storyIdea: idea,
          words: [],
          style,
          pageCount,
        },
        reviewState: {
          generateChatState: 'in-progress',
          chatHistory: nextHistory,
          illustrationStyle: style,
          clarificationPhase: phase,
          pendingIdea: idea,
          pendingRefinement: refinement,
        },
      }
      try {
        const ref = await addDoc(booksCollection(familyId), newBook as Book)
        setBookId(ref.id)
      } catch (err) {
        console.error('Failed to create draft clarification book:', err)
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

      // ── Post-story revision branch ──
      if (clarificationPhase === 'ready') {
        const historyWithKid: ChatTurn[] = [...chatHistory, kidTurn]
        setChatHistory(historyWithKid)
        setIsLoading(true)
        setError(null)
        try {
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
                    // Revisions inherit the book's actual length (FEAT-97) — the
                    // revise prompt locks "do not add or remove pages", so the
                    // book's real page count is the source of truth, not the
                    // (now user-adjustable) generation target.
                    pageCount: currentStory?.pages.length ?? pageCount,
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
            kind: 'revision',
          }
          const nextHistory: ChatTurn[] = [...historyWithKid, aiTurn]
          const nextStory =
            parsed.storyUpdated && parsed.updatedStory
              ? parsed.updatedStory
              : currentStory
          setChatHistory(nextHistory)
          if (parsed.storyUpdated && parsed.updatedStory) {
            setCurrentStory(parsed.updatedStory)
          }
          if (nextStory) {
            await persistStory(
              nextStory,
              nextHistory,
              illustrationStyle,
              'in-progress',
              'ready',
              pendingIdea,
              null,
            )
          }
        } finally {
          setIsLoading(false)
        }
        return
      }

      // ── Clarification branch — no AI call ──
      setError(null)

      if (chatHistory.length === 0) {
        // First message ever → echo turn.
        const aiTurn: ChatTurn = {
          role: 'ai',
          content: echoMessage(trimmed),
          ts: Date.now(),
          kind: 'echo',
        }
        const nextHistory: ChatTurn[] = [...chatHistory, kidTurn, aiTurn]
        setChatHistory(nextHistory)
        setPendingIdea(trimmed)
        setPendingRefinement(null)
        await persistClarification(
          nextHistory,
          illustrationStyle,
          'clarifying',
          trimmed,
          null,
        )
        return
      }

      if (pendingRefinement === null) {
        // Kid sent a follow-up during clarification → Add/Change prompt.
        const aiTurn: ChatTurn = {
          role: 'ai',
          content: ADD_OR_CHANGE_FIRST,
          ts: Date.now(),
          kind: 'add-or-change',
        }
        const nextHistory: ChatTurn[] = [...chatHistory, kidTurn, aiTurn]
        setChatHistory(nextHistory)
        setPendingRefinement(trimmed)
        await persistClarification(
          nextHistory,
          illustrationStyle,
          'clarifying',
          pendingIdea,
          trimmed,
        )
        return
      }

      // Kid sent yet another message while Add-or-Change was pending —
      // overwrite the pending refinement and ask again.
      const aiTurn: ChatTurn = {
        role: 'ai',
        content: ADD_OR_CHANGE_OVERWRITE,
        ts: Date.now(),
        kind: 'add-or-change',
      }
      const nextHistory: ChatTurn[] = [...chatHistory, kidTurn, aiTurn]
      setChatHistory(nextHistory)
      setPendingRefinement(trimmed)
      await persistClarification(
        nextHistory,
        illustrationStyle,
        'clarifying',
        pendingIdea,
        trimmed,
      )
    },
    [
      chat,
      chatHistory,
      currentStory,
      clarificationPhase,
      familyId,
      childId,
      childName,
      childAge,
      illustrationStyle,
      pageCount,
      pendingIdea,
      pendingRefinement,
      persistClarification,
      persistStory,
    ],
  )

  // ── Confirm start story (kid taps "Yes, start my story!") ────

  const confirmStartStory = useCallback(async () => {
    if (clarificationPhase !== 'clarifying') return
    if (pendingRefinement !== null) return
    if (!pendingIdea) return

    setIsLoading(true)
    setError(null)
    const priorPhase = clarificationPhase
    setClarificationPhase('ready')
    try {
      const result = await chat({
        familyId,
        childId,
        taskType: 'generateStory' as TaskType,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              storyIdea: pendingIdea,
              words: [],
              pageCount,
              theme: inferBookTheme(pendingIdea, [], illustrationStyle),
            }),
          },
        ],
      })
      if (!result?.message) {
        setError('I had trouble writing that. Try again?')
        setClarificationPhase(priorPhase)
        return
      }
      const story = parseGeneratedStory(result.message)
      if (!story) {
        setError('I had trouble writing that. Try again?')
        setClarificationPhase(priorPhase)
        return
      }
      const aiTurn: ChatTurn = {
        role: 'ai',
        content: `Here's your story! "${story.title}"`,
        ts: Date.now(),
        kind: 'story-draft',
      }
      const nextHistory: ChatTurn[] = [...chatHistory, aiTurn]
      setCurrentStory(story)
      setChatHistory(nextHistory)
      await persistStory(
        story,
        nextHistory,
        illustrationStyle,
        'in-progress',
        'ready',
        pendingIdea,
        null,
      )
    } finally {
      setIsLoading(false)
    }
  }, [
    chat,
    chatHistory,
    clarificationPhase,
    familyId,
    childId,
    illustrationStyle,
    pageCount,
    pendingIdea,
    pendingRefinement,
    persistStory,
  ])

  // ── Confirm add refinement ───────────────────────────────────

  const confirmAddRefinement = useCallback(async () => {
    if (pendingRefinement === null) return
    const joined = joinIdeas(pendingIdea, pendingRefinement)
    const aiTurn: ChatTurn = {
      role: 'ai',
      content: echoUpdatedMessage(joined),
      ts: Date.now(),
      kind: 'echo',
    }
    const nextHistory: ChatTurn[] = [...chatHistory, aiTurn]
    setPendingIdea(joined)
    setPendingRefinement(null)
    setChatHistory(nextHistory)
    await persistClarification(
      nextHistory,
      illustrationStyle,
      'clarifying',
      joined,
      null,
    )
  }, [
    chatHistory,
    illustrationStyle,
    pendingIdea,
    pendingRefinement,
    persistClarification,
  ])

  // ── Confirm change refinement ────────────────────────────────

  const confirmChangeRefinement = useCallback(async () => {
    if (pendingRefinement === null) return
    const next = pendingRefinement
    const aiTurn: ChatTurn = {
      role: 'ai',
      content: echoUpdatedMessage(next),
      ts: Date.now(),
      kind: 'echo',
    }
    const nextHistory: ChatTurn[] = [...chatHistory, aiTurn]
    setPendingIdea(next)
    setPendingRefinement(null)
    setChatHistory(nextHistory)
    await persistClarification(
      nextHistory,
      illustrationStyle,
      'clarifying',
      next,
      null,
    )
  }, [
    chatHistory,
    illustrationStyle,
    pendingRefinement,
    persistClarification,
  ])

  // ── Commit + abandon ─────────────────────────────────────────

  const commitAndClose = useCallback(async (): Promise<string | null> => {
    if (!currentStory) return null
    const finalId = await persistStory(
      currentStory,
      chatHistory,
      illustrationStyle,
      'completed',
      'ready',
      pendingIdea,
      null,
    )
    const resolvedId = finalId ?? bookId
    if (!resolvedId) return null

    const themeId = inferBookTheme(pendingIdea, [], illustrationStyle)

    await illustrate({
      bookId: resolvedId,
      pages: currentStory.pages.map((p) => ({
        pageNumber: p.pageNumber,
        sceneDescription: p.sceneDescription ?? '',
      })),
      style: illustrationStyle,
      bookTheme: themeId,
      familyId,
      onProgress: setIllustrationProgress,
    })

    return resolvedId
  }, [
    currentStory,
    chatHistory,
    illustrationStyle,
    persistStory,
    bookId,
    pendingIdea,
    familyId,
    illustrate,
  ])

  const abandonDraft = useCallback(async (): Promise<void> => {
    // Allowed any time before an AI story-draft turn exists — the kid can
    // bail out of clarification freely. Once a story-draft exists, the draft
    // persists for resumption (no-op here).
    if (currentStory !== null) return
    setChatHistory([])
    setPendingIdea('')
    setPendingRefinement(null)
    setClarificationPhase('clarifying')
    setError(null)
  }, [currentStory])

  const canStartStory =
    clarificationPhase === 'clarifying' &&
    pendingRefinement === null &&
    pendingIdea.trim().length > 0

  return {
    chatHistory,
    currentStory,
    illustrationStyle,
    isLoading,
    error,
    bookId,
    clarificationPhase,
    pendingIdea,
    pendingRefinement,
    canStartStory,
    pageCount,
    setPageCount,
    illustrationProgress,
    sendKidMessage,
    setIllustrationStyle,
    commitAndClose,
    abandonDraft,
    confirmStartStory,
    confirmAddRefinement,
    confirmChangeRefinement,
  }
}
