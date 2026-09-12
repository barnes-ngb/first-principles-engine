/**
 * The file list the time-and-evidence registry is derived from — AUDIT-234.
 *
 * Split out of the pure rule (`timeLedgerSurfaces.ts`, which touches no I/O) so
 * the guard and `npm run census:time-ledger` read the SAME files by the same
 * definition. Two walkers would be two answers, and the whole point of this
 * registry is that the document and the rule cannot drift.
 *
 * **Both projects are walked**, unlike the child-switch census: the counting
 * rule is compiled by both (ARCH-47) and the surfaces that read it are on both
 * sides of the boundary — the weekly-review cron, the monthly book and two AI
 * context slices all read the hours record without any of them being in `src/`.
 * A census of "where time is written and read" that stopped at the client would
 * have missed the one reader that counts its own way.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SourceFile } from './timeLedgerSurfaces'

/** Repo root, resolved from this file rather than from `process.cwd()`. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const CENSUS_PATH = 'docs/review/TIME_AND_EVIDENCE_LEDGER_CENSUS_2026-09.md'

/** The two source trees, in the order the registry lists them. */
const TREES = ['src', 'functions/src'] as const

/**
 * Every non-test `.ts`/`.tsx` file under `src/` and `functions/src/`,
 * repo-relative with forward slashes.
 *
 * `src/test/` is excluded: no product surface lives there, and this registry's
 * own modules quote every collection name in their prose — scanning them would
 * have the guard counting itself as a writer of the hours record.
 */
export function loadSourceFiles(root: string = REPO_ROOT): SourceFile[] {
  const out: SourceFile[] = []
  const harness = join(root, 'src', 'test')
  const walk = (dir: string) => {
    if (dir === harness) return
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'lib' || entry === '__stubs__') continue
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry)) continue
      if (/\.test\.|\.d\.ts$/.test(entry)) continue
      out.push({
        path: relative(root, full).split('\\').join('/'),
        source: readFileSync(full, 'utf8'),
      })
    }
  }
  for (const tree of TREES) walk(join(root, tree))
  return out
}

/** The census markdown, read from disk. */
export function loadCensus(root: string = REPO_ROOT): string {
  return readFileSync(join(root, CENSUS_PATH), 'utf8')
}
