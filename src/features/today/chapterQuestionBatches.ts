import { sanitizeAndParseJson } from '../../core/utils/sanitizeJson'
import { TaskType } from '../../core/ai/useAI'
import type { ChatRequest, ChatResponse } from '../../core/ai/useAI'
import type { ChapterBook, ChapterQuestionPoolItem } from '../../core/types'
import {
  applyChapterPoolToAll,
  collectExistingChapterPool,
  type ChapterPoolChild,
} from './applyChapterPoolForChild'
import { buildChapterPoolItem, type RawChapterQuestion } from './chapterPool.logic'

/**
 * A whole book's chapter questions, a batch at a time (UX-464, owner decision
 * 2026-10-27: *"In batches."*).
 *
 * The three doors onto `TaskType.ChapterQuestions` — Today's *Generate chapter
 * questions*, the planner's chapter pool on Apply, and the Dev tab — each asked
 * for every missing chapter in ONE call and `JSON.parse`d the reply bare. On a
 * long book the reply stopped at the 4,096-token ceiling before its closing
 * `]`, the parse failed, nothing was kept, and every retry repeated it. This is
 * the one path all three use now:
 *
 *  - the family's existing pool is copied to every child first (FEAT-19), and
 *    only the chapters NO child has are generated;
 *  - they go `CHAPTER_QUESTION_BATCH_SIZE` at a time, in sequence, and each
 *    batch that parses is written through `applyChapterPoolToAll` THE MOMENT it
 *    lands — that already merges and dedupes per chapter per child, so a later
 *    batch or a later tap only ever adds and never clobbers an answer;
 *  - a failed batch STOPS the run and keeps every batch before it, and the
 *    outcome says how far it got, so a second tap generates only what is still
 *    missing.
 *
 * The writes go to the `children` and `book` handed in at the tap, never to a
 * live active child: switching the header mid-run does not move them (BIND).
 */

/**
 * Chapters per call. A question is 1–2 sentences plus its JSON keys, ~70
 * visible tokens, so 12 is ~850 tokens of reply against the server's 4,096
 * ceiling — ~3k left for thinking at LOW effort, a margin of more than 3×. A
 * 58-chapter book is five calls.
 */
export const CHAPTER_QUESTION_BATCH_SIZE = 12

/** Why one batch did not land. A closed vocabulary — never the model's text. */
export const ChapterBatchFailure = {
  /** The reply stopped at `max_tokens`. */
  CutShort: 'cut-short',
  /** The reply finished but was not a list of questions. */
  Unreadable: 'unreadable',
  /** The call itself failed (network, rate limit, an error from the server). */
  NoReply: 'no-reply',
  /** The questions came back but saving them failed. */
  WriteFailed: 'write-failed',
  /** Every batch landed, but the replies skipped some chapters. */
  Incomplete: 'incomplete',
} as const
export type ChapterBatchFailure = (typeof ChapterBatchFailure)[keyof typeof ChapterBatchFailure]

export const ChapterGenerationKind = {
  /** The book has no chapter list stored — there is nothing to ask about. */
  NoChapters: 'no-chapters',
  /** The family's existing pool could not be read; nothing was generated. */
  ReadFailed: 'read-failed',
  /** Every chapter already had a question (perhaps copied from a sibling). */
  AlreadyComplete: 'already-complete',
  /** Every chapter has a question now. */
  Complete: 'complete',
  /** Some chapters still have none. */
  Partial: 'partial',
} as const
export type ChapterGenerationKind = (typeof ChapterGenerationKind)[keyof typeof ChapterGenerationKind]

export type ChapterGenerationOutcome =
  | { kind: typeof ChapterGenerationKind.NoChapters }
  | { kind: typeof ChapterGenerationKind.ReadFailed }
  | {
      kind: typeof ChapterGenerationKind.AlreadyComplete
      totalChapters: number
      backfilled: number
      listShort: boolean
    }
  | {
      kind: typeof ChapterGenerationKind.Complete
      totalChapters: number
      generated: number
      listShort: boolean
    }
  | {
      kind: typeof ChapterGenerationKind.Partial
      /** Chapters with a question in the family pool now. */
      ready: number
      totalChapters: number
      generated: number
      failure: ChapterBatchFailure
      listShort: boolean
    }

/** Where a running generation is, for the line on the card. */
export interface ChapterGenerationProgress {
  /** First and last chapter number in the batch now being written. */
  from: number
  to: number
  totalChapters: number
  batch: number
  batches: number
}

/** The book fields this path reads. A structural subset of `ChapterBook`. */
export type ChapterGenerationBook = Pick<
  ChapterBook,
  'id' | 'title' | 'author' | 'totalChapters' | 'chapters'
>

export interface GenerateChapterQuestionsInput {
  familyId: string
  /** Every learner child — the read-aloud is a family book (FEAT-17). */
  children: ChapterPoolChild[]
  book: ChapterGenerationBook
  /** The child the call is made for (its age pitches the questions). */
  requestChildId: string
  childName?: string
  weekTheme?: string
  weekVirtue?: string
  chat: (request: ChatRequest) => Promise<ChatResponse | null>
  onProgress?: (progress: ChapterGenerationProgress) => void
  /** Tests only. */
  batchSize?: number
}

/** Split `items` into runs of at most `size`, in order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('batch size must be at least 1')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export type ChapterBatchReply =
  | { ok: true; questions: RawChapterQuestion[] }
  | { ok: false; failure: ChapterBatchFailure }

/**
 * Read one batch's reply. A server that names a failure is believed; a reply
 * that stopped at `max_tokens` is cut short even if an older server handed its
 * text back; and the text goes through the shared `sanitizeAndParseJson`,
 * never a bare `JSON.parse`.
 */
export function readChapterBatchReply(reply: ChatResponse | null): ChapterBatchReply {
  if (!reply) return { ok: false, failure: ChapterBatchFailure.NoReply }
  if (reply.failure === 'cut-short' || reply.stopReason === 'max_tokens') {
    return { ok: false, failure: ChapterBatchFailure.CutShort }
  }
  if (reply.failure === 'unreadable' || !reply.message) {
    return { ok: false, failure: ChapterBatchFailure.Unreadable }
  }
  try {
    const parsed = sanitizeAndParseJson<unknown>(reply.message)
    if (!Array.isArray(parsed)) return { ok: false, failure: ChapterBatchFailure.Unreadable }
    return { ok: true, questions: parsed as RawChapterQuestion[] }
  } catch {
    return { ok: false, failure: ChapterBatchFailure.Unreadable }
  }
}

/**
 * Generate every chapter question the family is missing for `book`, a batch at
 * a time, writing each batch as it lands. Never throws: every way it can end is
 * an outcome a caller can say in one sentence (`chapterGenerationMessage`).
 */
export async function generateChapterQuestionsInBatches(
  input: GenerateChapterQuestionsInput,
): Promise<ChapterGenerationOutcome> {
  const { familyId, children, book, chat, onProgress } = input
  const size = input.batchSize ?? CHAPTER_QUESTION_BATCH_SIZE
  const chapters = book.chapters ?? []
  if (chapters.length === 0) return { kind: ChapterGenerationKind.NoChapters }

  const totalChapters = chapters.length
  // A stored list shorter than the book's own count is said, not hidden.
  const listShort = chapters.length < (book.totalChapters ?? 0)
  const bookNumbers = new Set(chapters.map((c) => c.number))

  let existing: Map<number, ChapterQuestionPoolItem>
  let backfilled = 0
  try {
    existing = await collectExistingChapterPool(familyId, children, book.id)
    backfilled = await applyChapterPoolToAll(familyId, children, book, [...existing.values()])
  } catch (err) {
    console.error('[chapterQuestions] could not read or copy the existing pool', err)
    return { kind: ChapterGenerationKind.ReadFailed }
  }

  const covered = new Set([...existing.keys()].filter((n) => bookNumbers.has(n)))
  const missing = chapters.filter((c) => !covered.has(c.number))
  if (missing.length === 0) {
    return { kind: ChapterGenerationKind.AlreadyComplete, totalChapters, backfilled, listShort }
  }

  const batches = chunk(missing, size)
  let generated = 0
  let failure: ChapterBatchFailure | null = null

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    onProgress?.({
      from: batch[0].number,
      to: batch[batch.length - 1].number,
      totalChapters,
      batch: i + 1,
      batches: batches.length,
    })

    let reply: ChatResponse | null
    try {
      reply = await chat({
        familyId,
        childId: input.requestChildId,
        taskType: TaskType.ChapterQuestions,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            bookTitle: book.title,
            author: book.author,
            chapters: batch,
            childName: input.childName,
            weekTheme: input.weekTheme,
            weekVirtue: input.weekVirtue,
          }),
        }],
      })
    } catch {
      reply = null
    }

    const read = readChapterBatchReply(reply)
    if (!read.ok) {
      failure = read.failure
      break
    }

    // Only the chapters this batch asked for — a question for a chapter that
    // was not requested (or that another batch owns) is dropped.
    const asked = new Map(batch.map((c) => [c.number, c]))
    const items: ChapterQuestionPoolItem[] = []
    for (const q of read.questions) {
      const chapter = q && typeof q === 'object' ? asked.get(Number(q.chapter)) : undefined
      if (!chapter || covered.has(chapter.number)) continue
      const item = buildChapterPoolItem({ ...q, chapter: chapter.number }, chapter.title)
      if (!item) continue
      items.push(item)
      covered.add(chapter.number)
    }

    try {
      await applyChapterPoolToAll(familyId, children, book, items)
    } catch (err) {
      console.error('[chapterQuestions] could not save a batch', err)
      for (const item of items) covered.delete(item.chapter)
      failure = ChapterBatchFailure.WriteFailed
      break
    }
    generated += items.length
  }

  const ready = covered.size
  if (failure === null && ready < totalChapters) failure = ChapterBatchFailure.Incomplete
  if (failure !== null) {
    return { kind: ChapterGenerationKind.Partial, ready, totalChapters, generated, failure, listShort }
  }
  return { kind: ChapterGenerationKind.Complete, totalChapters, generated, listShort }
}

/** The card's line while a batch is being written. */
export function chapterProgressLine(p: ChapterGenerationProgress): string {
  const span = p.from === p.to ? `chapter ${p.from}` : `chapters ${p.from}–${p.to}`
  return `Writing questions… ${span} of ${p.totalChapters}`
}

const FAILURE_CLAUSE: Record<ChapterBatchFailure, string> = {
  [ChapterBatchFailure.CutShort]: 'The last batch came back cut short.',
  [ChapterBatchFailure.Unreadable]: "The last batch came back in a form the app couldn't read.",
  [ChapterBatchFailure.NoReply]: "The last batch didn't come back.",
  [ChapterBatchFailure.WriteFailed]: "The last batch couldn't be saved.",
  [ChapterBatchFailure.Incomplete]: 'Some chapters were skipped in the replies.',
}

/** Where a book's chapter list is fixed — there is no edit-a-book screen. */
export const CHAPTER_LIST_REPAIR =
  'Re-add it from Plan My Week → Add a book with its number of chapters.'

export interface ChapterGenerationMessage {
  text: string
  severity: 'success' | 'info' | 'warning' | 'error'
}

/** The one sentence each outcome is reported with, on every door. */
export function chapterGenerationMessage(
  outcome: ChapterGenerationOutcome,
  bookTitle: string,
): ChapterGenerationMessage {
  const short = (o: { listShort: boolean }) =>
    o.listShort ? ` This book's saved chapter list is shorter than its chapter count. ${CHAPTER_LIST_REPAIR}` : ''
  switch (outcome.kind) {
    case ChapterGenerationKind.NoChapters:
      return {
        text: `${bookTitle} has no chapter list saved, so there are no chapters to ask about. ${CHAPTER_LIST_REPAIR}`,
        severity: 'warning',
      }
    case ChapterGenerationKind.ReadFailed:
      return {
        text: "Couldn't read this book's existing questions, so nothing new was written. Try again.",
        severity: 'error',
      }
    case ChapterGenerationKind.AlreadyComplete:
      return {
        text: (outcome.backfilled > 0
          ? `Chapter questions copied for ${bookTitle}!`
          : `Every chapter of ${bookTitle} already has a question.`) + short(outcome),
        severity: outcome.listShort ? 'warning' : 'success',
      }
    case ChapterGenerationKind.Complete:
      return {
        text: `Chapter questions ready for ${bookTitle}!` + short(outcome),
        severity: outcome.listShort ? 'warning' : 'success',
      }
    case ChapterGenerationKind.Partial:
      return {
        text: `Questions ready for ${outcome.ready} of ${outcome.totalChapters} chapters. ${FAILURE_CLAUSE[outcome.failure]} Tap again to finish the rest.` + short(outcome),
        severity: 'warning',
      }
  }
}
