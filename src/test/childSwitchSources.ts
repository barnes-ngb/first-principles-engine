/**
 * The file list the child-switch registry is derived from — UX-329.
 *
 * Split out of the pure rule (`childSwitchSurfaces.ts`, which touches no I/O)
 * so the guard and `npm run census:child-switch` read the SAME files by the
 * same definition. Two walkers would be two answers, and the whole point of
 * this registry is that the document and the rule cannot drift.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SourceFile } from './childSwitchSurfaces'

/** Repo root, resolved from this file rather than from `process.cwd()`. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const CENSUS_PATH = 'docs/review/CHILD_SWITCH_SURFACE_CENSUS_2026-09.md'

/**
 * Every non-test `.ts`/`.tsx` file under `src/`, repo-relative with forward
 * slashes.
 *
 * `src/test/` is excluded: it holds the vitest setup and the shared assertion
 * helpers, no product surface lives there, and this registry's own modules
 * quote `useActiveChild` in their prose — scanning them would have the guard
 * counting itself as a surface.
 */
export function loadSourceFiles(root: string = REPO_ROOT): SourceFile[] {
  const out: SourceFile[] = []
  const harness = join(root, 'src', 'test')
  const walk = (dir: string) => {
    if (dir === harness) return
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
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
  walk(join(root, 'src'))
  return out
}

/** The census markdown, read from disk. */
export function loadCensus(root: string = REPO_ROOT): string {
  return readFileSync(join(root, CENSUS_PATH), 'utf8')
}
