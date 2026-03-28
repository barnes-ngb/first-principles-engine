import { doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'

import {
  avatarProfilesCollection,
  stripUndefined,
  xpLedgerCollection,
  xpLedgerDocId,
} from '../firebase/firestore'
import type { AvatarProfile, XP_EVENTS } from '../types'
import { checkAndUnlockArmor } from './checkAndUnlockArmor'
import { calculateTier } from '../../features/avatar/voxel/tierMaterials'

/** Build a sensible default AvatarProfile for a child that has none yet. */
function defaultAvatarProfile(childId: string): AvatarProfile {
  return {
    childId,
    themeStyle: 'minecraft',
    pieces: [],
    currentTier: 'stone',
    equippedPieces: [],
    unlockedPieces: [],
    totalXp: 0,
    updatedAt: new Date().toISOString(),
  }
}

/** Map XP event types to XpLedger source buckets. */
function mapTypeToSource(type: keyof typeof XP_EVENTS): 'routines' | 'quests' | 'books' {
  if (type === 'QUEST_DIAMOND' || type === 'QUEST_COMPLETE') return 'quests'
  if (type === 'BOOK_READ' || type === 'BOOK_PAGE_READ') return 'books'
  return 'routines'
}

/**
 * Award XP to a child, with dedup guard.
 *
 * Dedup and event tracking are handled via per-event docs in xpLedger
 * (doc ID: {childId}_{dedupKey}). The cumulative doc (doc ID: {childId})
 * is also updated atomically.
 *
 * @param dedupKey - Unique key for this event (e.g., `checklist_2026-03-20`,
 *   `book_${bookId}_2026-03-20`, `eval_${sessionId}`)
 */
export async function addXpEvent(
  familyId: string,
  childId: string,
  type: keyof typeof XP_EVENTS,
  amount: number,
  dedupKey: string,
  meta?: Record<string, string>,
): Promise<number> {
  if (!familyId || !childId || amount === 0) return 0
  console.log(`[XP] Awarding ${amount} XP to ${childId} for ${type}`)

  // ── Dedup check (per-event doc in xpLedger) ────────────────
  const eventDocId = xpLedgerDocId(childId, dedupKey)
  const eventRef = doc(xpLedgerCollection(familyId), eventDocId)
  const eventSnap = await getDoc(eventRef)
  if (eventSnap.exists()) return 0 // already awarded

  // ── Write per-event entry to xpLedger ──────────────────────
  const sourceKey = mapTypeToSource(type)
  await setDoc(eventRef, {
    childId,
    totalXp: amount,
    sources: {
      routines: sourceKey === 'routines' ? amount : 0,
      quests: sourceKey === 'quests' ? amount : 0,
      books: sourceKey === 'books' ? amount : 0,
    },
    dedupKey,
    type,
    amount,
    meta: meta ?? {},
    awardedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  })

  // ── Update cumulative XP ledger doc ────────────────────────
  const ledgerRef = doc(xpLedgerCollection(familyId), childId)
  const ledgerSnap = await getDoc(ledgerRef)
  const existing = ledgerSnap.exists()
    ? ledgerSnap.data()
    : { totalXp: 0, sources: { routines: 0, quests: 0, books: 0 } }

  const newTotal = Math.max(0, (existing.totalXp ?? 0) + amount)

  await setDoc(ledgerRef, {
    childId,
    totalXp: newTotal,
    sources: {
      routines: existing.sources?.routines ?? 0,
      quests: existing.sources?.quests ?? 0,
      books: existing.sources?.books ?? 0,
      [sourceKey]: ((existing.sources?.[sourceKey] ?? 0) + amount),
    },
    lastUpdatedAt: new Date().toISOString(),
  })

  // ── Compute real total from per-event xpLedger docs ────────
  const eventDocsSnap = await getDocs(
    query(xpLedgerCollection(familyId), where('childId', '==', childId), where('dedupKey', '!=', null)),
  )
  const realTotal = Math.max(0, eventDocsSnap.docs
    .filter((d) => !(d.data() as unknown as Record<string, unknown>)._deleted)
    .reduce((sum, d) => sum + ((d.data().amount as number) ?? 0), 0))

  // ── Update cached totalXp on avatarProfile ─────────────────
  const profileRef = doc(avatarProfilesCollection(familyId), childId)
  const profileSnap = await getDoc(profileRef)
  const profile: AvatarProfile = profileSnap.exists()
    ? (profileSnap.data() as AvatarProfile)
    : defaultAvatarProfile(childId)

  const oldTier = calculateTier(profile.totalXp ?? 0)
  const newTier = calculateTier(realTotal)
  console.log(`[XP] New total: ${realTotal}, tier: ${newTier}`)

  const tierUpdate: Record<string, unknown> = {}
  if (newTier !== oldTier) {
    console.log(`[XP] TIER UPGRADE: ${oldTier} → ${newTier}`)
    tierUpdate.currentTier = newTier.toLowerCase()
    tierUpdate.pendingTierUpgrade = newTier
  }

  await setDoc(profileRef, stripUndefined({
    ...profile,
    totalXp: realTotal,
    ...tierUpdate,
    updatedAt: new Date().toISOString(),
  }) as unknown as AvatarProfile)

  // ── Check for armor unlocks ────────────────────────────────
  await checkAndUnlockArmor(familyId, childId, realTotal)

  return amount
}
