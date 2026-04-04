import { getDocs, query, where } from 'firebase/firestore'

import { xpLedgerCollection } from '../firebase/firestore'
import type { DiamondCategory } from '../types'
import { addXpEvent } from './addXpEvent'
import type { XP_EVENTS } from '../types'

/**
 * Compute diamond balance for a child by summing all diamond ledger entries.
 * Positive amounts = earned, negative amounts = spent.
 */
export async function getDiamondBalance(
  familyId: string,
  childId: string,
): Promise<number> {
  if (!familyId || !childId) return 0

  const collRef = xpLedgerCollection(familyId)
  const q = query(
    collRef,
    where('childId', '==', childId),
    where('currencyType', '==', 'diamond'),
  )
  const snap = await getDocs(q)

  let balance = 0
  snap.forEach((doc) => {
    const data = doc.data()
    balance += data.amount ?? 0
  })

  return balance
}

/**
 * Spend diamonds by creating a negative diamond ledger entry.
 * Returns true if successful, false if insufficient balance.
 */
export async function spendDiamonds(
  familyId: string,
  childId: string,
  amount: number,
  dedupKey: string,
  category: DiamondCategory,
  itemId?: string,
): Promise<boolean> {
  if (amount <= 0) return false

  const balance = await getDiamondBalance(familyId, childId)
  if (balance < amount) return false

  // Use MANUAL_AWARD type for spend entries (amount is 0 in XP_EVENTS, actual amount passed)
  await addXpEvent(
    familyId,
    childId,
    'MANUAL_AWARD' as keyof typeof XP_EVENTS,
    -amount,
    dedupKey,
    { action: 'spend', category, ...(itemId ? { itemId } : {}) },
    { currencyType: 'diamond', category, itemId },
  )

  return true
}
