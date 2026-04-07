import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import { avatarProfilesCollection } from '../firebase/firestore'
import { getDiamondBalance } from './getDiamondBalance'

interface DiamondBalanceState {
  balance: number
  loading: boolean
}

/**
 * Reactive diamond balance hook.
 *
 * Primary source is avatarProfile.diamondBalance (live snapshot).
 * Falls back to a one-time ledger sum only if the cached balance is missing.
 */
export function useDiamondBalance(familyId: string, childId: string): DiamondBalanceState {
  const [snapshot, setSnapshot] = useState<{ key: string; balance: number } | null>(null)

  useEffect(() => {
    if (!familyId || !childId) return

    const key = `${familyId}_${childId}`
    const profileRef = doc(avatarProfilesCollection(familyId), childId)
    const unsub = onSnapshot(
      profileRef,
      (snap) => {
        if (!snap.exists()) {
          setSnapshot({ key, balance: 0 })
          return
        }
        const cached = snap.data().diamondBalance
        if (typeof cached === 'number') {
          setSnapshot({ key, balance: cached })
          return
        }

        // Fallback for legacy profiles that have no cached diamondBalance yet.
        void getDiamondBalance(familyId, childId)
          .then((computed) => setSnapshot({ key, balance: computed }))
          .catch(() => setSnapshot({ key, balance: 0 }))
      },
      () => setSnapshot({ key, balance: 0 }),
    )

    return unsub
  }, [familyId, childId])

  const expectedKey = familyId && childId ? `${familyId}_${childId}` : ''
  const loading = Boolean(expectedKey) && snapshot?.key !== expectedKey

  return {
    balance: snapshot?.key === expectedKey ? snapshot.balance : 0,
    loading,
  }
}
