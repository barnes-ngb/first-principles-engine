import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UX-214 — nothing on this page may write the review document whole.
 *
 * The parent's answer lives on the same `weeklyReviews` document as the AI
 * narrative, and three things write that document: the client's *Mark as
 * Reviewed* and *Apply adjustments* handlers, and the answer itself. The two
 * handlers used to `setDoc` a whole review object rebuilt from local state —
 * which is a snapshot of whatever the listener last delivered. So an answer
 * saved a second earlier, or saved in another open tab, was deleted by a tap on
 * a button that has nothing to do with it.
 *
 * Merging only the fields each write owns removes the whole class: a write can
 * then only ever change what it names. This is a source-level invariant because
 * the failure is invisible in any single-writer test — it needs two writers and
 * a gap between them, which is exactly what nobody reproduces by hand.
 */

const DIR = import.meta.dirname

function sources(): { file: string; text: string }[] {
  return readdirSync(DIR)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((file) => ({ file, text: readFileSync(join(DIR, file), 'utf8') }))
}

const countOf = (text: string, re: RegExp): number =>
  (text.match(re) ?? []).length

describe('every weekly-review write is a merge', () => {
  it('never writes the document without { merge: true }', () => {
    for (const { file, text } of sources()) {
      // Both shapes that reach this document: the plain client write, and the
      // transactional one the Apply handler uses.
      const writes = countOf(text, /\bsetDoc\(|\btx\.set\(/g)
      if (writes === 0) continue
      const merges = countOf(text, /merge:\s*true/g)
      expect(
        merges,
        `${file} has ${writes} write(s) but ${merges} merge flag(s) — a whole-document write here deletes the parent's answer`,
      ).toBe(writes)
    }
  })

  it('never rebuilds a whole review object to write it back', () => {
    for (const { file, text } of sources()) {
      expect(text, `${file} spreads a whole review into a write`).not.toMatch(
        /const\s+updated:\s*WeeklyReview\s*=/,
      )
    }
  })
})

/**
 * UX-409 — the hours on this page are folded LIVE, never read off the document.
 *
 * The weekly run now records the week's counted minutes onto the review
 * (`hoursSummary`), because a record that cannot say what the narrative was
 * written from cannot answer whether the run happened at all. That is a stamped
 * reading, and a stamped reading rendered beside a live fold is two numbers for
 * one week — the exact failure UX-211 and the whole *Hours and Coverage* design
 * exist to prevent. A parent's hours must reconcile with the Records page and
 * the compliance pack, which fold live and cannot read this document.
 *
 * So the rule is structural: nothing in this directory may read the field.
 */
describe('the page never reads the recorded hours off the review (UX-409)', () => {
  it('folds live instead — no file here mentions hoursSummary', () => {
    for (const { file, text } of sources()) {
      expect(text, `${file} reads the stored hours summary`).not.toMatch(
        /\bhoursSummary\b/,
      )
    }
  })

  it('and the live fold is still the one it uses', () => {
    const section = readFileSync(join(DIR, 'WeekPaceSection.tsx'), 'utf8')
    expect(section).toMatch(/useWeekHours/)
  })
})
