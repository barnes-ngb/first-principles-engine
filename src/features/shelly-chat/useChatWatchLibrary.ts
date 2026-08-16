// ── Read-only watch-library subscribe for the Shelly portal (FEAT-149) ───────
//
// The chat needs the child's curated videos for the same three reasons FEAT-135
// needed the activity configs and FEAT-142 needed the live week: to tell whether
// a video the assistant just found is ALREADY vetted in (the common case — and a
// duplicate must be refused with a reason, not silently added twice), to resolve
// a proposed `planVideoOnDay` id to a REAL, ACTIVE entry before a confirm card
// is offered, and to render that card by TITLE rather than by doc id.
//
// Deliberately NOT `useWatchLibrary`: that hook exposes the full writer surface
// (add / update / retire / restore), and — the part that matters here — an
// omitted `childId` makes it subscribe to the WHOLE family library. This gate is
// parent-scoped and child-scoped, so "no child" has to mean "nothing", not "the
// lot". So this is a plain read: subscribe, hand back. The portal's only library
// write goes through the shared `addWatchVideo` writer the vet-in form calls.

import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'

import { watchLibraryCollection } from '../../core/firebase/firestore'
import type { WatchVideo } from '../../core/types'

const EMPTY: WatchVideo[] = []

/**
 * Cache key identifying one (family, child) subscription — the same convention
 * `chatActivityConfigsCacheKey` and `chatWeekDaysCacheKey` use, for the same
 * reason.
 *
 * The separator is a NUL, the one character a Firestore id can never contain, so
 * ids that would collide under naive concatenation — `('ab', 'c')` vs
 * `('a', 'bc')` — stay distinct. That matters because the key is what keeps a
 * previous child's videos out of the resolution gate.
 *
 * The NUL MUST be written as the `\u0000` escape, never as a raw NUL byte: a raw
 * byte makes git classify this file as binary, so it renders as "Binary file not
 * shown" in review and `git diff` / `git blame` stop working on it. The escape
 * form is byte-identical at runtime and leaves the file plain text.
 */
export function chatWatchLibraryCacheKey(familyId: string, childId: string): string {
  return `${familyId}\u0000${childId}`
}

/**
 * Subscribe to the videos visible to one child — the child's own plus shared
 * (`'both'`) ones, the same scope `useWatchLibrary(childId)` and the planner
 * picker use.
 *
 * **Retired entries are included.** Filtering them out here would make a
 * proposal against a retired video refuse as "that didn't match a video in the
 * Watch Library" — false, and unhelpful, about a video the parent can see in the
 * Archive tab. `resolveWatchAction` refuses a retired entry explicitly and BY
 * NAME instead, and a duplicate vet-in of one is pointed at the Archive rather
 * than quietly re-added. (The same correction FEAT-143 made for completed
 * activity configs.)
 *
 * Returns `[]` while loading, when either id is missing, or on error: an empty
 * list simply means no `planVideoOnDay` can resolve, which fails closed rather
 * than offering a card the app can't back with a real video. A vet-in still
 * resolves against an empty list — correctly, since nothing is a duplicate of
 * nothing — and the write is additive, so the worst case is a second copy of a
 * video, not a lost one.
 */
export function useChatWatchLibrary(familyId: string, childId: string): WatchVideo[] {
  const key = chatWatchLibraryCacheKey(familyId, childId)
  const [loaded, setLoaded] = useState<{ key: string; videos: WatchVideo[] }>({
    key: '',
    videos: EMPTY,
  })

  useEffect(() => {
    if (!familyId || !childId) return

    const q = query(
      watchLibraryCollection(familyId),
      where('childId', 'in', [childId, 'both']),
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setLoaded({
          key,
          videos: snap.docs.map((d) => ({ ...(d.data() as WatchVideo), id: d.id })),
        })
      },
      (err) => {
        console.warn('[shellyChat] watch library subscribe failed:', err)
        setLoaded({ key, videos: EMPTY })
      },
    )

    return unsubscribe
  }, [familyId, childId, key])

  return loaded.key === key ? loaded.videos : EMPTY
}
