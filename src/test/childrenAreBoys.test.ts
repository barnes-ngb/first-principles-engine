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
 *
 * Checks a 2-line sliding window, not just a single line: a name and its
 * pronoun can land on adjacent lines of a wrapped template literal or a JSX
 * block, and a single-line check would miss that split (Codex round 2). A
 * wider window was tried and rejected — at 5 lines it more than tripled the
 * false-positive count on this same codebase, each one a fresh NPC name or
 * comment needing its own allowlist entry, which is the "cries wolf" failure
 * mode this guard is trying to avoid.
 *
 * An allowlist entry strips ONLY its own matched text before re-testing the
 * window, rather than exempting the whole window outright (Codex round 3) —
 * so a second, unrelated pronoun added later in an edit still trips the
 * guard even when it sits right beside an already-allowed one. The one
 * exception is `functions/src/ai/stonebridgeBible.ts`, which reads "she"
 * fifteen times across five NPC bios ("How she helps Lincoln:** She teaches
 * him ...", plus a "she" in each NPC's Personality line) with no fixed
 * template a regex could reliably consume — but the file NEVER once uses
 * "her"/"hers"/"herself" (verified by grep on this run), because every "she"
 * in it is the NPC subject and a child is only ever the grammatical object,
 * named or "him". So for this one file specifically, "she" is dropped from
 * the trigger set and "her"/"hers"/"herself" stay live — Codex's own example
 * ("...Lincoln:** She guides her...") still trips the guard, because "her"
 * is exactly the token this carve-out does not touch.
 */

const REPO_ROOT = join(__dirname, '..', '..')

const NAME_RE = /\b(Lincoln|London)\b/
const FEM_RE = /\b(she|her|hers|herself|girl|daughter|sister)\b/i
/** stonebridgeBible.ts's carve-out (see header): "she" is never the risk there. */
const FEM_RE_WITHOUT_SHE = /\b(her|hers|herself|girl|daughter|sister)\b/i

/** The one file that gets `FEM_RE_WITHOUT_SHE` instead of `FEM_RE`. */
const STONEBRIDGE_BIBLE_PATH = 'functions/src/ai/stonebridgeBible.ts'

/** How many consecutive lines are joined before testing NAME_RE/FEM_RE. */
const WINDOW_LINES = 2

/**
 * Patterns whose matched text is stripped from a window before it's
 * re-tested against the fem-pronoun regex — each hand-verified against this
 * codebase's actual hits at `WINDOW_LINES`, and scoped to consume only the
 * pronoun(s) it names so a second, unrelated pronoun in the same window
 * still trips the guard. Matched case-insensitively.
 */
const ALLOWED_WINDOW_PATTERNS: RegExp[] = [
  // shellyChat.ts's no-write contract: "her" is the PARENT being routed to a
  // child's tab ("send her to Lincoln's or London's tab") — the child's name
  // is a possessive on "tab", not the referent of "her".
  /send her to/gi,
  // missions.ts's Sister Anya dialogue: the NPC's own name is the only
  // reason this window matches FEM_RE (via "sister").
  /sister anya/gi,
  // weeklyFocus.ts's one-off Elder Ironroot line: "the village wise woman
  // ... she asks \"what kind of village...\"" — a specific quoted clause,
  // not a general "she asks" allowance.
  /she asks "what kind of village/gi,
  // storyPracticeWords.ts's design-note comment: "Shelly typed ... and the
  // chat answered ... but answering a question she did not ask" — "she" is
  // Shelly, several lines above this exact clause.
  /a question she did not ask/gi,
  // The book/sticker revision fixture used across several test files
  // ("Make the dragon a girl named Sparkle.") — a listener's transcribed
  // feedback string, not a reference to either child.
  /dragon a girl/gi,
]

/** Files allowed to use "she/her" for a non-Lincoln/London female character. */
const ALLOWED_FILES = [
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
        const femRe = rel === STONEBRIDGE_BIBLE_PATH ? FEM_RE_WITHOUT_SHE : FEM_RE
        const lines = readFileSync(file, 'utf8').split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const windowText = lines.slice(i, i + WINDOW_LINES).join(' ')
          if (!NAME_RE.test(windowText)) continue
          let remaining = windowText
          for (const pattern of ALLOWED_WINDOW_PATTERNS) {
            remaining = remaining.replace(pattern, ' ')
          }
          if (!femRe.test(remaining)) continue
          offenders.push(`${rel}:${i + 1}: ${windowText.trim()}`)
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
