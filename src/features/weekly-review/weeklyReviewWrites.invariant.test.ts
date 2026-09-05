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
  it('never calls setDoc without { merge: true }', () => {
    for (const { file, text } of sources()) {
      const writes = countOf(text, /\bsetDoc\(/g)
      if (writes === 0) continue
      const merges = countOf(text, /merge:\s*true/g)
      expect(
        merges,
        `${file} has ${writes} setDoc call(s) but ${merges} merge flag(s) — a whole-document write here deletes the parent's answer`,
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
