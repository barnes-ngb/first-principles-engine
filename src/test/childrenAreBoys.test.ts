import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UX-268 — a rail, not a cleanup.
 *
 * The repo has been swept clean of gendered references to Lincoln and London
 * twice — `docs/LONDON_GENDER_VERIFY_2026-05.md` (May 2026) and this run's own
 * re-check (September 2026) — both finding zero real hits in code (prompts,
 * comments, JSX, tests, types). But the drift itself is real and recurring:
 * it has come back twice in four months, both times in prose (a design
 * conversation in May, an external review of the Drive Dad Lab charter in
 * September) — never in code. A sweep that has to be repeated on a schedule
 * is not a rail; this test is the rail for the one surface where "clean" can
 * actually be enforced going forward — source code, where "Lincoln"/"London"
 * and a feminine pronoun are both literal, greppable tokens, unlike free-form
 * prose where a pronoun's antecedent can't be told apart from a false hit
 * without a human reading it.
 *
 * Deliberately scoped to `src/` and `functions/src/`, NOT `docs/`: a
 * line-level scan of narrative doc prose produced overwhelming noise when
 * tried on this run (~50 candidate hits), almost all of it "she/her"
 * referring to Shelly in the same sentence as a child's name — the exact
 * false-positive shape both prior sweeps recorded by hand. Encoding that
 * disambiguation reliably needs more than a regex over prose, and a guard
 * that fires on Shelly's own pronoun gets disabled within a week rather than
 * trusted. Doc-level drift stays a job for periodic human/design review,
 * which is what caught it both times so far (see `docs/PROJECT_CONTEXT.md`'s
 * "London pronoun drift" flag for the one open instance, in Drive).
 */

const REPO_ROOT = join(__dirname, '..', '..')

const NAME_RE = /\b(Lincoln|London)\b/
const FEM_RE = /\b(she|her|hers|herself|girl|daughter|sister)\b/i

/**
 * Lines that are gendered-adjacent to a child's name by coincidence, not by
 * reference — each hand-verified, not guessed.
 */
const ALLOWED_LINE_SUBSTRINGS = [
  // shellyChat.ts's no-write contract: "her" is the PARENT being routed to a
  // child's tab ("send her to Lincoln's or London's tab") — the child's name
  // is a possessive on "tab", not the referent of "her".
  'send her to',
]

/** Files allowed to use "she/her" for a non-Lincoln/London female character. */
const ALLOWED_FILES = [
  // Stonebridge Banner Rally NPCs (Sister Anya, Elder Ironroot, ...) are
  // canonically female, and their bios read "How she helps Lincoln" — the
  // pronoun refers to the NPC, not to Lincoln.
  'functions/src/ai/stonebridgeBible.ts',
  // This file's own header documents the patterns it allows, by example —
  // that is metadata about the guard, not a surface using the pronoun.
  'src/test/childrenAreBoys.test.ts',
]

function codeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...codeFiles(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('Lincoln and London are both boys — no gendered drift in code (UX-268)', () => {
  it('finds no feminine pronoun or noun referring to either child', () => {
    const offenders: string[] = []
    const roots = [join(REPO_ROOT, 'src'), join(REPO_ROOT, 'functions', 'src')]
    for (const root of roots) {
      for (const file of codeFiles(root)) {
        const rel = file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')
        if (ALLOWED_FILES.includes(rel)) continue
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        lines.forEach((line, i) => {
          if (!NAME_RE.test(line) || !FEM_RE.test(line)) return
          if (ALLOWED_LINE_SUBSTRINGS.some((s) => line.includes(s))) return
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
        })
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
