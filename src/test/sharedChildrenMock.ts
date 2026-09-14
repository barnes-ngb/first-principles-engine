/**
 * `useChildren`'s stand-in for the child-switch harness — `FEAT-237` /
 * `UX-425`.
 *
 * **It is its own module on purpose, and the purpose is a deadlock.** A
 * `vi.mock` factory is hoisted above every import, so it can only reach a
 * helper through a dynamic `import()` — and if that helper (transitively)
 * imports the very module being mocked, the factory waits on an import that is
 * waiting on the factory and the test file hangs with no output at all. The
 * sibling `childSwitchHarness.tsx` imports `ChildSwitcherChip`, which imports
 * `useActiveChild`, which imports `useChildren`. So the factory imports THIS
 * file, which reaches nothing but React and the two shared stores.
 */
import { useSyncExternalStore } from 'react'

import {
  getActiveChildId,
  setActiveChildIdShared,
  subscribeActiveChildId,
} from '../core/hooks/activeChildStore'
import {
  addSharedChild,
  getSharedChildren,
  subscribeSharedChildren,
} from '../core/hooks/childrenStore'
import type { Child } from '../core/types'

/**
 * Back `useChildren` with the two REAL shared stores, so the real
 * `useActiveChild` and the real switcher rules still run — only the Firestore
 * document load is replaced.
 *
 * ```ts
 * vi.mock('../core/hooks/useChildren', async (importOriginal) => {
 *   const { sharedChildrenMock } = await import('../test/sharedChildrenMock')
 *   return sharedChildrenMock(await importOriginal())
 * })
 * ```
 */
export function sharedChildrenMock(actual: object): object {
  return {
    ...actual,
    useChildren: () => ({
      children: useSyncExternalStore(subscribeSharedChildren, getSharedChildren),
      selectedChildId: useSyncExternalStore(subscribeActiveChildId, getActiveChildId),
      setSelectedChildId: setActiveChildIdShared,
      isLoading: false,
      addChild: (child: Child) => {
        addSharedChild(child)
        setActiveChildIdShared(child.id)
      },
    }),
  }
}
