import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import { xpLedgerCollection } from '../../core/firebase/firestore'
import type { XpLedger } from '../../core/types'
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
  const [snapshot, setSnapshot] = useState<{
    key: string
    totalXp: number
    sources: XpLedger['sources']
  } | null>(null)

  useEffect(() => {
    if (!familyId || !childId) return

    const ref = doc(xpLedgerCollection(familyId), childId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data()
          setSnapshot({
            key: `${familyId}_${childId}`,
            totalXp: d.totalXp ?? 0,
            sources: d.sources ?? DEFAULT_SOURCES,
          })
        } else {
          setSnapshot({
            key: `${familyId}_${childId}`,
            totalXp: 0,
            sources: DEFAULT_SOURCES,
          })
        }
      },
      (err) => {
        console.warn('useXpLedger snapshot error', err)
        setSnapshot({
          key: `${familyId}_${childId}`,
          totalXp: 0,
          sources: DEFAULT_SOURCES,
        })
      },
    )

    return unsub
  }, [familyId, childId])

  const expectedKey = familyId && childId ? `${familyId}_${childId}` : ''
  const loading = Boolean(expectedKey) && snapshot?.key !== expectedKey
  const totalXp = snapshot?.key === expectedKey ? snapshot.totalXp : 0
  const sources = snapshot?.key === expectedKey ? snapshot.sources : DEFAULT_SOURCES

  return {
    totalXp,
    sources,
    armorTier: getArmorTier(totalXp),
    nextTierProgress: getNextTierProgress(totalXp),
    loading,
  }
}
