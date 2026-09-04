import { useCallback, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { useAI } from '../../core/ai/useAI'
import { booksCollection } from '../../core/firebase/firestore'
import type { Book, BookTheme, PageImage } from '../../core/types'
import { generateImageId } from './bookTypes'
import { recordBookArtGeneration, useBookArtQuota } from './useBookArtQuota'

export interface IllustratePage {
  /** 1-based, matches BookPage.pageNumber. */
  pageNumber: number
  /** Empty string = skip this page. */
  sceneDescription: string
}

export interface IllustrateOpts {
  bookId: string
  pages: IllustratePage[]
  /** RAW style key, e.g. 'minecraft' — NOT prefixed. */
  style: string
  bookTheme?: BookTheme | undefined
  familyId: string
  onProgress?: (p: IllustrationProgress) => void
}

export interface IllustrationProgress {
  phase: 'idle' | 'illustrating' | 'done'
  /** 1-based; 0 when idle/done. */
  currentPage: number
  totalPages: number
  lastImageUrl?: string
  /** 1-based page numbers that errored. */
  failedPages: number[]
  /**
   * The week's art budget refused this book, or ran out part-way through it
   * (FEAT-168). Never an error — the caller shows `ART_QUOTA_MESSAGE`.
   */
  capReached: boolean
  /** 1-based positions of scene-bearing pages left unillustrated by the cap. */
  unillustratedPages: number[]
}

export interface IllustrateResult {
  /** First page's generated url, if any. */
  coverImageUrl?: string
  failedPages: number[]
  /** True when the day's art budget refused or cut short this book (FEAT-168). */
  capReached: boolean
  /** 1-based positions of scene-bearing pages left unillustrated by the cap. */
  unillustratedPages: number[]
}

/**
 * The pages this book will actually pay for, as 1-based positions (FEAT-168).
 *
 * A page with no `sceneDescription` is skipped by the loop and costs nothing, so
 * it must not count against the budget — a 14-page book where the kid only
 * described four scenes costs four calls, not fourteen. Positions are the loop's
 * own `i + 1`, matching how `failedPages` has always been reported.
 *
 * Pure and exported so the reservation rule can be tested without React.
 */
export function pagesNeedingIllustration(pages: IllustratePage[]): number[] {
  const needed: number[] = []
  for (let i = 0; i < pages.length; i++) {
    if (pages[i]?.sceneDescription) needed.push(i + 1)
  }
  return needed
}

/**
 * Can the loop afford one more page? (FEAT-168)
 *
 * Two numbers, because neither alone is right. `budgetAtStart - spent` is what
 * this book reserved and has left of it — correct even offline, where the
 * counter's writes have not landed. `liveRemaining` is the counter itself,
 * which also reflects a *concurrent* spend on another device. The lower of the
 * two is the honest answer: it never overspends, and it never double-counts our
 * own writes against us.
 *
 * Pure and exported so the rule is testable without React timing.
 */
export function canAffordNextPage(
  budgetAtStart: number,
  spent: number,
  liveRemaining: number,
): boolean {
  return Math.min(budgetAtStart - spent, liveRemaining) >= 1
}

type IllustrationStyleKey =
  | 'book-illustration-minecraft'
  | 'book-illustration-storybook'
  | 'book-illustration-comic'
  | 'book-illustration-realistic'
  | 'book-illustration-garden-warfare'
  | 'book-illustration-platformer'

/**
 * Illustrate a book — one paid image call **per page**, the highest-volume paid
 * path in the app, and the reason FEAT-168 exists.
 *
 * The weekly art budget (FEAT-94's `artQuota`) is asked **here**, not by the
 * callers, on purpose. `illustrate` is not a button: it is reached from
 * `useBookGenerateChat.commitAndClose` and from `useBookReview`'s per-page
 * regeneration — and, until FEAT-187 retired that wizard, from the Story
 * Guide's own generate hook — so a guard threaded through callers is a guard
 * the next caller can forget. Gating the loop itself means every route to a
 * paid image call is capped by construction. (The Book Editor's own three doors *do* take the
 * answer as props from the page, the way `StickersPage` feeds its four; nothing
 * asks the counter twice in one component.)
 */
export function useBookIllustrator() {
  const { generateImage } = useAI()
  const { remaining, recordGeneration } = useBookArtQuota()

  // The live remaining budget, readable from inside the async loop. The
  // counter's `onSnapshot` updates it as our own counted pages land *and* as
  // another device spends — so a book that fits when it starts can still be cut
  // short honestly rather than overspending. Assigned during render rather than
  // in an effect so the in-flight loop sees the new value on the render that
  // carries it, not one commit later.
  const remainingRef = useRef(remaining)
  remainingRef.current = remaining

  const illustrate = useCallback(
    async (opts: IllustrateOpts): Promise<IllustrateResult> => {
      const { bookId, pages, style, bookTheme, familyId, onProgress } = opts

      const bookRef = doc(booksCollection(familyId), bookId)
      const illustrationStyle = `book-illustration-${style}` as IllustrationStyleKey

      const failedPages: number[] = []
      let lastImageUrl: string | undefined
      let coverImageUrl: string | undefined
      const totalPages = pages.length

      // ── Reserve the whole book before spending any of it (FEAT-168) ──
      //
      // A batch is not a one-tap door. If the week's budget cannot cover every
      // page this book will actually illustrate, refuse the *whole* generation
      // now and spend nothing: a book that stops half-illustrated at page 7 of
      // 14 is a worse outcome than one that never started — the kid has paid
      // for seven images and has a broken book. Uncapped actors (parents) read
      // `Infinity` here, so this is a no-op for them.
      const needed = pagesNeedingIllustration(pages)
      const budgetAtStart = remainingRef.current
      if (needed.length > budgetAtStart) {
        onProgress?.({
          phase: 'done',
          currentPage: 0,
          totalPages: 0,
          failedPages: [],
          capReached: true,
          unillustratedPages: needed,
        })
        return { failedPages: [], capReached: true, unillustratedPages: needed }
      }

      // Pages actually paid for by this run. Combined with the live counter
      // below so neither our own writes nor a concurrent device double-count.
      let spent = 0
      let capReached = false
      /** 0-based loop index the budget stopped us at; -1 when it never did. */
      let stoppedAtIndex = -1

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const costsACall = Boolean(page.sceneDescription)

        // Budget exhausted mid-loop anyway — a concurrent sticker on another
        // device, say. Stop here, keep what was generated, and report it; never
        // silently truncate, and never spend past the ceiling. Checked before
        // the progress tick so we don't announce a page we won't illustrate.
        if (costsACall && !canAffordNextPage(budgetAtStart, spent, remainingRef.current)) {
          capReached = true
          stoppedAtIndex = i
          break
        }

        onProgress?.({
          phase: 'illustrating',
          currentPage: i + 1,
          totalPages,
          lastImageUrl,
          failedPages: [...failedPages],
          capReached: false,
          unillustratedPages: [],
        })

        if (!costsACall) continue

        try {
          const imgResult = await generateImage({
            familyId,
            prompt: page.sceneDescription,
            style: illustrationStyle,
            size: '1024x1024',
            ...(bookTheme ? { themeId: bookTheme } : {}),
          })

          if (imgResult) {
            // A real image came back, so a real call was made: count it, and
            // count it *per page* — a book spends N, never 1. Fire-and-forget
            // by construction (FEAT-167): the counter can never make the kid
            // wait on art they already have.
            spent++
            recordBookArtGeneration(recordGeneration)

            lastImageUrl = imgResult.url
            if (i === 0) coverImageUrl = imgResult.url
            const pageImage: PageImage = {
              id: generateImageId(),
              url: imgResult.url,
              storagePath: imgResult.storagePath,
              type: 'ai-generated',
              layerType: 'background',
              prompt: page.sceneDescription,
            }

            try {
              const snap = await getDoc(bookRef)
              if (snap.exists()) {
                const current = snap.data() as Book
                const updatedPages = current.pages.map((p, idx) =>
                  idx === i
                    ? {
                        ...p,
                        images: [pageImage],
                        layout: 'image-top' as const,
                        updatedAt: new Date().toISOString(),
                      }
                    : p,
                )
                await setDoc(bookRef, {
                  ...current,
                  pages: updatedPages,
                  ...(i === 0
                    ? { coverImageUrl: imgResult.url }
                    : current.coverImageUrl
                      ? { coverImageUrl: current.coverImageUrl }
                      : {}),
                  updatedAt: new Date().toISOString(),
                })
              }
            } catch (saveErr) {
              console.warn(`Failed to save illustration for page ${i + 1}:`, saveErr)
              failedPages.push(i + 1)
            }
          }
        } catch (err) {
          console.warn(`Illustration failed for page ${i + 1}:`, err)
          failedPages.push(i + 1)
        }
      }

      // Scene-bearing pages the cap left unmade. Empty unless the loop stopped
      // early — a page that errored is a `failedPage`, not an unillustrated one.
      // `needed` holds 1-based positions and `stoppedAtIndex` is the 0-based
      // index we stopped at, so everything at position > stoppedAtIndex is
      // still unmade.
      const unillustratedPages = capReached
        ? needed.filter((p) => p > stoppedAtIndex)
        : []

      onProgress?.({
        phase: 'done',
        currentPage: 0,
        totalPages: 0,
        lastImageUrl,
        failedPages: [...failedPages],
        capReached,
        unillustratedPages,
      })

      return {
        ...(coverImageUrl ? { coverImageUrl } : {}),
        failedPages,
        capReached,
        unillustratedPages,
      }
    },
    [generateImage, recordGeneration],
  )

  return { illustrate }
}
