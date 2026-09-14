/* eslint-disable react-refresh/only-export-components --
 * A vitest harness, never mounted by the app and never hot-reloaded. Splitting
 * its two components away from the three helpers that drive them would put one
 * rule in two files for a guarantee (fast refresh) that does not apply here.
 */
/**
 * The ONE harness for *"the shell's chip is the only way the child changes"* —
 * `FEAT-237` / `UX-425`.
 *
 * `UX-425` removed the ten in-page `ChildSelector`s. Every one of those pages
 * had been reading `useActiveChild` all along and merely rendering a second
 * control onto the same store, so what has to keep working afterwards is one
 * mechanism, not ten: a tap in the shell's `ChildSwitcherChip` moves the shared
 * active child, and every mounted consumer follows. Nine copies of that proof
 * would be nine chances to prove it against nine different mocks.
 *
 * **It mocks only the Firestore edges.** The real `useActiveChild`, the real
 * `activeChildStore`, the real `childrenStore` and the real `canSwitchChild` /
 * `canOpenChildMenu` rules all run — a harness that stubbed the hook could not
 * fail on the thing being asserted. What is stubbed is `useChildren`'s document
 * load (replaced by the two shared stores, which are the real ones) and the
 * avatar profile read.
 *
 * Inherited from `ContextBar.childSwitcher.test.tsx`, which built this shape
 * for `UX-362` and no longer needs it to itself.
 *
 * The `useChildren` replacement lives in the sibling `sharedChildrenMock.ts`
 * rather than here — see that file for why importing it from here would hang
 * every test that used it.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ChildSwitcherChip from '../components/ChildSwitcherChip'
import { useActiveChild } from '../core/hooks/useActiveChild'
import { setActiveChildIdShared } from '../core/hooks/activeChildStore'
import { __resetSharedChildren, setSharedChildren } from '../core/hooks/childrenStore'
import type { Child } from '../core/types'

export const HARNESS_CHILDREN = [
  { id: 'c1', name: 'Lincoln' },
  { id: 'c2', name: 'London' },
] as Child[]

/** Start a case from a known family. Call it in `beforeEach`. */
export function seedHarnessChildren(
  children: Child[] = HARNESS_CHILDREN,
  activeId: string = children[0]?.id ?? '',
): void {
  __resetSharedChildren()
  setSharedChildren(children)
  setActiveChildIdShared(activeId)
}

/**
 * The shell, as far as this rule is concerned: the one chip, which is where a
 * parent chooses the child on every screen in the product.
 */
export function ShellHeader() {
  return <ChildSwitcherChip />
}

/**
 * A page, as far as this rule is concerned: something that reads the hook and
 * renders what it got. Every one of the ten former selector hosts is this
 * shape — they alias `useActiveChild()` and read `activeChildId` /
 * `activeChild` from it.
 */
export function PageBody() {
  const { activeChild, activeChildId } = useActiveChild()
  return (
    <div data-testid="page-body">
      {activeChild ? `${activeChild.name} (${activeChildId})` : 'no child'}
    </div>
  )
}

/** Switch child the only way the app now offers: in the shell's chip. */
export async function switchChildInHeader(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /^Switch child/ }))
  await userEvent.click(screen.getByRole('menuitem', { name }))
}

/** What the page body reads as, for an assertion that names the child. */
export function pageBodyText(): string {
  return screen.getByTestId('page-body').textContent ?? ''
}
