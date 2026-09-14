import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **One place to choose the child** — `FEAT-237` / `UX-425`, the fail-closed
 * half.
 *
 * Owner, 2026-09-13, from the first post-deploy test: *"There are now as many
 * as four locations to choose a child. I like the chip drop-down in the header
 * as the primary source; remove the others. Keep the actual profile change
 * between parent and child."*
 *
 * Four controls were on Today alone — the mobile header chip, the nav drawer's
 * copy of it, `ContextBar`'s, and the `ChildSelector` card below — and nine
 * more pages carried a selector of their own. All of them wrote the same
 * `useActiveChild`, so none of them was *wrong*; what they were was four
 * answers to one question, a screen apart.
 *
 * **Why a source scan and not ten renders.** The mechanism has exactly one
 * definition: the chip calls `setActiveChildId`, the shared store notifies, and
 * every consumer of `useActiveChild` re-renders. That is proved end-to-end,
 * against the real hook and the real stores, in
 * `components/ChildSwitcherChip.menu.test.tsx` and
 * `components/ContextBar.childSwitcher.test.tsx`. Ten more renders would prove
 * it ten times against ten different mock sets — and three of these pages
 * (`TodayPage`, `PlannerChatPage`, `EvaluateChatPage`) mount dozens of
 * subscriptions and dialogs, where a component test proves a property only for
 * the paths it happens to reach. That is the call `todayChildFirst.source.test.ts`
 * already made, in the same area, for the same reason.
 *
 * What a render cannot catch and this does: an **eleventh** selector arriving on
 * a page nobody thought to write a render test for. So the rule is stated over
 * the whole tree rather than over a list.
 *
 * POSITIVE CONTROLS: render a `<ChildSelector>` anywhere under `src/`, drop
 * `useActiveChild` from one of the former hosts, give the drawer its chip back,
 * or render `ChildSwitcherChip` from a third site. Each fails exactly one
 * assertion below.
 */

import { loadSourceFiles, stripComments } from './childSwitchSources'

const SRC = resolve(__dirname, '..')
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8')

/**
 * Comments stripped — the rule is about what the code RENDERS, and every
 * comment touched by this run quotes the control it replaced. A scan that
 * cannot tell code from prose would make explaining the change impossible,
 * which is the `[ledger-shape]` failure: a guard satisfied by the wrong input.
 *
 * The SAME function the census script uses for its two published counts, so the
 * guard and the numbers in the registry cannot answer differently.
 */
const code = (source: string) => stripComments(source)

/** The ten pages that rendered an in-page `<ChildSelector>` before UX-425. */
const FORMER_HOSTS = [
  'features/today/TodayPage.tsx',
  'features/planner-chat/PlannerChatPage.tsx',
  'features/progress/CurriculumTab.tsx',
  'features/progress/FoundationsTab.tsx',
  'features/progress/DispositionProfile.tsx',
  'features/evaluation/SkillSnapshotPage.tsx',
  'features/evaluate/EvaluateChatPage.tsx',
  'features/review/ReviewPage.tsx',
  'features/weekly-review/WeeklyReviewPage.tsx',
] as const

/** Every non-test source file under `src/`, as the census script walks them. */
const allSources = () =>
  loadSourceFiles().map((f) => ({ path: f.path, source: code(f.source) }))

describe('UX-425 — nothing in the app renders a second child control', () => {
  it('no source file renders a <ChildSelector> — the component is gone', () => {
    const offenders = allSources()
      .filter((f) => /<ChildSelector\b/.test(f.source))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('nothing imports the deleted component either', () => {
    const offenders = allSources()
      .filter((f) => /from '[^']*\/ChildSelector'/.test(f.source))
      .map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('ChildSwitcherChip is rendered by the shell and by nothing else', () => {
    const hosts = allSources()
      .filter((f) => /<ChildSwitcherChip\b/.test(f.source))
      .map((f) => f.path)
    expect(hosts).toEqual(['src/app/AppShell.tsx'])
  })

  /**
   * The three that the run-prompt's `grep "<ChildSelector"` could not see.
   *
   * `ArmorTab`, `MyAvatarPage` and `AvatarAdminTab` each hand-rolled their own
   * child picker — a `Button` pair, a themed `Box` row and a `Chip` row — so
   * the owner's *"as many as four locations to choose a child"* was an
   * undercount on those screens. Removing the component while leaving three
   * copies of what it did would have made this run's whole claim false, so the
   * rule is stated over the ACT (calling the setter from a click) rather than
   * over the component.
   *
   * Three files still call `setActiveChildId`, and none of them is a picker:
   * each is a consequence of something else the person chose, and each is named
   * here so a fourth cannot join them quietly.
   */
  it('nothing in features offers a child to pick — only three consequences remain', () => {
    const callers = allSources()
      .filter((f) => f.path.startsWith('src/features/'))
      .filter((f) => /\bsetActiveChildId\s*\(/.test(f.source))
      .map((f) => f.path)
    expect(callers.sort()).toEqual([
      // Deleting the avatar profile you were on — fall back to one that exists.
      'src/features/settings/AvatarAdminTab.tsx',
      // Opening a monthly book follows to that book's child (the book is the pick).
      'src/features/monthly-review/MonthlyReviewReaderPage.tsx',
      // Resuming a draft follows to the draft's child — FEAT-188 `draftOwnership`.
      'src/features/books/BookshelfPage.tsx',
    ].sort())
  })

  it.each([
    'features/progress/ArmorTab.tsx',
    'features/avatar/MyAvatarPage.tsx',
    'features/settings/AvatarAdminTab.tsx',
  ])('%s renders no onClick that picks a child', (rel) => {
    expect(code(read(rel))).not.toMatch(/onClick=\{\(\)\s*=>\s*setActiveChildId\(/)
  })
})

describe('UX-425 — the shell renders ONE chip per viewport', () => {
  const SHELL = code(read('app/AppShell.tsx'))

  it('the drawer asks NavContent not to draw it', () => {
    // `NavContent` is both the desktop sidebar and the mobile drawer. On
    // desktop its chip is the only one on screen (the mobile header is
    // `display: none` above 900px), so it must render; in the drawer the
    // header's chip is visible above the open drawer, which is what the
    // owner's screenshot showed.
    expect(SHELL).toContain('showChildChip={false}')
    expect(SHELL.match(/showChildChip=\{false\}/g)).toHaveLength(1)
  })

  it('the sidebar keeps its chip by default', () => {
    expect(SHELL).toContain('showChildChip = true')
    expect(SHELL).toContain('{activeChild && showChildChip && (')
  })

  it('the profile switch is untouched — it is a different thing', () => {
    // Owner: "Keep the actual profile change between parent and child."
    expect(SHELL).toContain('<ProfileMenu />')
    expect(SHELL.match(/<ProfileMenu \/>/g)).toHaveLength(2)
  })
})

describe('UX-425 — every former host still follows the shell', () => {
  it.each(FORMER_HOSTS)('%s resolves its child from useActiveChild', (rel) => {
    const src = read(rel)
    // Two of the nine take the hook's result as a `childContext` prop from the
    // route shell rather than calling it themselves; both are the same object.
    expect(/useActiveChild/.test(src) || /UseActiveChildResult/.test(src)).toBe(true)
  })

  it.each(FORMER_HOSTS)('%s no longer calls setActiveChildId or addChild', (rel) => {
    const src = code(read(rel))
    expect(src).not.toMatch(/\bsetActiveChildId\b/)
    expect(src).not.toMatch(/\baddChild\b/)
  })
})

/**
 * `UX-426` — the five pages whose own heading names nobody keep a sentence
 * saying whose record this is.
 *
 * `UX-313`'s rule: a records surface names its target **before** the tap, never
 * in the receipt. On the other four the heading already does it
 * (*"Lincoln's Curriculum"*, *"Evaluate Lincoln"*, *"Lincoln's Skill
 * Snapshot"*), and a second naming would be the duplication this run removed.
 */
describe('UX-426 — a write surface with no name in its heading keeps one', () => {
  it.each([
    'features/today/TodayPage.tsx',
    'features/planner-chat/PlannerChatPage.tsx',
    'features/review/ReviewPage.tsx',
    'features/weekly-review/WeeklyReviewPage.tsx',
    'features/progress/FoundationsTab.tsx',
    'features/progress/DispositionProfile.tsx',
  ])('%s renders the shared ActiveChildLine', (rel) => {
    expect(code(read(rel))).toMatch(/<ActiveChildLine\b/)
  })

  it.each([
    'features/progress/CurriculumTab.tsx',
    'features/evaluation/SkillSnapshotPage.tsx',
    'features/evaluate/EvaluateChatPage.tsx',
  ])('%s names the child in its own heading instead', (rel) => {
    const src = code(read(rel))
    expect(src).not.toMatch(/<ActiveChildLine\b/)
    expect(src).toMatch(/(childName|activeChild\?\.name|activeChild\.name)/)
  })

  it('the line itself is copy — it reads no document and writes none', () => {
    const line = read('components/ActiveChildLine.tsx') + read('components/activeChildLine.ts')
    expect(line).not.toMatch(/\b(setDoc|addDoc|updateDoc|deleteDoc|runTransaction|writeBatch)\b/)
    expect(line).not.toMatch(/\bsetActiveChildId\b/)
  })
})
