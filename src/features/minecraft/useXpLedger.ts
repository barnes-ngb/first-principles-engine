import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import { xpLedgerCollection } from '../../core/firebase/firestore'
import type { XpLedger } from '../../core/types/domain'
import type { ArmorTierInfo } from './armorTiers'
import { getArmorTier, getNextTierProgress } from './armorTiers'

export interface XpLedgerData {
  totalXp: number
  sources: XpLedger['sources']
  armorTier: ArmorTierInfo
  nextTierProgress: {
    current: ArmorTierInfo
    next: ArmorTierInfo | null
    progress: number
    xpToNext: number
  }
  loading: boolean
}

const DEFAULT_SOURCES = { routines: 0, quests: 0, books: 0 }

export function useXpLedger(familyId: string, childId: string): XpLedgerData {
  const [data, setData] = useState<{ totalXp: number; sources: XpLedger['sources'] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!familyId || !childId) {
      setLoading(false)
      return
    }

    const ref = doc(xpLedgerCollection(familyId), childId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data()
          setData({ totalXp: d.totalXp ?? 0, sources: d.sources ?? DEFAULT_SOURCES })
        } else {
          setData({ totalXp: 0, sources: DEFAULT_SOURCES })
        }
        setLoading(false)
      },
      (err) => {
        console.warn('useXpLedger snapshot error', err)
        setData({ totalXp: 0, sources: DEFAULT_SOURCES })
        setLoading(false)
      },
    )

    return unsub
  }, [familyId, childId])

  const totalXp = data?.totalXp ?? 0
  const sources = data?.sources ?? DEFAULT_SOURCES

  return {
    totalXp,
    sources,
    armorTier: getArmorTier(totalXp),
    nextTierProgress: getNextTierProgress(totalXp),
    loading,
  }
}
