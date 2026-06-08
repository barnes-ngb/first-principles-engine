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
 * The child shape the cross-child helpers need: just an `id`. Lets all three
 * generate sites pass their `children` array (full `Child[]`) directly.
 */
export type ChapterPoolChild = { id: string }

/**
 * Reduce a stored pool item to the canonical, family-shared "same questions"
 * shape: keep only the question itself (`chapter` / `chapterTitle` /
 * `questionType` / `question`) and reset answer state. Per-child answer fields
 * (`answered`/`answeredDate`/`audioUrl`/`responseNote`/`artifactId`/`skipped`)
 * are stripped so a copy reaches the receiving child UNANSWERED. `chapterTitle`
 * is omitted entirely when absent (writing `undefined` makes `setDoc` reject the
 * whole doc — same constraint `buildChapterPoolItem` handles).
 */
function toCanonicalItem(
  item: ChapterQuestionPoolItem,
): ChapterQuestionPoolItem {
  return {
    chapter: item.chapter,
    questionType: item.questionType,
    question: item.question,
    answered: false,
    ...(item.chapterTitle ? { chapterTitle: item.chapterTitle } : {}),
  }
}

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
 *
 * Returns `true` if it wrote (created or appended), `false` on a pure no-op.
 * Callers use this to tell "backfilled a sibling" from "everyone already had it".
 */
export async function applyChapterPoolForChild(
  familyId: string,
  childId: string,
  book: ChapterPoolBook,
  poolItems: ChapterQuestionPoolItem[],
): Promise<boolean> {
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
    if (additions.length === 0) return false

    await updateDoc(progressRef, {
      questionPool: [...existing.questionPool, ...additions],
      updatedAt: now,
    })
    return true
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
    return true
  }
}

/**
 * Collect the existing question pool for a book across ALL learner children into
 * one canonical `Map<chapter, item>` (FEAT-19). This is the "same questions"
 * source of truth: read every kid's `bookProgress`, and for each chapter take
 * the FIRST child's item we see (siblings share the family questions, so any
 * copy is canonical) reduced to `toCanonicalItem` (answer state stripped).
 *
 * Replaces the old selected-child-only existence check: a chapter is "already in
 * the family" if ANY kid has it, so we never regenerate questions a sibling
 * already has — we copy them instead.
 */
export async function collectExistingChapterPool(
  familyId: string,
  children: ChapterPoolChild[],
  bookId: string,
): Promise<Map<number, ChapterQuestionPoolItem>> {
  const map = new Map<number, ChapterQuestionPoolItem>()
  const snaps = await Promise.all(
    children.map((child) =>
      getDoc(
        doc(
          bookProgressCollection(familyId),
          bookProgressDocId(child.id, bookId),
        ),
      ),
    ),
  )
  for (const snap of snaps) {
    if (!snap.exists()) continue
    const progress = snap.data() as BookProgress
    for (const item of progress.questionPool ?? []) {
      if (!map.has(item.chapter)) {
        map.set(item.chapter, toCanonicalItem(item))
      }
    }
  }
  return map
}

/**
 * Apply one pool to EVERY learner child via `applyChapterPoolForChild`
 * (FEAT-19). Kids who already have the chapters no-op (per-child dedup); kids
 * missing them receive the copied items. An empty pool is a no-op for everyone
 * (and never creates an empty `BookProgress`).
 *
 * Returns the count of children that actually received a write — lets a caller
 * distinguish "backfilled N siblings" from "already complete for all".
 */
export async function applyChapterPoolToAll(
  familyId: string,
  children: ChapterPoolChild[],
  book: ChapterPoolBook,
  poolItems: ChapterQuestionPoolItem[],
): Promise<number> {
  if (poolItems.length === 0) return 0
  const results = await Promise.all(
    children.map((child) =>
      applyChapterPoolForChild(familyId, child.id, book, poolItems),
    ),
  )
  return results.filter(Boolean).length
}
