import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pathKeepsLibraryReturnFlow } from './libraryReturnFlow'

/**
 * Every way out of the Books area, inventoried from the source.
 *
 * ── Why this guard exists ────────────────────────────────────────────────────
 *
 * The Stonebridge return is offered in ONE place — the shelf — and that is only
 * sufficient because every page the shelf opens comes back to the shelf. Today
 * that is true of all of them: the reader, the editor, the per-page review,
 * Stickers, the sight-word dashboard and the sight-word create page each exit
 * with `navigate('/books')`, and the onward hand-offs
 * (`/books/:id`, `/books/:id/read`, `/books/:id/review`) are inside the journey
 * too. The design turned on that fact, so it is asserted rather than remembered:
 * a new exit pointing at Today, the Knowledge Mine or anywhere else would end
 * the journey silently, and a child would lose the way back by reading a book.
 *
 * It is the `childSwitchSurfaces.invariant` shape: derived from the source, not
 * typed out, and **failing closed**. A destination that cannot be read — no
 * literal anywhere in the first argument — is reported rather than skipped,
 * because a guard that passes on what it could not read is worse than no guard.
 *
 * What a failure means is a decision, not a bug: either the new exit belongs in
 * the journey (add it to `pathKeepsLibraryReturnFlow`) or it deliberately ends
 * it (name it in `EXITS_THE_JOURNEY`, with the reason). Both are fine; being
 * silent is not.
 */

const BOOKS_DIR = resolve(process.cwd(), 'src/features/books')

/**
 * Exits that deliberately leave the journey, each with its reason.
 *
 * Empty today, and that is the finding: nothing in the Books area navigates out
 * of the Books area. The list exists so the next person has somewhere honest to
 * put one.
 */
const EXITS_THE_JOURNEY: Record<string, string> = {}

interface NavigateCall {
  file: string
  /** 1-indexed, for a message a person can act on. */
  line: number
  /** The first argument's text, as written. */
  argument: string
  /**
   * Every path literal in it, with `${…}` collapsed — a call whose target is a
   * conditional has two, and both are exits.
   */
  targets: string[]
  /** `navigate(-1)` and friends: a step in history, not a destination. */
  historyDelta: boolean
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.test\.|\.d\.ts$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/**
 * The text of a call's FIRST argument, from just after its `(`.
 *
 * A balanced walk rather than a regex, for the reason the child-switch registry
 * learned the hard way: the real shapes here nest. One call in `BookshelfPage`
 * passes a conditional spanning three lines, and another passes an options
 * object after the path — so "up to the first comma" and "up to the first `)`"
 * are both wrong, and a nested quantifier is how that census hung on this
 * repo's own source.
 */
function firstArgument(rest: string): string {
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < rest.length; i += 1) {
    const ch = rest[i]
    if (quote) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return rest.slice(0, i)
      depth -= 1
    } else if (ch === ',' && depth === 0) return rest.slice(0, i)
  }
  return rest
}

/** Path literals inside one argument, `${…}` collapsed to a placeholder. */
function pathLiterals(argument: string): string[] {
  const out: string[] = []
  const pattern = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(argument)) !== null) {
    const value = match[2].replace(/\$\{[^}]*\}/g, 'x')
    if (value.startsWith('/')) out.push(value)
  }
  return out
}

function navigateCalls(file: string): NavigateCall[] {
  const source = readFileSync(file, 'utf8')
  const rel = relative(process.cwd(), file).split('\\').join('/')
  const out: NavigateCall[] = []
  // Lower-case `navigate(` only: `useNavigate()` is the hook, not a call to it.
  const pattern = /\bnavigate\(/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const from = match.index + match[0].length
    const argument = firstArgument(source.slice(from)).trim()
    out.push({
      file: rel,
      line: source.slice(0, match.index).split('\n').length,
      argument,
      targets: pathLiterals(argument),
      historyDelta: /^-?\d+$/.test(argument),
    })
  }
  return out
}

const CALLS = sourceFiles(BOOKS_DIR).flatMap(navigateCalls)

describe('the Books area’s own exits', () => {
  it('has exits to inventory at all', () => {
    // The `[ledger-shape]` floor: a scan that reads nothing reports PASS on
    // everything, so the scan's own reach is asserted before anything else.
    expect(CALLS.length).toBeGreaterThan(10)
    expect(new Set(CALLS.map((c) => c.file)).size).toBeGreaterThan(4)
  })

  it('states every destination readably, so it can be inventoried', () => {
    const unreadable = CALLS.filter((c) => c.targets.length === 0 && !c.historyDelta).map(
      (c) => `${c.file}:${c.line} — navigate(${c.argument})`,
    )
    expect(
      unreadable,
      'this destination cannot be read from the source, so nobody can tell whether it leaves the journey — write the path, or decide it in a named helper this guard can be pointed at',
    ).toEqual([])
  })

  it('every one of them keeps the Stonebridge journey, or says it ends it', () => {
    const leaks: string[] = []
    for (const call of CALLS) {
      for (const target of call.targets) {
        if (pathKeepsLibraryReturnFlow(target)) continue
        if (target in EXITS_THE_JOURNEY) continue
        leaks.push(`${call.file}:${call.line} — navigate('${target}')`)
      }
    }
    expect(
      leaks,
      'this exit leaves the Books area, so a child who takes it loses the way back to the village — add it to the journey, or name it in EXITS_THE_JOURNEY with the reason',
    ).toEqual([])
  })

  it('and the shelf itself is what every page out of it comes back to', () => {
    // The fact the single return control rests on: one control on the shelf is
    // reachable from every page the shelf opens, because they all exit to it.
    const comingBack = new Set(
      CALLS.filter((c) => c.targets.includes('/books')).map((c) => c.file),
    )
    for (const page of [
      'src/features/books/BookReaderPage.tsx',
      'src/features/books/BookEditorPage.tsx',
      'src/features/books/BookReviewChat.tsx',
      'src/features/books/StickersPage.tsx',
      'src/features/books/SightWordDashboard.tsx',
      'src/features/books/CreateSightWordBook.tsx',
    ]) {
      expect(comingBack, `${page} has no exit to the shelf`).toContain(page)
    }
  })

  it('and a history step is still governed by where it lands', () => {
    // `navigate(-1)` has no destination to read; it is safe here because the
    // journey is ended by ARRIVING somewhere outside it, not by the call that
    // went there. Stated so the exception is a reason rather than a gap.
    for (const call of CALLS.filter((c) => c.historyDelta)) {
      expect(call.targets).toEqual([])
    }
  })

  it('and no named exception is left in without a reason', () => {
    for (const [path, reason] of Object.entries(EXITS_THE_JOURNEY)) {
      expect(reason.length, `${path}: say why it ends the journey`).toBeGreaterThan(20)
    }
  })
})
