import { useCallback, useEffect, useState } from 'react'
import { doc, getDocs, query, setDoc } from 'firebase/firestore'

import {
  sightWordProgressCollection,
  sightWordProgressDocId,
} from '../../core/firebase/firestore'
import type { SightWordProgress } from '../../core/types/domain'
import { recordEncounter } from './sightWordMastery'

export function useSightWordProgress(familyId: string, childId: string) {
  const [progressMap, setProgressMap] = useState<Map<string, SightWordProgress>>(new Map())
  const [loading, setLoading] = useState(!!familyId && !!childId)

  useEffect(() => {
    if (!familyId || !childId) return
    let cancelled = false

    const load = async () => {
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
      setLoading(false)
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
