/**
 * No Cloud Function under `functions/src/ai/` may sum a family's minutes itself
 * again (`FIX-236` / `UX-410`).
 *
 * The agreement test beside this one proves that today's readers report the same
 * number. It cannot see a NEW reader that never joins it — and the three this
 * row fixed were exactly that: arithmetic written inline, beside the shared
 * rule, never compared to anything, feeding a prompt rather than a screen. So
 * this is the structural half: a scan that fails closed on a minute-summing
 * expression in that directory unless it is named here with its reason.
 *
 * **A source scan is a naming convention and not a type check**, which is a
 * limit and is stated rather than presented as proof (AUDIT-234's round-1
 * lesson): it catches the shapes below, not every conceivable way to add two
 * numbers. What it does guarantee is that the obvious way — the way all three
 * of the fixed readers were written — cannot land unnoticed.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const AI_DIR = 'functions/src/ai'

/**
 * A minute-summing expression, in the four shapes this codebase actually writes:
 * `x += …minutes`, `…Minutes += …`, a `?? 0` bucket accumulation (the shape the
 * weekly prompt's `HOURS BY SUBJECT` used), and a `reduce` over minutes.
 */
const SUMMING =
  /(\+=[^;]*[Mm]inutes|[Mm]inutes[^;]*\+=|\?\?\s*0\)\s*\+[^;]*[Mm]inutes|\.reduce\([^;]*[Mm]inutes)/

/**
 * The lines allowed to match, each by its exact text, with the reason. A file is
 * never allowlisted whole: `evaluate.ts` is one of the three this row fixed, so
 * a second summing line appearing in it must fail even though a first one is
 * permitted here.
 */
const ALLOWED: Array<{ file: string; line: string; because: string }> = [
  {
    file: 'tasks/monthlyHours.ts',
    line: '(minutesBySubject[c.subjectBucket] ?? 0) + c.minutes;',
    because:
      'THE per-subject accumulation inside that same fold — the line the weekly prompt used to have its own copy of.',
  },
  {
    file: 'tasks/monthlyHours.ts',
    line: 'for (const minutes of Object.values(minutesBySubject)) totalMinutes += minutes;',
    because:
      'THE fold from contributions to {total, bySubject} — the one definition every prompt-side reader now calls through.',
  },
  {
    file: 'evaluate.ts',
    line: 'readingTotalMinutes += totalMinutes;',
    because:
      'Cumulative minutes on the books touched this week — a reading-effort proxy on the evidence strip, never an hours figure, and never folded into one.',
  },
]

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

describe('no AI-side Cloud Function counts hours its own way (UX-410)', () => {
  const found: Array<{ file: string; line: string }> = []
  for (const file of tsFiles(AI_DIR)) {
    const rel = file.slice(AI_DIR.length + 1)
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim()
      if (SUMMING.test(line)) found.push({ file: rel, line })
    }
  }

  it('finds only the lines named above, each with a reason', () => {
    const allowed = new Set(ALLOWED.map((a) => `${a.file}::${a.line}`))
    const unexplained = found.filter((f) => !allowed.has(`${f.file}::${f.line}`))
    expect(
      unexplained,
      'A new minute sum under functions/src/ai/. Route it through ' +
        'promptHours.foldHoursForPrompt, or add it above with the reason it is a ' +
        'different question.',
    ).toEqual([])
  })

  it('every allowlisted line is still there, so the list cannot go stale', () => {
    for (const entry of ALLOWED) {
      expect(
        found.some((f) => f.file === entry.file && f.line === entry.line),
        `${entry.file} no longer contains the allowlisted line — remove it from the list.`,
      ).toBe(true)
    }
  })

  it('PROVES IT CAN FAIL — the arithmetic this row deleted would be caught', () => {
    // `loadHoursSummary`'s own two lines, verbatim as they stood before FIX-236.
    expect(SUMMING.test('totalMinutes += data.minutes || 0;')).toBe(true)
    expect(SUMMING.test('if (data.hours) totalMinutes += data.hours * 60;')).toBe(true)
    // …and the weekly prompt's two, including the bucket accumulation, which is
    // the shape a `+=` scan alone would have walked straight past.
    expect(
      SUMMING.test('hoursBySubject[key] = (hoursBySubject[key] ?? 0) + h.minutes;'),
    ).toBe(true)
    expect(SUMMING.test('totalMinutes += h.minutes;')).toBe(true)
  })
})
