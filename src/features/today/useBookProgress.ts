import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'

import {
  bookProgressCollection,
  bookProgressDocId,
} from '../../core/firebase/firestore'
import type { BookProgress, ChapterQuestionPoolItem } from '../../core/types'

interface UseBookProgressResult {
  bookProgress: BookProgress | null
  loading: boolean
  updateChapter: (
    chapter: number,
    update: Partial<ChapterQuestionPoolItem>,
  ) => Promise<void>
}

export function useBookProgress(
  familyId: string | undefined,
  childId: string | undefined,
  bookId: string | undefined,
): UseBookProgressResult {
  const [bookProgress, setBookProgress] = useState<BookProgress | null>(null)
  const [loading, setLoading] = useState(true)

  /* eslint-disable react-hooks/set-state-in-effect -- Standard Firestore subscription: guard reset + loading flag before onSnapshot */
  useEffect(() => {
    if (!familyId || !childId || !bookId) {
      setBookProgress(null)
      setLoading(false)
      return
    }

    setLoading(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    const docId = bookProgressDocId(childId, bookId)
    const docRef = doc(bookProgressCollection(familyId), docId)

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setBookProgress({ ...snap.data(), id: snap.id })
        } else {
          setBookProgress(null)
        }
        setLoading(false)
      },
      (err) => {
        console.error('Failed to load book progress:', err)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId, childId, bookId])

  const updateChapter = useCallback(
    async (chapter: number, update: Partial<ChapterQuestionPoolItem>) => {
      if (!familyId || !childId || !bookId || !bookProgress) return

      const docId = bookProgressDocId(childId, bookId)
      const docRef = doc(bookProgressCollection(familyId), docId)

      const updatedPool = bookProgress.questionPool.map((item) =>
        item.chapter === chapter ? { ...item, ...update } : item,
      )

      // Determine lastChapterAnswered
      const answeredChapters = updatedPool
        .filter((item) => item.answered)
        .map((item) => item.chapter)
      const lastChapterAnswered =
        answeredChapters.length > 0 ? Math.max(...answeredChapters) : undefined

      // Determine completedAt
      const allAnswered = updatedPool.every((item) => item.answered)
      const completedAt = allAnswered ? new Date().toISOString() : undefined

      await updateDoc(docRef, {
        questionPool: updatedPool,
        ...(lastChapterAnswered !== undefined ? { lastChapterAnswered } : {}),
        ...(completedAt ? { completedAt } : {}),
        updatedAt: new Date().toISOString(),
      })
    },
    [familyId, childId, bookId, bookProgress],
  )

  return { bookProgress, loading, updateChapter }
}
