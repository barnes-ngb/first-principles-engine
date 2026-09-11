import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore'

import {
  bookProgressCollection,
  bookProgressDocId,
  stripUndefined,
} from '../../core/firebase/firestore'
import type { BookProgress, ChapterQuestionPoolItem } from '../../core/types'
import { ChapterSaveRefusal, type ChapterSaveOutcome } from './chapterSaveOutcome'
import { isBookFinished, repairLegacySkips } from './chapterPool.logic'

interface UseBookProgressResult {
  bookProgress: BookProgress | null
  loading: boolean
  /**
   * UX-356(a) — the read FAILED, as distinct from "this child has no progress
   * on this book".
   *
   * The `onSnapshot` error handler set `bookProgress: null` and `loading:
   * false`, which is byte-identical to an affirmative empty result. The parent
   * surface then offered to generate a question pool that already exists, and
   * the kid surface rendered a book as not started. That is this project's own
   * read-side rule broken on its heaviest page — the weekly review's
   * *"Couldn't read this week's hours"* precedent, and `useBusinessGoal`'s
   * **GATE** verdict in the child-switch census: **a failed read is not an
   * affirmative empty result.**
   */
  loadFailed: boolean
  /**
   * UX-355 — answers instead of throwing into nothing.
   *
   * This was a bare `await updateDoc(...)` with no catch anywhere on the path,
   * called as `void onChapterAnswered(...)` from three places across the parent
   * and kid surfaces. A rejected write was an unhandled promise rejection and
   * the child's answer was gone on the next load with nothing on screen.
   */
  updateChapter: (
    chapter: number,
    update: Partial<ChapterQuestionPoolItem>,
  ) => Promise<ChapterSaveOutcome>
}

export function useBookProgress(
  familyId: string | undefined,
  childId: string | undefined,
  bookId: string | undefined,
): UseBookProgressResult {
  const [bookProgress, setBookProgress] = useState<BookProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  // Guards the one-time skip-model repair so it fires at most once per mount,
  // even if onSnapshot delivers several events before the write lands.
  const migrationRanRef = useRef(false)

  /* eslint-disable react-hooks/set-state-in-effect -- Standard Firestore subscription: guard reset + loading flag before onSnapshot */
  useEffect(() => {
    migrationRanRef.current = false
    setLoadFailed(false)
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
        // A document that arrives clears an earlier failure — the subscription
        // recovered, and the surface may speak about the book again.
        setLoadFailed(false)
        setLoading(false)
      },
      (err) => {
        // UX-356(a): `null` + `loading: false` alone is indistinguishable from
        // "no progress yet", which is what the consumers used to render.
        console.error('[useBookProgress] onSnapshot error:', err)
        setBookProgress(null)
        setLoadFailed(true)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [familyId, childId, bookId])

  const updateChapter = useCallback(
    async (
      chapter: number,
      update: Partial<ChapterQuestionPoolItem>,
    ): Promise<ChapterSaveOutcome> => {
      // A guard that refuses a write is a failure to report, not a quiet no-op
      // (`dayWriteOutcome`'s rule, one hook over). Nothing was sent here, so
      // nothing half-landed — but the child has answered and only this says the
      // answer was not recorded.
      if (!familyId || !childId || !bookId || !bookProgress) {
        return { ok: false, reason: ChapterSaveRefusal.NoTarget }
      }

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

      try {
        await updateDoc(docRef, {
          questionPool: updatedPool,
          ...(lastChapterAnswered !== undefined ? { lastChapterAnswered } : {}),
          ...(completedAt ? { completedAt } : {}),
          updatedAt: new Date().toISOString(),
        })
      } catch (err) {
        console.error('[useBookProgress] Failed to save a chapter answer:', err)
        return { ok: false, reason: ChapterSaveRefusal.Rejected }
      }
      return { ok: true }
    },
    [familyId, childId, bookId, bookProgress],
  )

  return { bookProgress, loading, loadFailed, updateChapter }
}
