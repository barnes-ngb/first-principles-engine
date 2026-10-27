import { describe, expect, it } from 'vitest'

import { loadSourceFiles, stripComments } from './childSwitchSources'

/**
 * **One write lane for a read-aloud's Curriculum row** — FEAT-243 / UX-470.
 *
 * The row is created only by `planner-chat/readAloudConfigWrites.ts`, through
 * the pure `buildReadAloudConfig`; every other surface (the planner's Apply,
 * its active-phase book change, the one-tap *Add to Curriculum*) calls that one
 * writer. A second copy of the create — in Today, in the chat, anywhere — would
 * be a second answer to *does this row already exist*, which is how the UX-231
 * duplicates were made.
 *
 * Also pinned: **the single Apply is untouched** (`applyWeekPlan.ts` does not
 * know read-aloud rows exist — this is an enrichment beside it, like the
 * chapter pool), and the writer writes **no position** and touches neither
 * `bookProgress` nor `chapterBooks`.
 *
 * POSITIVE CONTROL: the rule is stated as a function over a file list and run
 * once over a list carrying a planted second writer, which must fail.
 */

const WRITER = 'src/features/planner-chat/readAloudConfigWrites.ts'

type File = { path: string; source: string }

function laneViolations(files: File[]): string[] {
  const out: string[] = []
  for (const file of files) {
    const code = stripComments(file.source)
    if (file.path === WRITER || file.path.endsWith('/readAloudCurriculum.ts')) continue
    if (/\bbuildReadAloudConfig\s*\(/.test(code)) out.push(`${file.path}: builds a read-aloud row`)
    if (/['"`]readaloud-/.test(code)) {
      out.push(`${file.path}: spells a read-aloud row id by hand`)
    }
  }
  return out
}

const files = loadSourceFiles()

describe('read-aloud Curriculum rows have one write lane (FEAT-243)', () => {
  it('only the writer builds the row', () => {
    expect(laneViolations(files)).toEqual([])
  })

  it('the guard fails on a planted second writer (positive control)', () => {
    const planted: File = {
      path: 'src/features/today/sneakyReadAloud.ts',
      source: "import { buildReadAloudConfig } from '../planner-chat/readAloudCurriculum'\nsetDoc(ref, buildReadAloudConfig(book, now))",
    }
    expect(laneViolations([...files, planted])).toHaveLength(1)
  })

  it('the single Apply does not know about read-aloud rows', () => {
    const apply = files.find((f) => f.path === 'src/features/planner-chat/applyWeekPlan.ts')
    expect(apply).toBeDefined()
    expect(stripComments(apply!.source)).not.toMatch(/readAloudConfig|ensureReadAloud|readAloudCurriculum/)
  })

  it('the writer writes no position and leaves bookProgress / chapterBooks alone', () => {
    const writer = files.find((f) => f.path === WRITER)
    expect(writer).toBeDefined()
    const code = stripComments(writer!.source)
    expect(code).not.toMatch(/currentPosition|totalUnits/)
    expect(code).not.toMatch(/bookProgress|chapterBooks/)
    expect(code).toMatch(/runTransaction/)
  })
})
