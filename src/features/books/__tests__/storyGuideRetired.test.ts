import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// FEAT-187 — the Story Guide wizard retires.
//
// It was the third way to make a book: an older question wizard reachable only
// from a buried link inside the Generate tab, calling the same `generateStory`
// with its own rules (no style picker, weak words always folded in, its own
// finish screen that auto-navigated 1.5 s later). The Generate chat now covers
// "tell me your idea"; Create a Sight Word Book covers "here are the words".
//
// A deletion guard, not a behaviour test: a retired surface that leaves its
// modules behind gets re-imported. Compilation catches an import of a deleted
// file, but not a file quietly restored and left unreferenced — so this reads
// the tree.

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const SRC = join(REPO_ROOT, 'src')

const RETIRED_MODULES = [
  'src/features/books/StoryGuidePage.tsx',
  'src/features/books/StoryGuideQuestion.tsx',
  'src/features/books/useStoryGuide.ts',
  // The wizard's own finish screen — the UX-115 surface. The Generate chat has
  // its own progress + cap notice, which holds for a tap.
  'src/features/books/GenerationProgress.tsx',
]

/** Every .ts/.tsx file under `src`, so the sweep cannot miss a new caller. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/**
 * Drop `/* … *\/` blocks (which is also how a JSX comment is written) and `//`
 * lines, so a retirement note explaining the wizard does not read as a surface
 * still offering it. Crude on purpose — it can strip a `//` inside a string
 * literal, and the only cost of that is a slightly smaller haystack.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('the Story Guide is retired', () => {
  it('has no module left on disk', () => {
    for (const rel of RETIRED_MODULES) {
      expect(existsSync(join(REPO_ROOT, rel)), `${rel} still exists`).toBe(false)
    }
  })

  it('is imported by nothing under src/', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (/from ['"][^'"]*\/(StoryGuidePage|StoryGuideQuestion|useStoryGuide|GenerationProgress)['"]/.test(text)) {
        offenders.push(file)
      }
      if (/vi\.mock\(['"][^'"]*\/(StoryGuidePage|StoryGuideQuestion|useStoryGuide|GenerationProgress)['"]/.test(text)) {
        offenders.push(file)
      }
    }
    expect(offenders, `still importing a retired module: ${offenders.join(', ')}`).toEqual([])
  })

  it('leaves no route pointing at the removed page — /books/story-guide redirects', () => {
    const router = readFileSync(join(SRC, 'app', 'router.tsx'), 'utf8')
    expect(router).not.toContain('StoryGuidePage')
    // The ARCH-07 ladders precedent: the route is kept as a redirect so an old
    // link still lands somewhere real — the shelf, where the door is.
    const route = router
      .split(/\r?\n/)
      .find((l) => l.includes("path: '/books/story-guide'"))
    expect(route, 'the /books/story-guide route is gone entirely').toBeTruthy()
    expect(route).toContain('<Navigate')
    expect(route).toContain('to="/books"')
    expect(route).toContain('replace')
  })

  it('leaves no surface naming it to a person', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      // Tests are not surfaces — several of them assert the wizard's *absence*,
      // which means naming it.
      if (/\.test\.tsx?$/.test(file)) continue
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const line of text.split(/\r?\n/)) {
        // The kept redirect is the one live mention of the path, and it takes
        // an old link to the shelf rather than offering the wizard.
        if (line.includes("path: '/books/story-guide'")) continue
        if (/Story Guide|story-guide/i.test(line)) offenders.push(`${file}: ${line.trim()}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
