import { useCallback } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { useAI } from '../../core/ai/useAI'
import { booksCollection } from '../../core/firebase/firestore'
import type { Book, BookTheme, PageImage } from '../../core/types'
import { generateImageId } from './bookTypes'

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
}

export interface IllustrateResult {
  /** First page's generated url, if any. */
  coverImageUrl?: string
  failedPages: number[]
}

type IllustrationStyleKey =
  | 'book-illustration-minecraft'
  | 'book-illustration-storybook'
  | 'book-illustration-comic'
  | 'book-illustration-realistic'
  | 'book-illustration-garden-warfare'
  | 'book-illustration-platformer'

export function useBookIllustrator() {
  const { generateImage } = useAI()

  const illustrate = useCallback(
    async (opts: IllustrateOpts): Promise<IllustrateResult> => {
      const { bookId, pages, style, bookTheme, familyId, onProgress } = opts

      const bookRef = doc(booksCollection(familyId), bookId)
      const illustrationStyle = `book-illustration-${style}` as IllustrationStyleKey

      const failedPages: number[] = []
      let lastImageUrl: string | undefined
      let coverImageUrl: string | undefined
      const totalPages = pages.length

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        onProgress?.({
          phase: 'illustrating',
          currentPage: i + 1,
          totalPages,
          lastImageUrl,
          failedPages: [...failedPages],
        })

        if (!page.sceneDescription) continue

        try {
          const imgResult = await generateImage({
            familyId,
            prompt: page.sceneDescription,
            style: illustrationStyle,
            size: '1024x1024',
            ...(bookTheme ? { themeId: bookTheme } : {}),
          })

          if (imgResult) {
            lastImageUrl = imgResult.url
            if (i === 0) coverImageUrl = imgResult.url
            const pageImage: PageImage = {
              id: generateImageId(),
              url: imgResult.url,
              storagePath: imgResult.storagePath,
              type: 'ai-generated',
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

      onProgress?.({
        phase: 'done',
        currentPage: 0,
        totalPages: 0,
        lastImageUrl,
        failedPages: [...failedPages],
      })

      return {
        ...(coverImageUrl ? { coverImageUrl } : {}),
        failedPages,
      }
    },
    [generateImage],
  )

  return { illustrate }
}
