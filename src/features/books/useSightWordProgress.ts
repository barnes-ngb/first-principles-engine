import { useCallback, useEffect, useState } from 'react'
import { deleteDoc, doc, getDocs, query, setDoc } from 'firebase/firestore'

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
 * Idempotent: writes with `{ merge: true }` against the deterministic
 * `{childId}_{word}` doc id, so re-adding a word that already exists is a
 * no-op-ish merge rather than a progress reset.
 */
export async function addSightWord(
  familyId: string,
  childId: string,
  word: string,
): Promise<void> {
  const lowerWord = word.trim().toLowerCase()
  if (!familyId || !childId || !lowerWord) return
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
  const docRef = doc(
    sightWordProgressCollection(familyId),
    sightWordProgressDocId(childId, lowerWord),
  )
  await setDoc(docRef, seed, { merge: true })
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
