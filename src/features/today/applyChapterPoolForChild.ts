import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

import {
  bookProgressCollection,
  bookProgressDocId,
} from '../../core/firebase/firestore'
import type {
  BookProgress,
  ChapterBook,
  ChapterQuestionPoolItem,
} from '../../core/types'
import { todayKey } from '../../core/utils/dateKey'

/**
 * The book metadata `applyChapterPoolForChild` needs to create-or-append a
 * `BookProgress`. A structural subset of `ChapterBook` so all three callers
 * (Today retry, Dev admin, planner apply) can pass their `selectedBook`/`book`
 * directly.
 */
export type ChapterPoolBook = Pick<
  ChapterBook,
  'id' | 'title' | 'author' | 'totalChapters'
>

/**
 * Write a family read-aloud question pool to ONE child's `bookProgress`,
 * create-or-append (FEAT-17).
 *
 * The read-aloud is a family book: the same questions go to every learner, with
 * separate answer tracking per child. This centralizes the create-or-append
 * logic that the three generate paths (Today retry, Dev admin, planner apply)
 * each duplicated, so they can fan the single AI-generated pool out to every
 * kid instead of only the selected child.
 *
 * - Existing doc → append ONLY items whose `chapter` isn't already in the
 *   child's pool. Dedup is per-child (each child may have a different set of
 *   answered/skipped chapters), so this NEVER clobbers a recorded answer and
 *   NEVER duplicates a chapter. A no-op (every chapter already present) skips
 *   the write entirely.
 * - No doc yet → create a fresh `BookProgress` with the same top-level shape the
 *   three sites wrote before.
 */
export async function applyChapterPoolForChild(
  familyId: string,
  childId: string,
  book: ChapterPoolBook,
  poolItems: ChapterQuestionPoolItem[],
): Promise<void> {
  const progressRef = doc(
    bookProgressCollection(familyId),
    bookProgressDocId(childId, book.id),
  )
  const snap = await getDoc(progressRef)
  const existing = snap.exists() ? (snap.data() as BookProgress) : null
  const now = new Date().toISOString()

  if (existing) {
    const existingChapters = new Set(
      existing.questionPool.map((item) => item.chapter),
    )
    const additions = poolItems.filter(
      (item) => !existingChapters.has(item.chapter),
    )
    if (additions.length === 0) return

    await updateDoc(progressRef, {
      questionPool: [...existing.questionPool, ...additions],
      updatedAt: now,
    })
  } else {
    const newProgress: BookProgress = {
      bookId: book.id,
      childId,
      bookTitle: book.title,
      author: book.author,
      totalChapters: book.totalChapters,
      questionPool: poolItems,
      startedAt: todayKey(),
      createdAt: now,
      updatedAt: now,
    }
    await setDoc(progressRef, newProgress)
  }
}
