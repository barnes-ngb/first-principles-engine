import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HOOK = readFileSync(resolve(__dirname, './useBackgroundReimagine.ts'), 'utf8')
const EDITOR = readFileSync(resolve(__dirname, './BookEditorPage.tsx'), 'utf8')

/** Comments stripped: the rule is about what the hook DOES, and every comment
 *  here quotes the behaviour it replaced. A scan that cannot tell code from
 *  prose is the `[ledger-shape]` failure — a guard satisfied by the wrong
 *  input. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const HOOK_CODE = code(HOOK)

/**
 * **`UX-333` — a reimagined picture belongs to the child it was started for**,
 * raised as a P2 by Codex round 2 on `FIX-231`'s PR and fixed there.
 *
 * This was the one census row whose **Reachable by a switch today?** column
 * reads *"Shell only"* among the six that were still open when
 * `CHILD_SWITCHER_ENABLED` was flipped back on: Books has no in-page
 * `ChildSelector`, so unlike `UX-331` / `UX-332` / `UX-335` / `UX-341` it was
 * **not** already reachable. Turning the switcher on is what opened it, which
 * makes it this run's to close rather than `FIX-232`'s.
 *
 * The defect: `BookEditorPage` derives the hook's `childId` as
 * `book?.createdFor ?? activeChild?.id`, so on a **legacy book with no
 * `createdFor`** it follows the live child. A reimagine is a paid call that
 * lands minutes later, and the auto-save effect then writes `stickerLibrary`
 * and portfolio `artifacts` with whatever `childId` is rendered at that moment
 * — permanently filing one boy's picture in the other's gallery.
 *
 * BIND, not RESET (the `useCreativeTimer.ownerChildId` answer, `UX-327`): the
 * work is done and was paid for, so the **write** is bound to the child it was
 * started for. No picture changes; only whose it is.
 *
 * Asserted as a source property because the hook takes eleven options, owns an
 * async generation with a stopwatch, and writes two collections from an effect
 * — the `dayStatusSaveReporting` / `todayChildFirst` idiom for a surface a
 * render test can only reach along the paths it happens to take.
 *
 * POSITIVE CONTROLS, one per case: drop `ownerChildId` from the `setJob` call;
 * change either write back to the bare `childId`. Each fails exactly one
 * assertion below.
 */

/** The body of a named `useCallback`, up to but NOT including its dependency
 *  array — a bare `childId,` is legitimate as a dependency and is the thing the
 *  payload assertions below must not confuse it with. */
function blockOf(name: string): string {
  const start = HOOK_CODE.indexOf(`const ${name} = useCallback(`)
  expect(start, `no ${name} in the hook`).toBeGreaterThan(-1)
  const end = HOOK_CODE.indexOf('  )', start)
  expect(end).toBeGreaterThan(start)
  const whole = HOOK_CODE.slice(start, end)
  const deps = whole.lastIndexOf('    [')
  return deps > -1 ? whole.slice(0, deps) : whole
}

/** The same callback's dependency array alone. */
function depsOf(name: string): string {
  const start = HOOK_CODE.indexOf(`const ${name} = useCallback(`)
  const end = HOOK_CODE.indexOf('  )', start)
  const whole = HOOK_CODE.slice(start, end)
  const deps = whole.lastIndexOf('    [')
  expect(deps, `no dependency array on ${name}`).toBeGreaterThan(-1)
  return whole.slice(deps)
}

describe('a reimagine job carries the child it was started for (UX-333)', () => {
  it('stamps the owner when the job starts', () => {
    const start = HOOK_CODE.slice(
      HOOK_CODE.indexOf('setJob({'),
      HOOK_CODE.indexOf('try {', HOOK_CODE.indexOf('setJob({')),
    )
    expect(start).toContain('ownerChildId: childId')
    expect(start).toContain('ownerChildName: childName')
  })

  it('declares the owner on the job type, so a new job cannot omit it', () => {
    // Required, not optional: a call site that forgets fails to compile rather
    // than falling through to the live child.
    expect(HOOK_CODE).toMatch(/\n {2}ownerChildId: string\n/)
    expect(HOOK_CODE).toMatch(/\n {2}ownerChildName: string\n/)
  })
})

describe('every write reads the job’s owner, never the live child (UX-333)', () => {
  it('the stickerLibrary write is bound', () => {
    const block = blockOf('saveToGallery')
    expect(block).toContain('job?.ownerChildId || childId')
    expect(block).toContain('childId: ownerId')
    // The bare live prop must not be what is written.
    expect(block).not.toMatch(/^\s+childId,$/m)
  })

  it('the portfolio artifact write is bound', () => {
    const block = blockOf('saveEnhancedArtifact')
    expect(block).toContain('job?.ownerChildId || childId')
    expect(block).toContain('childId: ownerId')
    expect(block).not.toMatch(/^\s+childId,$/m)
  })

  it('the saved label names the owner, not whoever is on screen', () => {
    // A picture filed under the right child with the other child's name on it
    // is the same defect wearing a label.
    expect(blockOf('saveToGallery')).toContain("`${ownerName}'s reimagined drawing`")
  })

  it('both writes list the owner among their dependencies', () => {
    // Otherwise the memoized callback keeps the first job's owner forever —
    // `useBook.persist`'s lesson (UX-345) on a second hook.
    expect(depsOf('saveToGallery')).toContain('job?.ownerChildId')
    expect(depsOf('saveEnhancedArtifact')).toContain('job?.ownerChildId')
  })
})

describe('the defect this closes is real, not hypothetical (UX-333)', () => {
  it('BookEditorPage still falls back to the live child for a legacy book', () => {
    // The fallback is correct — a book with no `createdFor` has no recorded
    // owner — and it is exactly why the JOB has to carry one.
    expect(code(EDITOR)).toContain("book?.createdFor ?? activeChild?.id")
  })

  it('Books has no in-page ChildSelector, so the shell switcher is the route', () => {
    expect(code(EDITOR)).not.toContain('<ChildSelector')
  })
})
