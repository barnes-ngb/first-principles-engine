import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../core/firebase/firestore'
import type { AvatarProfile, StoryPlayer } from '../../core/types'

/**
 * Loads avatar profiles from Firestore for kid players in a game session.
 * Parents and guests don't have avatar profiles — they use avatarUrl instead.
 */
export function useAvatarProfiles(
  familyId: string,
  storyPlayers?: StoryPlayer[],
): Record<string, AvatarProfile> {
  const [profiles, setProfiles] = useState<Record<string, AvatarProfile>>({})

  useEffect(() => {
    if (!familyId || !storyPlayers) return

    const kidIds = storyPlayers
      .filter((p) => !p.isGuest && !p.id.startsWith('parent-'))
      .map((p) => p.id)

    if (kidIds.length === 0) return

    Promise.all(
      kidIds.map(async (childId) => {
        const snap = await getDoc(
          doc(db, `families/${familyId}/avatarProfiles/${childId}`),
        )
        if (snap.exists()) {
          return { childId, profile: snap.data() as AvatarProfile }
        }
        return null
      }),
    ).then((results) => {
      const loaded: Record<string, AvatarProfile> = {}
      for (const r of results) {
        if (r) loaded[r.childId] = r.profile
      }
      setProfiles(loaded)
    })
  }, [familyId, storyPlayers])

  return profiles
}
