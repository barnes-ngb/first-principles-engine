/**
 * What the APP may reach into `functions/src/` for — and what it may not.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `functions/src/shared/` holds the rules with exactly one definition, compiled
 * by BOTH projects (ARCH-47), and its README states the constraint that makes
 * that possible: a module the app compiles may not import anything outside the
 * directory. What nothing checked was the constraint one level up — **which
 * `functions/src/` modules the app is allowed to import at all**.
 *
 * `FIX-236` broke it and CI caught it, which is the wrong place to find out.
 * `src/test/hoursReaderAgreement.test.ts` imported `foldWeekHours` from
 * `functions/src/ai/evaluate.ts` to assert the weekly reader beside the other
 * ten — reasonable-looking, and it pulled `firebase-admin`,
 * `firebase-functions/v2/https` and `firebase-functions/v2/scheduler` into the
 * app's type graph. Those are `functions/package.json` dependencies, not the
 * app's, so the root `tsc -b` resolves them only where `functions/node_modules`
 * happens to be installed — true on a workstation that has run the functions
 * suite, false in CI, which runs `npm ci` at the root alone. The result was a
 * green local verification and twenty-one `TS2307`s on the `test` job.
 *
 * So the rule is now asserted where it can fail before a push: every
 * `functions/src/…` module the app imports is walked through its own relative
 * imports, and **no module in that closure may import a bare package the app
 * does not itself depend on**.
 *
 * It is a scan over import statements, not a resolver, which is a limit rather
 * than a proof — and the first cut of that scan had a hole big enough to make it
 * green for the very failure it claims to prevent (Codex round 4, P2). It
 * matched only forms containing `from`, so a **side-effect import**
 * (`import 'firebase-functions/…'`) — which the root `tsc -b` still resolves and
 * which still produces the CI-only `TS2307` — was invisible, and worse, the lazy
 * span between `import` and `from` ran past it to the NEXT statement's
 * specifier. Three forms are read now: `from`-bearing imports and re-exports,
 * bare side-effect imports, and dynamic `import(…)` calls. Comments are stripped
 * first, because the modules this walks carry long docstrings that quote import
 * lines.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const APP_DIR = join(ROOT, 'src')
const FUNCTIONS_SRC = join(ROOT, 'functions/src')

/** The app's own dependencies — everything it may resolve at type-check time. */
const APP_PACKAGES = new Set([
  ...Object.keys(
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies ?? {},
  ),
  ...Object.keys(
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies ?? {},
  ),
  // Node builtins and the test runner, which the app compiles happily.
  'node:fs',
  'node:path',
  'node:url',
])

/** A throwaway directory for the parser's own fixtures. */
const SCRATCH = mkdtempSync(join(tmpdir(), 'fpe-import-scan-'))

/** `import … from 'x'` and `export … from 'x'`. */
const FROM_IMPORT = /\bfrom\s*['"]([^'"]+)['"]/g
/** `import 'x'` — a side-effect import, which resolves just like any other. */
const SIDE_EFFECT_IMPORT = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g
/** `import('x')` — dynamic, and still type-resolved. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * Strip block comments, and line comments that START a line.
 *
 * The block strip is what matters — the modules here carry docstrings that quote
 * `from '…'`. Line comments are stripped only when they open the line, so a
 * `'https://…'` inside code keeps its slashes and cannot be mangled into a
 * stray specifier.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?:^|\n)\s*\/\/[^\n]*/g, '\n')
}

function importsOf(file: string): string[] {
  const text = withoutComments(readFileSync(file, 'utf8'))
  const out: string[] = []
  for (const pattern of [FROM_IMPORT, SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
    for (const match of text.matchAll(pattern)) out.push(match[1])
  }
  return out
}

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Resolve a relative specifier the way both tsconfigs do (`.js` → `.ts`). */
function resolveRelative(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec).replace(/\.js$/, '')
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Every `functions/src/…` module the app imports, directly. */
function appEntryPoints(): string[] {
  const entries = new Set<string>()
  for (const file of tsFiles(APP_DIR)) {
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('.')) continue
      const target = resolve(dirname(file), spec)
      if (!target.startsWith(FUNCTIONS_SRC)) continue
      const resolved = resolveRelative(file, spec)
      if (resolved) entries.add(resolved)
    }
  }
  return [...entries]
}

/** Walk a module's relative imports and collect every bare package reached. */
function packagesReachedFrom(entry: string): Map<string, string> {
  const seen = new Set<string>()
  const packages = new Map<string, string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of importsOf(file)) {
      if (spec.startsWith('.')) {
        const next = resolveRelative(file, spec)
        if (next) queue.push(next)
        continue
      }
      if (!packages.has(spec)) packages.set(spec, relative(ROOT, file))
    }
  }
  return packages
}

describe('the app only reaches into functions/src for modules it can compile', () => {
  const entries = appEntryPoints()

  it('finds the imports at all — an empty scan would pass every check below', () => {
    expect(entries.length).toBeGreaterThan(3)
  })

  it('reaches no package the app does not itself depend on', () => {
    const offenders: string[] = []
    for (const entry of entries) {
      for (const [pkg, via] of packagesReachedFrom(entry)) {
        if (APP_PACKAGES.has(pkg) || pkg.startsWith('node:')) continue
        offenders.push(`${relative(ROOT, entry)} → ${pkg} (via ${via})`)
      }
    }
    expect(
      offenders,
      'The app compiles what it imports, and CI runs the root `tsc -b` with no ' +
        'functions/node_modules. Move the pure part into a module that imports ' +
        'nothing outside functions/src/shared, or assert it from the functions suite.',
    ).toEqual([])
  })

  it('reads a side-effect import, which the first cut of this scan could not', () => {
    // The round-4 finding, asserted as the parser property rather than as prose:
    // `import 'x'` resolves exactly like any other import and produces the same
    // CI-only TS2307, and a scan that needs a `from` sees neither it nor — worse
    // — the statement after it.
    const seen = (source: string) => {
      const file = join(SCRATCH, `boundary-${Math.random().toString(36).slice(2)}.ts`)
      writeFileSync(file, source, 'utf8')
      try {
        return importsOf(file)
      } finally {
        rmSync(file, { force: true })
      }
    }

    expect(seen("import 'firebase-functions/v2/https'\n")).toEqual([
      'firebase-functions/v2/https',
    ])
    // The capture bug: the side-effect import used to be skipped AND the lazy
    // span swallowed the statement after it.
    expect(
      seen("import 'side-effect'\nimport { x } from './y.js'\n"),
    ).toEqual(expect.arrayContaining(['side-effect', './y.js']))
    expect(seen("const m = await import('firebase-admin')\n")).toEqual([
      'firebase-admin',
    ])
    // …and a docstring that quotes an import line is not one.
    expect(seen("/** see `import x from 'not-a-dep'` */\nexport const a = 1\n")).toEqual([])
  })

  it('PROVES IT CAN FAIL — the import FIX-236 had to withdraw', () => {
    // `evaluate.ts` is the module that broke CI. It is still there, still
    // importing firebase-admin; what changed is that nothing under `src/` points
    // at it. If this assertion ever goes false, the scan above has stopped
    // being able to tell.
    const reached = packagesReachedFrom(join(FUNCTIONS_SRC, 'ai/evaluate.ts'))
    expect([...reached.keys()]).toContain('firebase-admin/firestore')
    expect(entries.map((e) => relative(ROOT, e))).not.toContain(
      'functions/src/ai/evaluate.ts',
    )
  })
})
