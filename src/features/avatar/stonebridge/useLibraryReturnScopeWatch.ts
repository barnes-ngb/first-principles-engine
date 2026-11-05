import { useEffect } from 'react'

import { reconcileLibraryReturnFlow } from './libraryReturnFlow'

/**
 * Keep the Library return flow honest about where the child actually is.
 *
 * Mounted in `AppShell`, which is the layout route — the one component that
 * stays mounted ACROSS every route transition the shelf, the reader and the
 * editor make between them. That placement is the whole reason the flow can be
 * temporary in-memory state instead of something written into the URL: the
 * journey outlives each page in it, but nothing about it outlives the shell.
 *
 * Two things end a flow here:
 *
 *   • **the family changed** — a different family, or a logout, which arrives as
 *     an empty id. Conservative on purpose: the worst a false end can do is
 *     leave the child with the ordinary nav, while the worst a missed one can do
 *     is offer one family's journey to another's.
 *   • **the location left the journey** — see `pathKeepsLibraryReturnFlow`.
 *     Because this runs on each CHANGE, Back and Forward are ordinary changes:
 *     stepping out of the journey ends the flow, and stepping back in with the
 *     browser's history finds it already gone. History can replay a URL; it
 *     cannot replay this.
 *
 * The child-switch half is deliberately NOT here — it is subscribed at the
 * shared active-child store inside `libraryReturnFlow`, so it holds whether or
 * not anything is mounted, and it sees a same-tick `A → B → A` that no render
 * comparison can. See that module's header.
 *
 * Takes its scope as plain values rather than reading the auth and router hooks
 * itself, so it is the shell's existing reads that feed it — one source for the
 * family and the location, not a second pair that could disagree with the
 * header rendered beside it.
 */
export function useLibraryReturnScopeWatch(scope: {
  familyId: string
  pathname: string
}): void {
  const { familyId, pathname } = scope
  useEffect(() => {
    reconcileLibraryReturnFlow({ familyId, pathname })
  }, [familyId, pathname])
}
