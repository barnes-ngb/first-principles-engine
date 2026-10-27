// ── The read-aloud has a place in Curriculum (FEAT-243 / UX-470) ─────────────
//
// Owner, 2026-10-27: *"Can we also add that book to the curriculum, not sure why
// it got lost."* Nothing was lost — the read-aloud had **never** had a
// Curriculum row. Plan My Week's pick was stored only as
// `weeks/{…}.readAloudBookId` and `plannerDefaults`, and drove the chapter card
// and nothing else. Owner decision: **picking a read-aloud adds it** — one
// shared row per book — and **chapter progress keeps its single home**, the
// chapter card's per-child `bookProgress`. A `workbook` with its own
// `currentPosition` was explicitly declined: two chapter counters drift.
//
// This file is the pure half: the row's id, its shape, which earlier rows are
// still open, and the sentences. The one write is
// `core/firebase/readAloudConfigWrites.ts`.
//
// ── Why `routine` ────────────────────────────────────────────────────────────
// Of the seven `ActivityType`s, `workbook` carries a position and `strand` a
// session count written only by a captured session (UX-283), and the owner
// declined both counters. `routine` carries neither, sits in Routine Activities
// beside the "Handwriting (while read-aloud)" row it already pairs with, and is
// what a read-aloud is to a parent — part of the shape of the day.
//
// ── Minutes and subject ──────────────────────────────────────────────────────
// No existing code gave the read-aloud minutes of its own: its time was carried
// by the seeded "Handwriting (while read-aloud)" routine (15m in
// `DEFAULT_ACTIVITY_CONFIG_SEED`, 20m in `chatPlanner.logic`'s
// `defaultDailyRoutine`). Owner pick, 2026-10-27: **20 minutes, Reading**, the
// fallback routine's read-aloud slot — and she edits it like any row.

import type { ActivityConfig, BookProgress, ChapterBook } from '../../core/types'
import { ActivityFrequency, ActivityType, ScheduleBlock, SubjectBucket } from '../../core/types/enums'

/** The id prefix — every read-aloud row's id, and nothing else's. */
export const READ_ALOUD_CONFIG_PREFIX = 'readaloud-'

/** Owner pick (2026-10-27): the fallback routine's read-aloud slot. */
export const READ_ALOUD_DEFAULT_MINUTES = 20

/**
 * After the seeded "Handwriting (while read-aloud)" (sortOrder 10), which runs
 * during it, and before the reading workbooks (20+).
 */
export const READ_ALOUD_SORT_ORDER = 11

/**
 * The deterministic document id for a book's row (the UX-231 / UX-394 rail).
 * A second Apply, a second tab or the other parent's phone addresses the same
 * document instead of appending a twin.
 */
export function readAloudConfigDocId(chapterBookId: string): string {
  return `${READ_ALOUD_CONFIG_PREFIX}${chapterBookId}`
}

/** What the row is called, so a parent recognises it. */
export function readAloudRowName(bookTitle: string): string {
  const title = bookTitle.trim()
  return title ? `Read-aloud: ${title}` : 'Read-aloud'
}

/**
 * The row a book becomes, written only when no row with its id exists. Pure.
 *
 * Deliberately carries no `currentPosition`, `totalUnits` or `unitLabel` — the
 * whole of the owner's decision — and `childId: 'both'`, because the read-aloud
 * is a family book (FEAT-17 writes the same question pool to every learner).
 */
export function buildReadAloudConfig(
  book: Pick<ChapterBook, 'id' | 'title' | 'author'>,
  now: string,
): ActivityConfig {
  return {
    id: readAloudConfigDocId(book.id),
    name: readAloudRowName(book.title),
    type: ActivityType.Routine,
    subjectBucket: SubjectBucket.Reading,
    defaultMinutes: READ_ALOUD_DEFAULT_MINUTES,
    frequency: ActivityFrequency.Daily,
    childId: 'both',
    sortOrder: READ_ALOUD_SORT_ORDER,
    ...(book.author?.trim() ? { curriculum: book.author.trim() } : {}),
    completed: false,
    scannable: false,
    block: ScheduleBlock.ReadAloud,
    chapterBookId: book.id,
    createdAt: now,
    updatedAt: now,
  }
}

/** Is this config a read-aloud row? Read by the link, never by the name. */
export function isReadAloudConfig(
  config: Pick<ActivityConfig, 'chapterBookId'>,
): config is Pick<ActivityConfig, 'chapterBookId'> & { chapterBookId: string } {
  return typeof config.chapterBookId === 'string' && config.chapterBookId.length > 0
}

/**
 * Read-aloud rows still active for a book OTHER than the one just applied.
 *
 * Applying a new book never completes the old one automatically — the family
 * may be pausing a book, not finishing it — so these are offered back to the
 * parent with one line instead. Left alone, two active read-aloud rows would
 * both plan every day and inflate the day budget (UX-206).
 */
export function openEarlierReadAloudRows<
  T extends Pick<ActivityConfig, 'id' | 'completed' | 'chapterBookId'>,
>(configs: T[], currentBookId: string | null | undefined): T[] {
  return configs.filter(
    (config) =>
      isReadAloudConfig(config) &&
      config.completed !== true &&
      config.chapterBookId !== currentBookId,
  )
}

/** A short handle for a row in a sentence: its own name, with the prefix dropped. */
function shortName(name: string): string {
  return name.replace(/^Read-aloud:\s*/i, '').trim() || name
}

/** The planner's one line after Apply, per open earlier row. */
export function earlierReadAloudPrompt(config: Pick<ActivityConfig, 'name'>): string {
  return `${shortName(config.name)} is still in Curriculum. Mark it finished?`
}

/** The confirm dialog's body — before anything is written. */
export function earlierReadAloudConfirm(config: Pick<ActivityConfig, 'name'>): string {
  return `Mark "${config.name}" as finished? It moves to Completed and stops being planned. Its chapter questions and answers stay exactly as they are.`
}

/** The success and failure lines for that confirm. */
export function earlierReadAloudDone(config: Pick<ActivityConfig, 'name'>): string {
  return `"${config.name}" marked as finished.`
}
export function earlierReadAloudFailed(config: Pick<ActivityConfig, 'name'>): string {
  return `Couldn't mark "${config.name}" finished — it is still in Curriculum.`
}

/** The planner's one-tap add's lines (the same create-only write as Apply). */
export const READ_ALOUD_ADD_LABEL = 'Add to Curriculum'
export function readAloudAddedLine(bookTitle: string, created: boolean): string {
  return created
    ? `${readAloudRowName(bookTitle)} added to Curriculum.`
    : `${readAloudRowName(bookTitle)} is already in Curriculum.`
}
export const READ_ALOUD_ADD_FAILED = "Couldn't add the read-aloud to Curriculum. Nothing was saved."

/**
 * Curriculum's chapter line for ONE child, read from `bookProgress` — the one
 * home of chapter progress. Pure, and never stored.
 *
 * Per child, by construction: Curriculum renders the active child's tab, and
 * the two boys can be on different chapters, so nothing here averages or picks
 * one. `null` means "say nothing" — no document, a failed read, or a book with
 * no usable chapter count — because a guessed chapter is worse than none.
 */
export function readAloudChapterLine(
  progress: Pick<BookProgress, 'totalChapters' | 'lastChapterAnswered' | 'completedAt'> | null,
  childName: string | undefined,
): string | null {
  if (!progress) return null
  const who = childName?.trim() ? `${childName.trim()}: ` : ''
  if (progress.completedAt) return `${who}finished`
  const total =
    typeof progress.totalChapters === 'number' && Number.isFinite(progress.totalChapters) && progress.totalChapters > 0
      ? progress.totalChapters
      : null
  const last =
    typeof progress.lastChapterAnswered === 'number' && Number.isFinite(progress.lastChapterAnswered) && progress.lastChapterAnswered > 0
      ? progress.lastChapterAnswered
      : null
  if (last !== null) return total ? `${who}chapter ${last} of ${total}` : `${who}chapter ${last}`
  if (total) return `${who}not started · ${total} chapters`
  return null
}
