import { useEffect, useState } from 'react'
import { getDocs, orderBy, query } from 'firebase/firestore'
import { storyGamesCollection } from '../../core/firebase/firestore'
import type { StoryGame } from '../../core/types'

/**
 * Load all story games for the family (not filtered by child).
 * Used by both the Workshop gallery and the Today page cards.
 */
export function useWorkshopGames(familyId: string | undefined) {
  const [games, setGames] = useState<StoryGame[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!familyId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadGames() {
      try {
        const q = query(
          storyGamesCollection(familyId!),
          orderBy('updatedAt', 'desc'),
        )
        const snapshot = await getDocs(q)
        if (!cancelled) {
          const loaded = snapshot.docs.map((d) => ({
            ...(d.data() as StoryGame),
            id: d.id,
          }))
          setGames(loaded)
        }
      } catch (err) {
        console.warn('Failed to load workshop games:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadGames()
    return () => {
      cancelled = true
    }
  }, [familyId])

  return { games, loading }
}
