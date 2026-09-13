/**
 * Print the monthly architecture audit's file-size numbers — ARCHITECTURE_AUDIT_*.
 *
 * `CLAUDE.md`'s derived-numbers rule: every number a review document asserts
 * whose source of truth is in this repository must come from a committed test
 * or script that derives it, and the number written down must be the number the
 * script prints. This is that script for the audit's file-size survey — a count
 * obtained by reading across the whole `src/` + `functions/src/` tree, which is
 * exactly the "survey" case the rule exists for (Codex's finding on
 * `ARCHITECTURE_AUDIT_2026-09-13.md`, PR #1845 round 1). Run it and paste from
 * it:
 *
 *     npm run census:arch-audit -- --base=<git-ref>
 *
 * `--base` is optional. Without it, only the size-ordered inventory prints (no
 * deltas) — still a full, base-independent snapshot survey. With it, every
 * production file that grew by more than 150 lines since that ref is also
 * printed, which is the audit prompt's own "drift since last audit" rule (Step
 * 1: "Any file that grew >150L since the last dated audit report"). The base
 * ref is the prior audit's own recorded window-start commit (named in that
 * audit's own header) — there is no single fixed base, because "since last
 * audit" moves every cycle by design; the script takes it as an argument
 * instead of hard-coding one so it stays runnable next cycle without editing.
 *
 * Non-test `.ts`/`.tsx` files under `src/` and `functions/src/` only — a test
 * file crossing a size threshold is not a decomposition candidate.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SCAN_DIRS = ['src', 'functions/src']
const SIZE_THRESHOLD = 1500
const DRIFT_THRESHOLD = 150

function isSourceFile(path: string): boolean {
  return (
    (path.endsWith('.ts') || path.endsWith('.tsx')) &&
    !path.endsWith('.test.ts') &&
    !path.endsWith('.test.tsx') &&
    !path.includes('/__tests__/')
  )
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'lib' || entry === 'dist') continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (isSourceFile(full)) out.push(full)
  }
}

function lineCount(path: string): number {
  const buf = readFileSync(path, 'utf8')
  if (buf.length === 0) return 0
  return buf.split('\n').length - (buf.endsWith('\n') ? 1 : 0)
}

const files: string[] = []
for (const dir of SCAN_DIRS) walk(join(ROOT, dir), files)

const rows = files
  .map((abs) => ({ path: relative(ROOT, abs).replace(/\\/g, '/'), lines: lineCount(abs) }))
  .sort((a, b) => b.lines - a.lines)

const large = rows.filter((r) => r.lines >= SIZE_THRESHOLD)

console.log(`non-test .ts/.tsx files scanned under src/ + functions/src/: ${rows.length}`)
console.log(`files >= ${SIZE_THRESHOLD}L: ${large.length}`)
for (const r of large) console.log(`  ${r.lines.toString().padStart(6)}  ${r.path}`)

// ── Zero-test feature directories (TEST-01's own ask: "re-list features with
// 0 test files") ─────────────────────────────────────────────────────────────
interface FeatureCounts {
  name: string
  sourceFiles: number
  testFiles: number
}

function countFeature(dir: string): FeatureCounts {
  let sourceFiles = 0
  let testFiles = 0
  const walkCount = (d: string): void => {
    for (const entry of readdirSync(d)) {
      if (entry === 'node_modules') continue
      const full = join(d, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walkCount(full)
      } else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
        testFiles += 1
      } else if (isSourceFile(full)) {
        sourceFiles += 1
      }
    }
  }
  walkCount(dir)
  return { name: relative(join(ROOT, 'src/features'), dir), sourceFiles, testFiles }
}

const featuresDir = join(ROOT, 'src/features')
const featureCounts = readdirSync(featuresDir)
  .filter((entry) => statSync(join(featuresDir, entry)).isDirectory())
  .map((entry) => countFeature(join(featuresDir, entry)))
  .sort((a, b) => a.name.localeCompare(b.name))

const zeroTest = featureCounts.filter((f) => f.testFiles === 0 && f.sourceFiles > 0)

console.log(`\nsrc/features/* directories scanned: ${featureCounts.length}`)
console.log(`directories with 0 *.test.ts(x) files (and >0 source files): ${zeroTest.length}`)
for (const f of zeroTest) console.log(`  ${f.name}  (${f.sourceFiles} source file(s), 0 tests)`)
console.log('all feature directories, source/test file counts:')
for (const f of featureCounts) console.log(`  ${f.name.padEnd(28)} src=${f.sourceFiles}  test=${f.testFiles}`)

const baseArg = process.argv.find((a) => a.startsWith('--base='))
if (!baseArg) {
  console.log(
    '\n(no --base given — pass e.g. `--base=<sha>` for the >150L drift-since-last-audit sweep)',
  )
  process.exit(0)
}
const base = baseArg.slice('--base='.length)

// `--numstat` on a rename/new/deleted file reports one row per path; a plain
// modification reports (insertions, deletions) for the same path both sides,
// so net delta = insertions - deletions is exactly the file's line-count
// change over the range, without a per-file `git show | wc -l` round trip.
const numstat = execFileSync(
  'git',
  ['diff', '--numstat', `${base}..HEAD`, '--', ...SCAN_DIRS],
  { cwd: ROOT, encoding: 'utf8' },
)

const deltas: { path: string; delta: number }[] = []
for (const line of numstat.split('\n')) {
  if (!line.trim()) continue
  const [insStr, delStr, path] = line.split('\t')
  if (!isSourceFile(path)) continue
  if (insStr === '-' || delStr === '-') continue // binary, skip
  const delta = Number(insStr) - Number(delStr)
  if (Math.abs(delta) > DRIFT_THRESHOLD) deltas.push({ path, delta })
}
deltas.sort((a, b) => b.delta - a.delta)

console.log(`\nsource-tree diff base: ${base}`)
console.log(`files with |net line delta| > ${DRIFT_THRESHOLD}L since base: ${deltas.length}`)
for (const d of deltas) {
  console.log(`  ${d.delta >= 0 ? '+' : ''}${d.delta.toString().padStart(6)}  ${d.path}`)
}
