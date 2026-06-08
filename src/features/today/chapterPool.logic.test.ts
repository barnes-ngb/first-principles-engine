import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ChapterQuestionPoolItem } from '../../core/types'
import { bookProgressDocId } from '../../core/firebase/firestore'
import {
  buildChapterPoolItem,
  isBookFinished,
  isChapterPoolVisible,
  isChapterToGo,
  isReadAloudSectionVisible,
  repairLegacySkips,
} from './chapterPool.logic'

const make = (
  overrides: Partial<ChapterQuestionPoolItem> = {},
): ChapterQuestionPoolItem => ({
  chapter: 1,
  questionType: 'comprehension',
  question: 'What happened?',
  answered: false,
  ...overrides,
})

const answered = (chapter: number) =>
  make({ chapter, answered: true, answeredDate: '2026-06-01', audioUrl: 'a' })
const skipped = (chapter: number) =>
  make({ chapter, answered: false, skipped: true })
const toGo = (chapter: number) => make({ chapter })

describe('buildChapterPoolItem', () => {
  const rawQ = { chapter: 4, questionType: 'comprehension', question: 'What happened?' }

  it('omits chapterTitle entirely when no title is given (untitled chapter)', () => {
    const item = buildChapterPoolItem(rawQ)
    // Never write `chapterTitle: undefined` — plain Firestore rejects the doc.
    expect(item).not.toBeNull()
    expect(item).not.toHaveProperty('chapterTitle')
    expect(item).toEqual({
      chapter: 4,
      questionType: 'comprehension',
      question: 'What happened?',
      answered: false,
    })
  })

  it('carries a real chapter title onto the pool item', () => {
    const item = buildChapterPoolItem(rawQ, 'The Island')
    expect(item?.chapterTitle).toBe('The Island')
  })

  it('omits chapterTitle for an empty-string title', () => {
    const item = buildChapterPoolItem(rawQ, '')
    expect(item).not.toHaveProperty('chapterTitle')
  })

  it('returns null for a malformed question (missing type or text)', () => {
    expect(buildChapterPoolItem({ chapter: 1, questionType: '', question: 'Q' })).toBeNull()
    expect(buildChapterPoolItem({ chapter: 1, questionType: 'comprehension', question: '' })).toBeNull()
  })
})

describe('isChapterToGo', () => {
  it('is true only when a chapter is neither answered nor parent-skipped', () => {
    expect(isChapterToGo(toGo(1))).toBe(true)
    expect(isChapterToGo(answered(1))).toBe(false)
    expect(isChapterToGo(skipped(1))).toBe(false)
  })
})

describe('parent skip semantics', () => {
  it('a parent-skipped chapter is skipped but NOT answered', () => {
    // A skip writes { skipped: true } with answered left false (FUNC-07).
    const item = skipped(3)
    expect(item.skipped).toBe(true)
    expect(item.answered).toBe(false)
  })

  it('the pool stays visible while any chapter is neither answered nor skipped', () => {
    const pool = [answered(1), skipped(2), toGo(3)]
    expect(isChapterPoolVisible(pool)).toBe(true)
  })

  it('the pool closes only once every chapter is answered or parent-skipped', () => {
    expect(isChapterPoolVisible([answered(1), skipped(2)])).toBe(false)
  })
})

describe('isBookFinished', () => {
  it('is NOT finished when some chapters are still untouched', () => {
    // some answered + some parent-skipped + some untouched
    const pool = [answered(1), skipped(2), toGo(3)]
    expect(isBookFinished(pool)).toBe(false)
  })

  it('is finished only when no chapter is left untouched (answered or skipped)', () => {
    expect(isBookFinished([answered(1), skipped(2), answered(3)])).toBe(true)
  })

  it('treats an all-skipped book as finished', () => {
    expect(isBookFinished([skipped(1), skipped(2)])).toBe(true)
  })

  it('an empty pool is not finished', () => {
    expect(isBookFinished([])).toBe(false)
  })
})

describe('repairLegacySkips (one-time migration)', () => {
  it('resets legacy-skipped chapters to answerable and clears their stale metadata', () => {
    // Legacy doc: skip was stamped answered:true with leftover answer metadata.
    const legacySkip = make({
      chapter: 2,
      answered: true,
      skipped: true,
      answeredDate: '2026-05-01',
      responseNote: 'old note',
    })
    const [repaired] = repairLegacySkips([legacySkip])

    expect(repaired.answered).toBe(false)
    expect(repaired.skipped).toBe(false)
    expect(repaired.answeredDate).toBeUndefined()
    expect(repaired.responseNote).toBeUndefined()
    // After repair the chapter is answerable again
    expect(isChapterToGo(repaired)).toBe(true)
  })

  it('never touches a genuine answer (answered without skipped)', () => {
    const realAnswer = answered(1)
    const [repaired] = repairLegacySkips([realAnswer])

    expect(repaired.answered).toBe(true)
    expect(repaired.answeredDate).toBe('2026-06-01') // unchanged
    // identity preserved — untouched items are returned as-is
    expect(repaired).toBe(realAnswer)
  })

  it('leaves untouched (to-go) chapters as-is', () => {
    const fresh = toGo(5)
    const [repaired] = repairLegacySkips([fresh])
    expect(repaired).toBe(fresh)
  })

  it('is idempotent: a second pass over repaired data changes nothing', () => {
    const pool = [answered(1), skipped(2), toGo(3)]
    const once = repairLegacySkips(pool)
    const twice = repairLegacySkips(once)
    // No item is `skipped` after the first pass, so the second pass is a no-op.
    expect(twice).toEqual(once)
    expect(once.some((i) => i.skipped)).toBe(false)
  })

  it('a legacy all-skipped book becomes answerable again (Lincoln chapters return)', () => {
    const legacy = [
      make({ chapter: 1, answered: true, skipped: true }),
      make({ chapter: 2, answered: true, skipped: true }),
      make({ chapter: 3, answered: true }),
    ]
    expect(isBookFinished(legacy)).toBe(true) // old model: looked finished

    const repaired = repairLegacySkips(legacy)
    expect(isChapterPoolVisible(repaired)).toBe(true) // section comes back
    expect(isBookFinished(repaired)).toBe(false) // genuinely not finished
    expect(repaired.filter(isChapterToGo)).toHaveLength(2)
  })
})

describe("shared read-aloud book reaches every child's Today (FUNC-09)", () => {
  it('mounts the read-aloud section for a child with NO per-child pool yet', () => {
    // London: shared weeks/{weekStart}.readAloudBookId resolves a book, but no
    // per-child bookProgress/question pool has been generated for him. The
    // section must still mount so the shared book reaches his Today.
    expect(isReadAloudSectionVisible(true, undefined)).toBe(true)
    expect(isReadAloudSectionVisible(true, [])).toBe(true)
  })

  it('does not mount when there is no shared book', () => {
    expect(isReadAloudSectionVisible(false, undefined)).toBe(false)
    expect(isReadAloudSectionVisible(false, [toGo(1)])).toBe(false)
  })

  it('shows the section while a per-child pool still has to-go chapters', () => {
    expect(isReadAloudSectionVisible(true, [answered(1), toGo(2)])).toBe(true)
  })

  it('unmounts the section once the per-child pool is finished (FUNC-07 unchanged)', () => {
    // Section visibility is decoupled from plan presence, NOT from completion:
    // a finished book still closes the kid section.
    expect(isReadAloudSectionVisible(true, [answered(1), skipped(2)])).toBe(false)
  })

  it('keeps bookProgress per-child while the book id stays shared', () => {
    // Both kids resolve the SAME shared book id, but write/read their own
    // bookProgress doc — one child's answers never appear under the other.
    const sharedBookId = 'lion-witch-wardrobe'
    const lincolnDoc = bookProgressDocId('lincoln', sharedBookId)
    const londonDoc = bookProgressDocId('london', sharedBookId)
    expect(lincolnDoc).not.toBe(londonDoc)
    expect(lincolnDoc).toContain(sharedBookId)
    expect(londonDoc).toContain(sharedBookId)
  })
})

describe('kid chapter view has no skip control (FUNC-07)', () => {
  it('KidChapterPool never writes a skip — skipping is parent-only', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/today/KidChapterPool.tsx'),
      'utf8',
    )
    // The kid surface answers chapters; it must not write `skipped` nor render
    // any "Skip" affordance. Skipping originates only from the parent surface.
    expect(src).not.toMatch(/skipped:\s*true/)
    expect(src).not.toMatch(/Skip this chapter/i)
  })
})
