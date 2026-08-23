// ── Read-only concept-arc subscribe for the Shelly portal (FEAT-157) ─────────
//
// The chat needs the family's live arcs for the same reasons FEAT-135 needed
// the activity configs: to resolve a proposed `planLab.arcId` to a REAL,
// active arc (and its step index to a real step) before a confirm card is
// offered, and to render that card by the arc's TITLE rather than a doc id.
//
// Deliberately NOT `useConceptArcs`: that hook exposes the full writer surface
// (create / update / archive / step transitions). This is a plain read:
// subscribe, filter archived — the same active-list rule the Dad Lab page
// shows — hand back. The portal's only arc write goes through the shared
// module-level `createArc` writer the New Arc dialog calls.

import { useEffect, useState } from 'react'
import { onSnapshot, orderBy, query } from 'firebase/firestore'

import { conceptArcsCollection } from '../../core/firebase/firestore'
import type { ConceptArc } from '../../core/types'

const EMPTY: ConceptArc[] = []

/**
 * Cache key identifying one (family, child) subscription — the convention
 * `chatWatchLibraryCacheKey` documents (the `\u0000` separator is the one
 * character a Firestore id can never contain, written as an escape so git
 * keeps the file plain text).
 */
export function chatConceptArcsCacheKey(familyId: string, childId: string): string {
  return `${familyId}\u0000${childId}`
}

/**
 * Subscribe to the family's ACTIVE concept arcs.
 *
 * Arcs are family-scoped (an arc names its own `childIds` audience), so there
 * is no child filter on the query — but the read is still gated on a child tab
 * being selected, like every other portal read: the General tab emits no
 * actions, so "no child" costs zero reads and resolves nothing, which fails
 * closed.
 *
 * Archived arcs are filtered out, matching `useConceptArcs`' active list: a
 * lab cannot be planned against a container the parent can't see, and the
 * resolver's "not one of your active arcs" refusal is the true sentence for
 * an archived one.
 *
 * Returns `[]` while loading, when either id is missing, or on error — an
 * empty list simply means no `planLab.arcId` can resolve; an UNLINKED lab
 * still resolves fine, so the worst case is a dropped arc link, never a
 * wrong one.
 */
export function useChatConceptArcs(familyId: string, childId: string): ConceptArc[] {
  const key = chatConceptArcsCacheKey(familyId, childId)
  const [loaded, setLoaded] = useState<{ key: string; arcs: ConceptArc[] }>({
    key: '',
    arcs: EMPTY,
  })

  useEffect(() => {
    if (!familyId || !childId) return

    const q = query(conceptArcsCollection(familyId), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setLoaded({
          key,
          arcs: snap.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .filter((a) => !a.archivedAt),
        })
      },
      (err) => {
        console.warn('[shellyChat] concept arcs subscribe failed:', err)
        setLoaded({ key, arcs: EMPTY })
      },
    )

    return unsubscribe
  }, [familyId, childId, key])

  return loaded.key === key ? loaded.arcs : EMPTY
}
