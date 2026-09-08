import { useCallback, useEffect, useState } from 'react'
import { deleteDoc, doc, getDoc, getDocs, query, setDoc } from 'firebase/firestore'

import {
  sightWordProgressCollection,
  sightWordProgressDocId,
} from '../../core/firebase/firestore'
import type { SightWordProgress } from '../../core/types'
import { recordEncounter } from './sightWordMastery'

// ── Add / remove writers (shared, not portal-private) ────────────
//
// Sight words normally enter the store implicitly via reading encounters
// (`recordInteraction`). These two writers let a caller add or remove a word
// explicitly — the first caller is the Shelly portal's confirmed-write path
// (`useShellyChatActions`), but they live here so `SightWordDashboard` can adopt
// them later. They are deliberately standalone (not hook methods) so the portal
// can write for any child without mounting the dashboard hook.

/**
 * Seed a brand-new sight-word progress doc for {@link word} under {@link childId}.
 *
 * **An add never touches a word that is already there (UX-186).** It used to,
 * and its own docblock said the opposite — *"a no-op-ish merge rather than a
 * progress reset"*. The seed below carries **every one of the nine fields**
 * `SightWordProgress` declares, and Firestore's `merge` operates per FIELD:
 * fields present in the payload are overwritten and only absent ones survive.
 * A payload that sets all nine preserves nothing, so `{ merge: true }` bought
 * exactly nothing and the comment claiming otherwise is how it survived review.
 *
 * The cost was real, and on the app's only door for this. Ask AI is the sole
 * place a word can be added or removed (`SightWordDashboard` can confirm
 * mastery, not add), so *"He knows 'said' now"* — the most plausible sentence a
 * parent says — proposed an add for a word the reader had already carried to
 * `masteryLevel: 'mastered'` with thirty encounters, and confirming reset it to
 * `new` / `0` / `shellyConfirmed: false` and re-dated `firstSeen` to today. The
 * dashboard then showed a mastered word as new and the Generate Chat's practice
 * channel (FEAT-169/172) handed it back as a word to practise.
 *
 * So the existence check is explicit rather than delegated to a merge that
 * cannot express it: an existing document is left **byte-for-byte alone** —
 * not re-stamped with `lastSeen`, because a parent saying "add this" is not the
 * child having read it, and this writer must not manufacture an encounter.
 *
 * **The reader's two writers are untouched.** `recordInteraction` and
 * `confirmMastery` still `setDoc` the whole accumulated record; this is the
 * two-doors-to-one-collection case FEAT-188 named, and the fix is for the doors
 * to stop disagreeing — the reader accumulates, the add no longer resets.
 *
 * A concurrent pair of adds can both see the word absent and both write the
 * seed; that is harmless, because the seed they write is identical.
 */
export async function addSightWord(
  familyId: string,
  childId: string,
  word: string,
): Promise<void> {
  const lowerWord = word.trim().toLowerCase()
  if (!familyId || !childId || !lowerWord) return
  const docRef = doc(
    sightWordProgressCollection(familyId),
    sightWordProgressDocId(childId, lowerWord),
  )
  const existing = await getDoc(docRef)
  // Already tracked: the word is on the list, which is what an add asks for.
  // Nothing to write, and nothing that may be overwritten.
  if (existing.exists()) return

  const now = new Date().toISOString()
  const seed: SightWordProgress = {
    word: lowerWord,
    encounters: 0,
    selfReportedKnown: 0,
    helpRequested: 0,
    shellyConfirmed: false,
    masteryLevel: 'new',
    firstSeen: now,
    lastSeen: now,
    lastLevelChange: now,
  }
  await setDoc(docRef, seed)
}

/**
 * Remove a sight-word progress doc for {@link word} under {@link childId}.
 * Removing an absent word is a safe no-op (`deleteDoc` does not throw).
 */
export async function removeSightWord(
  familyId: string,
  childId: string,
  word: string,
): Promise<void> {
  const lowerWord = word.trim().toLowerCase()
  if (!familyId || !childId || !lowerWord) return
  const docRef = doc(
    sightWordProgressCollection(familyId),
    sightWordProgressDocId(childId, lowerWord),
  )
  await deleteDoc(docRef)
}

export function useSightWordProgress(familyId: string, childId: string) {
  const [progressMap, setProgressMap] = useState<Map<string, SightWordProgress>>(new Map())
  const [loading, setLoading] = useState(!!familyId && !!childId)

  useEffect(() => {
    if (!familyId || !childId) return
    let cancelled = false
    // A NEW child means a new read: flag it and drop the previous child's words
    // first (FEAT-172). Before this, switching the child the story is for left
    // `loading` false and the map holding the OLD child's list until the read
    // landed — so a fast tap could send one child's practice words for the
    // other's book. A first mount already starts loading with an empty map, so
    // these are no-ops there.
    setLoading(true)
    setProgressMap(new Map())

    const load = async () => {
      try {
        const snap = await getDocs(
          query(sightWordProgressCollection(familyId)),
        )
        if (cancelled) return

        const map = new Map<string, SightWordProgress>()
        for (const d of snap.docs) {
          // Only include docs for this child (doc ID starts with childId_)
          if (d.id.startsWith(`${childId}_`)) {
            map.set(d.data().word.toLowerCase(), { ...d.data(), word: d.data().word.toLowerCase() })
          }
        }
        setProgressMap(map)
      } catch (err) {
        // A read that rejects must still SETTLE: callers gate on `loading`
        // (the Generate Chat waits for the list before it lets a story start,
        // FEAT-169), and a flag stuck at `true` would wedge that door offline —
        // the FEAT-167 lesson. Fail open: no words, nothing claimed, logged.
        console.warn('Failed to load sight word progress:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [familyId, childId])

  const recordInteraction = useCallback(
    async (word: string, interaction: 'seen' | 'help' | 'known') => {
      if (!familyId || !childId) return
      const lowerWord = word.toLowerCase()
      const existing = progressMap.get(lowerWord) ?? null
      const updated = recordEncounter(existing, lowerWord, interaction)

      setProgressMap((prev) => {
        const next = new Map(prev)
        next.set(lowerWord, updated)
        return next
      })

      // Persist to Firestore
      const docId = sightWordProgressDocId(childId, lowerWord)
      const docRef = doc(sightWordProgressCollection(familyId), docId)
      await setDoc(docRef, updated)
    },
    [familyId, childId, progressMap],
  )

  const confirmMastery = useCallback(
    async (word: string, mastered: boolean) => {
      if (!familyId || !childId) return
      const lowerWord = word.toLowerCase()
      const existing = progressMap.get(lowerWord)
      if (!existing) return

      const updated: SightWordProgress = {
        ...existing,
        shellyConfirmed: mastered,
        masteryLevel: mastered ? 'mastered' : existing.masteryLevel,
        lastLevelChange: new Date().toISOString(),
      }

      // If un-confirming, recompute level
      if (!mastered) {
        const { computeMasteryLevel } = await import('./sightWordMastery')
        updated.masteryLevel = computeMasteryLevel(updated)
      }

      setProgressMap((prev) => {
        const next = new Map(prev)
        next.set(lowerWord, updated)
        return next
      })

      const docId = sightWordProgressDocId(childId, lowerWord)
      const docRef = doc(sightWordProgressCollection(familyId), docId)
      await setDoc(docRef, updated)
    },
    [familyId, childId, progressMap],
  )

  const getWeakWords = useCallback((): string[] => {
    return [...progressMap.values()]
      .filter(p => p.masteryLevel === 'new' || p.masteryLevel === 'practicing')
      .map(p => p.word)
  }, [progressMap])

  const allProgress = [...progressMap.values()]

  return {
    progressMap,
    allProgress,
    loading,
    recordInteraction,
    confirmMastery,
    getWeakWords,
  }
}
