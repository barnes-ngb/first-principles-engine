import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { useAI } from '../../core/ai/useAI'
import type { TaskType } from '../../core/ai/useAI'
import { booksCollection } from '../../core/firebase/firestore'
import { useTTS } from '../../core/hooks/useTTS'
import type { Book, BookPage } from '../../core/types'
import { useBookIllustrator } from './useBookIllustrator'

// ── Types ────────────────────────────────────────────────────────

/**
 * Per-page review phases (design doc §5.B.2).
 * - idle       page just mounted, TTS not yet started
 * - playing    TTS reading the current page aloud
 * - awaiting   TTS finished, waiting for kid feedback
 * - recording  VoiceInput is capturing feedback (driven by the component)
 * - revising   AI revising the page (revisePage in flight)
 * - completed  all pages reviewed or kid skipped the rest
 */
export type ReviewPhase =
  | 'idle'
  | 'playing'
  | 'awaiting'
  | 'recording'
  | 'revising'
  | 'completed'

export interface RevisePageResult {
  newText: string
  newSceneDescription: string
  wordsOnPage?: string[]
  regenerateImage: 'yes' | 'no'
  qualityNotes?: string
}

export interface UseBookReviewOptions {
  familyId: string
  bookId: string | undefined
  childName: string
  childAge: number
  /** Raw illustration style key for image regen; falls back to book state. */
  illustrationStyle?: string
}

export interface UseBookReview {
  book: Book | null
  currentPageIndex: number
  currentPage: BookPage | null
  totalPages: number
  phase: ReviewPhase
  isLoading: boolean
  error: string | null
  reviewedCount: number
  /** True while an illustration is being regenerated in the background. */
  imageRegenerating: boolean

  playCurrentPage: () => Promise<void>
  approveCurrentPage: () => Promise<void>
  reviseCurrentPage: (feedback: string) => Promise<void>
  skipRemaining: () => Promise<void>
  gotoPage: (index: number) => Promise<void>
  /** Component hook: flip into/out of the recording sub-state. */
  setRecording: (recording: boolean) => void
}

// ── Helpers ──────────────────────────────────────────────────────

function cleanJson(raw: string): string {
  return raw.replace(/```json|```/g, '').trim()
}

export function parseRevisePageResult(raw: string): RevisePageResult | null {
  try {
    const parsed = JSON.parse(cleanJson(raw)) as RevisePageResult
    if (typeof parsed.newText !== 'string') return null
    if (parsed.regenerateImage !== 'yes' && parsed.regenerateImage !== 'no') {
      parsed.regenerateImage = 'no'
    }
    return parsed
  } catch {
    return null
  }
}

/** Scene description for a page lives on its AI image's prompt (set by the illustrator). */
function sceneOf(page: BookPage | null | undefined): string {
  if (!page) return ''
  const ai = page.images?.find((img) => img.type === 'ai-generated')
  return ai?.prompt ?? page.images?.[0]?.prompt ?? ''
}

/** First page index whose pageNumber is not yet in reviewedPages. */
export function firstUnreviewedIndex(
  pages: Pick<BookPage, 'pageNumber'>[],
  reviewedPages: number[],
): number {
  const reviewed = new Set(reviewedPages)
  for (let i = 0; i < pages.length; i++) {
    if (!reviewed.has(pages[i].pageNumber)) return i
  }
  return -1 // every page reviewed
}

// ── Hook ─────────────────────────────────────────────────────────

export function useBookReview(opts: UseBookReviewOptions): UseBookReview {
  const { familyId, bookId, childName, childAge, illustrationStyle } = opts

  const { chat } = useAI()
  const { illustrate } = useBookIllustrator()
  const tts = useTTS()

  const [book, setBook] = useState<Book | null>(null)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [phase, setPhase] = useState<ReviewPhase>('idle')
  const [isLoading, setIsLoading] = useState(!!familyId && !!bookId)
  const [error, setError] = useState<string | null>(null)
  const [imageRegenerating, setImageRegenerating] = useState(false)

  const phaseRef = useRef<ReviewPhase>('idle')
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // ── Load book + compute resume position ─────────────────────────

  const loadBook = useCallback(async (): Promise<Book | null> => {
    if (!familyId || !bookId) return null
    const snap = await getDoc(doc(booksCollection(familyId), bookId))
    if (!snap.exists()) return null
    return { ...(snap.data() as Book), id: snap.id }
  }, [familyId, bookId])

  useEffect(() => {
    if (!familyId || !bookId) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const loaded = await loadBook()
      if (cancelled) return
      if (!loaded) {
        setIsLoading(false)
        return
      }
      setBook(loaded)
      const reviewed = loaded.reviewState?.reviewedPages ?? []
      if (loaded.reviewState?.completedAt) {
        setPhase('completed')
      } else {
        const idx = firstUnreviewedIndex(loaded.pages ?? [], reviewed)
        if (idx === -1) {
          setPhase('completed')
        } else {
          setCurrentPageIndex(idx)
          setPhase('idle')
        }
      }
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [familyId, bookId, loadBook])

  // ── TTS end detection: playing → awaiting when speech finishes ──

  const wasSpeakingRef = useRef(false)
  useEffect(() => {
    if (tts.isSpeaking) {
      wasSpeakingRef.current = true
    } else if (wasSpeakingRef.current) {
      wasSpeakingRef.current = false
      if (phaseRef.current === 'playing') setPhase('awaiting')
    }
  }, [tts.isSpeaking])

  // ── Persistence ─────────────────────────────────────────────────

  const persist = useCallback(
    async (next: Book) => {
      if (!familyId || !bookId) return
      const ref = doc(booksCollection(familyId), bookId)
      const { id, ...data } = next
      void id
      try {
        await setDoc(
          ref,
          { ...data, updatedAt: new Date().toISOString() },
          { merge: true },
        )
      } catch (err) {
        console.warn('Failed to persist review state:', err)
      }
    },
    [familyId, bookId],
  )

  // ── Actions ─────────────────────────────────────────────────────

  const playCurrentPage = useCallback(async () => {
    const page = book?.pages?.[currentPageIndex]
    const text = page?.text ?? ''
    setPhase('playing')
    if (!tts.isSupported || !text) {
      // No speech available — drop straight to awaiting so the flow isn't stuck.
      setPhase('awaiting')
      return
    }
    tts.cancel()
    tts.speak(`Page ${page?.pageNumber ?? currentPageIndex + 1}. ${text}`)
  }, [book, currentPageIndex, tts])

  const advanceOrComplete = useCallback(
    async (updatedBook: Book) => {
      const total = updatedBook.pages?.length ?? 0
      if (currentPageIndex < total - 1) {
        const nextIdx = currentPageIndex + 1
        setCurrentPageIndex(nextIdx)
        // Auto-play the next page.
        const nextPage = updatedBook.pages[nextIdx]
        const text = nextPage?.text ?? ''
        setPhase('playing')
        if (!tts.isSupported || !text) {
          setPhase('awaiting')
        } else {
          tts.cancel()
          tts.speak(`Page ${nextPage.pageNumber}. ${text}`)
        }
      } else {
        const completedBook: Book = {
          ...updatedBook,
          reviewState: {
            ...(updatedBook.reviewState ?? {}),
            completedAt: new Date().toISOString(),
          },
        }
        setBook(completedBook)
        setPhase('completed')
        await persist(completedBook)
      }
    },
    [currentPageIndex, tts, persist],
  )

  const approveCurrentPage = useCallback(async () => {
    if (!book) return
    const page = book.pages?.[currentPageIndex]
    if (!page) return
    tts.cancel()
    const reviewed = new Set(book.reviewState?.reviewedPages ?? [])
    reviewed.add(page.pageNumber)
    const updatedBook: Book = {
      ...book,
      reviewState: {
        ...(book.reviewState ?? {}),
        reviewedPages: [...reviewed].sort((a, b) => a - b),
      },
    }
    setBook(updatedBook)
    await persist(updatedBook)
    await advanceOrComplete(updatedBook)
  }, [book, currentPageIndex, tts, persist, advanceOrComplete])

  const reviseCurrentPage = useCallback(
    async (feedback: string) => {
      if (!book) return
      const idx = currentPageIndex
      const page = book.pages?.[idx]
      if (!page) return
      const trimmed = feedback.trim()
      if (!trimmed) return

      tts.cancel()
      setPhase('revising')
      setError(null)
      try {
        const result = await chat({
          familyId,
          childId: book.childId,
          taskType: 'revisePage' as TaskType,
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                pageNumber: page.pageNumber,
                currentText: page.text ?? '',
                currentSceneDescription: sceneOf(page),
                feedback: trimmed,
                fullStoryContext: {
                  title: book.title,
                  allPages: book.pages.map((p) => ({
                    pageNumber: p.pageNumber,
                    text: p.text ?? '',
                  })),
                  characterNames: [],
                },
                childCalibration: {
                  childAge,
                  childName,
                  sentenceTarget: '',
                  vocabularyLevel: '',
                },
              }),
            },
          ],
        })

        const parsed = result?.message ? parseRevisePageResult(result.message) : null
        if (!parsed) {
          setError('I had trouble changing that page. Try again?')
          setPhase('awaiting')
          return
        }

        const now = new Date().toISOString()
        const revisedSet = new Set(book.reviewState?.revisedPages ?? [])
        revisedSet.add(page.pageNumber)
        const updatedBook: Book = {
          ...book,
          pages: book.pages.map((p, i) => {
            if (i !== idx) return p
            const images = p.images?.length
              ? p.images.map((img, j) =>
                  j === 0 && img.type === 'ai-generated'
                    ? { ...img, prompt: parsed.newSceneDescription }
                    : img,
                )
              : p.images
            return {
              ...p,
              text: parsed.newText,
              ...(parsed.wordsOnPage ? { sightWordsOnPage: parsed.wordsOnPage } : {}),
              images,
              updatedAt: now,
            }
          }),
          reviewState: {
            ...(book.reviewState ?? {}),
            revisedPages: [...revisedSet].sort((a, b) => a - b),
          },
        }
        setBook(updatedBook)
        await persist(updatedBook)

        // Auto-play the revised page so the kid hears the new version.
        const text = parsed.newText
        setPhase('playing')
        if (!tts.isSupported || !text) {
          setPhase('awaiting')
        } else {
          tts.cancel()
          tts.speak(`Page ${page.pageNumber}. ${text}`)
        }

        // Image regen runs in the background — do NOT block the read-back.
        if (parsed.regenerateImage === 'yes') {
          const rawStyle =
            illustrationStyle ??
            updatedBook.reviewState?.illustrationStyle ??
            updatedBook.coverStyle ??
            'storybook'
          setImageRegenerating(true)
          void (async () => {
            try {
              await illustrate({
                bookId: updatedBook.id ?? (bookId as string),
                familyId,
                // Full-length array; only the target index carries a scene so
                // the illustrator regenerates exactly one page.
                pages: updatedBook.pages.map((p, i) => ({
                  pageNumber: p.pageNumber,
                  sceneDescription: i === idx ? parsed.newSceneDescription : '',
                })),
                style: rawStyle,
                ...(updatedBook.theme ? { bookTheme: updatedBook.theme } : {}),
              })
              // Re-read so the new image URL surfaces on the page.
              const refreshed = await loadBook()
              if (refreshed) setBook(refreshed)
            } catch (err) {
              console.warn('Per-page image regen failed:', err)
            } finally {
              setImageRegenerating(false)
            }
          })()
        }
      } catch {
        setError('I had trouble changing that page. Try again?')
        setPhase('awaiting')
      }
    },
    [
      book,
      currentPageIndex,
      tts,
      chat,
      familyId,
      childAge,
      childName,
      persist,
      illustrate,
      illustrationStyle,
      bookId,
      loadBook,
    ],
  )

  const skipRemaining = useCallback(async () => {
    if (!book) {
      setPhase('completed')
      return
    }
    tts.cancel()
    // Do NOT add unreviewed pages to reviewedPages — only mark completion.
    const updatedBook: Book = {
      ...book,
      reviewState: {
        ...(book.reviewState ?? {}),
        completedAt: new Date().toISOString(),
      },
    }
    setBook(updatedBook)
    setPhase('completed')
    await persist(updatedBook)
  }, [book, tts, persist])

  const gotoPage = useCallback(
    async (index: number) => {
      if (!book) return
      const total = book.pages?.length ?? 0
      if (index < 0 || index >= total) return
      tts.cancel()
      setCurrentPageIndex(index)
      setPhase('idle')
      const page = book.pages[index]
      const text = page?.text ?? ''
      setPhase('playing')
      if (!tts.isSupported || !text) {
        setPhase('awaiting')
      } else {
        tts.speak(`Page ${page.pageNumber}. ${text}`)
      }
    },
    [book, tts],
  )

  const setRecording = useCallback((recording: boolean) => {
    setPhase((p) => {
      if (recording) return 'recording'
      // Leaving recording without a transcript → back to awaiting.
      return p === 'recording' ? 'awaiting' : p
    })
  }, [])

  return {
    book,
    currentPageIndex,
    currentPage: book?.pages?.[currentPageIndex] ?? null,
    totalPages: book?.pages?.length ?? 0,
    phase,
    isLoading,
    error,
    reviewedCount: book?.reviewState?.reviewedPages?.length ?? 0,
    imageRegenerating,
    playCurrentPage,
    approveCurrentPage,
    reviseCurrentPage,
    skipRemaining,
    gotoPage,
    setRecording,
  }
}
