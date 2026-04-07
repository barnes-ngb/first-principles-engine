import { doc, getDocs, query, runTransaction, where } from 'firebase/firestore'

import { avatarProfilesCollection, xpLedgerCollection, xpLedgerDocId } from '../firebase/firestore'
import { db } from '../firebase/firestore'
import type { AvatarProfile, DiamondCategory } from '../types'

/**
 * Compute diamond balance for a child by summing all diamond ledger entries.
 * Positive amounts = earned, negative amounts = spent.
 *
 * TODO: O(n) computation — sums entire diamond ledger on every call.
 * For a single family this is fine. At scale, cache balance on avatar
 * profile (same pattern as totalXp cached on xpLedger cumulative doc).
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
  snap.forEach((d) => {
    const data = d.data()
    balance += data.amount ?? 0
  })

  return balance
}

/**
 * Spend diamonds using a Firestore transaction for atomicity.
 *
 * Uses the cached `diamondBalance` on the avatar profile to prevent
 * race conditions (two concurrent spends can't both succeed if balance
 * only covers one). Falls back to computing from ledger if the cached
 * balance is missing (first-time migration).
 *
 * Returns true if successful, false if insufficient balance or error.
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

  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const ledgerDocRef = doc(xpLedgerCollection(familyId), xpLedgerDocId(childId, dedupKey))

  try {
    await runTransaction(db, async (transaction) => {
      const profileSnap = await transaction.get(profileRef)
      if (!profileSnap.exists()) throw new Error('Profile not found')

      // Also check dedup — if ledger entry already exists, abort
      const existingEvent = await transaction.get(ledgerDocRef)
      if (existingEvent.exists()) throw new Error('Already spent (dedup)')

      const profile = profileSnap.data() as AvatarProfile

      // Use cached balance, or fall back to computed balance for migration
      let currentBalance = profile.diamondBalance
      if (currentBalance === undefined || currentBalance === null) {
        currentBalance = await getDiamondBalance(familyId, childId)
      }

      if (currentBalance < amount) {
        throw new Error(`Insufficient diamonds: have ${currentBalance}, need ${amount}`)
      }

      const newBalance = currentBalance - amount

      // Atomic write: balance + ledger entry together
      transaction.update(profileRef, {
        diamondBalance: newBalance,
        updatedAt: new Date().toISOString(),
      })

      transaction.set(ledgerDocRef, {
        childId,
        totalXp: -amount,
        sources: { routines: 0, quests: 0, books: 0 },
        dedupKey,
        type: 'MANUAL_AWARD',
        amount: -amount,
        meta: { action: 'spend', category, ...(itemId ? { itemId } : {}) },
        awardedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        currencyType: 'diamond',
        category,
        ...(itemId ? { itemId } : {}),
      })
    })

    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Insufficient') || msg.includes('dedup')) {
      console.warn('spendDiamonds:', msg)
    } else {
      console.error('spendDiamonds failed:', err)
    }
    return false
  }
}
