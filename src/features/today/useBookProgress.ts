import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore'

import {
  bookProgressCollection,
  bookProgressDocId,
  stripUndefined,
} from '../../core/firebase/firestore'
import type { BookProgress, ChapterQuestionPoolItem } from '../../core/types'
import { isBookFinished, repairLegacySkips } from './chapterPool.logic'

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
  // Guards the one-time skip-model repair so it fires at most once per mount,
  // even if onSnapshot delivers several events before the write lands.
  const migrationRanRef = useRef(false)

  /* eslint-disable react-hooks/set-state-in-effect -- Standard Firestore subscription: guard reset + loading flag before onSnapshot */
  useEffect(() => {
    migrationRanRef.current = false
    if (!familyId || !childId || !bookId) {
      setBookProgress(null)
      setLoading(false)
      return
    }

    setLoading(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    const docId = bookProgressDocId(childId, bookId)
    const docRef = doc(bookProgressCollection(familyId), docId)

    // One-time repair (FUNC-07): docs from before the skip≠answered split had
    // skipped chapters stamped `answered: true`, which finished the book and
    // hid the kid section. Reset every legacy-skipped chapter to answerable and
    // flag the doc so deliberate parent skips made afterward are preserved.
    const maybeRepairSkipModel = (data: BookProgress) => {
      if (data.migratedSkipModel || migrationRanRef.current) return
      migrationRanRef.current = true

      const repairedPool = repairLegacySkips(data.questionPool ?? []).map(
        (item) =>
          stripUndefined(
            item as unknown as Record<string, unknown>,
          ) as unknown as ChapterQuestionPoolItem,
      )

      const answeredChapters = repairedPool
        .filter((item) => item.answered)
        .map((item) => item.chapter)
      const lastChapterAnswered =
        answeredChapters.length > 0 ? Math.max(...answeredChapters) : undefined
      const stillFinished = isBookFinished(repairedPool)

      void updateDoc(docRef, {
        questionPool: repairedPool,
        migratedSkipModel: true,
        ...(lastChapterAnswered !== undefined
          ? { lastChapterAnswered }
          : { lastChapterAnswered: deleteField() }),
        ...(stillFinished ? {} : { completedAt: deleteField() }),
        updatedAt: new Date().toISOString(),
      }).catch((err) =>
        console.error('[useBookProgress] skip-model repair failed:', err),
      )
      // onSnapshot fires again with migratedSkipModel set; the flag short-circuits.
    }

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          maybeRepairSkipModel(data)
          setBookProgress({ ...data, id: snap.id })
        } else {
          setBookProgress(null)
        }
        setLoading(false)
      },
      (err) => {
        console.error('[useBookProgress] onSnapshot error:', err)
        setBookProgress(null)
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
        item.chapter === chapter
          ? (stripUndefined({ ...item, ...update } as unknown as Record<string, unknown>) as unknown as ChapterQuestionPoolItem)
          : item,
      )

      // Determine lastChapterAnswered
      const answeredChapters = updatedPool
        .filter((item) => item.answered)
        .map((item) => item.chapter)
      const lastChapterAnswered =
        answeredChapters.length > 0 ? Math.max(...answeredChapters) : undefined

      // Determine completedAt. A book is finished when no chapter is left
      // untouched — every chapter is either answered or parent-skipped (FUNC-07).
      const completedAt = isBookFinished(updatedPool)
        ? new Date().toISOString()
        : undefined

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
