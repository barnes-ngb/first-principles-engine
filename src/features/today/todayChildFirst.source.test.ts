import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const TODAY_PAGE = readFileSync(resolve(__dirname, './TodayPage.tsx'), 'utf8')
const CONTEXT_BAR = readFileSync(
  resolve(__dirname, '../../components/ContextBar.tsx'),
  'utf8',
)

/**
 * Comments stripped, because the rule is about what the page RENDERS — and
 * every comment in this area quotes the arrangement it replaced, so a scan that
 * cannot tell code from prose would make explaining the fix impossible. That is
 * the `[ledger-shape]` failure mode: a guard satisfied by the wrong input.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const PAGE = code(TODAY_PAGE)
const BAR = code(CONTEXT_BAR)

/**
 * `UX-362` / `UX-425` / `UX-426` — **which boy, before anything about him.**
 *
 * AUDIT-228's Today walkthrough counted six things about one particular child
 * rendering above the control that says which child: `ContextBar`'s name chip,
 * the page heading, the day arrows, `WeekRibbon`'s five Mon–Fri dots, the
 * draft/past/upcoming banner and `HelpStrip` — and only then the
 * `ChildSelector`. The chip was the worst of them, being `color="primary"
 * variant="outlined"` with no `onClick`: styled exactly like every *tappable*
 * chip in the app, and inert. `UX-362` made that chip the real switcher and
 * moved the selector up beside it.
 *
 * `UX-425` then removed BOTH of this page's child controls — the `ContextBar`
 * chip and the two `ChildSelector`s — because the shell's chip does the job and
 * the owner counted four of them on one screen. What survives is the ORDER and
 * the NAMING, which is what AUDIT-228 was actually about: the sentence saying
 * whose day this is still comes before anything else about him, in both
 * branches, and this page's heading is *Today* and names nobody.
 *
 * This is asserted as a source property rather than through a render because
 * `TodayPage` mounts around fifty subscriptions and a dozen dialogs; a
 * component test proves an ordering only for the paths it happens to reach,
 * which is how the original arrangement survived a green suite. The same call
 * `UX-343` / `UX-352` / `UX-358` made, one row earlier.
 *
 * POSITIVE CONTROLS: move the line back below `HelpStrip` in either branch, put
 * a bare `<Chip label={activeChild.name} …>` back in `ContextBar`, or re-add an
 * in-page selector. Each fails exactly one assertion below.
 */

/** The loaded page: everything after the second (and last) `<ContextBar`. */
function loadedReturn(): string {
  const last = PAGE.lastIndexOf('<ContextBar')
  expect(last).toBeGreaterThan(-1)
  return PAGE.slice(last)
}

/** The `!dayLog` branch: between the first `<ContextBar` and the second. */
function loadingReturn(): string {
  const first = PAGE.indexOf('<ContextBar')
  const last = PAGE.lastIndexOf('<ContextBar')
  expect(first).toBeGreaterThan(-1)
  expect(last).toBeGreaterThan(first)
  return PAGE.slice(first, last)
}

function orderedWithin(block: string, tokens: string[]): void {
  let previous = -1
  let previousToken = '(start)'
  for (const token of tokens) {
    const at = block.indexOf(token)
    expect(at, `not found in this branch: ${token}`).toBeGreaterThan(-1)
    expect(at, `${token} renders before ${previousToken}`).toBeGreaterThan(previous)
    previous = at
    previousToken = token
  }
}

describe('Today asks which child first (UX-362 / UX-426)', () => {
  it('puts the child line directly under the ContextBar on the loaded page', () => {
    orderedWithin(loadedReturn(), [
      '<ActiveChildLine',
      '{pageHeading}',
      'aria-label="Previous day"',
      '<WeekRibbon',
      '<HelpStrip',
    ])
  })

  it('puts it in the same place while the day is still loading', () => {
    // The two branches must agree: a line that jumps down the page once the day
    // log arrives is the same defect with a delay on it.
    orderedWithin(loadingReturn(), ['<ActiveChildLine', '{pageHeading}', '<HelpStrip'])
  })

  it('renders NO in-page child selector — UX-425 removed both', () => {
    // Owner, 2026-09-13: "I like the chip drop-down in the header as the primary
    // source; remove the others." This reverses the 2026-09-09 "the in-page
    // selectors stay" that the earlier form of this assertion pinned.
    expect(PAGE).not.toContain('<ChildSelector')
  })

  it('names the child for a kid too, and offers the switch hint to a parent only', () => {
    // Capability, never a name: the hint says where the child is CHANGED, and a
    // kid cannot change it. `isKidProfile` is `useActiveChild().isChildProfile`
    // (UX-358 — never a hand-written profile list), so this is the same answer
    // the chip in the shell gives.
    for (const branch of [loadedReturn(), loadingReturn()]) {
      expect(branch).toContain('<ActiveChildLine hint={!isKidProfile} />')
    }
    // Two branches, one line each — never a second copy in either.
    expect(PAGE.match(/<ActiveChildLine/g)).toHaveLength(2)
  })
})

describe('ContextBar draws no child control at all (UX-425)', () => {
  it('renders neither the shared switcher nor an import of it', () => {
    expect(BAR).not.toContain('<ChildSwitcherChip')
    expect(BAR).not.toContain("from './ChildSwitcherChip'")
  })

  it('still draws no chip out of the child NAME itself', () => {
    // `UX-362`'s defect was a second, inert copy of the shell's chip. Removing
    // the real one must not let the look-alike back in.
    expect(BAR).not.toContain('activeChild.name')
  })
})
