import { describe, expect, it } from 'vitest'

import {
  ChapterSaveAudience,
  ChapterSaveRefusal,
  chapterSaveFailureNotice,
} from './chapterSaveOutcome'
import { expectKidLine } from '../../test/kidReadability'

/**
 * UX-355 — the sentence a chapter answer gets when it does not save.
 *
 * The write had no catch anywhere on its path and was called as
 * `void onChapterAnswered(...)` from three places across the parent and kid
 * surfaces, so a rejection was an unhandled promise rejection with nothing on
 * screen and the answer gone on the next load.
 *
 * POSITIVE CONTROL: collapse the two audiences onto one string and the kid
 * readability assertions below fail; collapse the two refusals and the
 * "different advice" test fails.
 */

describe('what a parent reads', () => {
  it('says the answer is not recorded, and what to do about it', () => {
    const notice = chapterSaveFailureNotice(
      ChapterSaveRefusal.Rejected,
      ChapterSaveAudience.Parent,
    )
    expect(notice.severity).toBe('error')
    expect(notice.text).toContain("didn't save")
    expect(notice.text).toContain('try again')
  })

  it('gives different advice for a refusal retrying cannot fix', () => {
    const refused = chapterSaveFailureNotice(
      ChapterSaveRefusal.NoTarget,
      ChapterSaveAudience.Parent,
    )
    const rejected = chapterSaveFailureNotice(
      ChapterSaveRefusal.Rejected,
      ChapterSaveAudience.Parent,
    )
    expect(refused.text).not.toBe(rejected.text)
    expect(refused.text).toContain('Reload')
  })

  it('never claims a rollback — nothing moved optimistically here', () => {
    for (const reason of Object.values(ChapterSaveRefusal)) {
      const notice = chapterSaveFailureNotice(reason, ChapterSaveAudience.Parent)
      expect(notice.text).not.toContain('back to how it was')
    }
  })
})

describe('what a six-year-old reads', () => {
  it('holds both sentences to the shared kid readability bar', () => {
    for (const reason of Object.values(ChapterSaveRefusal)) {
      const notice = chapterSaveFailureNotice(reason, ChapterSaveAudience.Kid)
      expectKidLine(notice.text, `kid chapter-save notice (${reason})`)
      expect(notice.severity).toBe('error')
    }
  })

  it('names the only action a small boy actually has', () => {
    expect(
      chapterSaveFailureNotice(ChapterSaveRefusal.NoTarget, ChapterSaveAudience.Kid).text,
    ).toContain('grown up')
  })

  it('is not the parent copy', () => {
    for (const reason of Object.values(ChapterSaveRefusal)) {
      expect(
        chapterSaveFailureNotice(reason, ChapterSaveAudience.Kid).text,
      ).not.toBe(chapterSaveFailureNotice(reason, ChapterSaveAudience.Parent).text)
    }
  })
})
