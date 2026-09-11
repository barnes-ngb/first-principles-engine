/**
 * Print the Today walkthrough's numbers — AUDIT-228.
 *
 * `CLAUDE.md`'s derived-numbers rule: every count a review document asserts
 * whose source of truth is in this repository must come from a committed test
 * or script that derives it, and the number written down must be the number the
 * script prints. Run it and paste from it:
 *
 *     npm run census:today
 *
 * ── What it counts, and what it deliberately does NOT ───────────────────────
 *
 * It counts the things that are expensive to recount and easy to get wrong: how
 * big the surface is, which collections it writes and from how many call sites,
 * and how many `console.error` / `console.warn` catches remain in it. Those are
 * surveys across a body of code larger than the change itself, which is the case
 * the rule exists for.
 *
 * It does **not** count the doors. `TODAY_WALKTHROUGH_2026-09.md` NAMES them in
 * a table instead, because a short list is its own check and cannot go stale
 * against a recount — the other half of the same rule.
 *
 * A collection reference is counted where the app NAMES it (`daysCollection(`,
 * `hoursCollection(`, …). That over-counts a read and a write in the same file
 * and is honest about it: the figure is *how often this area reaches for that
 * collection*, which is the thing a walk wants to know. Read/write intent is not
 * derivable by a regex, so the document states it per door by hand instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const TODAY_DIR = join(ROOT, 'src/features/today')

interface SourceFile {
  path: string
  source: string
  /** `source` with comments removed — what the counts below read. */
  code: string
  lines: number
}

/**
 * Comments stripped before counting, because a walkthrough's own prose about a
 * `console.error` would otherwise be counted as one. `lines` deliberately counts
 * the whole file: how big the surface is to read is the thing that figure means.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function isTestPath(path: string): boolean {
  return /\.test\.[tj]sx?$/.test(path) || path.includes('__tests__')
}

function walk(dir: string, out: SourceFile[] = []): SourceFile[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    const path = relative(ROOT, full).replaceAll('\\', '/')
    if (isTestPath(path)) continue
    const source = readFileSync(full, 'utf8')
    out.push({ path, source, code: stripComments(source), lines: source.split('\n').length })
  }
  return out
}

const files = walk(TODAY_DIR).sort((a, b) => a.path.localeCompare(b.path))
const totalLines = files.reduce((sum, f) => sum + f.lines, 0)

/** Every `xCollection(` the area names, and how many times. */
const collectionHits = new Map<string, number>()
for (const file of files) {
  for (const match of file.code.matchAll(/\b([a-zA-Z]+)Collection\s*\(/g)) {
    const name = match[1]
    collectionHits.set(name, (collectionHits.get(name) ?? 0) + 1)
  }
}

/** Catches that end in the console and nowhere a person can see. */
let consoleCatches = 0
const consoleByFile = new Map<string, number>()
for (const file of files) {
  const hits = file.code.match(/console\.(error|warn)\s*\(/g)?.length ?? 0
  if (hits > 0) {
    consoleCatches += hits
    consoleByFile.set(file.path, hits)
  }
}

const biggest = [...files].sort((a, b) => b.lines - a.lines).slice(0, 5)

console.log(`source files under src/features/today (non-test): ${files.length}`)
console.log(`lines of source in them: ${totalLines}`)
console.log('largest files:')
for (const f of biggest) {
  console.log(`  ${f.lines.toString().padStart(5)}  ${f.path.replace('src/features/today/', '')}`)
}
console.log(`collections named: ${collectionHits.size}`)
for (const [name, count] of [...collectionHits].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(3)}  ${name}Collection`)
}
console.log(`console.error / console.warn call sites: ${consoleCatches}`)
console.log(`  in ${consoleByFile.size} of ${files.length} files`)
