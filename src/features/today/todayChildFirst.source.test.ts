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
 * `UX-362` — **which boy, before anything about him.**
 *
 * AUDIT-228's Today walkthrough counted six things about one particular child
 * rendering above the control that says which child: `ContextBar`'s name chip,
 * the page heading, the day arrows, `WeekRibbon`'s five Mon–Fri dots, the
 * draft/past/upcoming banner and `HelpStrip` — and only then the
 * `ChildSelector`. The chip was the worst of them, being `color="primary"
 * variant="outlined"` with no `onClick`: styled exactly like every *tappable*
 * chip in the app, and inert.
 *
 * This is asserted as a source property rather than through a render because
 * `TodayPage` mounts around fifty subscriptions and a dozen dialogs; a
 * component test proves an ordering only for the paths it happens to reach,
 * which is how the original arrangement survived a green suite. The same call
 * `UX-343` / `UX-352` / `UX-358` made, one row earlier.
 *
 * POSITIVE CONTROLS: move the selector back below `HelpStrip` in either branch,
 * or put a bare `<Chip label={activeChild.name} …>` back in `ContextBar`. Each
 * fails exactly one assertion below.
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

describe('Today asks which child first (UX-362)', () => {
  it('puts the selector directly under the ContextBar on the loaded page', () => {
    orderedWithin(loadedReturn(), [
      '<ChildSelector',
      '{pageHeading}',
      'aria-label="Previous day"',
      '<WeekRibbon',
      '<HelpStrip',
    ])
  })

  it('puts it in the same place while the day is still loading', () => {
    // The two branches must agree: a selector that jumps down the page once the
    // day log arrives is the same defect with a delay on it.
    orderedWithin(loadingReturn(), ['<ChildSelector', '{pageHeading}', '<HelpStrip'])
  })

  it('still renders the in-page selector — this is a reorder, not a removal', () => {
    // Owner: the in-page selectors stay. Both branches keep theirs.
    expect(PAGE.match(/<ChildSelector/g)).toHaveLength(2)
  })

  it('offers the selector to a parent only, in both branches', () => {
    // Capability, never a name: a kid gets his name as text. `isKidProfile` is
    // `useActiveChild().isChildProfile` (UX-358 — never a hand-written profile
    // list), so this is the same answer the chip above it gives.
    for (const branch of [loadedReturn(), loadingReturn()]) {
      const selectorAt = branch.indexOf('<ChildSelector')
      const gateAt = branch.indexOf('{isKidProfile ? (')
      expect(gateAt).toBeGreaterThan(-1)
      expect(gateAt).toBeLessThan(selectorAt)
      // The selector is in the ELSE arm — a kid never reaches it.
      const elseAt = branch.indexOf(') : (', gateAt)
      expect(elseAt).toBeGreaterThan(gateAt)
      expect(elseAt).toBeLessThan(selectorAt)
    }
  })
})

describe('ContextBar draws the shared switcher, never a look-alike (UX-362)', () => {
  it('renders ChildSwitcherChip', () => {
    expect(BAR).toContain('<ChildSwitcherChip />')
    expect(BAR).toContain("from './ChildSwitcherChip'")
  })

  it('no longer draws a chip out of the child NAME itself', () => {
    // The defect was a second, inert copy of the shell's chip. One definition
    // of "is this name a control" or the two can disagree again.
    expect(BAR).not.toContain('activeChild.name')
  })
})
