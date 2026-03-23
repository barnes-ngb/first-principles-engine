import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import { avatarProfilesCollection } from '../../core/firebase/firestore'
import type { AvatarProfile } from '../../core/types'

/**
 * Subscribe to a child's avatar profile from Firestore.
 * Returns null while loading or if no profile exists.
 */
export function useAvatarProfile(
  familyId: string | undefined,
  childId: string | undefined,
): AvatarProfile | null {
  const [profile, setProfile] = useState<AvatarProfile | null>(null)

  useEffect(() => {
    if (!familyId || !childId) {
      setProfile(null)
      return
    }

    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const unsub = onSnapshot(
      profileRef,
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as AvatarProfile)
        } else {
          setProfile(null)
        }
      },
      () => setProfile(null),
    )

    return unsub
  }, [familyId, childId])

  return profile
}
