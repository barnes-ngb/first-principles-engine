import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatRequest, ChatResponse } from '../../core/ai/useAI'
import type { ChapterQuestionPoolItem } from '../../core/types'

// The pool writers are the existing, separately tested `applyChapterPoolForChild`
// module; here they are an in-memory family pool so a run's writes can be read.
const familyPool = new Map<number, ChapterQuestionPoolItem>()
const writes: number[][] = []
let failReadOnce = false
let failWriteOnCall: number | null = null

vi.mock('./applyChapterPoolForChild', () => ({
  collectExistingChapterPool: vi.fn(async () => {
    if (failReadOnce) {
      failReadOnce = false
      throw new Error('permission-denied')
    }
    return new Map(familyPool)
  }),
  applyChapterPoolToAll: vi.fn(async (_f: string, _c: unknown, _b: unknown, items: ChapterQuestionPoolItem[]) => {
    if (items.length === 0) return 0
    writes.push(items.map((i) => i.chapter))
    if (failWriteOnCall !== null && writes.length === failWriteOnCall) throw new Error('unavailable')
    for (const i of items) if (!familyPool.has(i.chapter)) familyPool.set(i.chapter, i)
    return 2
  }),
}))

import {
  CHAPTER_QUESTION_BATCH_SIZE,
  ChapterBatchFailure,
  ChapterGenerationKind,
  chapterGenerationMessage,
  chapterProgressLine,
  chunk,
  generateChapterQuestionsInBatches,
  readChapterBatchReply,
  type ChapterGenerationOutcome,
  type ChapterGenerationProgress,
} from './chapterQuestionBatches'

const book58 = {
  id: 'dark-sea',
  title: 'On the Edge of the Dark Sea of Darkness',
  author: 'Andrew Peterson',
  totalChapters: 58,
  chapters: Array.from({ length: 58 }, (_, i) => ({ number: i + 1, title: `Chapter ${i + 1}` })),
}

/** A reply answering every chapter the request asked for. */
function answer(request: ChatRequest): ChatResponse {
  const { chapters } = JSON.parse(request.messages[0].content) as { chapters: Array<{ number: number }> }
  return {
    message: JSON.stringify(chapters.map((c) => ({
      chapter: c.number, questionType: 'opinion', question: `What did you think of chapter ${c.number}?`,
    }))),
    model: 'm',
    usage: { inputTokens: 1, outputTokens: 1 },
    stopReason: 'end_turn',
  }
}

const requestedChapters = (chat: ReturnType<typeof vi.fn>) =>
  chat.mock.calls.map((call) =>
    (JSON.parse((call[0] as ChatRequest).messages[0].content) as { chapters: Array<{ number: number }> })
      .chapters.map((c) => c.number))

function run(chat: (r: ChatRequest) => Promise<ChatResponse | null>, onProgress?: (p: ChapterGenerationProgress) => void) {
  return generateChapterQuestionsInBatches({
    familyId: 'fam',
    children: [{ id: 'lincoln' }, { id: 'london' }],
    book: book58,
    requestChildId: 'lincoln',
    childName: 'Lincoln',
    chat,
    onProgress,
  })
}

beforeEach(() => {
  familyPool.clear()
  writes.length = 0
  failReadOnce = false
  failWriteOnCall = null
})

describe('chunk', () => {
  it('splits in order and keeps the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe('generateChapterQuestionsInBatches (UX-464)', () => {
  it('a 58-chapter book goes in batches of 12 and lands whole', async () => {
    const chat = vi.fn(async (r: ChatRequest) => answer(r))
    const progress: ChapterGenerationProgress[] = []
    const outcome = await run(chat, (p) => progress.push(p))
    expect(CHAPTER_QUESTION_BATCH_SIZE).toBe(12)
    expect(requestedChapters(chat).map((b) => b.length)).toEqual([12, 12, 12, 12, 10])
    expect(outcome).toEqual({ kind: ChapterGenerationKind.Complete, totalChapters: 58, generated: 58, listShort: false })
    expect(familyPool.size).toBe(58)
    expect(chapterProgressLine(progress[1])).toBe('Writing questions… chapters 13–24 of 58')
  })

  it('positive control: batch 2 failing keeps batch 1 on the pool and reports 12 of 58', async () => {
    const chat = vi.fn(async (r: ChatRequest) => (chat.mock.calls.length === 2 ? null : answer(r)))
    const outcome = await run(chat)
    expect(chat).toHaveBeenCalledTimes(2) // stops; does not plough on
    expect(writes).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]])
    expect(outcome).toMatchObject({ kind: ChapterGenerationKind.Partial, ready: 12, totalChapters: 58, failure: ChapterBatchFailure.NoReply })
    expect(chapterGenerationMessage(outcome, book58.title).text).toContain(
      'Questions ready for 12 of 58 chapters.',
    )
    expect(chapterGenerationMessage(outcome, book58.title).text).toContain('Tap again to finish the rest.')

    // …and the retry asks ONLY for the 46 chapters still missing.
    const retry = vi.fn(async (r: ChatRequest) => answer(r))
    const second = await run(retry)
    const asked = requestedChapters(retry).flat()
    expect(asked[0]).toBe(13)
    expect(asked).toHaveLength(46)
    expect(second).toMatchObject({ kind: ChapterGenerationKind.Complete, generated: 46 })
    expect(familyPool.size).toBe(58)
  })

  it('a truncated reply is a named failure — its text never reaches a parser as if whole', async () => {
    const truncated: ChatResponse = {
      // An older server handing back the raw cut-off text, with its stop reason.
      message: '[{"chapter":1,"questionType":"opinion","question":"Why?"},{"chapter":2,"quest',
      model: 'm', usage: { inputTokens: 1, outputTokens: 4096 }, stopReason: 'max_tokens',
    }
    expect(readChapterBatchReply(truncated)).toEqual({ ok: false, failure: ChapterBatchFailure.CutShort })
    // Even a cut-short reply whose fragment WOULD parse is refused on its stop reason.
    expect(readChapterBatchReply({ ...truncated, message: '[]' })).toEqual({ ok: false, failure: ChapterBatchFailure.CutShort })
    // The new server names it and sends no text.
    expect(readChapterBatchReply({ ...truncated, message: '', failure: 'cut-short' })).toEqual({ ok: false, failure: ChapterBatchFailure.CutShort })
    expect(readChapterBatchReply({ ...truncated, message: '', stopReason: 'end_turn', failure: 'unreadable' })).toEqual({ ok: false, failure: ChapterBatchFailure.Unreadable })

    const outcome = await run(vi.fn(async () => truncated))
    expect(writes).toEqual([])
    expect(outcome).toMatchObject({ kind: ChapterGenerationKind.Partial, ready: 0, failure: ChapterBatchFailure.CutShort })
  })

  it('reads a fenced reply through the shared sanitizer, not a bare JSON.parse', () => {
    const fenced = readChapterBatchReply({
      message: '```json\n[{"chapter":1,"questionType":"opinion","question":"Why?"}]\n```',
      model: 'm', usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end_turn',
    })
    expect(fenced.ok).toBe(true)
  })

  it('a book with chapters: [] never reports "already generated"', async () => {
    const chat = vi.fn()
    const outcome = await generateChapterQuestionsInBatches({
      familyId: 'fam', children: [{ id: 'lincoln' }], book: { ...book58, chapters: [] },
      requestChildId: 'lincoln', chat,
    })
    expect(outcome).toEqual({ kind: ChapterGenerationKind.NoChapters })
    expect(chat).not.toHaveBeenCalled()
    const text = chapterGenerationMessage(outcome, book58.title).text
    expect(text).not.toMatch(/already/i)
    expect(text).toContain('no chapter list saved')
    expect(text).toContain('Plan My Week')
  })

  it('drops questions for chapters the batch did not ask for, and names a skipped chapter', async () => {
    const chat = vi.fn(async (r: ChatRequest) => {
      const reply = answer(r)
      const qs = JSON.parse(reply.message) as Array<{ chapter: number }>
      // Skip chapter 5, and invent a chapter 99.
      const edited = qs.filter((q) => q.chapter !== 5)
      edited.push({ chapter: 99, questionType: 'opinion', question: '?' } as never)
      return { ...reply, message: JSON.stringify(edited) }
    })
    const outcome = await run(chat)
    expect(familyPool.has(99)).toBe(false)
    expect(familyPool.has(5)).toBe(false)
    expect(outcome).toMatchObject({ kind: ChapterGenerationKind.Partial, ready: 57, failure: ChapterBatchFailure.Incomplete })
  })

  it('a failed save keeps earlier batches and does not count the failed one', async () => {
    failWriteOnCall = 2
    const outcome = await run(vi.fn(async (r: ChatRequest) => answer(r)))
    expect(outcome).toMatchObject({ kind: ChapterGenerationKind.Partial, ready: 12, failure: ChapterBatchFailure.WriteFailed })
  })

  it('an unreadable existing pool writes nothing and asks nothing', async () => {
    failReadOnce = true
    const chat = vi.fn()
    const outcome = await run(chat)
    expect(outcome).toEqual({ kind: ChapterGenerationKind.ReadFailed })
    expect(chat).not.toHaveBeenCalled()
  })

  it('a complete family pool is "already", copied or not, and a short saved list is said', async () => {
    for (const c of book58.chapters) familyPool.set(c.number, { chapter: c.number, questionType: 'opinion', question: 'q', answered: false })
    const chat = vi.fn()
    const outcome = await run(chat)
    expect(chat).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ kind: ChapterGenerationKind.AlreadyComplete, totalChapters: 58 })

    const short: ChapterGenerationOutcome = { kind: ChapterGenerationKind.Complete, totalChapters: 30, generated: 30, listShort: true }
    expect(chapterGenerationMessage(short, 'B').text).toContain('shorter than its chapter count')
  })
})
